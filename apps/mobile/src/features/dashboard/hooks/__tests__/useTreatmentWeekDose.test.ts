// useTreatmentWeekDose — 121 C · PO-20: diário lê a semana na MESMA chamada (limite ampliado),
// sem rede nova no mount e sem a janela de âncora (só semanal). RC6/R-299: o diário lê as
// ocorrências GRAVADAS do passado (best-effort, depois do paint).
import { describe, it, expect, afterEach, beforeEach } from '@jest/globals'
import { renderHook, waitFor } from '@testing-library/react-native'
import { InteractionManager } from 'react-native'

const mockList = jest.fn()
const mockLadder = jest.fn()
const mockWindow = jest.fn()
jest.mock('@dose/services/doseService', () => ({ listRecentApplications: (...a: any[]) => mockList(...a) }))
jest.mock('@treatments/services/titrationService', () => ({ getLadderForProtocol: (...a: any[]) => mockLadder(...a) }))
jest.mock('@platform/supabase/nativeSupabaseClient', () => ({ supabase: {} }))
jest.mock('@dosiq/core', () => ({
  ...(jest.requireActual('@dosiq/core') as object),
  createDoseInstanceRepository: () => ({ getWindow: (...a: any[]) => mockWindow(...a) }),
}))

import { DAILY_RECENT_LIMIT, recentLimitFor, useTreatmentWeekDose } from '../useTreatmentWeekDose'

const P = '11111111-1111-4111-8111-111111111111'
const M = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation(((cb: any) => {
    Promise.resolve().then(cb)
    return { cancel: () => {} } as any
  }) as any)
  mockLadder.mockResolvedValue(null)
  mockWindow.mockResolvedValue([])
})

afterEach(() => {
  jest.restoreAllMocks()
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('useTreatmentWeekDose (PO-20)', () => {
  it('limite por cadência: semanal 4, diário 20 (teto do core)', () => {
    expect(recentLimitFor('weekly')).toBe(4)
    expect(recentLimitFor('daily')).toBe(DAILY_RECENT_LIMIT)
    expect(DAILY_RECENT_LIMIT).toBe(20)
  })

  it('diário: UMA chamada de aplicações com limite 20, janela só PASSADA (sem âncora); truncated quando bate no limite', async () => {
    mockWindow.mockResolvedValue([
      { protocol_id: P, scheduled_for: '2026-11-17T11:00:00Z', status: 'taken' },
      { protocol_id: 'outro', scheduled_for: '2026-11-17T11:00:00Z', status: 'taken' },
    ])
    mockList.mockResolvedValue(Array.from({ length: 20 }, (_, i) => ({ id: `l${i}`, taken_at: '2026-11-18T11:00:00Z' })))
    const { result } = renderHook(() =>
      useTreatmentWeekDose({ enabled: true, cadenceKind: 'daily', userId: 'u', protocolId: P, medicineId: M })
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockList).toHaveBeenCalledTimes(1)
    expect(mockList).toHaveBeenCalledWith({ protocolId: P, medicineId: M, limit: 20 })
    expect(mockWindow).toHaveBeenCalledTimes(1)
    const [, from, to] = mockWindow.mock.calls[0] as [string, Date, Date]
    expect(to.getTime()).toBeLessThanOrEqual(Date.now()) // nunca futuro: não é âncora
    expect(to.getTime() - from.getTime()).toBeGreaterThanOrEqual(7 * 86_400_000)
    expect(result.current.pastInstances).toEqual([{ protocol_id: P, scheduled_for: '2026-11-17T11:00:00Z', status: 'taken' }])
    expect(result.current.truncated).toBe(true)
  })

  it('diário: falha na leitura das ocorrências ⇒ pastInstances null (fallback), sem erro na L1', async () => {
    mockWindow.mockRejectedValue(new Error('net'))
    mockList.mockResolvedValue([])
    const { result } = renderHook(() =>
      useTreatmentWeekDose({ enabled: true, cadenceKind: 'daily', userId: 'u', protocolId: P, medicineId: M })
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.pastInstances).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('semanal: limite 4 e janela de âncora mantidos (B inalterada)', async () => {
    mockList.mockResolvedValue([{ id: 'l1', taken_at: '2026-11-13T11:00:00Z' }])
    const { result } = renderHook(() =>
      useTreatmentWeekDose({ enabled: true, cadenceDays: 7, userId: 'u', protocolId: P, medicineId: M })
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockList).toHaveBeenCalledWith({ protocolId: P, medicineId: M, limit: 4 })
    expect(mockWindow).toHaveBeenCalledTimes(1)
    expect(result.current.truncated).toBe(false)
  })
})
