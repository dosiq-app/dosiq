// authService.test.js — testes unitários para signUpWithEmail e sendPasswordReset
import { jest } from '@jest/globals'

jest.mock('@platform/supabase/nativeSupabaseClient', () => ({
  supabase: {
    auth: {
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      resend: jest.fn(),
      verifyOtp: jest.fn(),
      signOut: jest.fn(),
    },
  },
}))

import type {
  AuthError,
  User,
  AuthTokenResponsePassword,
  AuthResponse,
} from '@supabase/supabase-js'
import { supabase } from '@platform/supabase/nativeSupabaseClient'
import {
  signInWithEmail, signUpWithEmail, sendPasswordReset, signOut,
  resendSignupConfirmation, verifyOtpWithEmail, SEND_LIMIT_MESSAGES, OTP_ERROR_MESSAGE,
} from '../authService'

const mockedAuth = supabase.auth as jest.Mocked<typeof supabase.auth>

describe('authService', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('signInWithEmail', () => {
    it('retorna erro quando email é inválido', async () => {
      const result = await signInWithEmail('email-invalido', 'senha123')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Email inválido')
    })

    it('retorna erro quando senha está vazia', async () => {
      const result = await signInWithEmail('test@example.com', '')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Senha é obrigatória')
    })

    it('retorna erro traduzido para credenciais inválidas', async () => {
      mockedAuth.signInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials' } as AuthError,
      } as AuthTokenResponsePassword)
      const result = await signInWithEmail('test@example.com', 'senhaerrada')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Email ou senha inválidos')
    })

    it('retorna success em login bem-sucedido', async () => {
      mockedAuth.signInWithPassword.mockResolvedValue({
        data: { user: { id: 'user-123' } as User, session: {} },
        error: null,
      } as AuthTokenResponsePassword)
      const result = await signInWithEmail('test@example.com', 'Senha123!')
      expect(result.success).toBe(true)
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'Senha123!',
      })
    })

    it('trata erro de rede inesperado com fallback', async () => {
      mockedAuth.signInWithPassword.mockRejectedValue(new Error('Network error'))
      const result = await signInWithEmail('test@example.com', 'Senha123!')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Erro inesperado ao fazer login')
    })
  })

  describe('signUpWithEmail', () => {
    it('retorna erro quando email é inválido', async () => {
      const result = await signUpWithEmail('email-invalido', 'Senha123!', 'Senha123!')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Email inválido')
    })

    it('retorna erro quando senha tem menos de 8 caracteres', async () => {
      const result = await signUpWithEmail('test@example.com', 'curta', 'curta')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Senha deve ter no mínimo 8 caracteres')
    })

    it('retorna erro quando confirmação de senha é vazia', async () => {
      const result = await signUpWithEmail('test@example.com', 'Senha123!', '')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Confirmação de senha é obrigatória')
    })

    it('retorna erro quando senhas não coincidem', async () => {
      const result = await signUpWithEmail('test@example.com', 'Senha123!', 'SenhaDiferente!')
      expect(result.success).toBe(false)
      expect(result.error).toBe('As senhas não coincidem')
    })

    // 096 B3 — o cadastro não carrega mais consentimento: A é colhido no fim do onboarding (S1), com
    // sessão, pelo RPC. Conta nasce sem A (E1b) e sem intenção no user_metadata.
    it('cria a conta sem intenção de consentimento no user_metadata', async () => {
      mockedAuth.signUp.mockResolvedValue({
        data: { user: { id: 'user-1', email: 'novo@example.com' } as User, session: {} },
        error: null,
      } as AuthResponse)

      const result = await signUpWithEmail('novo@example.com', 'Senha123!', 'Senha123!')

      expect(result.success).toBe(true)
      const options = mockedAuth.signUp.mock.calls[0][0].options as { data?: unknown }
      expect(options.data).toBeUndefined()
    })

    it('retorna erro PT-BR quando email já está cadastrado', async () => {
      mockedAuth.signUp.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'User already registered' } as AuthError,
      } as AuthResponse)
      const result = await signUpWithEmail('test@example.com', 'Senha123!', 'Senha123!')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Email já cadastrado. Faça login.')
    })

    it('em produção usa emailRedirectTo https (Universal Link)', async () => {
      const prevDev = (global as unknown as { __DEV__: boolean }).__DEV__;
      (global as unknown as { __DEV__: boolean }).__DEV__ = false
      try {
        mockedAuth.signUp.mockResolvedValue({
          data: { user: { id: 'user-456', email: 'novo@example.com' } as User, session: {} },
          error: null,
        } as AuthResponse)
        const result = await signUpWithEmail('novo@example.com', 'Senha123!', 'Senha123!')
        expect(result.success).toBe(true)
        expect(supabase.auth.signUp).toHaveBeenCalledWith({
          email: 'novo@example.com',
          password: 'Senha123!',
          options: expect.objectContaining({ emailRedirectTo: 'https://dosiq.app/auth/callback' }),
        })
      } finally {
        (global as unknown as { __DEV__: boolean }).__DEV__ = prevDev
      }
    })

    it('em dev usa o scheme dosiq:// (abre build de dev direto)', async () => {
      const prevDev = (global as unknown as { __DEV__: boolean }).__DEV__;
      (global as unknown as { __DEV__: boolean }).__DEV__ = true
      try {
        mockedAuth.signUp.mockResolvedValue({
          data: { user: { id: 'user-789', email: 'dev@example.com' } as User, session: {} },
          error: null,
        } as AuthResponse)
        await signUpWithEmail('dev@example.com', 'Senha123!', 'Senha123!')
        expect(supabase.auth.signUp).toHaveBeenCalledWith({
          email: 'dev@example.com',
          password: 'Senha123!',
          options: expect.objectContaining({ emailRedirectTo: 'dosiq://auth/callback' }),
        })
      } finally {
        (global as unknown as { __DEV__: boolean }).__DEV__ = prevDev
      }
    })

    it('trata erro de rede inesperado com fallback', async () => {
      mockedAuth.signUp.mockRejectedValue(new Error('Network error'))
      const result = await signUpWithEmail('test@example.com', 'Senha123!', 'Senha123!')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Erro inesperado ao criar conta')
    })
  })

  describe('sendPasswordReset', () => {
    it('retorna erro quando email é inválido', async () => {
      const result = await sendPasswordReset('email-invalido')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Email inválido')
    })

    it('retorna success após envio de reset (Supabase não revela se email existe)', async () => {
      mockedAuth.resetPasswordForEmail.mockResolvedValue({
        data: {},
        error: null,
      })
      const result = await sendPasswordReset('test@example.com')
      expect(result.success).toBe(true)
      expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
        'test@example.com',
        { redirectTo: 'dosiq://auth/callback' }
      )
    })

    it('retorna erro traduzido para rate limit', async () => {
      mockedAuth.resetPasswordForEmail.mockResolvedValue({
        data: null,
        error: { message: 'rate limit exceeded' } as AuthError,
      })
      const result = await sendPasswordReset('test@example.com')
      expect(result.success).toBe(false)
      expect(result.error).toBe(SEND_LIMIT_MESSAGES.quota)
    })

    it('trata erro de rede inesperado com fallback', async () => {
      mockedAuth.resetPasswordForEmail.mockRejectedValue(new Error('Network error'))
      const result = await sendPasswordReset('test@example.com')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Erro inesperado ao enviar email de recuperação')
    })
  })

  describe('signOut', () => {
    it('retorna success em logout bem-sucedido', async () => {
      mockedAuth.signOut.mockResolvedValue({ error: null })
      const result = await signOut()
      expect(result.success).toBe(true)
    })

    it('retorna failure quando Supabase retorna erro', async () => {
      mockedAuth.signOut.mockResolvedValue({
        error: { message: 'Logout failed' } as AuthError,
      })
      const result = await signOut()
      expect(result.success).toBe(false)
    })

    it('trata exceção inesperada', async () => {
      mockedAuth.signOut.mockRejectedValue(new Error('Network error'))
      const result = await signOut()
      expect(result.success).toBe(false)
    })
  })
  // Spec 123 (PO-123-3, PO-SEC-3): recusas do GoTrue por causa — analysis-M.md.
  describe('resendSignupConfirmation', () => {
    const cases: Array<[string, Partial<AuthError>, string]> = [
      ['60 s do mesmo endereço', { code: 'over_email_send_rate_limit', status: 429, message: 'For security purposes, you can only request this after 42 seconds.' }, SEND_LIMIT_MESSAGES.cooldown],
      ['teto de e-mails do projeto', { code: 'over_email_send_rate_limit', status: 429, message: 'email rate limit exceeded' }, SEND_LIMIT_MESSAGES.quota],
      ['limite por IP', { code: 'over_request_rate_limit', status: 429, message: 'Request rate limit reached' }, SEND_LIMIT_MESSAGES.network],
      ['SMTP falhou', { status: 500, message: 'Error sending confirmation email' }, SEND_LIMIT_MESSAGES.quota],
      ['erro desconhecido', { status: 400, message: 'algo novo' }, SEND_LIMIT_MESSAGES.quota],
    ]

    it.each(cases)('%s ⇒ mensagem própria', async (_label, error, expected) => {
      mockedAuth.resend.mockResolvedValue({ data: { user: null, session: null }, error: error as AuthError })
      const result = await resendSignupConfirmation('fulano@example.com')
      expect(result).toEqual({ success: false, error: expected })
    })

    it('sucesso usa o mesmo redirect do cadastro', async () => {
      const prevDev = (global as unknown as { __DEV__: boolean }).__DEV__;
      (global as unknown as { __DEV__: boolean }).__DEV__ = false
      try {
        mockedAuth.resend.mockResolvedValue({ data: { user: null, session: null }, error: null })
        const result = await resendSignupConfirmation('fulano@example.com')
        expect(result).toEqual({ success: true })
        expect(supabase.auth.resend).toHaveBeenCalledWith({
          type: 'signup',
          email: 'fulano@example.com',
          options: { emailRedirectTo: 'https://dosiq.app/auth/callback' },
        })
      } finally {
        (global as unknown as { __DEV__: boolean }).__DEV__ = prevDev
      }
    })

    it('exceção de rede ⇒ mensagem do teto, sem lançar', async () => {
      mockedAuth.resend.mockRejectedValue(new Error('offline'))
      expect(await resendSignupConfirmation('fulano@example.com')).toEqual({ success: false, error: SEND_LIMIT_MESSAGES.quota })
    })
  })

  describe('verifyOtpWithEmail (E-7: só 8 dígitos)', () => {
    it.each(['123456', '1234567', '123456789', 'abcdefgh', ''])('%j é recusado sem chamar o servidor', async (code) => {
      const result = await verifyOtpWithEmail('fulano@example.com', code, 'signup')
      expect(result.success).toBe(false)
      expect(supabase.auth.verifyOtp).not.toHaveBeenCalled()
    })

    it('código errado ou vencido ⇒ mensagem única', async () => {
      mockedAuth.verifyOtp.mockResolvedValue({ data: { user: null, session: null }, error: { message: 'Token has expired or is invalid', code: 'otp_expired' } as AuthError })
      const result = await verifyOtpWithEmail('fulano@example.com', '19971511', 'signup')
      expect(result).toEqual({ success: false, error: OTP_ERROR_MESSAGE })
    })
  })
})
