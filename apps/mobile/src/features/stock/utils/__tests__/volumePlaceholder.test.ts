import { countPlaceholder, volumePlaceholder } from '@stock/utils/purchaseContainer'

describe('volumePlaceholder (smoke 1c)', () => {
  it.each([
    [false, null, 'ex.: 100 mL'],
    [true, null, 'ex.: 3 mL'],
    [true, 'caneta', 'ex.: 3 mL'],
    [true, 'refil', 'ex.: 3 mL'],
    [true, 'ampola', 'ex.: 1 mL'],
    [true, 'frasco_ampola', 'ex.: 10 mL'],
    [true, 'seringa_preenchida', 'ex.: 0,5 mL'],
  ])('injetável=%s, %s ⇒ %s', (inj, container, expected) => {
    expect(volumePlaceholder(inj as boolean, container as string | null)).toBe(expected)
  })
})

it('contagem pela caixa comum, com a palavra do recipiente', () => {
  expect(countPlaceholder('caneta', { singular: 'caneta', plural: 'canetas' })).toBe('ex.: 4 canetas')
  expect(countPlaceholder('refil', { singular: 'refil', plural: 'refis' })).toBe('ex.: 5 refis')
  expect(countPlaceholder('frasco_ampola', { singular: 'frasco-ampola', plural: 'frascos-ampola' })).toBe('ex.: 1 frasco-ampola')
  expect(countPlaceholder(null, { singular: 'unidade', plural: 'unidades' })).toBe('ex.: 1 unidade')
})
