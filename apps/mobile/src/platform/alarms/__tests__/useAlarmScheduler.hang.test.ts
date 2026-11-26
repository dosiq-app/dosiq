// 128 C-NN (smoke POCO 2026-11-24): leitura do Supabase que nunca resolve prendia o sync inteiro — a
// dose recém-editada ficava sem alarme e só o push de reserva tocava (uma vez, sem tela cheia).
// Guard: teto por leitura, sync obsoleto não mexe nos alarmes, e 1 nova tentativa no hook.
import { describe, it, expect, afterEach, beforeEach } from '@jest/globals'
import { renderHook } from '@testing-library/react-native'
import { syncAlarms, useAlarmScheduler, SYNC_STEP_TIMEOUT_MS, SYNC_RETRY_MS } from '../useAlarmScheduler'
import { alarmService } from '../alarmService'

jest.mock('@platform/supabase/nativeSupabaseClient', () => ({ supabase: {} }))
jest.mock('../alarmService', () => ({
  alarmService: {
    cancelAll: jest.fn().mockResolvedValue(undefined),
    scheduleAlarm: jest.fn().mockResolvedValue(undefined),
  },
}))
jest.mock('../snoozeAnchorStore', () => ({
  ...jest.requireActual('../snoozeAnchorStore'),
  getSnoozeAnchors: () => Promise.resolve({}),
  getSnoozeAttempts: () => Promise.resolve({}),
}))

let mockGetWindow: jest.Mock
let mockItems: any[] = []
jest.mock('@dosiq/core', () => ({
  createDoseInstanceRepository: () => ({ getWindow: (...a: unknown[]) => mockGetWindow(...a) }),
  createCriticalAuditService: () => ({ emit: jest.fn().mockResolvedValue({ ok: true }) }),
  buildDoseItemsFromInstances: () => mockItems,
  ensureInstancesUpTo: jest.fn().mockResolvedValue(undefined),
  getRawNow: () => new Date('2026-03-05T12:00:00.000Z'),
  addDays: (d: Date, n: number) => new Date(d.getTime() + n * 86400000),
  parseISO: (s: string) => new Date(s),
}))

const futureItem = {
  instanceId: 'inst-1',
  scheduledFor: '2026-03-05T12:05:00.000Z',
  status: 'pending',
  critical: true,
  toleranceMinutes: 120,
  medicineName: 'Lantus',
}
const never = () => new Promise(() => {})

beforeEach(() => {
  mockItems = [futureItem]
  mockGetWindow = jest.fn().mockResolvedValue([])
})

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
  jest.useRealTimers()
})

describe('syncAlarms — leitura que nunca responde', () => {
  it('🔴 getWindow pendurado ⇒ rejeita no teto e NÃO apaga os alarmes já armados', async () => {
    jest.useFakeTimers()
    mockGetWindow = jest.fn(never)
    const p = syncAlarms({ userId: 'u1', protocols: [], tz: 'America/Sao_Paulo' })
    const assertion = expect(p).rejects.toThrow(/getWindow sem resposta/)
    await jest.advanceTimersByTimeAsync(SYNC_STEP_TIMEOUT_MS)
    await assertion
    expect(alarmService.cancelAll).not.toHaveBeenCalled()
    expect(alarmService.scheduleAlarm).not.toHaveBeenCalled()
  })

  it('sync obsoleto (outro começou depois) sai sem cancelAll nem agendar', async () => {
    await syncAlarms({ userId: 'u1', protocols: [], tz: 'America/Sao_Paulo', isStale: () => true })
    expect(alarmService.cancelAll).not.toHaveBeenCalled()
    expect(alarmService.scheduleAlarm).not.toHaveBeenCalled()
  })

  it('caminho feliz segue agendando a dose futura', async () => {
    await syncAlarms({ userId: 'u1', protocols: [], tz: 'America/Sao_Paulo', isStale: () => false })
    expect(alarmService.cancelAll).toHaveBeenCalledTimes(1)
    expect(alarmService.scheduleAlarm).toHaveBeenCalledTimes(1)
  })
})

describe('useAlarmScheduler — nova tentativa', () => {
  it('🔴 1º sync estoura o teto ⇒ tenta de novo e agenda (quem salvou e saiu do app não volta)', async () => {
    jest.useFakeTimers()
    mockGetWindow = jest.fn().mockImplementationOnce(never).mockResolvedValue([])
    renderHook(() => useAlarmScheduler({ isAlarmEnabled: true, userId: 'u1', protocols: [], tz: 'America/Sao_Paulo' }))
    await jest.advanceTimersByTimeAsync(SYNC_STEP_TIMEOUT_MS)
    expect(alarmService.scheduleAlarm).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(SYNC_RETRY_MS)
    expect(mockGetWindow).toHaveBeenCalledTimes(2)
    expect(alarmService.scheduleAlarm).toHaveBeenCalledTimes(1)
  })

  it('desmontado antes da nova tentativa ⇒ não tenta', async () => {
    jest.useFakeTimers()
    mockGetWindow = jest.fn(never)
    const { unmount } = renderHook(() =>
      useAlarmScheduler({ isAlarmEnabled: true, userId: 'u1', protocols: [], tz: 'America/Sao_Paulo' })
    )
    await jest.advanceTimersByTimeAsync(SYNC_STEP_TIMEOUT_MS)
    unmount()
    await jest.advanceTimersByTimeAsync(SYNC_RETRY_MS)
    expect(mockGetWindow).toHaveBeenCalledTimes(1)
  })
})
