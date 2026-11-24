// trackedSelection.ts — regras puras do seletor "Acompanhar" (spec 124 B · FR-012/014/016/019).
//
// - `trackedStatus`: estado neutro de um tratamento elegível (lacuna · hoje · próxima · 1ª dose).
// - `pickTrackedDefault`: seleção padrão a cada abertura — lacuna > dose prevista hoje > próxima mais
//   cedo; empate ⇒ wedge, depois `id` (estável entre renderizações).
// - `trackedStatusLine`: linha do sheet. Vocabulário da L1 (G-B3: lacuna NÃO diz "sem registro").
// - `widgetMeasure`: medida da L2 do widget. NULL ⇒ wedge peso / não wedge nenhum (PO 23/11).
//   Chave AUSENTE = NULL (RC3 E-12 revisto 24/11: "ausente ⇒ nenhum" tirava o peso do wedge que a 121
//   sempre mostrou — SC-003); valor fora do enum ⇒ nenhum.
//   `effectiveMeasure` do core fica intacto (pedido pós-dose da 100).
// SaMD: nenhum estado fala de atraso, risco ou janela.

import { TRACKED_MEASURES, daysDifference, formatConcentration, summarizeWeeklyDose, isInjectable, type DoseCadence, type WeeklyApplication } from '@dosiq/core'
import { weekdayDate } from '@dashboard/utils/treatmentWeek'

export type TrackedKind = 'wedge' | 'injetavel' | 'outro'
export type WidgetMeasure = 'peso' | 'glicemia' | 'pressao_arterial' | 'nenhum'

export interface TrackedStatus {
  /** Dia local da última dose quando há lacuna (cadência ≥ 7 d só — PO 24/11, Q-2). */
  gapSince: string | null
  /** Nenhuma dose registrada (leitura OK e vazia). */
  first: boolean
  /** Dose prevista hoje (qualquer cadência — PO 24/11, Q-1). */
  today: boolean
  nextDay: string | null
  daysUntil: number | null
}

/**
 * @param latest - última aplicação: objeto · `null` (nenhuma) · `undefined` (leitura falhou ⇒ sem
 *   lacuna e sem 1ª dose; nunca bloqueia a Hoje — RC3 E-11)
 * @param upcomingDates - próximas datas do calendário do tratamento (YYYY-MM-DD, crescente)
 */
export function trackedStatus({ cadence, latest, upcomingDates, todayLocal, tz }: {
  cadence: DoseCadence
  latest: WeeklyApplication | null | undefined
  upcomingDates: readonly string[] | null | undefined
  todayLocal: string
  tz: string
}): TrackedStatus {
  const dates = Array.isArray(upcomingDates) ? upcomingDates.filter((d) => d >= todayLocal) : []
  const nextDay = dates[0] ?? null
  const today = nextDay === todayLocal
  const daysUntil = nextDay ? Math.max(0, daysDifference(todayLocal, nextDay)) : null
  let gapSince: string | null = null
  if (cadence.kind === 'weekly' && latest) {
    const s = summarizeWeeklyDose({ applications: [latest], nextDay, intervalDays: cadence.days, todayLocal, tz })
    if (s.state === 'gap' && s.last) gapSince = s.last.day
  }
  return { gapSince, first: latest === null, today, nextDay, daysUntil }
}

export interface TrackedCandidate {
  id: string
  isWedge: boolean
  status: TrackedStatus
}

function rank(c: TrackedCandidate): [number, string, number, string] {
  // menor ganha: grupo · chave do grupo · wedge primeiro · id
  const wedge = c.isWedge ? 0 : 1
  if (c.status.gapSince) return [0, c.status.gapSince, wedge, c.id]
  if (c.status.today) return [1, '', wedge, c.id]
  if (c.status.nextDay) return [2, c.status.nextDay, wedge, c.id]
  return [3, '', wedge, c.id]
}

function compare(a: TrackedCandidate, b: TrackedCandidate): number {
  const ra = rank(a)
  const rb = rank(b)
  for (let i = 0; i < ra.length; i++) {
    if (ra[i] < rb[i]) return -1
    if (ra[i] > rb[i]) return 1
  }
  return 0
}

/** FR-014. Lacuna mais antiga primeiro; sem candidato ⇒ null. */
export function pickTrackedDefault(candidates: readonly TrackedCandidate[] | null | undefined): string | null {
  if (!Array.isArray(candidates) || candidates.length === 0) return null
  return [...candidates].sort(compare)[0].id
}

function daysWord(n: number): string {
  return n === 1 ? '1 dia' : `${n} dias`
}

/** Linha neutra do sheet (FR-012). */
export function trackedStatusLine(s: TrackedStatus, injectable: boolean): string {
  if (s.gapSince) return `${injectable ? 'Última aplicação registrada' : 'Última dose registrada'} · ${weekdayDate(s.gapSince)}`
  if (s.today) return 'Dose prevista hoje'
  if (s.first) return s.nextDay ? `1ª dose · ${weekdayDate(s.nextDay)}` : '1ª dose'
  if (s.nextDay && s.daysUntil != null) {
    return s.daysUntil === 1 ? `Próxima amanhã · ${weekdayDate(s.nextDay)}` : `Próxima em ${daysWord(s.daysUntil)} · ${weekdayDate(s.nextDay)}`
  }
  return ''
}

/** Domínio fechado do evento (RC3 E-15) — nunca nome nem id. */
export function trackedKind(isWedge: boolean, medicine: unknown): TrackedKind {
  if (isWedge) return 'wedge'
  return isInjectable(medicine as any) ? 'injetavel' : 'outro'
}

const MEASURE_SET = new Set<string>(TRACKED_MEASURES as readonly string[])

/** FR-016 · RC3 E-12. */
export function widgetMeasure(protocol: object | null | undefined, isWedge: boolean): WidgetMeasure {
  if (!protocol) return 'nenhum'
  const value = (protocol as { tracked_measure?: unknown }).tracked_measure
  if (value === null || value === undefined) return isWedge ? 'peso' : 'nenhum'
  return typeof value === 'string' && MEASURE_SET.has(value) ? (value as WidgetMeasure) : 'nenhum'
}

/** Concentração do selo do cabeçalho e da linha do sheet (mesmo pill do card do remédio). */
export function moduleConcentration(medicine: any): string | null {
  return medicine?.dosage_per_pill
    ? formatConcentration(medicine.dosage_per_pill, medicine.dosage_unit, medicine.concentration_volume_ml)
    : null
}
