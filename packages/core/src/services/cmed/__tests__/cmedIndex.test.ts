import { describe, it, expect, afterEach, vi } from 'vitest'
import fixture from './fixtures/cmed-fixture.json'
import fixtureRows from './fixtures/cmed-fixture.rows.json'
import {
  decodeCmedIndex,
  isValidEan13,
  buildEanLookup,
  getEanLookup,
  resolveEan,
  searchCmedByName,
  findRowsByProductName,
  rowsForAnvisaItem,
  groupByConcentration,
  countConcentrationChoices,
  groupForPicker,
} from '../cmedIndex'
import type { CmedIndex } from '../cmedIndex'
import { medicineDraftFromRow } from '../cmedMedicine'
import { decodeCmedIndexReference, buildEanLookupReference } from './cmedIndexReference'

afterEach(() => {
  vi.clearAllMocks()
  vi.clearAllTimers()
})

function decodeFixture(): CmedIndex {
  const result = decodeCmedIndex(structuredClone(fixture))
  if (result.ok === false) throw new Error(`fixture não decodifica: ${result.reason}`)
  return result.index
}

describe('decodeCmedIndex', () => {
  it('ida e volta: cada linha decodificada é igual ao rows.json do pipeline (FR-024)', () => {
    const index = decodeFixture()
    expect(index.n).toBe(fixtureRows.length)
    index.rows.forEach((row, i) => {
      const { e, ...expected } = fixtureRows[i]
      expect(row).toEqual(expected)
      // a coluna crua guarda o EAN de checksum inválido (o rows.json do pipeline já o omite); quem filtra é o lookup
      expect(index.eanCol[i]).toBe(fixture.cols.e[i])
      if (e.length > 0) expect(index.eanCol[i]).toBe(e.join('|'))
    })
  })

  it.each([
    ['número', 42],
    ['null', null],
  ])('EAN cru não-string (%s) ⇒ coluna vazia, nada no lookup', (_label, value) => {
    const raw = structuredClone(fixture) as { cols: { e: unknown[] } }
    raw.cols.e[8] = value
    const result = decodeCmedIndex(raw)
    if (result.ok === false) throw new Error('não decodificou')
    expect(result.index.eanCol[8]).toBe('')
    expect(buildEanLookup(result.index).has('7896004778402')).toBe(false)
  })

  it('normaliza amb 0/1 para booleano', () => {
    const index = decodeFixture()
    expect(index.rows.every((r) => typeof r.amb === 'boolean')).toBe(true)
    expect(index.rows.filter((r) => r.amb)).toHaveLength(1)
  })

  it('recusa v desconhecido com reason version (E10), sem throw', () => {
    expect(decodeCmedIndex({ ...structuredClone(fixture), v: 2 })).toEqual({ ok: false, reason: 'version' })
    const semV: Record<string, unknown> = structuredClone(fixture)
    delete semV.v
    expect(decodeCmedIndex(semV)).toEqual({ ok: false, reason: 'version' })
  })

  it.each([null, 'texto', [], 42])('entrada %p não-objeto ⇒ shape', (raw) => {
    expect(decodeCmedIndex(raw)).toEqual({ ok: false, reason: 'shape' })
  })

  it('coluna com comprimento ≠ n ⇒ shape', () => {
    const raw = structuredClone(fixture)
    raw.cols.q.pop()
    expect(decodeCmedIndex(raw)).toEqual({ ok: false, reason: 'shape' })
  })

  it('coluna ausente ⇒ shape', () => {
    const raw: { cols: Record<string, unknown> } = structuredClone(fixture)
    delete raw.cols.amb
    expect(decodeCmedIndex(raw)).toEqual({ ok: false, reason: 'shape' })
  })

  it('índice de dicionário fora do range vira null, nunca undefined', () => {
    const raw = structuredClone(fixture)
    raw.cols.l[0] = 999
    raw.cols.u[1] = -1
    const result = decodeCmedIndex(raw)
    if (result.ok === false) throw new Error('não decodificou')
    expect(result.index.rows[0].l).toBeNull()
    expect(result.index.rows[1].u).toBeNull()
  })
})

describe('isValidEan13', () => {
  it('confere dígito verificador e formato', () => {
    expect(isValidEan13('7896004778402')).toBe(true)
    expect(isValidEan13('7891317020576')).toBe(true)
    expect(isValidEan13('7890000000025')).toBe(false)
    expect(isValidEan13('789600477840')).toBe(false)
    expect(isValidEan13('78960047784021')).toBe(false)
    expect(isValidEan13('78960047784a2')).toBe(false)
    expect(isValidEan13('')).toBe(false)
    expect(isValidEan13(null)).toBe(false)
  })
})

describe('buildEanLookup + resolveEan', () => {
  const index = decodeFixture()
  const lookup = buildEanLookup(index)

  it('SC-005: 7896004778402 resolve para uma linha', () => {
    const res = resolveEan(lookup, index, '7896004778402')
    expect(res.kind).toBe('found')
    if (res.kind === 'found') expect(index.rows[res.rowIdx].ds).toBe('500 mg + 125 mg')
  })

  it('PO-9: EAN com linhas divergentes ⇒ multiple com X 30 e X 60', () => {
    const res = resolveEan(lookup, index, '7891317020576')
    expect(res.kind).toBe('multiple')
    if (res.kind === 'multiple') expect(res.rowIdxs.map((i) => index.rows[i].q)).toEqual([30, 60])
  })

  it('PO-9: EAN duplicado com linhas idênticas colapsa em found', () => {
    expect(lookup.get('7890000000017')).toHaveLength(2)
    expect(resolveEan(lookup, index, '7890000000017').kind).toBe('found')
  })

  it('PO-9: EAN de checksum inválido fica fora do lookup', () => {
    expect(lookup.has('7890000000025')).toBe(false)
    expect(resolveEan(lookup, index, '7890000000025')).toEqual({ kind: 'not_found' })
  })

  it.each(['', '123', '0000000000000'])('EAN %p ausente ⇒ not_found', (ean) => {
    expect(resolveEan(lookup, index, ean)).toEqual({ kind: 'not_found' })
  })

  it('separadores vazios (`a||b`, borda) não viram EAN', () => {
    const raw = structuredClone(fixture)
    raw.cols.e[8] = '|7896004778402||7896004795232|'
    const result = decodeCmedIndex(raw)
    if (result.ok === false) throw new Error('não decodificou')
    const lk = buildEanLookup(result.index)
    expect(lk.get('7896004778402')).toEqual([8])
    expect(lk.get('7896004795232')).toEqual([8])
    expect(lk.has('')).toBe(false)
  })

  it('EAN repetido na mesma linha entra uma vez', () => {
    const raw = structuredClone(fixture)
    raw.cols.e[8] = '7896004778402|7896004778402'
    const result = decodeCmedIndex(raw)
    if (result.ok === false) throw new Error('não decodificou')
    expect(buildEanLookup(result.index).get('7896004778402')).toEqual([8])
  })
})

describe('getEanLookup — mapa sob demanda, um por índice (129 FR-002)', () => {
  it('mesmo índice ⇒ mesma instância; índice novo ⇒ mapa novo com o mesmo conteúdo', () => {
    const a = decodeFixture()
    const b = decodeFixture()
    expect(getEanLookup(a)).toBe(getEanLookup(a))
    expect(getEanLookup(b)).not.toBe(getEanLookup(a))
    expect([...getEanLookup(b)]).toEqual([...buildEanLookup(a)])
  })

  it('índice vazio (n=0) ⇒ mapa vazio', () => {
    const empty = decodeCmedIndex({
      v: 1,
      n: 0,
      dict: { l: [], k: [], c: [], cn: [], t: [], u: [], f: [] },
      cols: Object.fromEntries(['e', 'p', 's', 'a', 'r', 'ds', 'l', 'k', 'c', 't', 'u', 'f', 'd', 'nc', 'q', 'amb'].map((k) => [k, []])),
    })
    if (empty.ok === false) throw new Error(empty.reason)
    expect(getEanLookup(empty.index).size).toBe(0)
  })
})

describe('paridade com o decode de referência (129 PO-4/PO-5 · INV-1)', () => {
  const variants: [string, (raw: typeof fixture) => void][] = [
    ['fixture curada', () => {}],
    ['EAN duplicado na linha', (raw) => { raw.cols.e[8] = '7896004778402|7896004778402' }],
    ['produto repetido como substância', (raw) => { raw.cols.s[3] = raw.cols.p[3] }],
    ['com lv curado (113)', (raw) => {
      const lv: unknown[] = new Array(raw.n).fill(null)
      lv[5] = 1.5
      lv[6] = 0
      ;(raw.cols as Record<string, unknown>).lv = lv
    }],
  ]

  it.each(variants)('%s: linhas, chaves, EANs e rascunhos idênticos', (_label, mutate) => {
    const raw = structuredClone(fixture)
    mutate(raw)
    const next = decodeCmedIndex(structuredClone(raw))
    const ref = decodeCmedIndexReference(structuredClone(raw))
    if (next.ok === false || ref.ok === false) throw new Error('não decodificou')
    expect(next.index.n).toBe(ref.index.n)
    next.index.rows.forEach((row, i) => {
      const { e, ...refRow } = ref.index.rows[i]
      expect(row).toEqual(refRow)
      expect(next.index.eanCol[i].split('|').filter(Boolean)).toEqual(e)
      expect(medicineDraftFromRow(row)).toEqual(medicineDraftFromRow({ ...refRow }))
    })
    expect(next.index.productKeys).toEqual(ref.index.productKeys)
    expect(next.index.substanceKeys).toEqual(ref.index.substanceKeys)
    expect([...buildEanLookup(next.index)]).toEqual([...buildEanLookupReference(ref.index, isValidEan13)])
  })

  it('recusas idênticas (version/shape)', () => {
    for (const raw of [{ ...structuredClone(fixture), v: 2 }, null, { v: 1, n: 1, cols: {}, dict: {} }]) {
      expect(decodeCmedIndex(raw)).toEqual(decodeCmedIndexReference(raw))
    }
  })
})

describe('searchCmedByName / findRowsByProductName', () => {
  const index = decodeFixture()

  it('prefixo sem acento em produto ou substância', () => {
    expect(searchCmedByName(index, 'amoxi').map((i) => index.rows[i].p)).toContain(
      'Amoxicilina + Clavulanato de Potassio'
    )
    expect(searchCmedByName(index, 'clavul')).toHaveLength(1)
    expect(searchCmedByName(index, 'potássio').length).toBeGreaterThan(0)
  })

  it('respeita o limite e query vazia devolve []', () => {
    expect(searchCmedByName(index, 'c', 2)).toHaveLength(2)
    expect(searchCmedByName(index, '   ')).toEqual([])
  })

  it('lookup exato por nome do produto, sem acento', () => {
    expect(findRowsByProductName(index, 'DIVALPROATO DE SODIO')).toHaveLength(2)
    expect(findRowsByProductName(index, 'Divalproato')).toEqual([])
    expect(findRowsByProductName(index, null)).toEqual([])
  })
})

describe('groupForPicker', () => {
  const index = decodeFixture()

  it('força → quantidade: X 30 e X 60 na mesma força', () => {
    const groups = groupForPicker(index, findRowsByProductName(index, 'Divalproato de Sódio'))
    expect(groups).toHaveLength(1)
    expect(groups[0].quantities.map((q) => q.quantity)).toEqual([30, 60])
    expect(groups[0].quantities.every((q) => q.laboratories.length === 0)).toBe(true)
  })

  it('genérico com mesma força/quantidade colapsa sem pedir laboratório (D11)', () => {
    const groups = groupForPicker(index, findRowsByProductName(index, 'Clopidogrel'))
    expect(groups).toHaveLength(1)
    expect(groups[0].quantities).toHaveLength(1)
    expect(groups[0].quantities[0].laboratories).toEqual([])
  })

  it('não-genérico com 2 laboratórios na mesma caixa pergunta o laboratório', () => {
    const raw = structuredClone(fixture)
    raw.cols.l[10] = 0
    const result = decodeCmedIndex(raw)
    if (result.ok === false) throw new Error('não decodificou')
    const rows = [9, 10]
    result.index.rows[10].q = 30
    const groups = groupForPicker(result.index, rows)
    expect(groups[0].quantities[0].laboratories.map((l) => l.laboratory)).toHaveLength(2)
  })

  it('lista vazia ⇒ []', () => {
    expect(groupForPicker(index, [])).toEqual([])
  })
})

describe('rowsForAnvisaItem (C-C1 · manifest 1.1.12)', () => {
  const index = decodeFixture()
  it('marca (com laboratório) ⇒ linhas do produto', () => {
    expect(rowsForAnvisaItem(index, { name: 'Divalproato de Sódio', laboratory: 'Eurofarma' })).toEqual([9, 10])
  })

  it('marca casa todos os laboratórios do produto, não só o do item', () => {
    const raw = structuredClone(fixture)
    raw.cols.l[10] = 0
    const result = decodeCmedIndex(raw)
    if (result.ok === false) throw new Error('não decodificou')
    expect(rowsForAnvisaItem(result.index, { name: 'Divalproato de Sódio', laboratory: 'Eurofarma' })).toEqual([9, 10])
  })

  it('genérico (sem laboratório) ⇒ linhas de genérico pela substância, com acento/caixa diferentes', () => {
    expect(rowsForAnvisaItem(index, { name: 'BISSULFATO DE CLOPIDOGREL', activeIngredient: 'Bissulfato de Clopidogrel', laboratory: null })).toEqual([11, 12, 14])
  })

  it('substância sem genérico ⇒ todas as linhas dela (opção A)', () => {
    expect(rowsForAnvisaItem(index, { name: 'Tisagenlecleucel', activeIngredient: 'Tisagenlecleucel', laboratory: null })).toEqual([4])
  })

  it('genérico com linha de marca na mesma substância ⇒ só as de genérico', () => {
    const raw = structuredClone(fixture)
    raw.cols.s[9] = raw.cols.s[11]
    const result = decodeCmedIndex(raw)
    if (result.ok === false) throw new Error('não decodificou')
    expect(rowsForAnvisaItem(result.index, { name: 'Bissulfato de Clopidogrel', laboratory: null })).toEqual([11, 12, 14])
  })

  it('base antiga (genérico com nome de produto) cai no nome do produto', () => {
    expect(rowsForAnvisaItem(index, { name: 'Clopidogrel', activeIngredient: 'Clopidogrel', laboratory: null })).toEqual([11, 12])
  })

  it('item nulo, sem nome ou sem linha ⇒ []', () => {
    expect(rowsForAnvisaItem(index, null)).toEqual([])
    expect(rowsForAnvisaItem(index, { name: '', laboratory: null })).toEqual([])
    expect(rowsForAnvisaItem(index, { name: 'Inexistente', laboratory: 'EMS' })).toEqual([])
    expect(rowsForAnvisaItem(index, { name: 'Inexistente', activeIngredient: null, laboratory: null })).toEqual([])
  })
})

describe('groupByConcentration (C5.1 R-4 · só concentração)', () => {
  const index = decodeFixture()

  it('quantidades diferentes na mesma concentração viram uma escolha só', () => {
    const groups = groupByConcentration(index, [9, 10])
    expect(groups).toHaveLength(1)
    expect(groups[0].rowIdx).toBe(9)
    expect(groups[0].laboratories).toEqual([])
    expect(countConcentrationChoices(groups)).toBe(1)
  })

  it('concentrações distintas viram escolhas distintas, da menor dose para a maior (C-C8)', () => {
    const raw = structuredClone(fixture)
    raw.cols.ds[10] = '250 mg'
    raw.cols.d[10] = 250
    const result = decodeCmedIndex(raw)
    if (result.ok === false) throw new Error('não decodificou')
    const groups = groupByConcentration(result.index, [9, 10])
    expect(groups.map((g) => g.dose)).toEqual([250, 500])
    expect(countConcentrationChoices(groups)).toBe(2)
  })

  it('dose ausente vai para o fim; forma ordena antes da dose (C-C8)', () => {
    const raw = structuredClone(fixture)
    ;(raw.cols.d as (number | null)[])[10] = null
    ;(raw.cols.ds as (string | null)[])[10] = null
    const result = decodeCmedIndex(raw)
    if (result.ok === false) throw new Error('não decodificou')
    const groups = groupByConcentration(result.index, [10, 9])
    expect(groups.map((g) => g.rowIdx)).toEqual([9, 10])
  })

  it('marca com 2 fabricantes na concentração pede o laboratório, mesmo em quantidades diferentes', () => {
    const raw = structuredClone(fixture)
    raw.cols.l[10] = 0
    const result = decodeCmedIndex(raw)
    if (result.ok === false) throw new Error('não decodificou')
    const groups = groupByConcentration(result.index, [9, 10])
    expect(groups).toHaveLength(1)
    const names = groups[0].laboratories.map((l) => l.laboratory)
    expect(groups[0].laboratories.map((l) => l.rowIdx).sort((a, b) => a - b)).toEqual([9, 10])
    expect(names).toEqual([...names].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'))) // C-C8
    expect(countConcentrationChoices(groups)).toBe(2)
  })

  it('genérico de vários laboratórios nunca pede laboratório (D11)', () => {
    const groups = groupByConcentration(index, [11, 12])
    expect(groups).toHaveLength(1)
    expect(groups[0].laboratories).toEqual([])
  })

  it('lista vazia ou índice inexistente ⇒ []', () => {
    expect(groupByConcentration(index, [])).toEqual([])
    expect(groupByConcentration(index, [9999])).toEqual([])
    expect(countConcentrationChoices([])).toBe(0)
  })
})

describe('coluna opcional lv (spec 113, FR-001 · INV-3)', () => {
  const withLv = (lv: unknown) => {
    const raw = structuredClone(fixture) as Record<string, any>
    raw.cols.lv = lv
    return decodeCmedIndex(raw)
  }

  it('fixture sem cols.lv ⇒ ok, todo lv null', () => {
    const index = decodeFixture()
    expect(index.rows.every((r) => r.lv === null)).toBe(true)
  })

  it('lv de tamanho errado ou não-array ⇒ ok, todo lv null (nunca shape)', () => {
    for (const bad of [[0.5], 'x', null, {}]) {
      const result = withLv(bad)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.index.rows.every((r) => r.lv === null)).toBe(true)
    }
  })

  it('lv válido é lido; não numérico, ≤ 0 ou não finito ⇒ null', () => {
    const n = fixture.n
    const lv: unknown[] = new Array(n).fill(null)
    lv[0] = 0.5
    lv[1] = 0
    lv[2] = -1
    lv[3] = '0.5'
    const result = withLv(lv)
    expect(result.ok).toBe(true)
    if (result.ok === false) return
    expect(result.index.rows.map((r) => r.lv).slice(0, 5)).toEqual([0.5, null, null, null, null])
  })

  it('v continua 1: v 2 segue version, com ou sem lv', () => {
    const raw = structuredClone(fixture) as Record<string, any>
    raw.cols.lv = new Array(fixture.n).fill(null)
    raw.v = 2
    expect(decodeCmedIndex(raw)).toEqual({ ok: false, reason: 'version' })
  })
})

describe('groupByConcentration com lv (spec 113, FR-004 · E4)', () => {
  it('volumeMl vem de lv; mesma d com e sem lv viram grupos distintos', () => {
    const index = decodeFixture()
    const idxs = findRowsByProductName(index, 'Clopidogrel')
    expect(idxs).toHaveLength(2)
    const base = groupByConcentration(index, idxs)
    expect(base.every((g) => g.volumeMl === null)).toBe(true)
    const rows = index.rows.map((r, i) => (i === idxs[1] ? { ...r, lv: 0.5 } : r))
    const groups = groupByConcentration({ ...index, rows }, idxs)
    expect(groups.map((g) => g.volumeMl).sort()).toEqual([0.5, null])
  })
})
