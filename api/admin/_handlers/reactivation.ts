// api/admin/_handlers/reactivation.ts — push one-shot de reativação (spec 126).
//
// Resource do router `api/admin.ts` (auth de admin herdada, sem função nova — R-090). Nunca é chamado
// por cron (INV-3): só existe como ato do operador.
//   GET  action=variants: textos das variantes (o painel não duplica a copy).
//   GET  simula: devolve quem receberia e o motivo de cada pulado, sem enviar (FR-006).
//   POST com `simulate: true` também simula (coorte grande não cabe na URL do GET).
//   POST envia: exige `confirm: 'ENVIAR'` no corpo.
//
// Regras de elegibilidade, nesta ordem (o primeiro motivo que casa é o reportado):
//   already_sent     existe linha `reactivation_notice` no `notification_log` em QUALQUER status —
//                    falha de entrega também conta como tentativa (INV-2).
//   consent_revoked  o dispatcher suprimiria SEM gravar log; pular aqui deixa o motivo visível.
//   no_eligible_device nenhum aparelho expo ativo com `app_version >= min` (versão ilegível não conta).
//   quiet_hours      o gate do dispatcher gravaria `silenciada` e queimaria a tentativa sem entregar.
//                    Pulado aqui, sem linha: a conta segue apta a um envio futuro.
// O envio só alcança os aparelhos que passaram no filtro de versão: o canal Expo recebe um
// repositório de aparelhos já filtrado, então um aparelho antigo da mesma conta não recebe nada.

import { Expo } from 'expo-server-sdk'
import { satisfiesSemver } from '@dosiq/core/utils'
import { dispatchNotification } from '../../../server/notifications/dispatcher/dispatchNotification.js'
import { isConsentSuppressed } from '../../../server/notifications/policies/consentSuppression.js'
import { checkGatePolicy } from '../../../server/notifications/dispatcher/_dispatchHelpers.js'
import { reactivationVariantSchema, REACTIVATION_VARIANTS } from '../../../server/notifications/payloads/_payloadSchemas.js'
import { getCurrentTime } from '../../../server/utils/dateUtils.js'
import type { NotificationSettings } from '../../../server/notifications/repositories/notificationPreferenceRepository.js'

export const REACTIVATION_KIND = 'reactivation_notice'
// Envio é serial (1 push + 1 log por conta): 100 contas cabem com folga no tempo da função.
export const COHORT_MAX = 100
export const CONFIRM_TOKEN = 'ENVIAR'
const CHUNK = 100
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type SkipReason = 'already_sent' | 'consent_revoked' | 'push_disabled' | 'no_eligible_device' | 'quiet_hours'

export interface ReactivationDevice {
  id: string
  user_id: string
  push_token: string
  app_version?: string | null
  [key: string]: unknown
}

export interface ReactivationSettings {
  user_id?: string
  consent_revoked_at?: string | null
  international_transfer_granted_at?: string | null
  notification_mode?: string
  channel_mobile_push_enabled?: boolean
  quiet_hours_enabled?: boolean
  quiet_hours_start?: string | null
  quiet_hours_end?: string | null
  _read_failed?: boolean
}

/** Acesso a dados do handler. Toda leitura lança em erro: sem prova de "não recebeu", nada sai. */
export interface ReactivationStore {
  alreadySent(userIds: string[]): Promise<Set<string>>
  activeExpoDevices(userIds: string[]): Promise<ReactivationDevice[]>
  settings(userIds: string[]): Promise<Map<string, ReactivationSettings>>
  deactivateByToken(token: string): Promise<void>
}

type DispatchFn = typeof dispatchNotification

export interface ReactivationDeps {
  store: ReactivationStore
  dispatch: DispatchFn
  expoClient: { sendPushNotificationsAsync(messages: unknown[]): Promise<Array<{ status: string; message?: string; id?: string; details?: { error?: string } }>> }
  nowHHMM: () => string
}

function chunks<T>(list: T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK))
  return out
}

export function createSupabaseReactivationStore(supabase): ReactivationStore {
  return {
    async alreadySent(userIds) {
      const sent = new Set<string>()
      for (const part of chunks(userIds)) {
        // Cada conta tem no máximo 1 linha deste kind (INV-2); 1000 cobre um bloco de 100 com folga.
        const { data, error } = await supabase
          .from('notification_log').select('user_id')
          .eq('notification_type', REACTIVATION_KIND).in('user_id', part).range(0, 999)
        if (error) throw new Error(`notification_log: ${error.message}`)
        for (const row of data ?? []) sent.add(row.user_id)
      }
      return sent
    },
    async activeExpoDevices(userIds) {
      const out: ReactivationDevice[] = []
      for (const part of chunks(userIds)) {
        const { data, error } = await supabase
          .from('notification_devices').select('*')
          .eq('provider', 'expo').eq('is_active', true).in('user_id', part).range(0, 999)
        if (error) throw new Error(`notification_devices: ${error.message}`)
        out.push(...(data ?? []))
      }
      return out
    },
    async settings(userIds) {
      const map = new Map<string, ReactivationSettings>()
      for (const part of chunks(userIds)) {
        const { data, error } = await supabase.from('user_settings').select('*').in('user_id', part)
        if (error) {
          console.error('[Reactivation] user_settings ilegível — contas do bloco puladas', { count: part.length })
          // Fail-closed por conta: sem saber se revogou, a supressão de consentimento pula a conta.
          for (const id of part) map.set(id, { _read_failed: true })
          continue
        }
        for (const row of data ?? []) map.set(row.user_id, row)
      }
      return map
    },
    async deactivateByToken(token) {
      const { error } = await supabase.from('notification_devices').update({ is_active: false }).eq('push_token', token)
      if (error) throw new Error(`deactivate: ${error.message}`)
    },
  }
}

interface ParsedInput { userIds: string[]; variant: 'A' | 'B' | 'C' | 'D' | 'E'; minVersion: string }

export function parseReactivationInput(raw: Record<string, unknown> | undefined): { ok: true; value: ParsedInput } | { ok: false; error: string } {
  const src = raw ?? {}
  const rawIds = typeof src.user_ids === 'string' ? src.user_ids.split(',') : src.user_ids
  if (!Array.isArray(rawIds) || rawIds.length === 0) return { ok: false, error: 'user_ids obrigatório (lista de uids)' }
  // Minúsculas: o banco devolve uuid em minúsculas e o "já recebeu" compara texto.
  const ids = [...new Set(rawIds.map((v) => String(v).trim().toLowerCase()).filter((v) => v.length > 0))]
  if (ids.length === 0) return { ok: false, error: 'user_ids obrigatório (lista de uids)' }
  if (ids.length > COHORT_MAX) return { ok: false, error: `coorte acima de ${COHORT_MAX} contas` }
  if (ids.some((id) => !UUID_RE.test(id))) return { ok: false, error: 'user_ids com valor que não é uuid' }
  const variant = reactivationVariantSchema.safeParse(src.variant)
  if (variant.success === false) return { ok: false, error: 'variant deve ser A, B, C, D ou E' }
  const minVersion = typeof src.min_version === 'string' ? src.min_version.trim() : ''
  if (!satisfiesSemver(minVersion, null, null)) return { ok: false, error: 'min_version inválida (ex.: 0.35.0)' }
  return { ok: true, value: { userIds: ids, variant: variant.data, minVersion } }
}

export interface ReactivationPlan {
  eligible: Array<{ user_id: string; devices: ReactivationDevice[]; settings: ReactivationSettings }>
  skipped: Array<{ user_id: string; reason: SkipReason }>
}

export async function planReactivation(input: ParsedInput, deps: Pick<ReactivationDeps, 'store' | 'nowHHMM'>): Promise<ReactivationPlan> {
  const { userIds, minVersion } = input
  const [sent, devices, settings] = await Promise.all([
    deps.store.alreadySent(userIds),
    deps.store.activeExpoDevices(userIds),
    deps.store.settings(userIds),
  ])
  const currentHHMM = deps.nowHHMM()
  const plan: ReactivationPlan = { eligible: [], skipped: [] }
  for (const userId of userIds) {
    const userSettings = settings.get(userId) ?? {}
    const okDevices = devices.filter((d) => d.user_id === userId && satisfiesSemver(d.app_version, minVersion, null))
    let reason: SkipReason | null = null
    if (sent.has(userId)) reason = 'already_sent'
    else if (isConsentSuppressed(userSettings, REACTIVATION_KIND)) reason = 'consent_revoked'
    else if (userSettings.channel_mobile_push_enabled === false) reason = 'push_disabled'
    else if (okDevices.length === 0) reason = 'no_eligible_device'
    else if (checkGatePolicy({ userId, kind: REACTIVATION_KIND, settings: userSettings, currentHHMM })) reason = 'quiet_hours'
    if (reason) plan.skipped.push({ user_id: userId, reason })
    else plan.eligible.push({ user_id: userId, devices: okDevices, settings: userSettings })
  }
  return plan
}

/** O dispatcher espera a linha completa; campos ausentes recebem os defaults da tabela. */
function toDispatchSettings(row: ReactivationSettings): NotificationSettings {
  return {
    notification_mode: row.notification_mode ?? 'realtime',
    quiet_hours_enabled: row.quiet_hours_enabled ?? false,
    quiet_hours_start: row.quiet_hours_start ?? null,
    quiet_hours_end: row.quiet_hours_end ?? null,
    digest_time: '23:00',
    timezone: 'America/Sao_Paulo',
    channel_mobile_push_enabled: row.channel_mobile_push_enabled,
    consent_revoked_at: row.consent_revoked_at ?? null,
    international_transfer_granted_at: row.international_transfer_granted_at ?? null,
    _read_failed: row._read_failed,
  }
}

const noTelegram = { async sendMessage() { return undefined } }

function defaultDeps(supabase): ReactivationDeps {
  return {
    store: createSupabaseReactivationStore(supabase),
    dispatch: dispatchNotification,
    expoClient: new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN }),
    nowHHMM: getCurrentTime,
  }
}

const summarize = (skipped: ReactivationPlan['skipped']) =>
  skipped.reduce<Record<string, number>>((acc, s) => { acc[s.reason] = (acc[s.reason] ?? 0) + 1; return acc }, {})

type Dispatched = Array<{ user_id: string; delivered: number; failed: number }>
type Deferred = Array<{ user_id: string; reason: SkipReason }>

/** Despacha em série, uma conta por vez, aguardando o log de cada uma (prova de "já recebeu"). */
async function dispatchEligible(eligible: ReactivationPlan['eligible'], variant: ParsedInput['variant'], d: ReactivationDeps): Promise<{ dispatched: Dispatched; deferred: Deferred }> {
  const dispatched: Dispatched = []
  const deferred: Deferred = []
  for (const target of eligible) {
    // O lote é serial: a janela silenciosa pode abrir no meio dele. Reavaliar aqui evita que o
    // dispatcher grave `silenciada` e gaste a tentativa sem entregar.
    if (checkGatePolicy({ userId: target.user_id, kind: REACTIVATION_KIND, settings: target.settings, currentHHMM: d.nowHHMM() })) {
      deferred.push({ user_id: target.user_id, reason: 'quiet_hours' })
      continue
    }
    // Repositório por conta: o canal só enxerga os aparelhos que passaram no filtro de versão.
    const devicesRepo = {
      async listActiveByUser() { return target.devices },
      async deactivateByToken(token: string) { await d.store.deactivateByToken(token) },
    }
    const result = await d.dispatch({
      userId: target.user_id,
      kind: REACTIVATION_KIND,
      data: { variant },
      channels: ['mobile_push'],
      context: { correlationId: `reactivation_${target.user_id}`, awaitLog: true },
      repositories: {
        devices: devicesRepo,
        preferences: {
          async hasTelegramChat() { return false },
          async getByUserId() { return 'mobile_push' as const },
          async getSettingsByUserId() { return toDispatchSettings(target.settings) },
        },
      },
      bot: noTelegram,
      expoClient: d.expoClient,
    })
    dispatched.push({ user_id: target.user_id, delivered: result.totalDelivered ?? 0, failed: result.totalFailed ?? 0 })
  }
  return { dispatched, deferred }
}

/**
 * Prova de escrita: quem foi despachado e não tem linha no log pode receber de novo (INV-2).
 * Releitura falhou ⇒ os pushes já saíram; todos voltam como não confirmados, nunca como erro 500.
 */
async function findUnlogged(dispatched: Dispatched, store: ReactivationStore): Promise<string[]> {
  if (dispatched.length === 0) return []
  let logged = new Set<string>()
  try {
    logged = await store.alreadySent(dispatched.map((x) => x.user_id))
  } catch (err) {
    console.error('[Reactivation] releitura do log falhou', err instanceof Error ? err.message : 'erro')
  }
  return dispatched.filter((x) => !logged.has(x.user_id)).map((x) => x.user_id)
}

export async function handleReactivation(req, res, supabase, deps?: ReactivationDeps) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed for reactivation' })
  if (req.method === 'GET' && req.query?.action === 'variants') {
    return res.status(200).json({ data: REACTIVATION_VARIANTS })
  }
  const fromBody = req.method === 'POST'
  const isSend = fromBody && req.body?.simulate !== true
  const parsed = parseReactivationInput(fromBody ? req.body : req.query)
  if (parsed.ok === false) return res.status(400).json({ error: parsed.error })
  if (isSend && req.body?.confirm !== CONFIRM_TOKEN) {
    return res.status(400).json({ error: `envio real exige confirm: '${CONFIRM_TOKEN}'` })
  }
  const d = deps ?? defaultDeps(supabase)

  try {
    const plan = await planReactivation(parsed.value, d)
    const base = {
      variant: parsed.value.variant,
      preview: REACTIVATION_VARIANTS[parsed.value.variant],
      min_version: parsed.value.minVersion,
      cohort: parsed.value.userIds.length,
      skipped: plan.skipped,
      skipped_by_reason: summarize(plan.skipped),
    }
    if (!isSend) {
      return res.status(200).json({ data: { mode: 'simulate', ...base, would_send: plan.eligible.map((e) => e.user_id) } })
    }

    const { dispatched, deferred } = await dispatchEligible(plan.eligible, parsed.value.variant, d)
    const skipped = [...plan.skipped, ...deferred]

    const unlogged = await findUnlogged(dispatched, d.store)
    if (unlogged.length > 0) console.error('[Reactivation] enviado sem linha no log', { count: unlogged.length })

    return res.status(200).json({ data: { mode: 'send', ...base, skipped, skipped_by_reason: summarize(skipped), sent: dispatched, unlogged } })
  } catch (err) {
    console.error('[Reactivation]', err instanceof Error ? err.message : 'erro')
    return res.status(500).json({ error: 'Internal server error' })
  }
}
