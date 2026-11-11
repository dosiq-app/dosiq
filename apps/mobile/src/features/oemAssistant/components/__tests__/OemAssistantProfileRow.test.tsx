// 068 PR 2 — US5/AC-11: linha fixa "Alarme e bateria" no Perfil (só Android, independe de dismiss/gate).

import React from 'react'
import { Platform } from 'react-native'
import { render, fireEvent } from '@testing-library/react-native'
import OemAssistantProfileRow from '../OemAssistantProfileRow'

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }))

const baseFacts = { notificationsAllowed: true, backgroundRestricted: false, batteryOptimized: false, hibernationEnabled: false }
const mockHook = {
  family: 'samsung',
  facts: { ...baseFacts } as Record<string, boolean | null> | null,
  reason: null as string | null | undefined,
}
jest.mock('@features/oemAssistant/hooks/useOemBatteryAssistant', () => ({ useOemBatteryAssistant: () => mockHook }))

const originalOS = Platform.OS
const setOS = (os: string) => Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true })

beforeEach(() => {
  setOS('android')
  Object.assign(mockHook, { family: 'samsung', facts: { ...baseFacts }, reason: null })
})

afterEach(() => {
  setOS(originalOS)
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('OemAssistantProfileRow', () => {
  it('iOS ⇒ não renderiza', () => {
    setOS('ios')
    const { toJSON } = render(<OemAssistantProfileRow onPress={jest.fn()} />)
    expect(toJSON()).toBeNull()
  })

  it('Android, tudo ✓ (gate negativo) ⇒ linha presente com "Tudo certo"; toque navega', () => {
    const onPress = jest.fn()
    const { getByText, getByLabelText } = render(<OemAssistantProfileRow onPress={onPress} />)
    expect(getByText('Alarme e bateria')).toBeTruthy()
    expect(getByText('Tudo certo')).toBeTruthy()
    fireEvent.press(getByLabelText('Alarme e bateria, Tudo certo'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('pendência ⇒ "Falta 1 ajuste" (AC-11c: push desligado conta)', () => {
    mockHook.facts = { ...baseFacts, notificationsAllowed: false }
    const { getByText } = render(<OemAssistantProfileRow onPress={jest.fn()} />)
    expect(getByText('Falta 1 ajuste')).toBeTruthy()
  })

  it('sondando ou bateria não lida ⇒ texto neutro, nunca "Tudo certo"', () => {
    mockHook.reason = undefined
    const r1 = render(<OemAssistantProfileRow onPress={jest.fn()} />)
    expect(r1.getByText('Confira os ajustes do aparelho')).toBeTruthy()
    r1.unmount()
    mockHook.reason = null
    mockHook.facts = null
    const { getByText, queryByText } = render(<OemAssistantProfileRow onPress={jest.fn()} />)
    expect(getByText('Confira os ajustes de bateria')).toBeTruthy()
    expect(queryByText('Tudo certo')).toBeNull()
  })
})
