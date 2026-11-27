import { describe, it, expect, afterEach, vi } from 'vitest'
import { normalizeText } from '../../anvisaDatabase'
import { decodeCmedIndex } from '../cmedIndex'

afterEach(() => {
  vi.clearAllMocks()
  vi.clearAllTimers()
})

// Golden sintético (nenhum dado da base CMED): fixa a chave de busca que o decode grava.
// O decode memoiza por string; a saída tem que ser exatamente esta, caso a caso.
const GOLDEN: [string | null | undefined, string][] = [
  ['Ácido Ascórbico', 'acido ascorbico'],
  ['  Paracetamol  ', '  paracetamol  '],
  ['Vitamina Nº 1 ª', 'vitamina nº 1 ª'],
  ['Dipirona + Cafeína', 'dipirona + cafeina'],
  ['Ação⃝', 'acao⃝'],
  ['AÇÚCAR ÃÕ ÜÏ', 'acucar ao ui'],
  ['Ñandu Ç', 'nandu c'],
  ['x́y', 'xy'],
  ['', ''],
  [null, ''],
  [undefined, ''],
]

describe('normalizeText — golden sintético (129 FR-006)', () => {
  it.each(GOLDEN)('%j ⇒ %j', (input, expected) => {
    expect(normalizeText(input)).toBe(expected)
  })

  it('decode grava as mesmas chaves, inclusive com string repetida entre produto e substância', () => {
    const inputs = GOLDEN.map(([input]) => input ?? '')
    const n = inputs.length
    const raw = {
      v: 1,
      n,
      dict: { l: [], k: [], c: [], cn: [], t: [], u: [], f: [] },
      cols: {
        e: inputs.map(() => ''),
        p: inputs,
        s: [...inputs].reverse(),
        a: inputs.map(() => ''),
        r: inputs.map(() => ''),
        ds: inputs.map(() => null),
        l: inputs.map(() => null),
        k: inputs.map(() => null),
        c: inputs.map(() => null),
        t: inputs.map(() => null),
        u: inputs.map(() => null),
        f: inputs.map(() => null),
        d: inputs.map(() => null),
        nc: inputs.map(() => null),
        q: inputs.map(() => null),
        amb: inputs.map(() => 0),
      },
    }
    const result = decodeCmedIndex(raw)
    if (result.ok === false) throw new Error(result.reason)
    expect(result.index.productKeys).toEqual(inputs.map((x) => normalizeText(x)))
    expect(result.index.substanceKeys).toEqual([...inputs].reverse().map((x) => normalizeText(x)))
  })
})
