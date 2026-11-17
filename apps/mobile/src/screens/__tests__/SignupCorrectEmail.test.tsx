// SignupCorrectEmail.test.tsx — spec 123 US3 (PO-123-5): Corrigir/seta volta ao formulário
// preenchido; mesmo endereço não recadastra (contador preservado); endereço novo cadastra uma vez.

import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react-native'

const mockSignUp = jest.fn((..._a: any[]) => Promise.resolve({ success: true }))
jest.mock('../../platform/auth/authService', () => ({
  signUpWithEmail: (...a: any[]) => mockSignUp(...a),
  verifyOtpWithEmail: jest.fn(),
  resendSignupConfirmation: jest.fn(() => Promise.resolve({ success: true })),
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
})

async function pressContinue() {
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Continuar' })) })
}

async function signUpAs(email: string) {
  render(<SignupScreen navigation={{ navigate: jest.fn(), goBack: jest.fn() }} />)
  fireEvent.changeText(screen.getByLabelText('Seu e-mail'), email)
  fireEvent.changeText(screen.getByPlaceholderText('••••••••'), 'Senha123!')
  await pressContinue()
}

it.each([
  ['Corrigir', 'Corrigir'],
  ['seta de voltar', 'Voltar e corrigir o e-mail'],
])('%s volta ao formulário com e-mail e senha preenchidos', async (_label, buttonName) => {
  await signUpAs('fulano@gmail.com')
  fireEvent.press(screen.getByRole('button', { name: buttonName }))
  expect(screen.getByLabelText('Seu e-mail').props.value).toBe('fulano@gmail.com')
  expect(screen.getByPlaceholderText('••••••••').props.value).toBe('Senha123!')
})

it('U-5: ao voltar pelo Corrigir a senha fica travada, mas Mostrar segue funcionando', async () => {
  await signUpAs('fulano@gmail.com')
  fireEvent.press(screen.getByRole('button', { name: 'Corrigir' }))
  const passwordInput = screen.getByPlaceholderText('••••••••')
  expect(passwordInput.props.editable).toBe(false)
  expect(passwordInput.props.secureTextEntry).toBe(true)
  expect(screen.getByText(/A senha é a que você já criou/)).toBeTruthy()

  fireEvent.press(screen.getByRole('button', { name: 'Mostrar senha' }))
  expect(screen.getByPlaceholderText('••••••••').props.secureTextEntry).toBe(false)
  expect(screen.getByLabelText('Seu e-mail').props.editable).not.toBe(false)
})

it('mesmo endereço: volta à confirmação sem novo cadastro e o contador continua', async () => {
  await signUpAs('fulano@gmail.com')
  act(() => { jest.advanceTimersByTime(20_000) })
  fireEvent.press(screen.getByRole('button', { name: 'Corrigir' }))
  await pressContinue()
  expect(mockSignUp).toHaveBeenCalledTimes(1)
  expect(screen.getByText('Confirme seu e-mail')).toBeTruthy()
  expect(screen.getByText('Reenviar e-mail em 0:40')).toBeTruthy()
  expect(screen.queryByText(/E-mail corrigido/)).toBeNull()
})

it('endereço novo: um cadastro, aviso de correção e contador reinicia', async () => {
  await signUpAs('fulano@gmial.com')
  // primeiro Continuar mostra a sugestão; o segundo segue com o digitado (typo antes do @ não
  // existe aqui — o caso é a pessoa ter mantido o domínio errado e perceber na confirmação)
  await pressContinue()
  expect(mockSignUp).toHaveBeenCalledTimes(1)
  act(() => { jest.advanceTimersByTime(20_000) })

  fireEvent.press(screen.getByRole('button', { name: 'Corrigir' }))
  fireEvent.changeText(screen.getByLabelText('Seu e-mail'), 'fulano@gmail.com')
  await pressContinue()
  expect(mockSignUp).toHaveBeenCalledTimes(2)
  expect(mockSignUp).toHaveBeenLastCalledWith('fulano@gmail.com', 'Senha123!', 'Senha123!')
  expect(screen.getByText('fulano@gmail.com')).toBeTruthy()
  expect(screen.getByText('E-mail corrigido. A confirmação foi para esse endereço.')).toBeTruthy()
  expect(screen.getByText('Reenviar e-mail em 1:00')).toBeTruthy()
})
