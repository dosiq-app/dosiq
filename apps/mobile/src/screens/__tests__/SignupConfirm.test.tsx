// SignupConfirm.test.tsx — spec 123 US2 (PO-123-3): endereço à vista, código, reenvio com 60 s.

import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react-native'

const mockSignUp = jest.fn((..._a: any[]) => Promise.resolve({ success: true }))
const mockVerify = jest.fn((..._a: any[]): Promise<any> => Promise.resolve({ success: true }))
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

const OTP_ERROR = 'Código incorreto ou vencido. Confira os dígitos ou peça um novo.'

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
  jest.useRealTimers()
})

async function signUpAs(email: string, navigate = jest.fn()) {
  render(<SignupScreen navigation={{ navigate, goBack: jest.fn() }} />)
  fireEvent.changeText(screen.getByLabelText('Seu e-mail'), email)
  fireEvent.changeText(screen.getByPlaceholderText('••••••••'), 'Senha123!')
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Continuar' })) })
}

function advance(seconds: number) {
  act(() => { jest.advanceTimersByTime(seconds * 1000) })
}

it('mostra o endereço usado, Corrigir, a orientação e o rodapé de login', async () => {
  const navigate = jest.fn()
  await signUpAs('fulano@gmail.com', navigate)
  expect(screen.getByText('Confirme seu e-mail')).toBeTruthy()
  expect(screen.getByText('fulano@gmail.com')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Corrigir' })).toBeTruthy()
  expect(screen.getByText('Toque no link que enviamos ou digite o código de 8 dígitos')).toBeTruthy()
  expect(screen.queryByText('Voltar ao Login')).toBeNull()

  fireEvent.press(screen.getByText(/Já tem conta\?/))
  expect(navigate).toHaveBeenCalledWith('Login')
})

it('reenvio: nenhum antes de 60 s; depois, uma chamada e contador reinicia', async () => {
  await signUpAs('fulano@gmail.com')
  expect(screen.getByText('Reenviar e-mail em 1:00')).toBeTruthy()

  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Reenviar e-mail' })) })
  advance(59)
  expect(screen.getByText('Reenviar e-mail em 0:01')).toBeTruthy()
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Reenviar e-mail' })) })
  expect(mockResend).not.toHaveBeenCalled()

  advance(1)
  expect(screen.getByText('Reenviar e-mail')).toBeTruthy()
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Reenviar e-mail' })) })
  expect(mockResend).toHaveBeenCalledTimes(1)
  expect(mockResend).toHaveBeenCalledWith('fulano@gmail.com')
  expect(screen.getByText('Novo e-mail enviado agora')).toBeTruthy()
  expect(screen.getByText('Reenviar e-mail em 1:00')).toBeTruthy()
})

it('recusa do reenvio mostra a mensagem do serviço e não reinicia o contador', async () => {
  mockResend.mockResolvedValueOnce({ success: false, error: 'Muitas tentativas nesta rede agora. Tente de novo em alguns minutos.' })
  await signUpAs('fulano@gmail.com')
  advance(60)
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Reenviar e-mail' })) })
  expect(screen.getByText('Muitas tentativas nesta rede agora. Tente de novo em alguns minutos.')).toBeTruthy()
  expect(screen.getByText('Reenviar e-mail')).toBeTruthy()
})

it('colar o código dispara o verify uma vez com o código colado', async () => {
  await signUpAs('fulano@gmail.com')
  await act(async () => { fireEvent.changeText(screen.getByLabelText('Código de 8 dígitos'), 'Ou digite este código no app: 1997 1511') })
  expect(mockVerify).toHaveBeenCalledTimes(1)
  expect(mockVerify).toHaveBeenCalledWith('fulano@gmail.com', '19971511', 'signup')
})

it('segundo colar durante o verify em andamento é ignorado (trava por ref)', async () => {
  let resolveVerify: (v: unknown) => void = () => {}
  mockVerify.mockImplementationOnce(() => new Promise((r) => { resolveVerify = r }))
  await signUpAs('fulano@gmail.com')
  const field = screen.getByLabelText('Código de 8 dígitos')
  await act(async () => { fireEvent.changeText(field, '19971511') })
  await act(async () => { fireEvent(field, 'changeText', '') })
  await act(async () => { fireEvent(field, 'changeText', '12345678') })
  expect(mockVerify).toHaveBeenCalledTimes(1)
  await act(async () => { resolveVerify({ success: true }) })
})

it('digitado um a um espera o botão; botão só age com 8 dígitos', async () => {
  await signUpAs('fulano@gmail.com')
  const field = screen.getByLabelText('Código de 8 dígitos')
  let typed = ''
  for (const d of '1997151') {
    typed += d
    fireEvent.changeText(field, typed)
  }
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Confirmar e entrar' })) })
  expect(mockVerify).not.toHaveBeenCalled()

  fireEvent.changeText(field, '19971511')
  expect(mockVerify).not.toHaveBeenCalled()
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Confirmar e entrar' })) })
  expect(mockVerify).toHaveBeenCalledTimes(1)
})

it('código errado: mensagem única, campo não é apagado, reenvio segue disponível', async () => {
  mockVerify.mockResolvedValueOnce({ success: false, error: OTP_ERROR })
  await signUpAs('fulano@gmail.com')
  advance(60)
  await act(async () => { fireEvent.changeText(screen.getByLabelText('Código de 8 dígitos'), '11111111') })
  expect(screen.getByText(OTP_ERROR)).toBeTruthy()
  expect(screen.getByLabelText('Código de 8 dígitos').props.value).toBe('11111111')
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Reenviar e-mail' })) })
  expect(mockResend).toHaveBeenCalledTimes(1)
})
