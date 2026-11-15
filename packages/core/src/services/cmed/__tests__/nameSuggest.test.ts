// Spec 119 fatia B · FR-007 / RC2 D-2 / PO-119-6, 119-12: sugestões por nome sobre a base ANVISA.
import { afterEach, describe, expect, it, vi } from 'vitest'
import golden from './nameMatch.golden.json'
import { buildNameSuggestionIndex, suggestByName } from '../nameMatch'

const base = [
  { name: 'Mounjaro', activeIngredient: 'Tirzepatida', laboratory: 'Lilly' },
  { name: 'Tirzepatida', activeIngredient: 'Tirzepatida', laboratory: null },
  { name: 'Ozempic', activeIngredient: 'Semaglutida', laboratory: 'Novo' },
  { name: 'Wegovy', activeIngredient: 'Semaglutida', laboratory: 'Novo' },
  { name: 'Ozivy', activeIngredient: 'Semaglutida', laboratory: 'X' },
  // sal comum: casa muitos itens, pesa pouco no ranking
  ...Array.from({ length: 30 }, (_, i) => ({ name: `Remedio ${i}`, activeIngredient: 'Cloridrato de Coisa', laboratory: null })),
  { name: 'Metformina', activeIngredient: 'Cloridrato de Metformina', laboratory: null },
]
const index = buildNameSuggestionIndex(base)
const names = (list: { name?: string | null }[]) => list.map((i) => i.name)

describe('suggestByName (119 B)', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.clearAllTimers()
  })

  it('prefixo ⇒ exact (nome antes de princípio ativo); nada em approx', () => {
    const r = suggestByName(index, 'tirz')
    expect(names(r.exact)).toEqual(['Tirzepatida', 'Mounjaro'])
    expect(r.approx).toEqual([])
  })

  it('erro de digitação ("tizerpatida") ⇒ approx, nunca exact', () => {
    const r = suggestByName(index, 'tizerpatida')
    expect(r.exact).toEqual([])
    expect(names(r.approx)).toEqual(['Mounjaro', 'Tirzepatida'])
  })

  it('nome com ruído ("tg ( tirzepatida genérico 15mg )") ⇒ approx por palavra', () => {
    const r = suggestByName(index, 'tg ( tirzepatida genérico 15mg )')
    expect(r.exact).toEqual([])
    expect(names(r.approx)).toEqual(['Mounjaro', 'Tirzepatida'])
  })

  it('palavra rara vence sal comum ("cloridrato de metformina 850")', () => {
    const r = suggestByName(index, 'cloridrato de metformina 850')
    expect(names(r.approx)[0]).toBe('Metformina')
  })

  it('sigla, curto, vazio, nulo ⇒ nada', () => {
    for (const q of ['tv', 'tg', '', null, undefined, '  ']) expect(suggestByName(index, q)).toEqual({ exact: [], approx: [] })
    expect(suggestByName(index, 'creatina')).toEqual({ exact: [], approx: [] })
  })

  it('base vazia/nula e limit ≤ 0 ⇒ nada', () => {
    expect(suggestByName(buildNameSuggestionIndex([]), 'mounjaro')).toEqual({ exact: [], approx: [] })
    expect(suggestByName(buildNameSuggestionIndex(null), 'mounjaro')).toEqual({ exact: [], approx: [] })
    expect(suggestByName(null, 'mounjaro')).toEqual({ exact: [], approx: [] })
    expect(suggestByName(index, 'mounjaro', 0)).toEqual({ exact: [], approx: [] })
  })

  it('total ≤ limit e item sem repetição entre camadas', () => {
    const r = suggestByName(index, 'remedio coisa', 5)
    expect(r.exact.length + r.approx.length).toBeLessThanOrEqual(5)
    const all = [...r.exact, ...r.approx]
    expect(new Set(all).size).toBe(all.length)
  })

  it('texto de 10 mil caracteres não quebra nem demora', () => {
    const t0 = performance.now()
    suggestByName(index, 'tizerpatida '.repeat(1000))
    expect(performance.now() - t0).toBeLessThan(500)
  })

  // Paridade com a regra do servidor (CON-045): o que o painel casa por palavra ou erro de digitação,
  // o app também sugere — mesma entrada, mesma resposta nos dois lados (RC2 D-2).
  const catalogBase = buildNameSuggestionIndex(Object.keys(golden.catalog).map((t) => ({ name: t, activeIngredient: null })))
  const suggestAll = (texts: (string | null)[]) => texts.filter(Boolean).map((t) => suggestByName(catalogBase, t))
  const matched = golden.matches.filter((m) => m.layer !== 'none')
  const unmatched = golden.matches.filter((m) => m.layer === 'none')

  it('paridade: os goldens têm casos dos dois lados (o it.each não é vazio)', () => {
    expect(matched.length).toBeGreaterThanOrEqual(10)
    expect(unmatched.length).toBeGreaterThanOrEqual(4)
  })

  it.each(matched)('paridade servidor casa ⇒ app sugere: $texts ($layer)', ({ texts }) => {
    expect(suggestAll(texts).some((r) => r.exact.length + r.approx.length > 0)).toBe(true)
  })

  // O servidor não casa ⇒ o app nunca diz "Você quis dizer" (o prefixo da busca de hoje pode achar algo).
  it.each(unmatched)('paridade servidor não casa ⇒ app sem approx: $texts', ({ texts }) => {
    expect(suggestAll(texts).every((r) => r.approx.length === 0)).toBe(true)
  })
})
