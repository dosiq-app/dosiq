// Utilitários puros das sugestões do catálogo (spec 119 fatia B), fora dos componentes (fast refresh).
import {
  buildNameSuggestionIndex,
  medicineDraftFromRow,
  normalizeText,
  rowsForAnvisaItem,
  setupDefaults,
  suggestByName,
  type CmedIndex,
} from '@dosiq/core'

/** Rótulo completo de uma sugestão para leitor de tela (RC2 D-7). */
export function suggestionLabel(item: any): string {
  return [item?.name, item?.activeIngredient, item?.laboratory].filter(Boolean).join(', ')
}

// Um índice por base carregada (RC5): o detalhe, o sheet e os campos reusam, sem reconstruir 6 mil itens.
const indexCache = new WeakMap<object, ReturnType<typeof buildNameSuggestionIndex>>()
export function suggestionIndexFor(items: any[]) {
  let index = indexCache.get(items)
  if (!index) {
    index = buildNameSuggestionIndex(items)
    indexCache.set(items, index)
  }
  return index
}

/**
 * Itens da lista oficial que casam com um cadastro (nome; senão princípio ativo), sem repetir nome.
 * Usado pelo convite de vínculo (US4).
 */
export function catalogMatchesFor(
  items: any[] | null,
  name?: string | null,
  ingredient?: string | null,
  limit = 5
): any[] {
  if (!items || items.length === 0) return []
  const index = suggestionIndexFor(items)
  for (const text of [name, ingredient]) {
    const { exact, approx } = suggestByName(index, text, limit)
    const seen = new Set<string>()
    const unique = [...exact, ...approx].filter((item) => {
      const key = String(item?.name ?? '').toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    if (unique.length > 0) return collapseSameSubstance(unique)
  }
  return []
}

/**
 * Opções com o MESMO princípio ativo são o mesmo remédio (marca + genérico, ex.: Mounjaro e
 * Tirzepatida): vira uma só, preferindo a marca (item com laboratório). PO 2026-11-15 (smoke):
 * "Encontramos opções" sem nome era indecifrável quando as opções eram o mesmo remédio.
 */
function collapseSameSubstance(items: any[]): any[] {
  if (items.length < 2) return items
  const key = (item: any) => normalizeText(item?.activeIngredient).trim()
  const first = key(items[0])
  if (!first || items.some((item) => key(item) !== first)) return items
  return [items.find((item) => item?.laboratory) ?? items[0]]
}

/**
 * Payload do vínculo à lista oficial (PO 2026-11-15): remédio é lista formal, tratamento é texto
 * livre — a identidade (nome, princípio ativo, laboratório, classe, categoria, registro) passa a ser
 * a da caixa escolhida. Dose e forma só entram quando o cadastro não tem: mudar a força de um remédio
 * com histórico reescreveria o passado (R-299). Força conhecida e diferente ⇒ `null` (não vincula).
 */
const STRENGTH_KEYS = ['dosage_per_pill', 'dosage_unit', 'presentation', 'concentration_volume_ml'] as const

/**
 * Edição (RC5 119 B): a caixa escolhida pela sugestão não troca força/forma já cadastradas — os valores
 * do medicamento salvo vencem os do rascunho (R-299, o mesmo critério do `catalogLinkPayload`).
 */
export function keepSavedStrength<T extends Record<string, any>>(saved: any, values: T): T {
  if (!saved) return values
  const out: Record<string, any> = { ...values }
  const savedHasDose = !isBlank(saved.dosage_per_pill)
  for (const key of STRENGTH_KEYS) {
    // Unidade sem número não é força conhecida (smoke 1c, "Aas" null + 'g') — a da caixa vale.
    if (key === 'dosage_unit' && !savedHasDose) continue
    if (!isBlank(saved[key])) out[key] = saved[key]
  }
  return out as T
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === ''
}

const SOLID_FORMS = new Set(['comprimido', 'capsula'])

/**
 * Força/forma que o vínculo grava, ou `null` quando a caixa tem outra força conhecida (não vincula).
 * Smoke 1c (PO 19/11): 'un' é contagem, não força — com caixa de comprimido/cápsula, o cadastro em 'un'
 * (ou forma "outro"/vazia) assume forma, número e unidade da caixa; estoque e logs seguem em unidades.
 * Líquido/injetável não: estoque/log passariam a mL/mg. Unidade sem número também não é força conhecida
 * ("Aas" comprimido null + 'g'): a caixa traz número E unidade. Com número, unidade diferente segue não
 * vinculando (R-299: o histórico lê a força viva do remédio).
 */
function strengthPayload(medicine: any, draft: any): Record<string, unknown> | null {
  const countOnly = medicine?.dosage_unit === 'un' && SOLID_FORMS.has(draft.presentation)
  const dose = countOnly || isBlank(medicine?.dosage_per_pill) ? null : Number(medicine.dosage_per_pill)
  if (dose !== null && draft.dosage_per_pill != null && dose !== draft.dosage_per_pill) return null
  const knownUnit = dose !== null ? medicine?.dosage_unit : null
  if (knownUnit && draft.dosage_unit && knownUnit !== draft.dosage_unit) return null
  const takesPresentation = !medicine?.presentation || (countOnly && !SOLID_FORMS.has(medicine.presentation))
  // Pomada/spray/outro ficam em 'un' (smoke 1c): a força da caixa não entra.
  const unitOnly = setupDefaults(takesPresentation ? draft.presentation : medicine.presentation).strengthOptional
  const out: Record<string, unknown> = {}
  if (!unitOnly && dose === null && draft.dosage_per_pill != null) out.dosage_per_pill = draft.dosage_per_pill
  if (!unitOnly && !knownUnit && draft.dosage_unit) out.dosage_unit = draft.dosage_unit
  if (takesPresentation && draft.presentation) out.presentation = draft.presentation
  return out
}

export function catalogLinkPayload(medicine: any, draft: any): Record<string, unknown> | null {
  const strength = strengthPayload(medicine, draft)
  if (!strength) return null
  const payload: Record<string, unknown> = {
    name: draft.name,
    active_ingredient: draft.active_ingredient,
    laboratory: draft.laboratory,
    therapeutic_class: draft.therapeutic_class,
    therapeutic_class_code: draft.therapeutic_class_code,
    regulatory_category: draft.regulatory_category,
    anvisa_registration: draft.anvisa_registration,
    ...strength,
  }
  for (const key of Object.keys(payload)) if (payload[key] === undefined) delete payload[key]
  return payload
}

/**
 * Smoke 1c (PO 19/11): o convite só oferece o que o "Sim, é esse" consegue aplicar. Item da lista
 * oficial é vinculável quando alguma caixa dele (CMED) tem código de classe e passa no
 * `catalogLinkPayload` deste remédio. Sem caixa vinculável, o item sai do convite.
 */
export function linkableCatalogMatches(index: CmedIndex, items: any[], medicine: any): any[] {
  return items.filter((item) =>
    rowsForAnvisaItem(index, item).some((rowIdx) => {
      const row = index.rows[rowIdx]
      if (!row) return false
      const draft = medicineDraftFromRow(row)
      return !!draft.therapeutic_class_code && catalogLinkPayload(medicine, draft) !== null
    })
  )
}

/** Assinatura do que decide o veredito: muda a força/nome do remédio ⇒ recalcula. */
export function catalogLinkSignature(medicine: any): string {
  return [medicine?.name, medicine?.active_ingredient, medicine?.presentation, medicine?.dosage_per_pill, medicine?.dosage_unit]
    .map((v) => String(v ?? ''))
    .join('|')
}
