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

// 120 E-9 / D-1 rev. 13/11: o card de permissão NÃO passa por aqui (vai na faixa de alertas);
// com ele visível, o de bateria sai (push não utilizável ⇒ bateria é inútil).
describe('pickPromoCard × permissionVisible (120)', () => {
  it.each([
    [{ hasHero: false, nudge: null, stockVisible: false, oemVisible: true, permissionVisible: true }, null],
    [{ hasHero: true, nudge: {}, stockVisible: false, oemVisible: true, permissionVisible: true }, null],
    [{ hasHero: false, nudge: {}, stockVisible: true, oemVisible: true, permissionVisible: true }, 'nudge'],
    [{ hasHero: true, nudge: null, stockVisible: true, oemVisible: true, permissionVisible: true }, 'stock'],
    [{ hasHero: false, nudge: null, stockVisible: false, oemVisible: true, permissionVisible: false }, 'oem'],
  ])('%o ⇒ %s', (input, expected) => {
    expect(pickPromoCard(input)).toBe(expected)
  })
})
