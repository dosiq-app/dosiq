// Utilitários puros das sugestões do catálogo (spec 119 fatia B), fora dos componentes (fast refresh).
import { buildNameSuggestionIndex, normalizeText, suggestByName } from '@dosiq/core'

/** Rótulo completo de uma sugestão para leitor de tela (RC2 D-7). */
export function suggestionLabel(item: any): string {
  return [item?.name, item?.activeIngredient, item?.laboratory].filter(Boolean).join(', ')
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
  const index = buildNameSuggestionIndex(items)
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
export function catalogLinkPayload(medicine: any, draft: any): Record<string, unknown> | null {
  const dose = medicine?.dosage_per_pill === '' || medicine?.dosage_per_pill == null ? null : Number(medicine.dosage_per_pill)
  if (dose !== null && draft.dosage_per_pill != null && dose !== draft.dosage_per_pill) return null
  if (medicine?.dosage_unit && draft.dosage_unit && medicine.dosage_unit !== draft.dosage_unit) return null
  const payload: Record<string, unknown> = {
    name: draft.name,
    active_ingredient: draft.active_ingredient,
    laboratory: draft.laboratory,
    therapeutic_class: draft.therapeutic_class,
    therapeutic_class_code: draft.therapeutic_class_code,
    regulatory_category: draft.regulatory_category,
    anvisa_registration: draft.anvisa_registration,
  }
  if (dose === null && draft.dosage_per_pill != null) payload.dosage_per_pill = draft.dosage_per_pill
  if (!medicine?.dosage_unit && draft.dosage_unit) payload.dosage_unit = draft.dosage_unit
  if (!medicine?.presentation && draft.presentation) payload.presentation = draft.presentation
  for (const key of Object.keys(payload)) if (payload[key] === undefined) delete payload[key]
  return payload
}
