// 120 US1 / FR-001 / FR-003 / C-01 — alcance do push e adiamento do card (PO-120-1, PO-120-2, PO-120-11).
import { readPushChannels } from '../usePushReachability'
import { ANDROID_PUSH_CHANNEL } from '@dosiq/core'
import { renderHook, act, waitFor } from '@testing-library/react-native'
import { AppState } from 'react-native'

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => {
    const React = require('react')
    React.useEffect(cb, [cb])
  },
}))
const mockStatus = jest.fn()
const mockChannel = jest.fn()
jest.mock('../pushPermission', () => ({
  getPushPermissionStatus: () => mockStatus(),
  getPushChannelState: (id?: string) => mockChannel(id),
}))
const store: Record<string, string> = {}
jest.mock('@platform/storage/nativeStorageAdapter', () => ({
  nativeStorageAdapter: {
    getItem: jest.fn(async (k: string) => store[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      store[k] = v
    }),
    removeItem: jest.fn(async (k: string) => {
      delete store[k]
    }),
  },
}))

import {
  evaluateReachability,
  parseSnooze,
  isSnoozed,
  nextSnooze,
  usePushReachability,
  pushReachSnoozeKey,
  PUSH_REACH_SNOOZE_MS,
} from '../usePushReachability'

const RN = require('react-native')
const ORIGINAL_OS = RN.Platform.OS
const DAY = 24 * 60 * 60 * 1000

beforeEach(() => {
  RN.Platform.OS = 'ios'
  mockChannel.mockResolvedValue('ok')
})

afterEach(() => {
  RN.Platform.OS = ORIGINAL_OS
  for (const k of Object.keys(store)) delete store[k]
  jest.clearAllMocks()
  jest.clearAllTimers()
  jest.useRealTimers()
})

describe('evaluateReachability (PO-120-1)', () => {
  it('iOS undetermined ⇒ undetermined', () => {
    expect(evaluateReachability('ios', { status: 'undetermined', granted: false }, 'ok')).toEqual({ usable: false, reason: 'undetermined' })
  })
  it('iOS negado (inclui alerta desligado já rebaixado por _effective) ⇒ denied', () => {
    expect(evaluateReachability('ios', { status: 'denied', granted: false }, 'ok')).toEqual({ usable: false, reason: 'denied' })
  })
  it('🔴 C-01: Android não concedido (Expo diz denied) ⇒ undetermined para o card', () => {
    expect(evaluateReachability('android', { status: 'denied', granted: false }, 'ok')).toEqual({ usable: false, reason: 'undetermined' })
  })
  it('Android concedido + canal blocked ⇒ channel_blocked', () => {
    expect(evaluateReachability('android', { status: 'granted', granted: true }, 'blocked')).toEqual({ usable: false, reason: 'channel_blocked' })
  })
  it('concedido com canal silenciado/desconhecido ⇒ utilizável', () => {
    expect(evaluateReachability('android', { granted: true }, 'silenced').usable).toBe(true)
    expect(evaluateReachability('android', { granted: true }, 'unknown').usable).toBe(true)
  })
  it('leitura falhou ⇒ não acusa', () => {
    expect(evaluateReachability('ios', null, 'ok')).toEqual({ usable: true, reason: null })
  })
})

describe('adiamento (PO-120-2) — 7 dias, teto 3', () => {
  const T0 = 1_700_000_000_000
  it('reaparece só depois de 7 dias', () => {
    const r1 = nextSnooze({ count: 0, until: 0 }, T0)
    expect(isSnoozed(r1, T0 + 7 * DAY - 1)).toBe(true)
    expect(isSnoozed(r1, T0 + 7 * DAY)).toBe(false)
  })
  it('some de vez após o 3º "Agora não"', () => {
    let r = { count: 0, until: 0 }
    for (let i = 0; i < 3; i++) r = nextSnooze(r, T0)
    expect(r.count).toBe(3)
    expect(isSnoozed(r, T0 + 365 * DAY)).toBe(true)
  })
  it('registro inválido ⇒ sem adiamento', () => {
    expect(parseSnooze('{bad')).toEqual({ count: 0, until: 0 })
    expect(parseSnooze(null)).toEqual({ count: 0, until: 0 })
    expect(parseSnooze('{"count":-2,"until":"x"}')).toEqual({ count: 0, until: 0 })
  })
})

describe('usePushReachability', () => {
  it('lê o status e reavalia ao voltar dos Ajustes (cenário 4)', async () => {
    let listener: (s: string) => void = () => {}
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_e: any, cb: any) => {
      listener = cb
      return { remove: jest.fn() } as any
    })
    mockStatus.mockResolvedValueOnce({ status: 'denied', granted: false })
    const { result } = renderHook(() => usePushReachability({ userId: 'u1' }))
    await waitFor(() => expect(result.current.usable).toBe(false))
    mockStatus.mockResolvedValueOnce({ status: 'granted', granted: true })
    await act(async () => listener('active'))
    expect(result.current.usable).toBe(true)
  })

  it('adiamento é por usuário (E-10) e persiste', async () => {
    mockStatus.mockResolvedValue({ status: 'undetermined', granted: false })
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const { result } = renderHook(() => usePushReachability({ userId: 'u1' }))
    await waitFor(() => expect(result.current.snoozed).toBe(false))
    act(() => result.current.snooze())
    expect(result.current.snoozed).toBe(true)
    expect(result.current.snoozeCount).toBe(1)
    expect(JSON.parse(store[pushReachSnoozeKey('u1')])).toEqual({ count: 1, until: 1_700_000_000_000 + PUSH_REACH_SNOOZE_MS })
    expect(store[pushReachSnoozeKey('u2')]).toBeUndefined()
    now.mockRestore()
  })

  it('smoke 120: push voltou a chegar ⇒ apaga o adiamento; bloqueio novo mostra o card de novo', async () => {
    let listener: (s: string) => void = () => {}
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_e: any, cb: any) => {
      listener = cb
      return { remove: jest.fn() } as any
    })
    store[pushReachSnoozeKey('u1')] = JSON.stringify({ count: 3, until: 0 })
    mockStatus.mockResolvedValue({ status: 'denied', granted: false })
    const { result } = renderHook(() => usePushReachability({ userId: 'u1' }))
    await waitFor(() => expect(result.current.snoozed).toBe(true))
    mockStatus.mockResolvedValue({ status: 'granted', granted: true })
    await act(async () => listener('active'))
    await waitFor(() => expect(store[pushReachSnoozeKey('u1')]).toBeUndefined())
    mockStatus.mockResolvedValue({ status: 'denied', granted: false })
    await act(async () => listener('active'))
    expect(result.current.usable).toBe(false)
    expect(result.current.snoozed).toBe(false)
    expect(result.current.snoozeCount).toBe(0)
  })

  it('leitura do status falhou ⇒ não apaga o adiamento', async () => {
    store[pushReachSnoozeKey('u1')] = JSON.stringify({ count: 1, until: 9_999_999_999_999 })
    mockStatus.mockRejectedValue(new Error('x'))
    const { result } = renderHook(() => usePushReachability({ userId: 'u1' }))
    await waitFor(() => expect(result.current.snoozed).toBe(true))
    expect(store[pushReachSnoozeKey('u1')]).toBeDefined()
  })

  it('storage falhou ⇒ fail-safe oculto', async () => {
    const { nativeStorageAdapter } = require('@platform/storage/nativeStorageAdapter')
    nativeStorageAdapter.getItem.mockRejectedValueOnce(new Error('x'))
    mockStatus.mockResolvedValue({ status: 'undetermined', granted: false })
    const { result } = renderHook(() => usePushReachability({ userId: 'u1' }))
    await waitFor(() => expect(result.current.snoozed).toBe(true))
  })
})

describe('readPushChannels — canal crítico (120 C, U-1)', () => {
  afterEach(() => { mockChannel.mockReset() })
  const by = (map: Record<string, string>) => (id: string) => Promise.resolve(map[id] ?? 'ok')

  it('comum bloqueado ⇒ aponta o comum', async () => {
    mockChannel.mockImplementation(by({ [ANDROID_PUSH_CHANNEL.DEFAULT]: 'blocked' }))
    expect(await readPushChannels(true)).toEqual({ channel: 'blocked', blockedChannel: ANDROID_PUSH_CHANNEL.DEFAULT })
  })

  it('crítico bloqueado + tratamento crítico ⇒ bloqueado, aponta o crítico', async () => {
    mockChannel.mockImplementation(by({ [ANDROID_PUSH_CHANNEL.CRITICAL]: 'blocked' }))
    expect(await readPushChannels(true)).toEqual({ channel: 'blocked', blockedChannel: ANDROID_PUSH_CHANNEL.CRITICAL })
  })

  it('crítico bloqueado SEM tratamento crítico ⇒ não acusa (nem lê o canal crítico)', async () => {
    mockChannel.mockImplementation(by({ [ANDROID_PUSH_CHANNEL.CRITICAL]: 'blocked' }))
    expect(await readPushChannels(false)).toEqual({ channel: 'ok', blockedChannel: null })
    expect(mockChannel).not.toHaveBeenCalledWith(ANDROID_PUSH_CHANNEL.CRITICAL)
  })

  it('crítico silenciado ⇒ não acusa (chega sem som)', async () => {
    mockChannel.mockImplementation(by({ [ANDROID_PUSH_CHANNEL.CRITICAL]: 'silenced' }))
    expect(await readPushChannels(true)).toEqual({ channel: 'ok', blockedChannel: null })
  })
})
