// 120 FR-007 / E-5 / RC-SEC S-5 — falha ao registrar o token vira `push_token_register_failed` com
// motivo de enum fechado. Nunca a mensagem do erro (pode carregar URL do Supabase ou o token).
const mockLogEvent = jest.fn()
jest.mock('@platform/analytics/productAnalytics', () => ({ logEvent: (...a: any[]) => mockLogEvent(...a) }))
const mockGetToken = jest.fn()
jest.mock('../getExpoPushToken', () => ({ getExpoPushToken: () => mockGetToken() }))
const mockSync = jest.fn()
jest.mock('../syncNotificationDevice', () => ({ syncNotificationDevice: (...a: any[]) => mockSync(...a) }))
jest.mock('@react-native-async-storage/async-storage', () => ({ setItem: jest.fn(() => Promise.resolve()) }))

import { registerPushToken } from '../registerPushToken'

const TOKEN = 'ExponentPushToken[abc123]'
const supabase = { auth: { getUser: jest.fn() } }

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

const failures = () => mockLogEvent.mock.calls.filter((c) => c[0] === 'push_token_register_failed').map((c) => c[1])

describe('registerPushToken — evento de falha (PO-120-8 / PO-SEC-3)', () => {
  it('sucesso ⇒ nenhum evento', async () => {
    mockGetToken.mockResolvedValue(TOKEN)
    mockSync.mockResolvedValue(undefined)
    expect(await registerPushToken({ supabase, userId: 'u1' })).toBe(TOKEN)
    expect(failures()).toEqual([])
  })

  it('sem token ⇒ no_token, retorna null (não lança)', async () => {
    mockGetToken.mockResolvedValue(null)
    expect(await registerPushToken({ supabase, userId: 'u1' })).toBeNull()
    expect(failures()).toEqual([{ surface: 'mobile', reason: 'no_token' }])
  })

  it('sem usuário ⇒ no_user, retorna null', async () => {
    mockGetToken.mockResolvedValue(TOKEN)
    supabase.auth.getUser.mockResolvedValue({ data: { user: null } })
    expect(await registerPushToken({ supabase })).toBeNull()
    expect(failures()).toEqual([{ surface: 'mobile', reason: 'no_user' }])
  })

  it('🔴 upsert falha com URL/token na mensagem ⇒ server, relança, props sem a mensagem', async () => {
    mockGetToken.mockResolvedValue(TOKEN)
    mockSync.mockRejectedValue(new Error(`[syncNotificationDevice] Upsert failed: https://x.supabase.co ${TOKEN}`))
    await expect(registerPushToken({ supabase, userId: 'u1' })).rejects.toThrow()
    expect(failures()).toEqual([{ surface: 'mobile', reason: 'server' }])
    const dump = JSON.stringify(mockLogEvent.mock.calls)
    expect(dump).not.toMatch(/supabase\.co|ExponentPushToken|u1/)
  })

  it('erro de rede ⇒ network', async () => {
    mockGetToken.mockRejectedValue(new TypeError('Network request failed'))
    await expect(registerPushToken({ supabase, userId: 'u1' })).rejects.toThrow()
    expect(failures()).toEqual([{ surface: 'mobile', reason: 'network' }])
  })

  it('erro desconhecido ⇒ unknown', async () => {
    mockGetToken.mockRejectedValue(new Error('EAS projectId não configurado'))
    await expect(registerPushToken({ supabase, userId: 'u1' })).rejects.toThrow()
    expect(failures()).toEqual([{ surface: 'mobile', reason: 'unknown' }])
  })
})
