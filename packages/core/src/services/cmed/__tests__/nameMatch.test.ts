// Spec 119 · PO-119-10 / PO-119-4: regra única de casamento nome → código (CON-045).
import { afterEach, describe, expect, it, vi } from 'vitest'
import golden from './nameMatch.golden.json'
import type { CmedIndex, CmedRow } from '../cmedIndex'
import {
  MATCH_KEY_MAX,
  buildClassTokenMap,
  fuzzyThreshold,
  isProbableWedge,
  levenshtein,
  matchClassCodes,
  matchKey,
  matchTokens,
} from '../nameMatch'

const catalog = new Map<string, string[]>(Object.entries(golden.catalog))

describe('nameMatch (119)', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.clearAllTimers()
  })

  it.each(golden.keys)('matchKey/matchTokens: $in', ({ in: input, key, tokens }) => {
    expect(matchKey(input)).toBe(key)
    expect(matchTokens(input)).toEqual(tokens)
  })

  it.each(golden.matches)('matchClassCodes: $texts', ({ texts, layer, codes, probable }) => {
    const result = matchClassCodes(catalog, texts)
    expect(result).toEqual({ layer, codes })
    expect(isProbableWedge(result.codes)).toBe(probable)
  })

  it('trunca em MATCH_KEY_MAX (texto de 10 mil caracteres)', () => {
    const key = matchKey('tirzepatida '.repeat(1000))
    expect(key.length).toBeLessThanOrEqual(MATCH_KEY_MAX)
    expect(key.endsWith(' ')).toBe(false)
  })

  it('levenshtein e limiar', () => {
    expect(levenshtein('tizerpatida', 'tirzepatida')).toBe(2)
    expect(levenshtein('', 'abc')).toBe(3)
    expect(levenshtein('abc', 'abc')).toBe(0)
    expect(fuzzyThreshold(8)).toBe(1)
    expect(fuzzyThreshold(9)).toBe(2)
  })

  it('isProbableWedge: vazio e misto são falsos', () => {
    expect(isProbableWedge([])).toBe(false)
    expect(isProbableWedge(['A10S', 'C10A2'])).toBe(false)
    expect(isProbableWedge(['A10S', 'A10X9', 'A8A'])).toBe(true)
  })

  it('buildClassTokenMap: produto e substância, códigos distintos, linha sem código ignorada', () => {
    const row = (c: string | null) => ({ c }) as unknown as CmedRow
    const index = {
      n: 3,
      rows: [row('A10S'), row(' a8a '), row(null)],
      productKeys: ['mounjaro', 'wegovy', 'creatina'],
      substanceKeys: ['tirzepatida', 'semaglutida', 'creatina'],
    } as CmedIndex
    const map = buildClassTokenMap(index)
    expect(map.get('mounjaro')).toEqual(['A10S'])
    expect(map.get('semaglutida')).toEqual(['A8A'])
    expect(map.has('creatina')).toBe(false)
  })
})
