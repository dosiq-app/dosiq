// useFullScreenCheck — 128 A · C-6: abre só com chave medida como faltando (PO-A1/A2); Xiaomi lê também
// "Mostrar na Tela de bloqueio"; quem está no padrão não vê sheet (sem guia "1× por aparelho"); releitura
// na volta dos Ajustes (PO-A3/A4); eventos só com oem_family (RC2 D-6).
import { describe, it, expect, afterEach, beforeEach } from '@jest/globals'

let mockAllowed: boolean | null = null
jest.mock('@platform/device/fullScreenIntent', () => ({ canUseFullScreenIntent: () => mockAllowed }))
let mockLock: boolean | null = null
jest.mock('@platform/device/miuiLockScreen', () => ({ canShowOnLockScreenMiui: () => mockLock }))
let mockFamily = 'generic'
jest.mock('@platform/device/oemFamily', () => ({ resolveOemFamily: () => mockFamily }))
const mockOpenSettings = jest.fn(async () => true)
jest.mock('@platform/alarms/alarmService', () => ({ openFullScreenIntentSettings: () => mockOpenSettings() }))
const mockLog = jest.fn()
jest.mock('@platform/analytics/productAnalytics', () => ({ logEvent: (...a: unknown[]) => mockLog(...a) }))

import { AppState } from 'react-native'
import { renderHook, act } from '@testing-library/react-native'
import {
  useFullScreenCheck,
  shouldShowFullScreenGuide,
  missingRows,
  fullScreenItemState,
  GRANTED_CLOSE_MS,
} from '../useFullScreenCheck'

let appStateHandler: ((s: string) => void) | null = null
beforeEach(() => {
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, h: (s: string) => void) => {
    appStateHandler = h
    return { remove: jest.fn() }
  }) as any)
})

afterEach(() => {
  mockAllowed = null
  mockLock = null
  mockFamily = 'generic'
  appStateHandler = null
  jest.restoreAllMocks()
  jest.clearAllMocks()
  jest.clearAllTimers()
  jest.useRealTimers()
})

describe('gate puro', () => {
  it('PO-A1: tudo liberado ⇒ não mostra (inclui Xiaomi no padrão — C-6)', () => {
    expect(shouldShowFullScreenGuide({ fullScreen: true, lockScreen: null })).toBe(false)
    expect(shouldShowFullScreenGuide({ fullScreen: true, lockScreen: true })).toBe(false)
  })
  it('PO-A2: tela cheia negada ou ilegível ⇒ mostra (INV-3)', () => {
    expect(missingRows({ fullScreen: false, lockScreen: null })).toEqual(['fullScreen'])
    expect(missingRows({ fullScreen: null, lockScreen: null })).toEqual(['fullScreen'])
  })
  it('🔴 C-6: tela de bloqueio só entra MEDIDA negada; ilegível nunca vira pedido', () => {
    expect(missingRows({ fullScreen: true, lockScreen: false })).toEqual(['lockScreen'])
    expect(missingRows({ fullScreen: false, lockScreen: false })).toEqual(['fullScreen', 'lockScreen'])
    expect(missingRows({ fullScreen: true, lockScreen: null })).toEqual([])
  })
  it('estado do item: null ⇒ manual, nunca ✓/○', () => {
    expect(fullScreenItemState(null)).toBe('manual')
    expect(fullScreenItemState(true)).toBe('done')
    expect(fullScreenItemState(false)).toBe('pending')
  })
})

describe('useFullScreenCheck', () => {
  it('liberado ao ligar o alarme ⇒ nenhum sheet, nenhum evento (PO-A1)', async () => {
    mockAllowed = true
    const { result } = renderHook(() => useFullScreenCheck())
    await act(async () => {
      await result.current.check()
    })
    expect(result.current.visible).toBe(false)
    expect(mockLog).not.toHaveBeenCalled()
  })

  it('🔴 C-6: Xiaomi no padrão (tudo ligado) ⇒ nenhum sheet', async () => {
    mockFamily = 'xiaomi'
    mockAllowed = true
    mockLock = true
    const { result } = renderHook(() => useFullScreenCheck())
    await act(async () => {
      await result.current.check()
    })
    expect(result.current.visible).toBe(false)
  })

  it('negado ⇒ sheet só com a linha que falta + evento só com oem_family (PO-A2)', async () => {
    mockAllowed = false
    const { result } = renderHook(() => useFullScreenCheck())
    await act(async () => {
      await result.current.check()
    })
    expect(result.current.visible).toBe(true)
    expect(result.current.rows).toEqual([{ id: 'fullScreen', state: 'pending' }])
    expect(mockLog).toHaveBeenCalledWith('full_screen_guide_shown', { oem_family: 'generic', surface: 'mobile' })
  })

  it('Xiaomi com tela de bloqueio negada ⇒ só essa linha', async () => {
    mockFamily = 'xiaomi'
    mockAllowed = true
    mockLock = false
    const { result } = renderHook(() => useFullScreenCheck())
    await act(async () => {
      await result.current.check()
    })
    expect(result.current.rows).toEqual([{ id: 'lockScreen', state: 'pending' }])
    expect(result.current.family).toBe('xiaomi')
  })

  it('Ajustes → concede TUDO → volta: "Pronto" e fecha sozinho (PO-A3/A4)', async () => {
    jest.useFakeTimers()
    mockFamily = 'xiaomi'
    mockAllowed = false
    mockLock = false
    const { result } = renderHook(() => useFullScreenCheck())
    await act(async () => {
      await result.current.check()
    })
    await act(async () => {
      await result.current.openSettings()
    })
    expect(mockOpenSettings).toHaveBeenCalled()
    mockAllowed = true
    mockLock = true
    act(() => appStateHandler?.('active'))
    expect(result.current.recheckResult).toBe('granted')
    expect(result.current.rows).toEqual([
      { id: 'fullScreen', state: 'done' },
      { id: 'lockScreen', state: 'done' },
    ])
    expect(mockLog).toHaveBeenCalledWith('full_screen_granted_after_settings', { oem_family: 'xiaomi', surface: 'mobile' })
    act(() => {
      jest.advanceTimersByTime(GRANTED_CLOSE_MS)
    })
    expect(result.current.visible).toBe(false)
  })

  it('volta com uma ainda negada ⇒ "ainda falta", sheet fica e mostra o progresso', async () => {
    mockFamily = 'xiaomi'
    mockAllowed = false
    mockLock = false
    const { result } = renderHook(() => useFullScreenCheck())
    await act(async () => {
      await result.current.check()
    })
    await act(async () => {
      await result.current.openSettings()
    })
    mockAllowed = true // liberou só uma
    act(() => appStateHandler?.('active'))
    expect(result.current.recheckResult).toBe('still_pending')
    expect(result.current.rows).toEqual([
      { id: 'fullScreen', state: 'done' },
      { id: 'lockScreen', state: 'pending' },
    ])
    expect(result.current.visible).toBe(true)
  })

  it('voltar ao app sem ter ido aos Ajustes não relê nem fecha (boundary PO-A4)', async () => {
    mockAllowed = false
    const { result } = renderHook(() => useFullScreenCheck())
    await act(async () => {
      await result.current.check()
    })
    mockAllowed = true
    act(() => appStateHandler?.('active'))
    expect(result.current.recheckResult).toBeNull()
    expect(result.current.visible).toBe(true)
  })
})
