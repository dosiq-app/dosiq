// 121 B · PO-15 (ADR-130): registro adiantado ancora na ocorrência e desarma o alarme local.
import { describe, it, expect, afterEach } from '@jest/globals'
import { disarmRegisteredAlarms, earlyRegisterModal } from '../earlyRegister'

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('earlyRegisterModal', () => {
  it('âncora estrita na ocorrência, hora = agora (não tardio), id para desarme', () => {
    const protocol = { id: 'p1', treatment_plan: null }
    const m = earlyRegisterModal({ id: 'inst-1', scheduled_for: '2026-11-18T11:00:00.000Z' }, protocol, 'America/Sao_Paulo')
    expect(m.items).toEqual([{ id: 'inst-1', instanceId: 'inst-1', protocol, scheduledTime: '08:00', plan: null }])
    expect(m.initialTakenAt).toBeNull()
    expect(m.cancelAlarmIds).toEqual(['inst-1'])
  })
})

describe('disarmRegisteredAlarms', () => {
  it('cancela o alarme de cada ocorrência registrada; falha não lança', async () => {
    const cancel = jest.fn(async (id: string) => { if (id === 'b') throw new Error('x') })
    expect(() => disarmRegisteredAlarms({ cancelAlarmIds: ['a', 'b'] }, cancel)).not.toThrow()
    expect(cancel).toHaveBeenCalledWith('a')
    expect(cancel).toHaveBeenCalledWith('b')
  })

  it('modal sem ids (registro comum) não cancela nada', () => {
    const cancel = jest.fn(async () => {})
    disarmRegisteredAlarms({}, cancel)
    disarmRegisteredAlarms(null, cancel)
    expect(cancel).not.toHaveBeenCalled()
  })
})
