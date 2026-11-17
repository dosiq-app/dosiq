// Smoke 121 B: o card neutro da 029 sai da Hoje quando a L3 do módulo cobre a mesma escada;
// o card com [Iniciar etapa] (dia 0) nunca sai (AC-15).
import { describe, it, expect, afterEach } from '@jest/globals'

import { isCoveredByWeekModule } from '@dashboard/utils/evolutionSwitchCover'

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

const view = (showCta: boolean, pid = 'p1') => ({ showCta, currentStep: { protocol_id: pid }, pendingStep: { protocol_id: pid } })

describe('isCoveredByWeekModule', () => {
  it('linha neutra do mesmo tratamento do módulo ⇒ coberta (sai da Hoje)', () => {
    expect(isCoveredByWeekModule(view(false), 'p1')).toBe(true)
  })
  it('card com [Iniciar etapa] (dia 0) ⇒ nunca coberto', () => {
    expect(isCoveredByWeekModule(view(true), 'p1')).toBe(false)
  })
  it('escada de outro tratamento ou sem módulo ⇒ card fica', () => {
    expect(isCoveredByWeekModule(view(false, 'outro'), 'p1')).toBe(false)
    expect(isCoveredByWeekModule(view(false), null)).toBe(false)
    expect(isCoveredByWeekModule(null, 'p1')).toBe(false)
  })
})
