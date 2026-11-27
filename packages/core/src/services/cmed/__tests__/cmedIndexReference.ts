// Decodificador de referência CONGELADO (cópia literal do decode anterior ao corte da 129).
// Só para teste de paridade: o caminho novo tem que produzir as mesmas linhas, chaves e EANs.
// Não exportar pelo core nem "corrigir" — divergência aqui é a regressão que a paridade pega.

import { normalizeText } from '../../anvisaDatabase'

const STRING_COLS = ['e', 'p', 's', 'a', 'r'] as const
const NULLABLE_STRING_COLS = ['ds'] as const
const DICT_COLS = ['l', 'k', 'c', 't', 'u', 'f'] as const
const NUMBER_COLS = ['d', 'nc', 'q', 'amb'] as const


export interface ReferenceCmedRow {
  /** EANs da linha como vieram no arquivo (sem filtro de checksum). */
  e: string[]
  p: string
  s: string
  a: string
  r: string
  l: string | null
  k: string | null
  c: string | null
  cn: string | null
  t: string | null
  d: number | null
  u: string | null
  ds: string | null
  nc: number | null
  f: string | null
  q: number | null
  amb: boolean
  /** Spec 113: volume do RÓTULO (mL), só em registros curados pelo pipeline; nunca o do recipiente. */
  lv: number | null
}

export interface ReferenceCmedIndex {
  n: number
  rows: ReferenceCmedRow[]
  productKeys: string[]
  substanceKeys: string[]
}

export type ReferenceDecodeResult =
  | { ok: true; index: ReferenceCmedIndex }
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

/** Coluna aditiva opcional (CON-038): ausente ou de tamanho ≠ `n` ⇒ vazia (todo `null`), nunca `shape`. */
function optionalColumn(cols: Raw, key: string, n: number): unknown[] {
  const col = cols[key]
  return Array.isArray(col) && col.length === n ? col : []
}

function positiveOrNull(value: unknown): number | null {
  const num = numberOrNull(value)
  return num !== null && num > 0 ? num : null
}

export function decodeCmedIndexReference(raw: unknown): ReferenceDecodeResult {
  if (!isObject(raw)) return { ok: false, reason: 'shape' }
  if (raw.v !== 1) return { ok: false, reason: 'version' }
  const n = raw.n
  const cols = raw.cols
  const dict = raw.dict
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) return { ok: false, reason: 'shape' }
  if (!isObject(cols) || !isObject(dict)) return { ok: false, reason: 'shape' }

  const allCols = [...STRING_COLS, ...NULLABLE_STRING_COLS, ...DICT_COLS, ...NUMBER_COLS]
  for (const key of allCols) {
    const col = cols[key]
    if (!Array.isArray(col) || col.length !== n) return { ok: false, reason: 'shape' }
  }
  const dicts: Record<string, unknown[]> = {}
  for (const key of [...DICT_COLS, 'cn']) {
    const d = dict[key]
    if (!Array.isArray(d)) return { ok: false, reason: 'shape' }
    dicts[key] = d
  }

  const col = (key: string) => cols[key] as unknown[]
  const lvCol = optionalColumn(cols, 'lv', n)
  const rows: ReferenceCmedRow[] = new Array(n)
  const productKeys: string[] = new Array(n)
  const substanceKeys: string[] = new Array(n)
  for (let i = 0; i < n; i += 1) {
    const eRaw = col('e')[i]
    const cIdx = col('c')[i]
    const row: ReferenceCmedRow = {
      e: typeof eRaw === 'string' && eRaw ? eRaw.split('|').filter(Boolean) : [],
      p: String(col('p')[i] ?? ''),
      s: String(col('s')[i] ?? ''),
      a: String(col('a')[i] ?? ''),
      r: String(col('r')[i] ?? ''),
      l: dictValue(dicts.l, col('l')[i]),
      k: dictValue(dicts.k, col('k')[i]),
      c: dictValue(dicts.c, cIdx),
      cn: dictValue(dicts.cn, cIdx),
      t: dictValue(dicts.t, col('t')[i]),
      u: dictValue(dicts.u, col('u')[i]),
      f: dictValue(dicts.f, col('f')[i]),
      d: numberOrNull(col('d')[i]),
      nc: numberOrNull(col('nc')[i]),
      q: numberOrNull(col('q')[i]),
      ds: typeof col('ds')[i] === 'string' ? (col('ds')[i] as string) : null,
      amb: col('amb')[i] === 1 || col('amb')[i] === true,
      lv: positiveOrNull(lvCol[i]),
    }
    rows[i] = row
    productKeys[i] = normalizeText(row.p)
    substanceKeys[i] = normalizeText(row.s)
  }
  return { ok: true, index: { n, rows, productKeys, substanceKeys } }
}

/** Lookup de referência (lê `row.e`, como antes do corte); mesma regra de checksum do core. */
export function buildEanLookupReference(
  index: ReferenceCmedIndex,
  isValidEan13: (ean: string) => boolean,
): Map<string, number[]> {
  const lookup = new Map<string, number[]>()
  index.rows.forEach((row, rowIdx) => {
    for (const ean of row.e) {
      if (!isValidEan13(ean)) continue
      const list = lookup.get(ean)
      if (!list) lookup.set(ean, [rowIdx])
      else if (!list.includes(rowIdx)) list.push(rowIdx)
    }
  })
  return lookup
}
