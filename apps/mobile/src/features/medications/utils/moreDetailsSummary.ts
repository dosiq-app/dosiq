// moreDetailsSummary — resumo de "Mais detalhes" fechado no form de remédio (smoke 125 1c, PO 19/11).

import { MEDICINE_TYPE_LABELS, REGULATORY_CATEGORY_LABELS } from '@dosiq/core'

export const MORE_DETAILS_EMPTY_SUMMARY = 'Princípio ativo · Tipo · Classe · Categoria · Laboratório'

/**
 * Smoke 1c (PO 19/11): fechado, o resumo mostra os valores preenchidos (não há padrão aqui — o tipo
 * "Medicamento" é o de partida e só aparece quando vira "Suplemento"). Nasce sempre fechado.
 */
export function moreDetailsSummary(values: Record<string, unknown>): string {
  const text = (k: string) => String(values[k] ?? '').trim()
  const items = [
    text('active_ingredient'),
    values.type && values.type !== 'medicamento' ? (MEDICINE_TYPE_LABELS[values.type as string] ?? String(values.type)) : '',
    text('therapeutic_class'),
    values.regulatory_category ? (REGULATORY_CATEGORY_LABELS[values.regulatory_category as string] ?? String(values.regulatory_category)) : '',
    text('laboratory'),
  ].filter(Boolean)
  return items.length ? items.join(' · ') : MORE_DETAILS_EMPTY_SUMMARY
}
