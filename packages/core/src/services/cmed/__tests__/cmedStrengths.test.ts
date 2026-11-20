import { afterEach, describe, expect, it, vi } from 'vitest'
import fixture from './fixtures/cmed-strengths-fixture.json'
import {
  decodeCmedStrengths,
  indexByRegistration,
  isStrengthsAligned,
  strengthEntriesFor,
  type CmedStrengths,
} from '../cmedStrengths'

// Fixture recortada do sidecar publicado 1.3.0 (posições 3577 Mounjaro, 4097 Ozempic, 2108
// Extensior, 4098 Ozivy, 4 composto amb, 67 posição com 2 registros, 16 genérico sem registro).
// Os valores esperados de concentração/lv/amb são os do cmedIndex.json 1.3.0 para os mesmos
// registros (paridade global medida: 5587/5587 — analysis-2pre.md).

function decodeOk(raw: unknown = fixture): CmedStrengths {
  const result = decodeCmedStrengths(raw)
  if (result.ok === false) throw new Error(`decode falhou: ${result.reason}`)
  return result.strengths
}

function clone(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(fixture))
}

describe('decodeCmedStrengths', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.clearAllTimers()
  })

  it('decodifica o recorte real do 1.3.0', () => {
    const strengths = decodeOk()
    expect(strengths.version).toBe('1.3.0')
    expect(strengths.medCount).toBe(7)
    expect(strengths.items).toHaveLength(7)
  })

  it.each([null, [], 'x', 1])('topo não-objeto (%p) ⇒ shape, sem exceção', (raw) => {
    expect(decodeCmedStrengths(raw)).toEqual({ ok: false, reason: 'shape' })
  })

  it.each([2, undefined, '1'])('v=%p ⇒ version', (v) => {
    expect(decodeCmedStrengths({ ...clone(), v })).toEqual({ ok: false, reason: 'version' })
  })

  it.each([
    ['version ausente', { version: undefined }],
    ['version vazia', { version: '  ' }],
    ['medCount fracionário', { medCount: 1.5 }],
    ['medCount negativo', { medCount: -1 }],
    ['items não-array', { items: {} }],
    ['dict ausente', { dict: undefined }],
  ])('%s ⇒ shape', (_label, patch) => {
    expect(decodeCmedStrengths({ ...clone(), ...patch })).toEqual({ ok: false, reason: 'shape' })
  })

  it('dicionário sem uma chave ⇒ shape', () => {
    const raw = clone()
    delete (raw.dict as Record<string, unknown>).iu
    expect(decodeCmedStrengths(raw)).toEqual({ ok: false, reason: 'shape' })
  })
})

describe('isStrengthsAligned', () => {
  it('mesma versão do manifest e medCount = items ⇒ alinhado', () => {
    expect(isStrengthsAligned(decodeOk(), '1.3.0')).toBe(true)
  })

  it.each([['1.3.1'], [''], [undefined], [null]])('manifest %p ⇒ desalinhado', (manifestVersion) => {
    expect(isStrengthsAligned(decodeOk(), manifestVersion)).toBe(false)
  })

  it('medCount ≠ items.length ⇒ desalinhado (posições deslocadas)', () => {
    expect(isStrengthsAligned(decodeOk({ ...clone(), medCount: 8 }), '1.3.0')).toBe(false)
  })
})

describe('strengthEntriesFor (paridade com cmedIndex 1.3.0)', () => {
  const strengths = decodeOk()
  const byReg = indexByRegistration(strengths)
  const entries = (r: string | null | undefined) => strengthEntriesFor(strengths, byReg, r)

  it('mapa registro → posição cobre todos os registros do recorte', () => {
    expect(byReg.get('112600202')).toBe(0)
    expect(byReg.get('106390243')).toBe(5)
    expect(byReg.size).toBe(7)
  })

  it('Mounjaro 112600202: 6 concentrações, todas lv 0,5 mL', () => {
    const list = entries('112600202')
    expect(list.map((e) => e.d)).toEqual([5, 10, 15, 20, 25, 30])
    expect(list.every((e) => e.u === 'mg/ml' && e.lv === 0.5 && e.f === 'injetavel' && e.iu === 'mg')).toBe(true)
    expect(list.every((e) => e.dd.length === 0 && e.amb === false && e.l === 'Eli Lilly')).toBe(true)
  })

  it.each(['117660036', '117660043'])('Ozempic/Extensior %s: dd do mostrador [0,25, 0,5, 1]', (r) => {
    expect(entries(r)).toEqual([
      expect.objectContaining({ d: 1.34, u: 'mg/ml', lv: null, dd: [0.25, 0.5, 1], r }),
    ])
  })

  it('Ozivy 102351473: sem lv nem dd', () => {
    expect(entries('102351473')).toEqual([expect.objectContaining({ d: 1.34, lv: null, dd: [] })])
  })

  it('composto amb=1 ⇒ d null, força textual preservada', () => {
    expect(entries('144930011')).toEqual([
      expect.objectContaining({ d: null, amb: true, ds: '10 mg/ml + 50 mg/ml + 100 mg/ml' }),
    ])
  })

  it('posição com 2 registros devolve só as entradas do registro pedido', () => {
    expect(entries('178170914')).toEqual([expect.objectContaining({ r: '178170914', l: 'Cosmed' })])
    expect(entries('106390243')).toEqual([expect.objectContaining({ r: '106390243', l: 'Takeda Pharma' })])
  })

  it.each([null, undefined, '', '   ', '000000000'])('registro %p ⇒ []', (r) => {
    expect(entries(r)).toEqual([])
  })
})

describe('strengthEntriesFor — tuplas degeneradas', () => {
  function single(tuple: unknown[], dict?: Record<string, unknown[]>) {
    const raw: Record<string, unknown> = { ...clone(), medCount: 1, items: [[tuple]] }
    if (dict) raw.dict = { ...(raw.dict as object), ...dict }
    const strengths = decodeOk(raw)
    return strengthEntriesFor(strengths, indexByRegistration(strengths), 'R1')
  }

  it('amb=1 com d preenchido (regressão do pipeline) ⇒ d null (D6)', () => {
    expect(single([500, 2, 0, 1, 0, 0, 'R1', null, 1, null])[0].d).toBeNull()
  })

  it('índices fora do dicionário ou não-inteiros ⇒ null', () => {
    const [e] = single([5, 999, -1, 1.5, '0', 9999, 'R1', null, 0, 99])
    expect(e).toMatchObject({ u: null, ds: null, f: null, c: null, l: null, iu: null })
  })

  it.each([0, -0.5, Number.NaN, '0.5'])('lv %p ⇒ null', (lv) => {
    expect(single([5, 3, 0, 2, 0, 0, 'R1', lv, 0, 2])[0].lv).toBeNull()
  })

  it('d não numérico ⇒ null', () => {
    expect(single(['5', 3, 0, 2, 0, 0, 'R1', null, 0, 2])[0].d).toBeNull()
  })

  it('dd não-array ⇒ []; valores inválidos filtrados', () => {
    expect(single([1, 3, 0, 2, 0, 0, 'R1', null, 0, 2, 'x'])[0].dd).toEqual([])
    expect(single([1, 3, 0, 2, 0, 0, 'R1', null, 0, 2, [0.5, 0, -1, 'a', 1]])[0].dd).toEqual([0.5, 1])
  })

  it('bucket não-array e tupla curta são ignorados sem derrubar o arquivo', () => {
    const raw = { ...clone(), medCount: 3, items: ['x', [[1, 2, 3]], [[5, 3, 0, 2, 0, 0, 'R1', null, 0, 2]]] }
    const strengths = decodeOk(raw)
    const byReg = indexByRegistration(strengths)
    expect(byReg.get('R1')).toBe(2)
    expect(strengthEntriesFor(strengths, byReg, 'R1')).toHaveLength(1)
  })
})
