// ForgotPasswordOtp.test.tsx — spec 123 (E-5/E-6): o campo do código compartilhado também serve a
// recuperação de senha; colar com espaço não perde dígito.

import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react-native'

const mockSendReset = jest.fn((..._a: any[]) => Promise.resolve({ success: true }))
const mockVerify = jest.fn((..._a: any[]) => Promise.resolve({ success: true }))
jest.mock('../../platform/auth/authService', () => ({
  sendPasswordReset: (...a: any[]) => mockSendReset(...a),
  verifyOtpWithEmail: (...a: any[]) => mockVerify(...a),
}))
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }))
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native')
  return { SafeAreaView: View, SafeAreaProvider: ({ children }) => children, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }
})

import ForgotPasswordScreen from '../ForgotPasswordScreen'

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

it('colar "1997 1511" na recuperação verifica os 8 dígitos como recovery', async () => {
  render(<ForgotPasswordScreen navigation={{ goBack: jest.fn() }} />)
  fireEvent.changeText(screen.getByPlaceholderText('Email'), 'fulano@example.com')
  await act(async () => { fireEvent.press(screen.getByText('Enviar link de recuperação')) })

  fireEvent.changeText(screen.getByLabelText('Código de 8 dígitos'), '1997 1511')
  await act(async () => { fireEvent.press(screen.getByText('Confirmar Código e Continuar')) })

  expect(mockVerify).toHaveBeenCalledTimes(1)
  expect(mockVerify).toHaveBeenCalledWith('fulano@example.com', '19971511', 'recovery')
})

it('menos de 8 dígitos não chama o servidor', async () => {
  render(<ForgotPasswordScreen navigation={{ goBack: jest.fn() }} />)
  fireEvent.changeText(screen.getByPlaceholderText('Email'), 'fulano@example.com')
  await act(async () => { fireEvent.press(screen.getByText('Enviar link de recuperação')) })
  fireEvent.changeText(screen.getByLabelText('Código de 8 dígitos'), '1997')
  await act(async () => { fireEvent.press(screen.getByText('Confirmar Código e Continuar')) })
  expect(mockVerify).not.toHaveBeenCalled()
  expect(screen.getByText('O código tem 8 dígitos.')).toBeTruthy()
})
