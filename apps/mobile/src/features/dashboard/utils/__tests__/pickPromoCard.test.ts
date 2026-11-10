// 068 PO-11 (unidade): um card por render, precedência nudge > estoque > bateria.

import { pickPromoCard } from '../pickPromoCard'

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('pickPromoCard', () => {
  it.each([
    [{ hasHero: false, nudge: {}, stockVisible: true, oemVisible: true }, 'nudge'],
    [{ hasHero: true, nudge: {}, stockVisible: true, oemVisible: true }, 'stock'],
    [{ hasHero: false, nudge: null, stockVisible: true, oemVisible: true }, 'stock'],
    [{ hasHero: false, nudge: null, stockVisible: false, oemVisible: true }, 'oem'],
    [{ hasHero: true, nudge: {}, stockVisible: false, oemVisible: true }, 'oem'],
    [{ hasHero: false, nudge: null, stockVisible: false, oemVisible: false }, null],
  ])('%o ⇒ %s', (input, expected) => {
    expect(pickPromoCard(input)).toBe(expected)
  })
})
