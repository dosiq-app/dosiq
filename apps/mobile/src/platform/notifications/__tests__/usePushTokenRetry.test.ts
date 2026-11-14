// 120 FR-007 / E-5 / PO-120-8 — token perdido após a concessão é recuperado no próximo foreground.
import { renderHook, act } from '@testing-library/react-native'
import { AppState } from 'react-native'

const mockStatus = jest.fn()
jest.mock('../pushPermission', () => ({ getPushPermissionStatus: () => mockStatus() }))
const mockRegister = jest.fn()
jest.mock('../registerPushToken', () => ({
  PUSH_TOKEN_KEY: '@dosiq/expo-push-token',
  registerPushToken: (...a: any[]) => mockRegister(...a),
}))
const mockGetItem = jest.fn()
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: (...a: any[]) => mockGetItem(...a) }))

import { usePushTokenRetry } from '../usePushTokenRetry'

const supabase = { from: jest.fn(), rpc: jest.fn() }
let listener: ((s: string) => void) | null = null

beforeEach(() => {
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_e: any, cb: any) => {
    listener = cb
    return { remove: jest.fn() } as any
  })
  mockStatus.mockResolvedValue({ granted: true })
  mockGetItem.mockResolvedValue(null)
  mockRegister.mockResolvedValue('tok')
})

afterEach(() => {
  listener = null
  jest.clearAllMocks()
  jest.clearAllTimers()
  jest.restoreAllMocks()
})

async function foreground() {
  await act(async () => {
    listener?.('active')
  })
}

describe('usePushTokenRetry (PO-120-8)', () => {
  it('concedido + sem token local ⇒ nova tentativa no foreground', async () => {
    renderHook(() => usePushTokenRetry({ supabase, userId: 'u1', canRegister: true }))
    await foreground()
    expect(mockRegister).toHaveBeenCalledWith({ supabase, userId: 'u1' })
  })

  it('1 tentativa por foreground enquanto sem token; falha não derruba o próximo', async () => {
    mockRegister.mockRejectedValueOnce(new Error('Network request failed'))
    renderHook(() => usePushTokenRetry({ supabase, userId: 'u1', canRegister: true }))
    await foreground()
    await foreground()
    expect(mockRegister).toHaveBeenCalledTimes(2)
  })

  it('com token local ⇒ nenhuma tentativa, nenhuma consulta ao banco', async () => {
    mockGetItem.mockResolvedValue('ExponentPushToken[x]')
    renderHook(() => usePushTokenRetry({ supabase, userId: 'u1', canRegister: true }))
    await foreground()
    expect(mockRegister).not.toHaveBeenCalled()
    expect(supabase.from).not.toHaveBeenCalled()
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('permissão não concedida ⇒ nenhuma tentativa', async () => {
    mockStatus.mockResolvedValue({ granted: false })
    renderHook(() => usePushTokenRetry({ supabase, userId: 'u1', canRegister: true }))
    await foreground()
    expect(mockRegister).not.toHaveBeenCalled()
  })

  it('🔴 guard: canRegister=false (spec 091) ⇒ nem escuta o foreground', async () => {
    renderHook(() => usePushTokenRetry({ supabase, userId: 'u1', canRegister: false }))
    await foreground()
    expect(mockRegister).not.toHaveBeenCalled()
  })

  it('foregrounds em rajada ⇒ uma tentativa em voo por vez', async () => {
    let release: () => void = () => {}
    mockRegister.mockImplementation(() => new Promise<void>((r) => { release = r }))
    renderHook(() => usePushTokenRetry({ supabase, userId: 'u1', canRegister: true }))
    await foreground()
    await foreground()
    expect(mockRegister).toHaveBeenCalledTimes(1)
    await act(async () => release())
  })

  it('background/inactive ⇒ nada', async () => {
    renderHook(() => usePushTokenRetry({ supabase, userId: 'u1', canRegister: true }))
    await act(async () => listener?.('background'))
    expect(mockRegister).not.toHaveBeenCalled()
  })
})
