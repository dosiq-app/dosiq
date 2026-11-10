// 068 PO-1 (gate híbrido + restrito), PO-2 (fail-safe), PO-6 (dismiss persistente).

import { renderHook, act, waitFor } from '@testing-library/react-native'
import { evaluateOemAssistant, useOemBatteryAssistant, OEM_ASSISTANT_DISMISS_KEY } from '../useOemBatteryAssistant'

const mockProbe = jest.fn()
jest.mock('@platform/device/deviceProbe', () => ({ probeDevice: () => mockProbe() }))
let mockFamily = 'samsung'
jest.mock('@platform/device/oemFamily', () => ({ resolveOemFamily: () => mockFamily }))
const mockFocus: { cbs: Array<() => void> } = { cbs: [] }
jest.mock('@react-navigation/native', () => {
  const React = require('react')
  return {
    useFocusEffect: (cb) => {
      mockFocus.cbs.push(cb)
      React.useEffect(cb, [cb])
    },
  }
})
const mockStore: Record<string, string> = {}
const mockGetItem = jest.fn((k: string) => Promise.resolve(mockStore[k] ?? null))
const mockSetItem = jest.fn((k: string, v: string) => {
  mockStore[k] = v
  return Promise.resolve()
})
jest.mock('@platform/storage/nativeStorageAdapter', () => ({
  nativeStorageAdapter: { getItem: (k) => mockGetItem(k), setItem: (k, v) => mockSetItem(k, v) },
}))

const RN = require('react-native')
const ORIGINAL_OS = RN.Platform.OS
const facts = (over = {}) => ({ notificationsAllowed: true, backgroundRestricted: false, batteryOptimized: false, powerManagerActivity: null, hibernationEnabled: null, ...over })

beforeEach(() => {
  RN.Platform.OS = 'android'
  mockFamily = 'samsung'
  for (const k of Object.keys(mockStore)) delete mockStore[k]
})

afterEach(() => {
  RN.Platform.OS = ORIGINAL_OS
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('evaluateOemAssistant (gate)', () => {
  it.each([
    ['xiaomi otimizado => true', true, 'xiaomi', facts({ batteryOptimized: true }), 'battery'],
    ['xiaomi "Nenhuma restrição" (não otimizado) => false (smoke 2026-11-10)', true, 'xiaomi', facts(), null],
    ['xiaomi otimizado desconhecido => false', true, 'xiaomi', facts({ batteryOptimized: null }), null],
    ['hibernação ligada sozinha nunca abre o card (INV-6)', true, 'motorola', facts({ hibernationEnabled: true }), null],
    ['notificações desligadas sozinhas nunca abrem o card (INV-6)', true, 'samsung', facts({ notificationsAllowed: false }), null],
    ['samsung otimizado => true', true, 'samsung', facts({ batteryOptimized: true }), 'battery'],
    ['samsung nao otimizado => false', true, 'samsung', facts(), null],
    ['motorola otimizado => false (Otimizado basta — smoke Pixel 2026-11-10)', true, 'motorola', facts({ batteryOptimized: true }), null],
    ['motorola restrito => true', true, 'motorola', facts({ backgroundRestricted: true }), 'restricted'],
    ['motorola nao otimizado => false', true, 'motorola', facts(), null],
    ['pixel otimizado => false', true, 'generic', facts({ batteryOptimized: true }), null],
    ['pixel restrito => true (decisão PO 2026-11-08)', true, 'generic', facts({ backgroundRestricted: true }), 'restricted'],
    ['samsung restrito + otimizado => restrito primeiro', true, 'samsung', facts({ backgroundRestricted: true, batteryOptimized: true }), 'restricted'],
    ['samsung otimizado desconhecido (null) => false', true, 'samsung', facts({ batteryOptimized: null }), null],
    ['restrito desconhecido (null) nao forca', true, 'generic', facts({ backgroundRestricted: null }), null],
    ['notificações não liberadas => false mesmo otimizado (smoke conta nova)', true, 'xiaomi', facts({ batteryOptimized: true, notificationsAllowed: false }), null],
    ['notificações desconhecidas => false', true, 'samsung', facts({ batteryOptimized: true, notificationsAllowed: null }), null],
    ['restrito sem notificações => false', true, 'generic', facts({ backgroundRestricted: true, notificationsAllowed: false }), null],
    ['ios => false', false, 'xiaomi', facts({ backgroundRestricted: true }), null],
    ['facts null => false', true, 'xiaomi', null, null],
  ])('%s', (_label, isAndroid, family, f, expected) => {
    expect(evaluateOemAssistant(isAndroid as boolean, family as never, f as never)).toBe(expected)
  })
})

describe('useOemBatteryAssistant', () => {
  it('samsung otimizado ⇒ visible true', async () => {
    mockProbe.mockResolvedValue(facts({ batteryOptimized: true, powerManagerActivity: 'com.samsung/x' }))
    const { result } = renderHook(() => useOemBatteryAssistant())
    await waitFor(() => expect(result.current.visible).toBe(true))
    expect(result.current.powerManagerActivity).toBe('com.samsung/x')
  })

  it('ios ⇒ visible false sem sondar', async () => {
    RN.Platform.OS = 'ios'
    const { result } = renderHook(() => useOemBatteryAssistant())
    await waitFor(() => expect(result.current.reason).toBeNull())
    expect(result.current.visible).toBe(false)
    expect(mockProbe).not.toHaveBeenCalled()
  })

  it('isBatteryOptimizationEnabled rejeita => visible false, sem throw', async () => {
    mockProbe.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useOemBatteryAssistant())
    await waitFor(() => expect(result.current.reason).toBeNull())
    expect(result.current.visible).toBe(false)
  })

  it('storage rejeita ⇒ oculto (fail-safe)', async () => {
    mockProbe.mockResolvedValue(facts({ batteryOptimized: true }))
    mockGetItem.mockRejectedValueOnce(new Error('io'))
    const { result } = renderHook(() => useOemBatteryAssistant())
    await waitFor(() => expect(result.current.reason).toBe('battery'))
    expect(result.current.visible).toBe(false)
  })

  it('dismiss grava a chave e visible vira false', async () => {
    mockProbe.mockResolvedValue(facts({ batteryOptimized: true }))
    const { result } = renderHook(() => useOemBatteryAssistant())
    await waitFor(() => expect(result.current.visible).toBe(true))
    act(() => result.current.dismiss())
    expect(result.current.visible).toBe(false)
    expect(mockSetItem).toHaveBeenCalledWith(OEM_ASSISTANT_DISMISS_KEY, '1')
  })

  it('chave já gravada no storage => visible false na 1a montagem', async () => {
    mockStore[OEM_ASSISTANT_DISMISS_KEY] = '1'
    mockProbe.mockResolvedValue(facts({ batteryOptimized: true }))
    const { result } = renderHook(() => useOemBatteryAssistant())
    await waitFor(() => expect(result.current.reason).toBe('battery'))
    expect(result.current.visible).toBe(false)
  })

  it('"Já ajustei" em OUTRA instância (tela) esconde o card da Hoje ao voltar o foco', async () => {
    mockFamily = 'xiaomi'
    mockProbe.mockResolvedValue(facts({ batteryOptimized: true }))
    const today = renderHook(() => useOemBatteryAssistant())
    await waitFor(() => expect(today.result.current.visible).toBe(true))
    const focusToday = mockFocus.cbs[mockFocus.cbs.length - 1]
    const screen = renderHook(() => useOemBatteryAssistant())
    await waitFor(() => expect(screen.result.current.reason).toBe('battery'))
    act(() => screen.result.current.dismiss())
    screen.unmount()
    await act(async () => {
      focusToday()
    })
    await waitFor(() => expect(today.result.current.visible).toBe(false))
  })

  it('recheck após ajuste no SO ⇒ reason null (estado "voltei" sucesso)', async () => {
    mockProbe.mockResolvedValueOnce(facts({ batteryOptimized: true })).mockResolvedValue(facts())
    const { result } = renderHook(() => useOemBatteryAssistant())
    await waitFor(() => expect(result.current.reason).toBe('battery'))
    let out
    await act(async () => {
      out = await result.current.recheck()
    })
    expect(out).toBeNull()
    expect(result.current.visible).toBe(false)
  })

  it('AppState active re-sonda (volta das Configurações sem mudar foco)', async () => {
    let listener: ((s: string) => void) | undefined
    const spy = jest.spyOn(RN.AppState, 'addEventListener').mockImplementation((_e, cb) => {
      listener = cb as (s: string) => void
      return { remove: jest.fn() }
    })
    mockProbe.mockResolvedValue(facts())
    renderHook(() => useOemBatteryAssistant())
    await waitFor(() => expect(mockProbe).toHaveBeenCalledTimes(1))
    await act(async () => {
      listener?.('active')
    })
    expect(mockProbe).toHaveBeenCalledTimes(2)
    spy.mockRestore()
  })

  it('expõe os fatos da checklist (sem powerManagerActivity)', async () => {
    mockProbe.mockResolvedValue(facts({ batteryOptimized: true, hibernationEnabled: true, notificationsAllowed: false }))
    const { result } = renderHook(() => useOemBatteryAssistant())
    await waitFor(() =>
      expect(result.current.facts).toEqual({
        notificationsAllowed: false,
        backgroundRestricted: false,
        batteryOptimized: true,
        hibernationEnabled: true,
      })
    )
  })

  it('probe lança ⇒ facts null (tela não inventa estado)', async () => {
    mockProbe.mockRejectedValue(new Error('x'))
    const { result } = renderHook(() => useOemBatteryAssistant())
    await waitFor(() => expect(result.current.reason).toBeNull())
    expect(result.current.facts).toBeNull()
  })

  it('sem tratamento ativo ⇒ card oculto, mas reason e facts seguem para a tela', async () => {
    mockProbe.mockResolvedValue(facts({ batteryOptimized: true }))
    const { result } = renderHook(() => useOemBatteryAssistant({ hasTreatment: false }))
    await waitFor(() => expect(result.current.reason).toBe('battery'))
    expect(result.current.visible).toBe(false)
  })
})
