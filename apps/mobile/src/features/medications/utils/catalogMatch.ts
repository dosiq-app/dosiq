// Utilitários puros das sugestões do catálogo (spec 119 fatia B), fora dos componentes (fast refresh).
import {
  buildNameSuggestionIndex,
  matchTokens,
  normalizeText,
  setupDefaults,
  suggestByName,
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
 * Casamento para PROPOR vínculo (Hoje · spec 125 2a). Mais estrito que a sugestão: o ranking por raridade
 * deixa uma palavra genérica rara vencer ("Losartana sem tratamento" → "Babymed Tratamento", smoke 22/11).
 * Aqui o item precisa conter TODAS as palavras do cadastro que existem na base (as desconhecidas, como
 * erro de digitação, seguem pelo fuzzy). Busca folgada (limite 10) para "um só" não ser efeito do corte.
 */
export function linkMatchesFor(items: any[] | null, name?: string | null, ingredient?: string | null): any[] {
  if (!items || items.length === 0) return []
  const index = suggestionIndexFor(items)
  const known = matchTokens(name).filter((token) => index.tokenItems.has(token))
  const covers = (item: any) => {
    const own = new Set([...matchTokens(item?.name), ...matchTokens(item?.activeIngredient)])
    return known.every((token) => own.has(token))
  }
  // Nome idêntico na base vence o colapso por princípio ativo (que prefere a marca): cadastro genérico
  // "Succinato de Desvenlafaxina…" não vira proposta "Pristiq".
  // Idem pelo princípio ativo cadastrado ("Escitalopram" + "Oxalato de Escitalopram" ⇒ o genérico, não "Esc Odt").
  for (const text of [name, ingredient]) {
    const key = normalizeText(text).trim()
    const same = key ? index.items.find((_: any, i: number) => index.nNames[i] === key) : null
    // RC6 #973: o exato pelo princípio ativo também precisa cobrir o nome ("Aradois H" não vira a Losartana).
    if (same && (known.length === 0 || covers(same))) return [same]
  }
  const found = catalogMatchesFor(items, name, ingredient, 10)
  return known.length > 0 ? found.filter(covers) : found
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
 * do medicamento salvo vencem os do rascunho (R-299, o mesmo critério do `boxKeepsSavedStrength`).
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

/**
 * Trava do form em EDIÇÃO (RC5 119 B · E-R5-5): a caixa escolhida na busca não troca a força já salva.
 * O vínculo da Hoje NÃO passa por aqui — ele usa `diffCatalogBox` do core (FR-039, a caixa vence).
 */
export function boxKeepsSavedStrength(medicine: any, draft: any): boolean {
  return strengthPayload(medicine, draft) !== null
}
