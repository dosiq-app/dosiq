// weightChange.ts — variação de peso no período (spec 121 FR-012 · ADR-125 §2).
// Fonte única: PDF (`reportTemplate.weightTable`), Hoje (L2) e detalhe do tratamento.
// Informacional: valor e sinal, nunca cor, seta ou juízo (ADR-062 emendado pelo ADR-125).

import { formatNumberPtBR } from '../utils/doseUnit'

export interface WeightChange {
  /** Última − primeira, arredondada a 0,1 kg. */
  delta: number
  /** Com sinal: `+1,2` · `−1,2` (U+2212) · `0`. Sem unidade. */
  label: string
}

/**
 * Variação última − primeira de uma série JÁ ORDENADA no tempo (mais antiga primeiro).
 * Menos de 2 pontos ⇒ `null` (não há variação a mostrar).
 */
export function weightChange(points: ReadonlyArray<{ value: number }>): WeightChange | null {
  if (points.length < 2) return null
  const first = points[0].value
  const last = points[points.length - 1].value
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null
  // `+ 0` normaliza −0 (ex.: −0,04 arredonda a −0) para não sair "−0".
  const delta = Math.round((last - first) * 10) / 10 + 0
  const abs = formatNumberPtBR(Math.abs(delta))
  const label = delta > 0 ? `+${abs}` : delta < 0 ? `−${abs}` : formatNumberPtBR(0)
  return { delta, label }
}
