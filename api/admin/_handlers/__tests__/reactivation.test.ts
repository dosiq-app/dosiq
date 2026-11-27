import { describe, it, expect, afterEach, vi } from 'vitest'

// O dispatcher importa o log, que cria o cliente Supabase na carga do módulo; sem env (CI) ele lança.
vi.mock('../../../../server/services/supabase.js', () => ({ supabase: {} }))
import {
  handleReactivation,
  parseReactivationInput,
  CONFIRM_TOKEN,
  type ReactivationDeps,
  type ReactivationDevice,
  type ReactivationSettings,
} from '../reactivation.js'
import { buildNotificationPayload } from '../../../../server/notifications/payloads/buildNotificationPayload.js'
import { redactForNoTransfer } from '../../../../server/notifications/policies/transferRedaction.js'
import { REACTIVATION_VARIANTS } from '../../../../server/notifications/payloads/_payloadSchemas.js'

/**
 * 126 — push one-shot de reativação (PO-126-1, PO-126-2, PO-126-3).
 * O `store` em memória faz o papel do banco: o `dispatch` falso grava a linha no log como o
 * dispatcher real grava (inclusive quando a entrega falha), e é dela que sai o "já recebeu".
 */

const ELEG = 'a0000000-0000-4000-8000-000000000001'
const OLD = 'a0000000-0000-4000-8000-000000000002'
const NOTOKEN = 'a0000000-0000-4000-8000-000000000003'
const REVOKED = 'a0000000-0000-4000-8000-000000000004'
const QUIET = 'a0000000-0000-4000-8000-000000000005'

afterEach(() => { vi.clearAllMocks(); vi.clearAllTimers() })

function res() {
  const r: any = { statusCode: 0, body: null }
  r.status = (c: number) => { r.statusCode = c; return r }
  r.json = (b: any) => { r.body = b; return r }
  return r
}

function world(opts: { devices?: ReactivationDevice[]; settings?: Record<string, ReactivationSettings>; logged?: string[]; logFails?: boolean; dispatchFails?: boolean } = {}) {
  const log = new Set<string>(opts.logged ?? [])
  const devices: ReactivationDevice[] = opts.devices ?? [
    { id: 'd1', user_id: ELEG, push_token: 'ExponentPushToken[new]', app_version: '0.35.0' },
    { id: 'd2', user_id: ELEG, push_token: 'ExponentPushToken[old-same-user]', app_version: '0.34.4' },
    { id: 'd3', user_id: OLD, push_token: 'ExponentPushToken[old]', app_version: '0.34.4' },
  ]
  const store = {
    alreadySent: vi.fn(async (ids: string[]) => {
      if (opts.logFails) throw new Error('boom')
      return new Set(ids.filter((id) => log.has(id)))
    }),
    activeExpoDevices: vi.fn(async (ids: string[]) => devices.filter((d) => ids.includes(d.user_id))),
    settings: vi.fn(async () => new Map(Object.entries(opts.settings ?? {}))),
    deactivateByToken: vi.fn(async () => {}),
  }
  const seenDevices: Record<string, ReactivationDevice[]> = {}
  const dispatch = vi.fn(async (args: any) => {
    seenDevices[args.userId] = await args.repositories.devices.listActiveByUser(args.userId, 'expo')
    log.add(args.userId) // o dispatcher grava a linha em qualquer desfecho (falha conta, INV-2)
    return opts.dispatchFails
      ? { success: false, totalDelivered: 0, totalFailed: 1 }
      : { success: true, totalDelivered: 1, totalFailed: 0 }
  })
  const deps = {
    store,
    dispatch: dispatch as unknown as ReactivationDeps['dispatch'],
    expoClient: { sendPushNotificationsAsync: vi.fn() },
    nowHHMM: () => '19:30',
  } satisfies ReactivationDeps
  return { deps, dispatch, store, seenDevices, log }
}

const send = (user_ids: string[], extra: Record<string, unknown> = {}) =>
  ({ method: 'POST', query: {}, body: { user_ids, variant: 'B', min_version: '0.35.0', confirm: CONFIRM_TOKEN, ...extra } })

describe('126 — entrada', () => {
  it.each([
    [{}, 'user_ids'],
    [{ user_ids: [] }, 'user_ids'],
    [{ user_ids: ['x'], variant: 'A', min_version: '0.35.0' }, 'uuid'],
    [{ user_ids: [ELEG], variant: 'Z', min_version: '0.35.0' }, 'variant'],
    [{ user_ids: [ELEG], variant: 'A', min_version: 'nova' }, 'min_version'],
    [{ user_ids: [ELEG], variant: 'A' }, 'min_version'],
  ])('recusa %j', (raw, field) => {
    const r = parseReactivationInput(raw as Record<string, unknown>)
    expect(r.ok).toBe(false)
    if (r.ok === false) expect(r.error).toContain(field)
  })

  it('recusa coorte acima do teto e aceita uids repetidos sem duplicar', () => {
    const many = Array.from({ length: 101 }, (_, i) => `a0000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
    expect(parseReactivationInput({ user_ids: many, variant: 'A', min_version: '0.35.0' }).ok).toBe(false)
    const r = parseReactivationInput({ user_ids: `${ELEG},${ELEG}`, variant: 'A', min_version: '0.35.0' })
    expect(r.ok === true && r.value.userIds).toEqual([ELEG])
  })

  it('POST sem confirmação não envia nada', async () => {
    const w = world()
    const r = res()
    await handleReactivation(send([ELEG], { confirm: undefined }), r, null, w.deps)
    expect(r.statusCode).toBe(400)
    expect(w.dispatch).not.toHaveBeenCalled()
  })
})

describe('126 — variantes para o painel', () => {
  it('GET action=variants devolve os textos sem tocar no banco', async () => {
    const w = world()
    const r = res()
    await handleReactivation({ method: 'GET', query: { action: 'variants' } }, r, null, w.deps)
    expect(r.statusCode).toBe(200)
    expect(r.body.data).toEqual(REACTIVATION_VARIANTS)
    expect(w.store.alreadySent).not.toHaveBeenCalled()
  })
})

describe('PO-126-1 — coorte de 3: 1 elegível, 1 versão antiga, 1 sem token', () => {
  it('simulação lista quem receberia, sem enviar', async () => {
    const w = world()
    const r = res()
    await handleReactivation({ method: 'GET', query: { user_ids: `${ELEG},${OLD},${NOTOKEN}`, variant: 'B', min_version: '0.35.0' } }, r, null, w.deps)
    expect(r.statusCode).toBe(200)
    expect(r.body.data.mode).toBe('simulate')
    expect(r.body.data.preview).toEqual(REACTIVATION_VARIANTS.B)
    expect(r.body.data.would_send).toEqual([ELEG])
    expect(r.body.data.skipped).toEqual([
      { user_id: OLD, reason: 'no_eligible_device' },
      { user_id: NOTOKEN, reason: 'no_eligible_device' },
    ])
    expect(w.dispatch).not.toHaveBeenCalled()
  })

  it('POST com simulate: true simula sem confirmação e sem enviar', async () => {
    const w = world()
    const r = res()
    await handleReactivation(send([ELEG, OLD], { simulate: true, confirm: undefined }), r, null, w.deps)
    expect(r.statusCode).toBe(200)
    expect(r.body.data.mode).toBe('simulate')
    expect(r.body.data.would_send).toEqual([ELEG])
    expect(w.dispatch).not.toHaveBeenCalled()
  })

  it('envio: 1 enviado, 2 pulados com motivo; só o aparelho ≥ min recebe', async () => {
    const w = world()
    const r = res()
    await handleReactivation(send([ELEG, OLD, NOTOKEN]), r, null, w.deps)
    expect(r.statusCode).toBe(200)
    expect(r.body.data.sent).toEqual([{ user_id: ELEG, delivered: 1, failed: 0 }])
    expect(r.body.data.skipped_by_reason).toEqual({ no_eligible_device: 2 })
    expect(r.body.data.unlogged).toEqual([])
    expect(w.seenDevices[ELEG].map((d) => d.push_token)).toEqual(['ExponentPushToken[new]'])
    const call = w.dispatch.mock.calls[0][0]
    expect(call).toMatchObject({ kind: 'reactivation_notice', data: { variant: 'B' }, channels: ['mobile_push'], context: { awaitLog: true } })
  })

  it('versão ilegível ou nula não conta como elegível', async () => {
    const w = world({ devices: [
      { id: 'd4', user_id: ELEG, push_token: 't1', app_version: null },
      { id: 'd5', user_id: ELEG, push_token: 't2', app_version: 'dev' },
    ] })
    const r = res()
    await handleReactivation(send([ELEG]), r, null, w.deps)
    expect(r.body.data.skipped).toEqual([{ user_id: ELEG, reason: 'no_eligible_device' }])
  })

  it('consentimento revogado e horário silencioso são pulados sem queimar a tentativa', async () => {
    const devices = [REVOKED, QUIET].map((user_id) => ({ id: `d-${user_id}`, user_id, push_token: `t-${user_id}`, app_version: '0.35.1' }))
    const w = world({ devices, settings: {
      [REVOKED]: { consent_revoked_at: '2026-10-01T00:00:00Z' },
      [QUIET]: { quiet_hours_enabled: true, quiet_hours_start: '19:00', quiet_hours_end: '07:00' },
    } })
    const r = res()
    await handleReactivation(send([REVOKED, QUIET]), r, null, w.deps)
    expect(r.body.data.skipped).toEqual([
      { user_id: REVOKED, reason: 'consent_revoked' },
      { user_id: QUIET, reason: 'quiet_hours' },
    ])
    expect(w.dispatch).not.toHaveBeenCalled()
    expect(w.log.size).toBe(0)
  })

  it('leitura de settings que falhou pula a conta (fail-closed)', async () => {
    const w = world({ settings: { [ELEG]: { _read_failed: true } } })
    const r = res()
    await handleReactivation(send([ELEG]), r, null, w.deps)
    expect(r.body.data.skipped).toEqual([{ user_id: ELEG, reason: 'consent_revoked' }])
  })

  it('log ilegível ⇒ 500 e nada enviado', async () => {
    const w = world({ logFails: true })
    const r = res()
    await handleReactivation(send([ELEG]), r, null, w.deps)
    expect(r.statusCode).toBe(500)
    expect(w.dispatch).not.toHaveBeenCalled()
  })
})

describe('126 — achados do RC6 (#980)', () => {
  it('uid em maiúsculas casa com o log em minúsculas: não reenvia', async () => {
    const w = world({ logged: [ELEG] })
    const r = res()
    await handleReactivation(send([ELEG.toUpperCase()]), r, null, w.deps)
    expect(r.body.data.skipped).toEqual([{ user_id: ELEG, reason: 'already_sent' }])
    expect(w.dispatch).not.toHaveBeenCalled()
  })

  it('push desligado nas preferências é pulado', async () => {
    const w = world({ settings: { [ELEG]: { channel_mobile_push_enabled: false } } })
    const r = res()
    await handleReactivation(send([ELEG]), r, null, w.deps)
    expect(r.body.data.skipped).toEqual([{ user_id: ELEG, reason: 'push_disabled' }])
  })

  it('janela silenciosa que abre no meio do lote adia a conta sem gastar a tentativa', async () => {
    const devices = [ELEG, QUIET].map((user_id) => ({ id: `d-${user_id}`, user_id, push_token: `t-${user_id}`, app_version: '0.35.0' }))
    const quiet = { quiet_hours_enabled: true, quiet_hours_start: '19:31', quiet_hours_end: '07:00' }
    const w = world({ devices, settings: { [ELEG]: quiet, [QUIET]: quiet } })
    const clock = ['19:30', '19:30', '19:31']
    w.deps.nowHHMM = () => clock.shift() ?? '19:31'
    const r = res()
    await handleReactivation(send([ELEG, QUIET]), r, null, w.deps)
    expect(r.body.data.sent.map((x: { user_id: string }) => x.user_id)).toEqual([ELEG])
    expect(r.body.data.skipped).toEqual([{ user_id: QUIET, reason: 'quiet_hours' }])
    expect(w.log.has(QUIET)).toBe(false)
  })

  it('releitura do log falhou depois do envio: 200 com todos em unlogged', async () => {
    const w = world()
    const original = w.store.alreadySent.getMockImplementation()!
    w.store.alreadySent.mockImplementationOnce(original).mockRejectedValueOnce(new Error('caiu'))
    const r = res()
    await handleReactivation(send([ELEG]), r, null, w.deps)
    expect(r.statusCode).toBe(200)
    expect(r.body.data.unlogged).toEqual([ELEG])
  })
})

describe('PO-126-2 — uma tentativa só', () => {
  it('2º disparo sobre a mesma coorte envia 0, mesmo com a 1ª entrega falha', async () => {
    const w = world({ dispatchFails: true })
    const r1 = res()
    await handleReactivation(send([ELEG, OLD, NOTOKEN]), r1, null, w.deps)
    expect(r1.body.data.sent).toHaveLength(1)
    const r2 = res()
    await handleReactivation(send([ELEG, OLD, NOTOKEN], { variant: 'C' }), r2, null, w.deps)
    expect(r2.body.data.sent).toEqual([])
    expect(r2.body.data.skipped).toContainEqual({ user_id: ELEG, reason: 'already_sent' })
    expect(w.dispatch).toHaveBeenCalledTimes(1)
  })

  it('enviado sem linha no log aparece em `unlogged`', async () => {
    const w = world()
    w.dispatch.mockImplementationOnce(async () => ({ success: true, totalDelivered: 1, totalFailed: 0 }))
    const r = res()
    await handleReactivation(send([ELEG]), r, null, w.deps)
    expect(r.body.data.unlogged).toEqual([ELEG])
  })
})

describe('PO-126-3 — payload: destino Hoje, sem dado de saúde', () => {
  it.each(Object.keys(REACTIVATION_VARIANTS))('variante %s: Hoje, só campos de roteamento, texto intacto sem B', (variant) => {
    const p = buildNotificationPayload({ kind: 'reactivation_notice', data: { variant } as never, context: { correlationId: 'c1' } })
    const v = REACTIVATION_VARIANTS[variant as keyof typeof REACTIVATION_VARIANTS]
    expect(p.metadata.navigation).toEqual({ screen: 'today', params: {} })
    expect(p.deeplink).toBe('dosiq://today')
    expect(Object.keys(p.metadata).sort()).toEqual(['builtAt', 'correlationId', 'kind', 'navigation'])
    expect(p.pushBody).toBe(v.body)
    expect(v.title.length).toBeLessThanOrEqual(40)
    expect(v.body.length).toBeLessThanOrEqual(110)
    const redacted = redactForNoTransfer(p)
    expect(redacted.title).toBe(v.title)
    expect(redacted.pushBody).toBe(v.body)
  })

  it('dado fora do schema (texto livre, remédio) é recusado', () => {
    expect(() => buildNotificationPayload({ kind: 'reactivation_notice', data: { variant: 'A', medicineName: 'X' } as never })).toThrow()
    expect(() => buildNotificationPayload({ kind: 'reactivation_notice', data: { variant: 'livre' } as never })).toThrow()
  })
})
