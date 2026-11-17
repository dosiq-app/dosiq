// treatmentWeek.ts — regras puras do módulo "Semana do tratamento" da Hoje (spec 121 A).
import {
  BIOMARKER_PLAUSIBLE_RANGES,
  daysDifference,
  normalizeIntervalDays,
  formatIntakeDose,
  formatLocalDate,
  getEvolutionBadge,
  getUserTime,
  parseISO,
  parseLocalDate,
  resolveCurrentStep,
  resolvePendingSwitch,
  shiftDay,
} from '@dosiq/core'

export type WeightWindow = '7d' | '30d' | 'treatment'

const RANGE = BIOMARKER_PLAUSIBLE_RANGES.peso
// AC-3: mesma frase para fora da faixa e não numérico — a regra é do Zod; a frase, da faixa dele.
export const WEIGHT_RANGE_MSG = `Use um valor entre ${RANGE.min} e ${RANGE.max} kg.`

export const formatKg1 = (kg: number) => (Math.round(kg * 10) / 10).toFixed(1).replace('.', ',')

/** "hoje" · "ontem" · "dd/mm" — dia LOCAL (R-020). */
export function whenLabel(day: string, today: string, yesterday: string): string {
  if (day === today) return 'hoje'
  if (day === yesterday) return 'ontem'
  const [, m, d] = day.split('-')
  return `${d}/${m}`
}

/** FR-011: maior janela entre 7d e 30d que tem série — tudo nos últimos 7 dias ⇒ 7d. */
export function defaultWeightWindow(points: { day: string }[] | null, today: string): WeightWindow {
  if (!points || points.length === 0) return '30d'
  const from7 = shiftDay(today, -6)
  return points.every((p) => p.day >= from7) ? '7d' : '30d'
}

/**
 * Corte do espaço vazio (smoke 121 A): o eixo começa no mais tardio entre o início nominal da janela
 * e o mais cedo entre a 1ª pesagem e o início da jornada GLP-1. Pesagem anterior ao tratamento
 * (linha de base) nunca é cortada; só os dias vazios antes de tudo.
 */
export function chartAxisFrom(windowFrom: string, firstDay: string | null, journeyStart: string | null, today: string): string {
  const earliest = [firstDay, journeyStart].filter((d): d is string => !!d).sort()[0]
  return earliest && earliest > windowFrom && earliest <= today ? earliest : windowFrom
}

// ─── 121 B · L1 Dose (FR-030, AC-11..AC-13) ─────────────────────────────────────

const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** "qua, 11/11" — dia LOCAL YYYY-MM-DD (R-020: `parseLocalDate`, nunca `new Date('YYYY-MM-DD')`). */
export function weekdayDate(day: string): string {
  const [, m, d] = day.split('-')
  return `${WEEKDAY_SHORT[parseLocalDate(day).getDay()]}, ${d}/${m}`
}

/** "Abdômen (direito)" → "abdômen direito" (copy da linha; rótulo canônico vem do core). */
export function siteShort(label: string): string {
  return label.replace(/\s*\(([^)]+)\)/, ' $1').toLowerCase()
}

function daysWord(n: number): string {
  return n === 1 ? '1 dia' : `${n} dias`
}

type DoseSummaryLike = {
  state: 'first_dose' | 'on_track' | 'gap'
  last: { day: string; time: string; daysSince: number; siteLabel: string | null } | null
  next: { day: string; daysUntil: number } | null
}

function firstDoseCopy(s: DoseSummaryLike, nextDoseLabel: string | null) {
  const n = s.next?.daysUntil
  const when = n == null ? null : n === 0 ? 'Hoje' : n === 1 ? 'Amanhã' : `Em ${daysWord(n)}`
  return {
    primary: s.next ? `Primeira aplicação · ${weekdayDate(s.next.day)}` : 'Primeira aplicação',
    secondary: when ? [when, nextDoseLabel].filter(Boolean).join(' · ') : null,
  }
}

function nextCopy(next: DoseSummaryLike['next']): string | null {
  if (!next) return null
  const date = weekdayDate(next.day)
  if (next.daysUntil === 0) return `Próxima hoje · ${date}`
  if (next.daysUntil === 1) return `Próxima amanhã · ${date}`
  return `Próxima em ${daysWord(next.daysUntil)} · ${date}`
}

/**
 * Duas linhas da L1 fechada. Neutras (sem cor de alerta), nunca sugerem local (INV-2/AC-14).
 * G-B3: lacuna NÃO usa "sem registro" (vocabulário da agenda).
 */
export function doseRowCopy(s: DoseSummaryLike, nextDoseLabel: string | null): { primary: string; secondary: string | null } {
  const last = s.last
  if (s.state === 'first_dose' || !last) return firstDoseCopy(s, nextDoseLabel)
  if (s.state === 'gap') {
    return {
      primary: `Última aplicação registrada · ${weekdayDate(last.day)}`,
      secondary: s.next ? `Próxima prevista: ${weekdayDate(s.next.day)}` : null,
    }
  }
  const ago = last.daysSince === 0 ? 'Aplicada hoje' : `Aplicada há ${daysWord(last.daysSince)}`
  // D15: sem hora para dose de outro dia (relevância clínica nula); hoje mantém a hora.
  const detail = last.siteLabel ? siteShort(last.siteLabel) : last.daysSince === 0 ? last.time : weekdayDate(last.day)
  return { primary: `${ago} · ${detail}`, secondary: nextCopy(s.next) }
}

/** G-B5: L1 da B só para injetável com cadência ≥ 7 dias; devolve o intervalo ou null. */
export function weeklyCadenceDays(protocol: { frequency?: string | null; interval_days?: number | null } | null | undefined): number | null {
  if (!protocol) return null
  if (protocol.frequency === 'semanal') return 7
  if (protocol.frequency === 'intervalo_dias' && typeof protocol.interval_days === 'number' && protocol.interval_days >= 7) {
    return protocol.interval_days
  }
  return null
}

// ─── 121 B · L3 Evolução (FR-034, AC-15) ────────────────────────────────────────

function ddmm(day: string): string {
  const [, m, d] = day.split('-')
  return `${d}/${m}`
}

function stepDose(step: any): string {
  return formatIntakeDose(step?.dose, step?.intake_unit, step?.medicine) || ''
}

export type EvolutionCopy = { key: 'em_evolucao' | 'estavel' | 'aguardando'; primary: string; secondary: string }

/**
 * Linha neutra da L3 a partir da escada COMPLETA (`titration_id`, AP-311). Estado = o da 029
 * (`resolvePendingSwitch` > `getEvolutionBadge`). Sem ação: "Iniciar etapa" mora só no card da 029.
 * Sem escada ou sem etapa vigente ⇒ null (linha omitida).
 */
export function evolutionRowCopy(ladder: any[] | null | undefined, todayLocal: string, tz: string): EvolutionCopy | null {
  if (!Array.isArray(ladder) || ladder.length === 0) return null
  const total = ladder.length
  const pending = resolvePendingSwitch(ladder as any, todayLocal, tz)
  if (pending) {
    const p = ladder.find((s) => s.id === pending.pendingStepId)
    const c = ladder.find((s) => s.id === pending.currentStepId)
    const pDose = stepDose(p)
    const cDose = stepDose(c)
    return {
      key: 'aguardando',
      primary: `Etapa ${pending.pendingPosition + 1} aguardando${pDose ? ` · ${pDose}` : ''}`,
      secondary: `Desde ${ddmm(pending.dueDay)}${cDose ? ` · lembretes seguem em ${cDose}` : ''}`,
    }
  }
  const current = resolveCurrentStep(ladder as any)
  if (!current) return null
  const dose = stepDose(current)
  const primary = `Etapa ${current.position + 1} de ${total}${dose ? ` · ${dose}` : ''}`
  const badge = getEvolutionBadge(ladder as any)
  if (badge.key === 'em_evolucao') return { key: 'em_evolucao', primary, secondary: badge.label }
  const since = current.started_at ? ddmm(formatLocalDate(getUserTime(parseISO(current.started_at), tz))) : null
  return { key: 'estavel', primary, secondary: since ? `${badge.label} · desde ${since}` : badge.label }
}

export type EvolutionStepItem = { position: number; label: string; note: string; state: 'done' | 'now' | 'next' | 'later' }
export type EvolutionDetail = {
  /** Barra da linha fechada (só em evolução): etapas até a vigente cheias. */
  bar: { done: number; total: number }
  /** "Doses desta etapa" — só em evolução com duração definida; calendário da etapa, não adesão. */
  stageDoses: { total: number; done: number; nextOrdinal: number | null; nextDay: string | null; nextText: string | null } | null
  /** Etapa sem fim definido (estável): "Dose atual" + tempo nela + próxima. Nunca "manutenção" (juízo clínico). */
  currentDose: { dose: string; since: string | null; nextText: string | null } | null
  steps: EvolutionStepItem[]
}

function sinceText(startDay: string | null, todayLocal: string): string | null {
  if (!startDay) return null
  const weeks = Math.floor(daysDifference(startDay, todayLocal) / 7)
  if (weeks < 0) return null
  if (weeks === 0) return 'há menos de 1 semana'
  return `há ${weeks} ${weeks === 1 ? 'semana' : 'semanas'}`
}

/** "What's next" do bloco: próxima desta etapa ("3ª de 4") ou, etapa completa, a 1ª da seguinte. */
function stageNextText(nextOrdinal: number | null, total: number, nextDay: string | null, endDay: string, nextStepNumber: number | null): string | null {
  if (!nextDay) return null
  if (nextOrdinal) return `próxima: ${nextOrdinal}ª de ${total}\n${weekdayDate(nextDay)}`
  if (nextDay >= endDay && nextStepNumber) return `próxima: 1ª da etapa ${nextStepNumber}\n${weekdayDate(nextDay)}`
  return null
}

function stageDosesOf(startDay: string | null, endDay: string | null, duration: number, interval: number, nextDay: string | null, nextStepNumber: number | null): EvolutionDetail['stageDoses'] {
  // RC5: sem próxima data não há calendário a desenhar — nunca pintar tudo como feito.
  if (!startDay || !endDay || !nextDay) return null
  const total = Math.max(1, Math.ceil(duration / interval))
  const inStage = !!nextDay && nextDay >= startDay && nextDay < endDay
  const ordinal = inStage ? Math.floor(daysDifference(startDay, nextDay as string) / interval) + 1 : null
  const nextOrdinal = ordinal && ordinal <= total ? ordinal : null
  const nextText = stageNextText(nextOrdinal, total, nextDay, endDay, nextStepNumber)
  return { total, done: nextOrdinal ? nextOrdinal - 1 : total, nextOrdinal, nextDay: nextOrdinal ? nextDay : null, nextText }
}

function stepItem(st: any, currentPos: number, startDay: string | null, endDay: string | null): EvolutionStepItem {
  const label = `Etapa ${st.position + 1}${stepDose(st) ? ` · ${stepDose(st)}` : ''}`
  if (st.status === 'completed') return { position: st.position, label, note: 'concluída', state: 'done' }
  if (st.position === currentPos) {
    const note = endDay ? `até ${ddmm(endDay)}` : startDay ? `desde ${ddmm(startDay)}` : 'atual'
    return { position: st.position, label, note, state: 'now' }
  }
  const isNext = st.position === currentPos + 1
  return { position: st.position, label, note: isNext && endDay ? `prevista ${ddmm(endDay)}` : '', state: isNext ? 'next' : 'later' }
}

/**
 * L3 aberta (121 B · B-2, revisão PO 16/11): escada COMPLETA (AP-311) + doses da etapa vigente.
 * "Doses desta etapa" segue o CALENDÁRIO da etapa (D7: janela da etapa), a partir da próxima data
 * prevista — não conta registros (adesão não é papel da linha). Etapa sem duração (final) ⇒ sem bloco.
 */
export function evolutionDetail(
  ladder: any[] | null | undefined,
  nextDay: string | null,
  intervalDays: number | null,
  tz: string,
  todayLocal: string
): EvolutionDetail | null {
  if (!Array.isArray(ladder) || ladder.length === 0) return null
  const current = resolveCurrentStep(ladder as any)
  if (!current) return null
  const sorted = [...ladder].sort((a, b) => a.position - b.position)
  const startDay = current.started_at ? formatLocalDate(getUserTime(parseISO(current.started_at), tz)) : null
  const duration = Number(current.duration_days)
  const endDay = startDay && Number.isFinite(duration) && duration > 0 ? shiftDay(startDay, duration) : null
  const hasNextStep = sorted.some((st) => st.position === current.position + 1)
  // RC5: só cadência ≥ 7 d (a L1 da B); escada diária fica para a fatia C — nunca calcular como semanal.
  const stageDoses = intervalDays
    ? stageDosesOf(startDay, endDay, duration, normalizeIntervalDays(intervalDays), nextDay, hasNextStep ? current.position + 2 : null)
    : null
  const steps = sorted.map((st) => stepItem(st, current.position, startDay, endDay))
  const currentDose = endDay
    ? null
    : { dose: stepDose(current), since: sinceText(startDay, todayLocal), nextText: nextDay ? `próxima:\n${weekdayDate(nextDay)}` : null }
  return { bar: { done: current.position + 1, total: sorted.length }, stageDoses, currentDose, steps }
}
