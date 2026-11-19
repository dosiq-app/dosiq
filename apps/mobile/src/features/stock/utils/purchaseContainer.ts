// purchaseContainer — recipiente do injetável no form de compra (spec 125 1c, AC7.7/AC7.8).

import {
  INJECTION_CONTAINERS,
  INJECTION_CONTAINER_LABELS,
  INJECTION_CONTAINER_SINGULAR,
  formatDose,
  formatNumberPtBR,
  formatStockApplications,
} from '@dosiq/core'
import { medicineAmounts } from '@treatments/utils/penDose'

/** Chips = os 5 valores do CHECK `purchases_injection_container_check` (R-295, prod 19/11), não 4. */
export const CONTAINER_OPTIONS = INJECTION_CONTAINERS.map((c) => ({ value: c, label: INJECTION_CONTAINER_LABELS[c] ?? c }))

/** Plural PT simples dos rótulos de recipiente (caneta→canetas, refil→refis). */
function pluralize(word: string): string {
  if (word.endsWith('il')) return `${word.slice(0, -2)}is`
  return `${word}s`
}

/**
 * Rótulos da quantidade na língua do recipiente (AC7.8). Injetável sem recipiente ⇒ neutro
 * ("unidade"); líquido não injetável segue "frasco".
 */
export function containerWords(isInjectable: boolean, container: string | null | undefined) {
  const singular = isInjectable ? (INJECTION_CONTAINER_SINGULAR[container ?? ''] ?? 'unidade') : 'frasco'
  return { singular, plural: pluralize(singular) }
}

/**
 * mL por aplicação do 1º tratamento ativo com dose utilizável (mL direto, ou mg/UI ÷ concentração por mL).
 * Sem tratamento ou sem concentração ⇒ null (o total sai sem "≈ N aplicações" — U-3 do analysis-1c).
 */
export function mlPerApplication(medicine: any, protocols: any[] | null | undefined): number | null {
  if (!Array.isArray(protocols)) return null
  const { perMl } = medicineAmounts(medicine)
  for (const p of protocols) {
    if (!p || p.active === false) continue
    const dose = Number(String(p.dosage_per_intake ?? '').replace(',', '.'))
    if (!Number.isFinite(dose) || dose <= 0) continue
    if (p.intake_unit === 'ml') return dose
    if ((p.intake_unit === 'mg' || p.intake_unit === 'UI') && perMl && perMl > 0) return dose / perMl
  }
  return null
}

/** Total da compra (AC7.8): "1 caneta · 2,4 mL ≈ 4 aplicações"; sem mL por aplicação, sem o "≈". */
export function purchaseTotalText(bottles: number, volume: number, words: { singular: string; plural: string }, perApp: number | null): string {
  const ml = bottles * volume
  const count = `${formatNumberPtBR(bottles)} ${bottles === 1 ? words.singular : words.plural}`
  const base = `${count} · ${formatDose(ml, 'ml')}`
  return perApp ? `${base} ${formatStockApplications(ml, perApp, null)}` : base
}

// Smoke 1c (PO 19/11): exemplo em cinza do "mL por …" pelo recipiente — 100 só cabe em frasco de xarope.
// É exemplo, nunca valor: campo vazio continua vazio.
const VOLUME_EXAMPLE: Record<string, number> = {
  caneta: 3,
  refil: 3,
  ampola: 1,
  frasco_ampola: 10,
  seringa_preenchida: 0.5,
}

export function volumePlaceholder(isInjectable: boolean, container: string | null | undefined): string {
  const ml = isInjectable ? (VOLUME_EXAMPLE[container ?? ''] ?? 3) : 100
  return `ex.: ${formatDose(ml, 'ml')}`
}

// Quantos vêm numa caixa comum (smoke 1c, PO 19/11): canetas/seringas de dose única semanal vêm de 4
// (Mounjaro), refis de insulina de 5, ampolas de 3; frasco e frasco-ampola, 1.
const COUNT_EXAMPLE: Record<string, number> = { caneta: 4, seringa_preenchida: 4, refil: 5, ampola: 3, frasco_ampola: 1 }

/** Exemplo da contagem com a palavra do recipiente ("ex.: 4 canetas") — distingue do volume no olhar. */
export function countPlaceholder(container: string | null | undefined, words: { singular: string; plural: string }): string {
  const n = COUNT_EXAMPLE[container ?? ''] ?? 1
  return `ex.: ${n} ${n === 1 ? words.singular : words.plural}`
}
