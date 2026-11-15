// treatmentWeek.ts — regras puras do módulo "Semana do tratamento" da Hoje (spec 121 A).
import { BIOMARKER_PLAUSIBLE_RANGES, shiftDay } from '@dosiq/core'

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
