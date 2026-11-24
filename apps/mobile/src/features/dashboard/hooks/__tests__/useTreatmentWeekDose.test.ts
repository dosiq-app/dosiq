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
import { clearWeekCacheMemory } from '@dashboard/utils/weekCache'

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
  clearWeekCacheMemory() // 124 A: cache das linhas é do processo — isola os casos
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
    // Emenda 124 A (PO 23/11): vai até +24 h — as ocorrências de HOJE dizem se há dose hoje. Continua
    // sem âncora no diário (nenhum "Já apliquei"); só não passa de amanhã.
    expect(to.getTime()).toBeLessThanOrEqual(Date.now() + 86_400_000)
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

describe('useTreatmentWeekDose — cache das linhas (124 A, smoke 23/11)', () => {
  const props = { enabled: true, cadenceKind: 'weekly' as const, userId: 'u', protocolId: P, medicineId: M }
  const rows = [{ id: 'l1', taken_at: '2026-11-01T12:00:00+00:00', injection_site: null, medicine_id: M, protocol_id: P }]

  it('2ª montagem nasce com o último resultado (sem loading) e revalida por baixo', async () => {
    mockList.mockResolvedValue(rows)
    mockWindow.mockResolvedValue([{ id: 'i1', protocol_id: P, status: 'pending', scheduled_for: '2026-11-30T12:00:00Z', tolerance_minutes: 100 }])
    const first = renderHook(() => useTreatmentWeekDose(props))
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    expect(first.result.current.upcoming).toHaveLength(1)
    first.unmount()

    let release: (v: any) => void = () => {}
    mockList.mockImplementation(() => new Promise((r) => { release = r }))
    const second = renderHook(() => useTreatmentWeekDose(props))
    expect(second.result.current.loading).toBe(false)
    expect(second.result.current.recent).toEqual(rows)
    // Ocorrência futura NUNCA vem do cache: "Já apliquei" só com leitura atual (ADR-130).
    expect(second.result.current.upcoming).toEqual([])
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2))
    release([...rows, { ...rows[0], id: 'l0' }])
    await waitFor(() => expect(second.result.current.recent).toHaveLength(2))
  })

  it('falha com cache ⇒ segue o dado guardado, sem erro; sem cache ⇒ erro (nunca falso vazio)', async () => {
    mockList.mockRejectedValue(new Error('boom'))
    const cold = renderHook(() => useTreatmentWeekDose(props))
    await waitFor(() => expect(cold.result.current.loading).toBe(false))
    expect(cold.result.current.error).toBe('other')
    cold.unmount()

    mockList.mockResolvedValue(rows)
    const warm = renderHook(() => useTreatmentWeekDose(props))
    await waitFor(() => expect(warm.result.current.recent).toEqual(rows))
    warm.unmount()

    mockList.mockRejectedValue(new Error('boom'))
    const again = renderHook(() => useTreatmentWeekDose({ ...props, reloadKey: 2 }))
    expect(again.result.current.recent).toEqual(rows)
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(3))
    await new Promise((r) => setTimeout(r, 0))
    expect(again.result.current.error).toBeNull()
    expect(again.result.current.recent).toEqual(rows)
  })

  it('cache é por usuário: outra conta não herda', async () => {
    mockList.mockResolvedValue(rows)
    const a = renderHook(() => useTreatmentWeekDose(props))
    await waitFor(() => expect(a.result.current.loading).toBe(false))
    a.unmount()
    mockList.mockImplementation(() => new Promise(() => {}))
    const b = renderHook(() => useTreatmentWeekDose({ ...props, userId: 'outra' }))
    expect(b.result.current.loading).toBe(true)
    expect(b.result.current.recent).toEqual([])
  })
})
