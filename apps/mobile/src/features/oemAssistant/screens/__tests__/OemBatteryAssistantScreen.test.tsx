// 068 PO-5 (CTA) · PO-9 (um nó por item) · PO-10 revisada (checklist ✓/○ e "Pronto") · wireframes A–D.

import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import OemBatteryAssistantScreen from '../OemBatteryAssistantScreen'

const mockGoBack = jest.fn()
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: mockGoBack }) }))
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }))
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }) => children }))

const baseFacts = { notificationsAllowed: true, backgroundRestricted: false, batteryOptimized: true, hibernationEnabled: false }
const mockHook = {
  family: 'samsung',
  facts: { ...baseFacts } as Record<string, boolean | null> | null,
  powerManagerActivity: null as string | null,
  dismiss: jest.fn(),
}
jest.mock('@features/oemAssistant/hooks/useOemBatteryAssistant', () => ({ useOemBatteryAssistant: () => mockHook }))
const mockOpenPower = jest.fn()
const mockOpenApp = jest.fn()
jest.mock('@platform/device/oemBatterySettings', () => ({
  openOemPowerSettings: (a) => mockOpenPower(a),
  openAppDetailsSettings: () => mockOpenApp(),
}))

beforeEach(() => {
  Object.assign(mockHook, { family: 'samsung', facts: { ...baseFacts }, powerManagerActivity: null })
  mockOpenPower.mockResolvedValue(true)
  mockOpenApp.mockResolvedValue(true)
})

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('OemBatteryAssistantScreen', () => {
  it('pendente: cabeçalho com contagem, item ○ com instrução, item ✓ sem instrução', () => {
    const { getByText, getByLabelText } = render(<OemBatteryAssistantScreen />)
    expect(getByText('Para o alarme tocar na hora')).toBeTruthy()
    expect(getByText(/Falta 1 ajuste/)).toBeTruthy()
    expect(getByLabelText(/^Bateria sem restrições, pendente:/)).toBeTruthy()
    expect(getByLabelText('Pausa por falta de uso desligada, feito')).toBeTruthy()
  })

  it('CTA único sem activity; energia como secundário com activity', async () => {
    const r1 = render(<OemBatteryAssistantScreen />)
    expect(r1.queryByText('Abrir configurações de energia')).toBeNull()
    r1.unmount()
    mockHook.powerManagerActivity = 'com.samsung/x'
    const { getByText } = render(<OemBatteryAssistantScreen />)
    fireEvent.press(getByText('Abrir configurações de energia'))
    await waitFor(() => expect(mockOpenPower).toHaveBeenCalledWith('com.samsung/x'))
  })

  it('sem "Já ajustei" nem botão de hibernação (FR-004/D-4 revisados)', () => {
    const { queryByText } = render(<OemBatteryAssistantScreen />)
    expect(queryByText('Já ajustei')).toBeNull()
    expect(queryByText('Abrir ajuste de app fora de uso')).toBeNull()
  })

  it('voltei com tudo ajustado ⇒ "Pronto" + Concluir', async () => {
    const { getByText, rerender } = render(<OemBatteryAssistantScreen />)
    fireEvent.press(getByText('Abrir configurações do app'))
    await waitFor(() => expect(mockOpenApp).toHaveBeenCalled())
    mockHook.facts = { ...baseFacts, batteryOptimized: false }
    rerender(<OemBatteryAssistantScreen />)
    await waitFor(() => expect(getByText('Pronto')).toBeTruthy())
    fireEvent.press(getByText('Concluir'))
    expect(mockGoBack).toHaveBeenCalled()
  })

  it('entrada com tudo ajustado (sem ida às Configurações) ⇒ "Tudo certo" (AC-11b)', () => {
    mockHook.facts = { ...baseFacts, batteryOptimized: false }
    const { getByText, queryByText } = render(<OemBatteryAssistantScreen />)
    expect(getByText('Tudo certo')).toBeTruthy()
    expect(queryByText('Abrir configurações do app')).toBeNull()
  })

  it('xiaomi: "Para garantir" com as dicas; segundo plano omitido', () => {
    mockHook.family = 'xiaomi'
    const { getByText, queryByLabelText } = render(<OemBatteryAssistantScreen />)
    expect(getByText('Para garantir')).toBeTruthy()
    expect(getByText(/Início automático/)).toBeTruthy()
    expect(queryByLabelText(/^Uso em segundo plano liberado/)).toBeNull()
  })

  it('"Não mostrar de novo" dispensa e volta', () => {
    const { getByText } = render(<OemBatteryAssistantScreen />)
    fireEvent.press(getByText('Não mostrar de novo'))
    expect(mockHook.dismiss).toHaveBeenCalled()
    expect(mockGoBack).toHaveBeenCalled()
  })

  it('sondando (facts null) ⇒ sem "Pronto" falso nem cabeçalho de pendência', () => {
    mockHook.facts = null
    const { queryByText } = render(<OemBatteryAssistantScreen />)
    expect(queryByText('Pronto')).toBeNull()
    expect(queryByText('Tudo certo')).toBeNull()
    expect(queryByText('Para o alarme tocar na hora')).toBeNull()
  })

  it('tocar em qualquer item (✓ ou ○) abre as configurações do app', async () => {
    const { getByLabelText } = render(<OemBatteryAssistantScreen />)
    fireEvent.press(getByLabelText(/^Bateria sem restrições, pendente:/))
    await waitFor(() => expect(mockOpenApp).toHaveBeenCalledTimes(1))
    fireEvent.press(getByLabelText('Pausa por falta de uso desligada, feito'))
    await waitFor(() => expect(mockOpenApp).toHaveBeenCalledTimes(2))
  })
})
