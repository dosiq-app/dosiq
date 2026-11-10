// 068 (card só com algo a proteger) · 120 E-8 (predicado único).

import { hasRemindableTreatment } from '../hasRemindableTreatment'

const p = (over = {}) => ({ active: true, frequency: 'diário', time_schedule: ['08:00'], ...over })

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('hasRemindableTreatment', () => {
  it.each([
    ['diário com horário', [p()], true],
    ['semanal com horário', [p({ frequency: 'semanal' })], true],
    ['só quando necessário', [p({ frequency: 'quando_necessário', time_schedule: [] })], false],
    ['quando necessário mesmo com horário', [p({ frequency: 'quando_necessário' })], false],
    ['pausado', [p({ active: false })], false],
    ['sem horário', [p({ time_schedule: [] })], false],
    ['time_schedule nulo', [p({ time_schedule: null })], false],
    ['misto: 1 lembrável basta', [p({ frequency: 'quando_necessário' }), p()], true],
    ['lista vazia', [], false],
    ['null', null, false],
  ])('%s ⇒ %s', (_l, list, expected) => {
    expect(hasRemindableTreatment(list as never)).toBe(expected)
  })
})
