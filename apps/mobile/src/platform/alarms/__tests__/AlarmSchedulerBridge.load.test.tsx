// 128 C-5 (smoke POCO 2026-11-24): o load da ponte ficou 160 s preso no getMedicinesData e a dose
// recém-editada não ganhou alarme; e `user=null` enquanto a sessão restaurava caía no caminho de
// logout (cancelAll de tudo). Guard: teto + 1 nova tentativa, load obsoleto não sobrescreve, sessão
// carregando não roda o scheduler.
import React from 'react'
import { describe, it, expect, afterEach, beforeEach } from '@jest/globals'
import { render, act } from '@testing-library/react-native'

const mockScheduler = jest.fn()
const mockSyncNow = jest.fn(async (_: unknown) => {})
jest.mock('../useAlarmScheduler', () => ({
  useAlarmScheduler: (props: unknown) => mockScheduler(props),
  runAlarmSyncNow: (a: unknown) => mockSyncNow(a),
  SYNC_STEP_TIMEOUT_MS: 10_000,
  SYNC_RETRY_MS: 15_000,
}))
let mockAuth: { user: { id: string } | null; loading: boolean } = { user: { id: 'u1' }, loading: false }
jest.mock('@platform/auth/hooks/useAuth', () => ({ useAuth: () => mockAuth }))
jest.mock('@platform/consent/useConsentSuppressed', () => ({ useConsentSuppressed: () => false }))
let mockMeds: jest.Mock
jest.mock('@dashboard/services/dashboardService', () => ({
  getUserSettings: () => Promise.resolve({ timezone: 'America/Sao_Paulo' }),
  getActiveProtocols: () => Promise.resolve([{ id: 'p1', medicine_id: 'm1', critical_alarm: true }]),
  getMedicinesData: (...a: unknown[]) => mockMeds(...a),
}))
jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    onForegroundEvent: () => () => {},
    getInitialNotification: () => Promise.resolve(null),
    getDisplayedNotifications: () => Promise.resolve([]),
    getNotificationSettings: () => Promise.resolve({}),
  },
  EventType: {},
  IOSNotificationSetting: {},
}))
jest.mock('@dosiq/core', () => ({
  getTodayLocal: () => '2026-11-24',
  getRawNow: () => new Date('2026-11-24T20:00:00Z'),
  createCriticalAuditService: () => ({ emit: jest.fn() }),
}))
jest.mock('@platform/supabase/nativeSupabaseClient', () => ({ supabase: {} }))
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}) },
}))
jest.mock('@platform/audit/criticalAuditQueue', () => ({
  createCriticalAuditQueue: () => ({ drain: jest.fn(async () => {}), enqueue: jest.fn(async () => {}) }),
}))
jest.mock('@platform/audit/surfaceAuditBeacon', () => ({ drainSurfaceAudit: jest.fn(async () => {}) }))
jest.mock('@platform/audit/deriveIosAlarmOutcome', () => ({ deriveIosAlarmOutcome: jest.fn() }))
jest.mock('@navigation/navigationRef', () => ({ navigationRef: { isReady: () => false } }))
jest.mock('@navigation/routes', () => ({ ROUTES: {} }))
jest.mock('../quickDoseRegistration', () => ({ handleAlarmAction: jest.fn() }))
jest.mock('@platform/analytics/reminderEvents', () => ({ emitReminderOpened: jest.fn(), localReminderSource: jest.fn() }))
jest.mock('../alarmService', () => ({
  cancelAlarm: jest.fn(),
  invalidateCriticalAlertStatus: jest.fn(),
  isPushUsable: () => true,
}))
jest.mock('@platform/doseActivity/doseActivitySurfaceService', () => ({ SURFACE_ACTION: {}, endDoseActivity: jest.fn() }))
jest.mock('../staleDoseNotifications', () => ({
  isAlarmNotification: () => false,
  pickPromotableAlarm: () => null,
  reconcileStaleDoseNotifications: jest.fn(async () => {}),
}))
jest.mock('../doseWindow', () => ({ evaluateDoseWindow: jest.fn() }))
jest.mock('../outOfWindowNotice', () => ({ reportOutOfWindowAlarm: jest.fn(), shouldDropOnRevokedConsent: () => false }))

import AlarmSchedulerBridge from '../AlarmSchedulerBridge'
import { triggerAlarmResync, resyncAlarmsAndWait } from '../alarmResyncBus'

const never = () => new Promise(() => {})
const lastProps = () => mockScheduler.mock.calls.at(-1)?.[0] as any

beforeEach(() => {
  jest.useFakeTimers()
  mockAuth = { user: { id: 'u1' }, loading: false }
  mockMeds = jest.fn(async () => ({ m1: { name: 'Lantus' } }))
})

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
  jest.useRealTimers()
})

describe('AlarmSchedulerBridge — load', () => {
  it('🔴 sessão restaurando (user null, loading) ⇒ scheduler NÃO roda (não apaga os alarmes)', async () => {
    mockAuth = { user: null, loading: true }
    render(<AlarmSchedulerBridge />)
    await act(async () => {
      await jest.advanceTimersByTimeAsync(100)
    })
    expect(mockScheduler).not.toHaveBeenCalled()
  })

  it('deslogado de fato (user null, sessão carregada) ⇒ scheduler roda desligado', async () => {
    mockAuth = { user: null, loading: false }
    render(<AlarmSchedulerBridge />)
    await act(async () => {
      await jest.advanceTimersByTimeAsync(100)
    })
    expect(lastProps()).toMatchObject({ isAlarmEnabled: false, userId: null })
  })

  it('🔴 getMedicinesData pendurado ⇒ estoura o teto e a nova tentativa entrega os protocolos', async () => {
    mockMeds = jest.fn().mockImplementationOnce(never).mockResolvedValue({ m1: { name: 'Lantus' } })
    render(<AlarmSchedulerBridge />)
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10_000)
    })
    expect(mockScheduler).not.toHaveBeenCalled()
    await act(async () => {
      await jest.advanceTimersByTimeAsync(15_000)
    })
    expect(mockMeds).toHaveBeenCalledTimes(2)
    expect(lastProps()).toMatchObject({ isAlarmEnabled: true, userId: 'u1' })
    expect(lastProps().protocols[0].medicine).toEqual({ name: 'Lantus' })
  })

  it('load obsoleto que destrava depois não sobrescreve o mais novo', async () => {
    let releaseFirst: (v: unknown) => void = () => {}
    mockMeds = jest
      .fn()
      .mockImplementationOnce(() => new Promise((r) => (releaseFirst = r)))
      .mockResolvedValue({ m1: { name: 'Novo' } })
    render(<AlarmSchedulerBridge />)
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10)
      triggerAlarmResync() // 2º load (ex.: salvamento) começa com o 1º ainda pendurado
      await jest.advanceTimersByTimeAsync(10)
    })
    expect(lastProps().protocols[0].medicine).toEqual({ name: 'Novo' })
    await act(async () => {
      releaseFirst({ m1: { name: 'Velho' } })
      await jest.advanceTimersByTimeAsync(10)
    })
    expect(lastProps().protocols[0].medicine).toEqual({ name: 'Novo' })
  })

  it('🔴 128 C-8: resync do salvamento reagenda com os dados NOVOS e só resolve depois do sync', async () => {
    render(<AlarmSchedulerBridge />)
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10)
    })
    let syncDone = false
    mockSyncNow.mockImplementationOnce(async () => {
      await new Promise((r) => setTimeout(r, 2_000))
      syncDone = true
    })
    let ok: boolean | undefined
    await act(async () => {
      const p = resyncAlarmsAndWait().then((v) => (ok = v))
      await jest.advanceTimersByTimeAsync(1_000)
      expect(ok).toBeUndefined() // ainda reagendando: o salvamento espera
      await jest.advanceTimersByTimeAsync(1_500)
      await p
    })
    expect(syncDone).toBe(true)
    expect(ok).toBe(true)
    expect(mockSyncNow).toHaveBeenCalledWith(
      expect.objectContaining({ isAlarmEnabled: true, userId: 'u1', protocols: [expect.objectContaining({ id: 'p1' })] })
    )
  })

  it('🔴 RC6: logout com load em voo ⇒ o load antigo não entrega os protocolos de quem saiu', async () => {
    let release: (v: unknown) => void = () => {}
    mockMeds = jest.fn(() => new Promise((r) => (release = r)))
    const { rerender } = render(<AlarmSchedulerBridge />)
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10)
    })
    mockAuth = { user: null, loading: false }
    rerender(<AlarmSchedulerBridge />)
    await act(async () => {
      release({ m1: { name: 'Lantus' } })
      await jest.advanceTimersByTimeAsync(20_000) // passa também a janela da nova tentativa
    })
    expect(lastProps().userId).toBeNull()
    expect(lastProps().protocols).toEqual([])
  })

  it('🔴 RC6: logout durante o sync do salvamento ⇒ não aplica o estado do load antigo', async () => {
    const { rerender } = render(<AlarmSchedulerBridge />)
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10)
    })
    let releaseSync: () => void = () => {}
    mockSyncNow.mockImplementationOnce(() => new Promise<void>((r) => (releaseSync = r)))
    mockMeds = jest.fn(async () => ({ m1: { name: 'Novo' } }))
    await act(async () => {
      void resyncAlarmsAndWait()
      await jest.advanceTimersByTimeAsync(10)
    })
    mockAuth = { user: null, loading: false }
    rerender(<AlarmSchedulerBridge />)
    await act(async () => {
      releaseSync()
      await jest.advanceTimersByTimeAsync(10)
    })
    expect(lastProps().userId).toBeNull()
    expect(lastProps().protocols.every((p: any) => p.medicine?.name !== 'Novo')).toBe(true)
  })

  it('resync do salvamento que estoura o teto devolve false (o salvamento conclui mesmo assim)', async () => {
    render(<AlarmSchedulerBridge />)
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10)
    })
    mockSyncNow.mockImplementationOnce(() => never() as Promise<void>)
    let ok: boolean | undefined
    await act(async () => {
      const p = resyncAlarmsAndWait().then((v) => (ok = v))
      await jest.advanceTimersByTimeAsync(10_000)
      await p
    })
    expect(ok).toBe(false)
  })
})
