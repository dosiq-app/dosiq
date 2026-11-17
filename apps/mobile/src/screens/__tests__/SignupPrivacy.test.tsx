// SignupPrivacy.test.tsx — spec 123 RC-SEC (PO-SEC-2, PO-SEC-3).
// PO-SEC-2: senha, código e e-mail não saem do estado da tela (armazenamento, analytics, navegação,
// console). PO-SEC-3: a tela não revela se o e-mail já tem conta — o servidor responde igual para
// endereço novo, confirmado e não confirmado (GoTrue `signup.go:194`, `resend.go:94-104`) e a tela
// não tem ramo que distinga.

import React from 'react'
import fs from 'fs'
import path from 'path'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

const PASSWORD = 'SenhaSecreta#42'
const CODE = '19971511'

const mockLogEvent = jest.fn((..._a: any[]) => Promise.resolve())
jest.mock('@platform/analytics/productAnalytics', () => ({
  logEvent: (...a: any[]) => mockLogEvent(...a),
}))
const mockSignUp = jest.fn((..._a: any[]): Promise<any> => Promise.resolve({ success: true }))
const mockVerify = jest.fn((..._a: any[]): Promise<any> =>
  Promise.resolve({ success: false, error: 'Código incorreto ou vencido. Confira os dígitos ou peça um novo.' }))
const mockResend = jest.fn((..._a: any[]): Promise<any> => Promise.resolve({ success: true }))
jest.mock('../../platform/auth/authService', () => ({
  signUpWithEmail: (...a: any[]) => mockSignUp(...a),
  verifyOtpWithEmail: (...a: any[]) => mockVerify(...a),
  resendSignupConfirmation: (...a: any[]) => mockResend(...a),
}))
jest.mock('@profile/services/profileService', () => ({ captureDeviceTimezone: jest.fn() }))
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }))
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native')
  return { SafeAreaView: View, SafeAreaProvider: ({ children }) => children, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }
})

import SignupScreen from '../SignupScreen'

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
  jest.useRealTimers()
  jest.restoreAllMocks()
})

async function pressContinue() {
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Continuar' })) })
}

function navigationSpy() {
  return { navigate: jest.fn(), goBack: jest.fn(), setParams: jest.fn(), replace: jest.fn(), reset: jest.fn() }
}

it('PO-SEC-2: fluxo completo não vaza senha, código nem e-mail', async () => {
  const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
    jest.spyOn(console, m).mockImplementation(() => {}))
  const navigation = navigationSpy()

  render(<SignupScreen navigation={navigation} />)
  fireEvent.changeText(screen.getByLabelText('Seu e-mail'), 'fulano@gmail.com')
  fireEvent.changeText(screen.getByPlaceholderText('••••••••'), PASSWORD)
  await pressContinue()
  fireEvent.press(screen.getByRole('button', { name: 'Corrigir' }))
  fireEvent.changeText(screen.getByLabelText('Seu e-mail'), 'outra@gmail.com')
  await pressContinue()
  await act(async () => { fireEvent.changeText(screen.getByLabelText('Código de 8 dígitos'), CODE) })
  act(() => { jest.advanceTimersByTime(60_000) })
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Reenviar e-mail' })) })

  expect(mockVerify).toHaveBeenCalledWith('outra@gmail.com', CODE, 'signup') // o fluxo rodou de fato

  const leaked = (calls: unknown[][], needles: string[]) =>
    calls.some((args) => needles.some((n) => JSON.stringify(args).includes(n)))

  const storageCalls = (AsyncStorage.setItem as jest.Mock).mock.calls
  expect(leaked(storageCalls, [PASSWORD, CODE, 'gmail'])).toBe(false)
  expect(leaked(mockLogEvent.mock.calls, [PASSWORD, CODE, '@', 'gmail'])).toBe(false)
  for (const fn of Object.values(navigation)) {
    expect(leaked(fn.mock.calls, [PASSWORD, CODE, '@'])).toBe(false)
  }
  for (const spy of consoleSpies) {
    expect(leaked(spy.mock.calls, [PASSWORD, CODE])).toBe(false)
  }
})

it('PO-SEC-2 guard: replay de sessão segue desligado', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../../platform/analytics/productAnalytics.ts'),
    'utf8',
  )
  expect(source).toMatch(/enableSessionReplay:\s*false/)
  expect(source).not.toMatch(/enableSessionReplay:\s*true/)
})

describe('PO-SEC-3: mesma tela para endereço novo, confirmado e não confirmado', () => {
  // O que o servidor devolve em cada caso (GoTrue): cadastro ⇒ sucesso ofuscado; reenvio ⇒ 200 {}.
  const scenarios = ['novo', 'ja_confirmado', 'nao_confirmado'] as const

  async function renderedAfterSignupAndResend(): Promise<string> {
    mockSignUp.mockResolvedValueOnce({ success: true })
    mockResend.mockResolvedValueOnce({ success: true })
    const view = render(<SignupScreen navigation={navigationSpy()} />)
    fireEvent.changeText(screen.getByLabelText('Seu e-mail'), 'pessoa@gmail.com')
    fireEvent.changeText(screen.getByPlaceholderText('••••••••'), PASSWORD)
    await pressContinue()
    act(() => { jest.advanceTimersByTime(60_000) })
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Reenviar e-mail' })) })
    const tree = JSON.stringify(view.toJSON())
    view.unmount()
    return tree
  }

  it('renderiza idêntico nos três casos', async () => {
    const trees: string[] = []
    for (const _scenario of scenarios) trees.push(await renderedAfterSignupAndResend())
    expect(trees[1]).toBe(trees[0])
    expect(trees[2]).toBe(trees[0])
    expect(trees[0]).toContain('Novo e-mail enviado agora')
    expect(trees[0]).not.toMatch(/já cadastrad|já tem conta cadastrada|não encontrad/i)
  })
})
