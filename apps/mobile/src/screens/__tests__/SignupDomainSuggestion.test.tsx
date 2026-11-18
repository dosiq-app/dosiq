// SignupDomainSuggestion.test.tsx — spec 123 US1 (PO-123-2). A função de sugestão do core é REAL
// (boundary: não vale mocká-la).

import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react-native'

const mockSignUp = jest.fn((..._a: any[]) => Promise.resolve({ success: true }))
jest.mock('../../platform/auth/authService', () => ({
  signUpWithEmail: (...a: any[]) => mockSignUp(...a),
  verifyOtpWithEmail: jest.fn(),
  resendSignupConfirmation: jest.fn(),
}))
jest.mock('@profile/services/profileService', () => ({ captureDeviceTimezone: jest.fn() }))
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }))
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native')
  return { SafeAreaView: View, SafeAreaProvider: ({ children }) => children, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }
})

import SignupScreen from '../SignupScreen'

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

function setup() {
  render(<SignupScreen navigation={{ navigate: jest.fn(), goBack: jest.fn() }} />)
  const emailInput = screen.getByLabelText('Seu e-mail')
  const passwordInput = screen.getByPlaceholderText('••••••••')
  fireEvent.changeText(passwordInput, 'Senha123!')
  return { emailInput }
}

async function pressContinue() {
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Continuar' })) })
}

it('campo de e-mail oferece o preenchimento automático do sistema', () => {
  const { emailInput } = setup()
  expect(emailInput.props.autoComplete).toBe('email')
  expect(emailInput.props.textContentType).toBe('emailAddress')
})

it('blur com typo mostra a sugestão; "Usar este" troca o valor e oferece Desfazer', () => {
  const { emailInput } = setup()
  fireEvent.changeText(emailInput, 'Fulano@hotma.com')
  fireEvent(emailInput, 'blur')
  expect(screen.getByText(/Você quis dizer/)).toBeTruthy()
  expect(screen.getByText('Fulano@hotmail.com')).toBeTruthy()

  fireEvent.press(screen.getByRole('button', { name: 'Usar este' }))
  expect(screen.getByLabelText('Seu e-mail').props.value).toBe('Fulano@hotmail.com')
  expect(screen.queryByText(/Você quis dizer/)).toBeNull()
  expect(screen.getByText(/Corrigido para hotmail.com/)).toBeTruthy()

  fireEvent.press(screen.getByRole('button', { name: 'Desfazer' }))
  expect(screen.getByLabelText('Seu e-mail').props.value).toBe('Fulano@hotma.com')
  fireEvent(screen.getByLabelText('Seu e-mail'), 'blur')
  expect(screen.queryByText(/Você quis dizer/)).toBeNull()
})

it('"Manter o meu" não volta para o mesmo endereço e Continuar envia o digitado', async () => {
  const { emailInput } = setup()
  fireEvent.changeText(emailInput, 'fulano@gmail.con')
  fireEvent(emailInput, 'blur')
  fireEvent.press(screen.getByRole('button', { name: 'Manter o meu' }))
  expect(screen.queryByText(/Você quis dizer/)).toBeNull()
  fireEvent(emailInput, 'blur')
  expect(screen.queryByText(/Você quis dizer/)).toBeNull()

  await pressContinue()
  expect(mockSignUp).toHaveBeenCalledWith('fulano@gmail.con', 'Senha123!', 'Senha123!')
})

it('Continuar sem blur mostra a sugestão; com ela à vista, Continuar envia o digitado', async () => {
  const { emailInput } = setup()
  fireEvent.changeText(emailInput, 'fulano@gmial.com')
  await pressContinue()
  expect(mockSignUp).not.toHaveBeenCalled()
  expect(screen.getByText('fulano@gmail.com')).toBeTruthy()

  await pressContinue()
  expect(mockSignUp).toHaveBeenCalledTimes(1)
  expect(mockSignUp).toHaveBeenCalledWith('fulano@gmial.com', 'Senha123!', 'Senha123!')
})

it('domínio conhecido segue direto, sem aviso', async () => {
  const { emailInput } = setup()
  fireEvent.changeText(emailInput, 'fulano@gmail.com')
  fireEvent(emailInput, 'blur')
  expect(screen.queryByText(/Você quis dizer/)).toBeNull()
  await pressContinue()
  expect(mockSignUp).toHaveBeenCalledWith('fulano@gmail.com', 'Senha123!', 'Senha123!')
})
