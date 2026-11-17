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

function firstDoseCopy(s: DoseSummaryLike, nextDoseLabel: string | null, injectable: boolean) {
  const n = s.next?.daysUntil
  const when = n == null ? null : n === 0 ? 'Hoje' : n === 1 ? 'Amanhã' : `Em ${daysWord(n)}`
  const first = injectable ? 'Primeira aplicação' : 'Primeira dose'
  return {
    primary: s.next ? `${first} · ${weekdayDate(s.next.day)}` : first,
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
 * 121 C (FR-043): não injetável (forma cadastrada duvidosa — caneta salva como comprimido) usa o
 * verbo neutro "Registrada"; a forma muda só o verbo, nunca a elegibilidade.
 */
export function doseRowCopy(
  s: DoseSummaryLike,
  nextDoseLabel: string | null,
  injectable = true
): { primary: string; secondary: string | null } {
  const last = s.last
  if (s.state === 'first_dose' || !last) return firstDoseCopy(s, nextDoseLabel, injectable)
  if (s.state === 'gap') {
    return {
      primary: `${injectable ? 'Última aplicação registrada' : 'Último registro'} · ${weekdayDate(last.day)}`,
      secondary: s.next ? `Próxima prevista: ${weekdayDate(s.next.day)}` : null,
    }
  }
  const verb = injectable ? 'Aplicada' : 'Registrada'
  const ago = last.daysSince === 0 ? `${verb} hoje` : `${verb} há ${daysWord(last.daysSince)}`
  // D15: sem hora para dose de outro dia (relevância clínica nula); hoje mantém a hora.
  const detail = last.siteLabel ? siteShort(last.siteLabel) : last.daysSince === 0 ? last.time : weekdayDate(last.day)
  return { primary: `${ago} · ${detail}`, secondary: nextCopy(s.next) }
}

// ─── 121 C · L1 diária (FR-040..FR-043, AC-16) ──────────────────────────────────

export type DoseCadence = { kind: 'daily'; days: 1 } | { kind: 'weekly'; days: number }

/**
 * FR-040: a L1 vale para wedge com cadência CONHECIDA — a forma não decide (substitui G-B5).
 * C-A2: `intervalo_dias` 2..6, alternado, PRN e personalizado ficam sem L1 (sem caso nem copy).
 */
export function doseCadence(protocol: { frequency?: string | null; interval_days?: number | null } | null | undefined): DoseCadence | null {
  if (!protocol) return null
  if (protocol.frequency === 'diário') return { kind: 'daily', days: 1 }
  if (protocol.frequency === 'intervalo_dias' && protocol.interval_days === 1) return { kind: 'daily', days: 1 }
  const weekly = weeklyCadenceDays(protocol)
  return weekly ? { kind: 'weekly', days: weekly } : null
}

/** Menor horário "HH:mm" do tratamento (dose do dia), ou null. */
export function firstScheduledTime(protocol: { time_schedule?: string[] | null } | null | undefined): string | null {
  const times = (protocol?.time_schedule ?? []).filter((t) => typeof t === 'string' && /^\d{2}:\d{2}/.test(t))
  return times.length ? [...times].sort()[0].slice(0, 5) : null
}

/**
 * Duas linhas da L1 diária fechada (AC-16). Contagem neutra em DOSES na janela móvel de 7 d
 * (decisões PO 17/11): "{n} de {m} doses nos últimos 7 dias" (injetável: "aplicações"); tratamento
 * mais novo que a janela: "desde o início ({dia})". Fato, não nota — sem %, cor, "perdeu" ou
 * "parabéns" (FR-046). Sem ação: a dose do dia vive no hero/agenda (FR-042).
 * @param todayTime - horário de hoje (só quando hoje é dia previsto), ou null
 * @param next - próxima ocorrência (hoje não previsto), ou null
 */
export function dailyRowCopy(
  week: { taken: number; due: number; since: string | null; todayLast: { time: string } | null },
  { injectable, todayTime, next }: { injectable: boolean; todayTime: string | null; next: { date: string; time: string } | null }
): { primary: string; secondary: string | null } {
  const unit = injectable ? (week.due === 1 ? 'aplicação' : 'aplicações') : week.due === 1 ? 'dose' : 'doses'
  const period = week.since ? `desde o início (${weekdayDate(week.since)})` : 'nos últimos 7 dias'
  const count = week.due > 0 ? `${week.taken} de ${week.due} ${unit} ${period}` : null
  let head: string | null = null
  if (week.todayLast) head = `${injectable ? 'Aplicado' : 'Tomado'} hoje · ${week.todayLast.time}`
  else if (todayTime) head = `Hoje às ${todayTime}`
  else if (next) head = `Próxima · ${weekdayDate(next.date)} às ${next.time}`
  if (!head) return { primary: count ?? '', secondary: null }
  return { primary: head, secondary: count }
}

/** Cadência ≥ 7 dias (semanal ou `intervalo_dias` ≥ 7); devolve o intervalo ou null. Base de `doseCadence`. */
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
  /** 121 C (AC-19): escada DIÁRIA — calendário da etapa em texto, nunca bolinhas por dose. */
  stageCalendar: { day: number; total: number; nextText: string | null } | null
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
 * 121 C (AC-19): "Dia N de M desta etapa" pelo calendário (início + duração da etapa) — cálculo
 * próprio, NUNCA o semanal com intervalo 1 (boundary PO-19). Dia além do fim = M (aguardando troca).
 */
function dailyStageCalendar(startDay: string | null, endDay: string | null, duration: number, todayLocal: string, nextStepNumber: number | null): EvolutionDetail['stageCalendar'] {
  if (!startDay || !endDay) return null
  const day = Math.min(duration, Math.max(1, daysDifference(startDay, todayLocal) + 1))
  return { day, total: duration, nextText: nextStepNumber ? `Etapa ${nextStepNumber} prevista · ${weekdayDate(endDay)}` : null }
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
  todayLocal: string,
  cadenceKind: 'daily' | 'weekly' = 'weekly'
): EvolutionDetail | null {
  if (!Array.isArray(ladder) || ladder.length === 0) return null
  const current = resolveCurrentStep(ladder as any)
  if (!current) return null
  const sorted = [...ladder].sort((a, b) => a.position - b.position)
  const startDay = current.started_at ? formatLocalDate(getUserTime(parseISO(current.started_at), tz)) : null
  const duration = Number(current.duration_days)
  const endDay = startDay && Number.isFinite(duration) && duration > 0 ? shiftDay(startDay, duration) : null
  const hasNextStep = sorted.some((st) => st.position === current.position + 1)
  const nextStepNumber = hasNextStep ? current.position + 2 : null
  const daily = cadenceKind === 'daily'
  // RC5 da B: bolinhas só na cadência ≥ 7 d; diário ganha calendário em texto (121 C, AC-19).
  const stageDoses = intervalDays && !daily
    ? stageDosesOf(startDay, endDay, duration, normalizeIntervalDays(intervalDays), nextDay, nextStepNumber)
    : null
  const stageCalendar = daily ? dailyStageCalendar(startDay, endDay, duration, todayLocal, nextStepNumber) : null
  const steps = sorted.map((st) => stepItem(st, current.position, startDay, endDay))
  const currentDose = endDay
    ? null
    : { dose: stepDose(current), since: sinceText(startDay, todayLocal), nextText: nextDay ? `próxima:\n${weekdayDate(nextDay)}` : null }
  return { bar: { done: current.position + 1, total: sorted.length }, stageDoses, stageCalendar, currentDose, steps }
}
