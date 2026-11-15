/**
 * Casamento nome → código de classe pelo catálogo CMED (spec 119 · CON-045 · ADR-123).
 *
 * O nome serve só para ACHAR o código no catálogo; a classificação continua por código
 * (`classifyWedge`). Nenhuma lista de nomes → classe (INV-3).
 *
 * 🔴 Espelhada em SQL (`public.cmed_match_key` + `get_admin_growth_analytics`). Mudar a regra =
 * goldens (`__tests__/nameMatch.golden.json`) + core + SQL no mesmo PR (CON-045).
 *
 * Núcleo puro: nunca lança.
 */
import { normalizeText, matchesPrefix } from '../anvisaDatabase'
import { classifyWedge, normalizeClassCode } from '../trackedMeasure'
import type { CmedIndex } from './cmedIndex'

/** Chave truncada (PO-SEC-119-3): o custo do casamento não cresce com o texto do usuário. */
export const MATCH_KEY_MAX = 120
/** Tokens menores nunca casam ("tv", "tg"). */
export const MATCH_TOKEN_MIN = 4
/** Erro de digitação só em palavras a partir deste tamanho. */
export const MATCH_FUZZY_MIN = 5

/**
 * Chave normalizada: `normalizeText` (minúsculas + NFD sem diacríticos), tudo que não é
 * [a-z0-9] vira espaço, espaços colapsados, trim, truncada em `MATCH_KEY_MAX`.
 * Depois da troca só resta ASCII, então o truncamento conta igual em JS e em SQL.
 */
export function matchKey(text: string | null | undefined): string {
  const ascii = normalizeText(text).replace(/[^a-z0-9]+/g, ' ').trim()
  return ascii.slice(0, MATCH_KEY_MAX).trim()
}

/** Palavras da chave com ≥ `MATCH_TOKEN_MIN` caracteres e sem dígito (descarta "15mg", "500"). */
export function matchTokens(text: string | null | undefined): string[] {
  const key = matchKey(text)
  if (!key) return []
  const out: string[] = []
  for (const token of key.split(' ')) {
    if (token.length >= MATCH_TOKEN_MIN && !/[0-9]/.test(token) && !out.includes(token)) out.push(token)
  }
  return out
}

/** Limiar de distância para uma palavra de tamanho `len` (≤ 1; ≤ 2 a partir de 9 caracteres). */
export function fuzzyThreshold(len: number): number {
  return len >= 9 ? 2 : 1
}

/** Levenshtein simples (inserção, remoção, troca) — o mesmo do `fuzzystrmatch.levenshtein`. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const row: number[] = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i += 1) {
    let diag = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const up = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = up
    }
  }
  return row[b.length]
}

/** Derivado do catálogo: palavra → códigos de classe distintos (ordenados). */
export type ClassTokenMap = ReadonlyMap<string, readonly string[]>

/**
 * Monta o derivado a partir do índice decodificado (`decodeCmedIndex`), sobre as chaves de produto
 * e de substância. Linha sem código válido não contribui. É o que o `cmed:publish` carrega no banco.
 */
export function buildClassTokenMap(index: CmedIndex): Map<string, string[]> {
  const acc = new Map<string, Set<string>>()
  for (let i = 0; i < index.n; i += 1) {
    const code = normalizeClassCode(index.rows[i]?.c)
    if (!code) continue
    for (const source of [index.productKeys[i], index.substanceKeys[i]]) {
      for (const token of matchTokens(source)) {
        let set = acc.get(token)
        if (!set) {
          set = new Set()
          acc.set(token, set)
        }
        set.add(code)
      }
    }
  }
  const out = new Map<string, string[]>()
  for (const [token, set] of acc) out.set(token, [...set].sort())
  return out
}

export type MatchLayer = 'exact' | 'approx' | 'none'

export interface ClassMatch {
  layer: MatchLayer
  codes: string[]
}

/**
 * Camadas (CON-045): (1) alguma palavra dos textos é igual a uma palavra do catálogo ⇒ `exact`,
 * união das classes de todas as palavras que bateram; (2) só se nenhuma bateu exato, palavras com
 * ≥ `MATCH_FUZZY_MIN` caracteres a distância ≤ `fuzzyThreshold` ⇒ `approx`.
 */
export function matchClassCodes(map: ClassTokenMap, texts: ReadonlyArray<string | null | undefined>): ClassMatch {
  const tokens: string[] = []
  for (const text of texts) for (const t of matchTokens(text)) if (!tokens.includes(t)) tokens.push(t)
  const codes = new Set<string>()
  for (const t of tokens) map.get(t)?.forEach((c) => codes.add(c))
  if (codes.size > 0) return { layer: 'exact', codes: [...codes].sort() }
  for (const t of tokens) {
    if (t.length < MATCH_FUZZY_MIN) continue
    const limit = fuzzyThreshold(t.length)
    for (const [key, keyCodes] of map) {
      if (Math.abs(key.length - t.length) > limit) continue
      if (levenshtein(t, key) <= limit) keyCodes.forEach((c) => codes.add(c))
    }
  }
  if (codes.size > 0) return { layer: 'approx', codes: [...codes].sort() }
  return { layer: 'none', codes: [] }
}

/** Provável GLP-1 (RC3 E-2): conjunto não vazio e TODAS as classes candidatas no wedge. */
export function isProbableWedge(codes: ReadonlyArray<string>): boolean {
  return codes.length > 0 && codes.every((c) => classifyWedge(c) === 'glp1_antiobesidade')
}

// ─── Sugestões por nome (spec 119 fatia B · FR-007 · RC2 D-2) ──────────────────────────────────────
// O app sugere ITENS da base ANVISA (o passo 1 do "Buscar pelo nome"), não códigos. Mesmas peças da
// regra do servidor (`matchTokens`, `levenshtein`, `fuzzyThreshold`), mais o prefixo da query inteira,
// que é a busca de hoje. Camadas: (1) prefixo ⇒ `exact`; (2) palavra igual; (3) erro de digitação —
// (2) e (3) vão para `approx` ("Você quis dizer…"), e (3) só roda se (1) e (2) não acharam nada.
// Palavra comum de sal ("cloridrato", 928 itens) pesa pouco: o ranking soma 1/df das palavras casadas.

/** Mínimo de letras para sugerir (o mesmo `MIN_SEARCH_CHARS` da busca). */
export const SUGGEST_MIN_CHARS = 3

export interface NameSuggestionSource {
  name?: string | null
  activeIngredient?: string | null
}

export interface NameSuggestionIndex<T extends NameSuggestionSource> {
  items: readonly T[]
  nNames: string[]
  nIngredients: string[]
  /** palavra → índices dos itens que a contêm (nome ou princípio ativo). */
  tokenItems: Map<string, number[]>
}

export interface NameSuggestions<T> {
  exact: T[]
  approx: T[]
}

/** Pré-processa a base uma vez (o app chama ao carregar a base, não a cada tecla). */
export function buildNameSuggestionIndex<T extends NameSuggestionSource>(items: readonly T[] | null | undefined): NameSuggestionIndex<T> {
  const list = items ?? []
  const nNames: string[] = new Array(list.length)
  const nIngredients: string[] = new Array(list.length)
  const tokenItems = new Map<string, number[]>()
  list.forEach((item, idx) => {
    nNames[idx] = normalizeText(item?.name)
    nIngredients[idx] = normalizeText(item?.activeIngredient)
    for (const token of new Set([...matchTokens(item?.name), ...matchTokens(item?.activeIngredient)])) {
      const bucket = tokenItems.get(token)
      if (bucket) bucket.push(idx)
      else tokenItems.set(token, [idx])
    }
  })
  return { items: list, nNames, nIngredients, tokenItems }
}

function rankByRarity(scores: Map<number, number>, exclude: Set<number>): number[] {
  return [...scores]
    .filter(([idx]) => !exclude.has(idx))
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([idx]) => idx)
}

function addScores(scores: Map<number, number>, idxs: readonly number[]): void {
  const weight = 1 / idxs.length
  for (const idx of idxs) scores.set(idx, (scores.get(idx) ?? 0) + weight)
}

/** (1) prefixo com fronteira de palavra: nome antes de princípio ativo (igual à busca de hoje). */
function prefixLayer<T extends NameSuggestionSource>(index: NameSuggestionIndex<T>, q: string, limit: number): number[] {
  const byName: number[] = []
  const byIngredient: number[] = []
  for (let i = 0; i < index.items.length && byName.length < limit; i += 1) {
    if (matchesPrefix(index.nNames[i], q)) byName.push(i)
    else if (byIngredient.length < limit && matchesPrefix(index.nIngredients[i], q)) byIngredient.push(i)
  }
  return [...byName, ...byIngredient].slice(0, limit)
}

/** (2) palavra igual ⇒ pontuação por raridade. */
function tokenScores<T extends NameSuggestionSource>(index: NameSuggestionIndex<T>, tokens: string[]): Map<number, number> {
  const scores = new Map<number, number>()
  for (const token of tokens) {
    const idxs = index.tokenItems.get(token)
    if (idxs) addScores(scores, idxs)
  }
  return scores
}

/** (3) erro de digitação: palavras ≥ `MATCH_FUZZY_MIN` sem casamento exato, a distância ≤ limiar. */
function fuzzyScores<T extends NameSuggestionSource>(index: NameSuggestionIndex<T>, tokens: string[]): Map<number, number> {
  const scores = new Map<number, number>()
  for (const token of tokens) {
    if (token.length < MATCH_FUZZY_MIN || index.tokenItems.has(token)) continue
    const max = fuzzyThreshold(token.length)
    for (const [key, idxs] of index.tokenItems) {
      if (Math.abs(key.length - token.length) <= max && levenshtein(token, key) <= max) addScores(scores, idxs)
    }
  }
  return scores
}

/**
 * Sugestões para o texto digitado. Nunca lança; texto curto, vazio ou base vazia ⇒ listas vazias.
 * Total (exact + approx) ≤ `limit`; um item aparece uma vez só. (3) só roda se (1) e (2) não acharam nada.
 */
export function suggestByName<T extends NameSuggestionSource>(
  index: NameSuggestionIndex<T> | null | undefined,
  query: string | null | undefined,
  limit = 5
): NameSuggestions<T> {
  if (!index || index.items.length === 0 || limit <= 0) return { exact: [], approx: [] }
  const q = normalizeText(query).trim().slice(0, MATCH_KEY_MAX)
  if (q.length < SUGGEST_MIN_CHARS) return { exact: [], approx: [] }

  const exactIdx = prefixLayer(index, q, limit)
  const tokens = matchTokens(query)
  let scores = tokenScores(index, tokens)
  if (scores.size === 0 && exactIdx.length === 0) scores = fuzzyScores(index, tokens)
  const approxIdx = rankByRarity(scores, new Set(exactIdx)).slice(0, limit - exactIdx.length)
  return { exact: exactIdx.map((i) => index.items[i]), approx: approxIdx.map((i) => index.items[i]) }
}
