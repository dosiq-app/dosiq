// Núcleo puro do sidecar de forças CMED (spec 127 · CON-048 · 125 fatia 2-pré).
//
// `cmedStrengths.json` v1 é paralelo 1:1 a `medicineDatabase.json`: `items[i]` lista as forças
// da posição i, em tuplas compactas com dicionários. Aqui só decodifica, indexa por REGISTRO e
// resolve as tuplas — sem rede, disco nem relógio. A busca por registro dispensa a base leve
// (RC3 E-3): cada registro ocupa uma única posição (medido no 1.3.0), mas uma posição pode ter
// registros diferentes (293 no 1.3.0), por isso as entradas são filtradas por registro.

/** Versão de layout que este app sabe ler. Layout novo ⇒ `v` novo (CON-048). */
export const CMED_STRENGTHS_VERSION = 1

const DICT_KEYS = ['u', 'ds', 'f', 'c', 'l', 'iu'] as const
const TUPLE_MIN_LENGTH = 10

type DictKey = (typeof DICT_KEYS)[number]

/** Uma força de um registro, com os dicionários resolvidos. */
export interface StrengthEntry {
  /** Dose numérica do 1º componente; `null` quando ambígua (D6). */
  d: number | null
  u: string | null
  ds: string | null
  f: string | null
  c: string | null
  l: string | null
  r: string | null
  /** Spec 113: volume do rótulo (mL), só em registros curados. */
  lv: number | null
  amb: boolean
  /** Unidade da tomada (066 E). */
  iu: string | null
  /** Doses do mostrador da caneta (125 1b); vazio quando a caixa não escreve. */
  dd: number[]
}

export interface CmedStrengths {
  version: string
  medCount: number
  dict: Record<DictKey, unknown[]>
  /** Buckets crus por posição; resolvidos sob demanda em `strengthEntriesFor`. */
  items: unknown[]
}

export type CmedStrengthsDecodeResult =
  | { ok: true; strengths: CmedStrengths }
  | { ok: false; reason: 'version' | 'shape' }

type Raw = Record<string, unknown>

function isObject(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function dictValue(dict: unknown[], idx: unknown): string | null {
  if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0 || idx >= dict.length) return null
  const value = dict[idx]
  return typeof value === 'string' ? value : null
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function positiveOrNull(value: unknown): number | null {
  const num = numberOrNull(value)
  return num !== null && num > 0 ? num : null
}

function isTuple(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length >= TUPLE_MIN_LENGTH
}

function registrationOf(tuple: unknown[]): string | null {
  const r = tuple[6]
  return typeof r === 'string' && r ? r : null
}

/**
 * Decodifica o `cmedStrengths.json`. Nunca lança: `v` desconhecido ⇒ `version`; topo malformado
 * ⇒ `shape`. Bucket ou tupla malformados não derrubam o arquivo: viram ausência de entrada.
 * NÃO confere alinhamento — isso é `isStrengthsAligned`, antes de qualquer leitura.
 */
export function decodeCmedStrengths(raw: unknown): CmedStrengthsDecodeResult {
  if (!isObject(raw)) return { ok: false, reason: 'shape' }
  if (raw.v !== CMED_STRENGTHS_VERSION) return { ok: false, reason: 'version' }
  const { version, medCount, items, dict } = raw
  if (typeof version !== 'string' || !version.trim()) return { ok: false, reason: 'shape' }
  if (typeof medCount !== 'number' || !Number.isInteger(medCount) || medCount < 0) {
    return { ok: false, reason: 'shape' }
  }
  if (!Array.isArray(items) || !isObject(dict)) return { ok: false, reason: 'shape' }
  const dicts = {} as Record<DictKey, unknown[]>
  for (const key of DICT_KEYS) {
    const values = dict[key]
    if (!Array.isArray(values)) return { ok: false, reason: 'shape' }
    dicts[key] = values
  }
  return { ok: true, strengths: { version: version.trim(), medCount, dict: dicts, items } }
}

/**
 * O sidecar só vale lido junto do manifest com que foi baixado: mesma `version` e `medCount` =
 * tamanho de `items`. Fora disso as posições podem estar deslocadas ⇒ indisponível.
 */
export function isStrengthsAligned(strengths: CmedStrengths, manifestVersion: unknown): boolean {
  if (typeof manifestVersion !== 'string' || !manifestVersion.trim()) return false
  return strengths.version === manifestVersion.trim() && strengths.medCount === strengths.items.length
}

/** Mapa registro → posição, montado uma vez por arquivo. */
export function indexByRegistration(strengths: CmedStrengths): Map<string, number> {
  const byRegistration = new Map<string, number>()
  strengths.items.forEach((bucket, position) => {
    if (!Array.isArray(bucket)) return
    for (const tuple of bucket) {
      if (!isTuple(tuple)) continue
      const r = registrationOf(tuple)
      // 1:1 medido; se um dia repetir, vale a 1ª posição (determinístico).
      if (r && !byRegistration.has(r)) byRegistration.set(r, position)
    }
  })
  return byRegistration
}

function resolveEntry(strengths: CmedStrengths, tuple: unknown[]): StrengthEntry {
  const { dict } = strengths
  const amb = tuple[8] === 1 || tuple[8] === true
  const ddRaw = tuple[10]
  const dd = Array.isArray(ddRaw)
    ? ddRaw.filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0)
    : []
  return {
    // D6 / INV-2: ambíguo nunca tem dose numérica, mesmo se o pipeline regredir.
    d: amb ? null : numberOrNull(tuple[0]),
    u: dictValue(dict.u, tuple[1]),
    ds: dictValue(dict.ds, tuple[2]),
    f: dictValue(dict.f, tuple[3]),
    c: dictValue(dict.c, tuple[4]),
    l: dictValue(dict.l, tuple[5]),
    r: registrationOf(tuple),
    lv: positiveOrNull(tuple[7]),
    amb,
    iu: dictValue(dict.iu, tuple[9]),
    dd,
  }
}

/** Forças de um registro (só as dele, mesmo em posição compartilhada). Sem registro ⇒ `[]`. */
export function strengthEntriesFor(
  strengths: CmedStrengths,
  byRegistration: Map<string, number>,
  registration: string | null | undefined,
): StrengthEntry[] {
  const r = typeof registration === 'string' ? registration.trim() : ''
  if (!r) return []
  const position = byRegistration.get(r)
  if (position === undefined) return []
  const bucket = strengths.items[position]
  if (!Array.isArray(bucket)) return []
  return bucket
    .filter((tuple): tuple is unknown[] => isTuple(tuple) && registrationOf(tuple) === r)
    .map((tuple) => resolveEntry(strengths, tuple))
}
