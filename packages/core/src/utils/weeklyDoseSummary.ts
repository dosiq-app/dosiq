/**
 * weeklyDoseSummary — leitura da L1 "Dose" da Semana do tratamento (spec 121 B, FR-030/FR-033).
 *
 * Funções PURAS (sem I/O, sem relógio implícito): o chamador passa `todayLocal`/`now` e o fuso.
 *
 * - `summarizeWeeklyDose`: última aplicação, próxima, lacuna e 1ª dose. Parametrizada por
 *   `intervalDays` (semanal = 7; `intervalo_dias` = N) — a fatia C reaproveita para outras cadências.
 * - `resolveEarlyAnchorInstance`: ocorrência futura que o "Já apliquei" pode registrar (ADR-130).
 *
 * R-299: a última aplicação é a linha de FATO (`medicine_logs`), com o próprio `medicine_id` e
 * `injection_site`; nada aqui deriva atributo da entidade viva.
 * R-020: todo "dia" é dia LOCAL do dono no fuso informado — nunca UTC.
 */
import { daysDifference, formatLocalDate, getUserTime, parseISO } from './dateUtils'
import { getKnownInjectionSiteLabel } from './injectionSites'

const DEFAULT_INTERVAL_DAYS = 7
const MS_MINUTE = 60_000

/** Aplicação registrada (linha de `medicine_logs`), mais recente primeiro. */
export interface WeeklyApplication {
  taken_at: string
  injection_site?: string | null
  medicine_id?: string | null
}

export type WeeklyDoseState = 'first_dose' | 'on_track' | 'gap'

export interface WeeklyDoseLast {
  /** Dia local (YYYY-MM-DD) da aplicação. */
  day: string
  /** HH:mm local da aplicação. */
  time: string
  /** Dias de calendário local desde a aplicação (0 = hoje). */
  daysSince: number
  /** Local canônico conhecido, ou null (sem local / valor desconhecido no banco). */
  site: string | null
  siteLabel: string | null
}

export interface WeeklyDoseNext {
  day: string
  /** Dias de calendário local até a próxima (0 = hoje). */
  daysUntil: number
}

export interface WeeklyDoseSummary {
  state: WeeklyDoseState
  intervalDays: number
  last: WeeklyDoseLast | null
  next: WeeklyDoseNext | null
}

/** Intervalo válido ou o padrão semanal (null/0/negativo/NaN ⇒ 7). */
export function normalizeIntervalDays(intervalDays: number | null | undefined): number {
  const n = Number(intervalDays)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_INTERVAL_DAYS
}

/** Dia local + HH:mm de um instante ISO no fuso. */
function localParts(iso: string, tz: string): { day: string; time: string } | null {
  const d = parseISO(iso)
  if (Number.isNaN(d.getTime())) return null
  const local = getUserTime(d, tz)
  const time = `${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}`
  return { day: formatLocalDate(local), time }
}

/**
 * Resumo da L1 para cadência não diária.
 * @param applications - aplicações do tratamento, MAIS RECENTE PRIMEIRO (só a 1ª é usada aqui)
 * @param nextDay - próxima data prevista (YYYY-MM-DD) ou null (tratamento terminando)
 * @param intervalDays - cadência em dias (padrão 7)
 * @param todayLocal - hoje no fuso do dono (YYYY-MM-DD)
 * @param tz - fuso IANA do dono
 */
export function summarizeWeeklyDose({
  applications,
  nextDay,
  intervalDays,
  todayLocal,
  tz,
}: {
  applications: readonly WeeklyApplication[] | null | undefined
  nextDay: string | null | undefined
  intervalDays?: number | null
  todayLocal: string
  tz: string
}): WeeklyDoseSummary {
  const interval = normalizeIntervalDays(intervalDays)
  const next: WeeklyDoseNext | null = nextDay
    ? { day: nextDay, daysUntil: Math.max(0, daysDifference(todayLocal, nextDay)) }
    : null

  const latest = Array.isArray(applications) ? applications[0] : undefined
  const parts = latest?.taken_at ? localParts(latest.taken_at, tz) : null
  if (!latest || !parts) return { state: 'first_dose', intervalDays: interval, last: null, next }

  const site = getKnownInjectionSiteLabel(latest.injection_site) ? (latest.injection_site as string) : null
  const daysSince = Math.max(0, daysDifference(parts.day, todayLocal))
  const last: WeeklyDoseLast = {
    day: parts.day,
    time: parts.time,
    daysSince,
    site,
    siteLabel: site ? getKnownInjectionSiteLabel(site) : null,
  }
  return { state: daysSince > interval ? 'gap' : 'on_track', intervalDays: interval, last, next }
}

/** Ocorrência como o "Já apliquei" precisa (`dose_instances`). */
export interface AnchorCandidate {
  id: string
  status: string
  scheduled_for: string
  tolerance_minutes?: number | null
}

/**
 * ADR-130: ocorrência FUTURA que o registro manual adiantado pode ancorar — a mais próxima com
 * `status = 'pending'` e `scheduled_for` em (now, now + tolerância da própria ocorrência).
 * Dose atrasada (passado) NÃO entra: é do hero ("ainda dá tempo"). Em cadência semanal os dois
 * nunca coexistem (tolerância = metade do intervalo).
 *
 * Só para cadência NÃO diária — o chamador garante (diário/PRN mantêm o piso de 2 h da 067 A2).
 */
export function resolveEarlyAnchorInstance<T extends AnchorCandidate>(
  instances: readonly T[] | null | undefined,
  now: Date
): T | null {
  if (!Array.isArray(instances)) return null
  const nowMs = now.getTime()
  let best: T | null = null
  let bestMs = Infinity
  for (const inst of instances) {
    if (inst?.status !== 'pending') continue
    const ms = parseISO(inst.scheduled_for).getTime()
    const tol = Number(inst.tolerance_minutes)
    if (!Number.isFinite(ms) || !Number.isFinite(tol) || tol <= 0) continue
    // Aberto nos dois lados: no instante exato de "agora + tolerância" a anterior ainda é do hero
    // (tolerância inclusiva) — fronteira fica com o passado, nunca os dois ao mesmo tempo.
    if (ms <= nowMs || ms - nowMs >= tol * MS_MINUTE) continue
    if (ms < bestMs) {
      best = inst
      bestMs = ms
    }
  }
  return best
}

/** Status de ocorrência já resolvida pela paciente: não é mais "próxima". */
const RESOLVED_STATUSES = new Set(['taken', 'skipped_user'])

/**
 * ADR-130 (achado do smoke da 121 B): a "próxima" do calendário (`listUpcomingDoseDates`) não sabe
 * que a ocorrência futura já foi registrada adiantada. Devolve o 1º dia do calendário cuja
 * ocorrência NÃO está resolvida (`taken`/`skipped_user`) em `dose_instances`; dia sem instância
 * carregada conta como em aberto.
 * @param calendarDays - próximos dias do calendário (YYYY-MM-DD local), em ordem
 * @param instances - instâncias do tratamento na janela (qualquer status)
 */
export function resolveNextOpenDay(
  calendarDays: readonly string[],
  instances: readonly { scheduled_for: string; status: string }[] | null | undefined,
  tz: string
): string | null {
  const resolved = new Set<string>()
  for (const inst of instances ?? []) {
    if (!RESOLVED_STATUSES.has(inst.status)) continue
    const p = localParts(inst.scheduled_for, tz)
    if (p) resolved.add(p.day)
  }
  return calendarDays.find((d) => !resolved.has(d)) ?? null
}
