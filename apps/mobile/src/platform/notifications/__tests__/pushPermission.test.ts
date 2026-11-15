// 054 C-23: no iOS, só Alertas Críticos permitidos ⇒ status AUTHORIZED com alerta desligado.
// O app não pode chamar isso de "notificações ligadas" nem registrar token de push.
import * as Notifications from 'expo-notifications'

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getNotificationChannelAsync: jest.fn(),
  AndroidImportance: { NONE: 1, MIN: 2, LOW: 3, DEFAULT: 4, HIGH: 5 },
}))
jest.mock('expo-application', () => ({ applicationId: 'app.dosiq.test' }))
jest.mock('../registerPushToken', () => ({ registerPushToken: jest.fn(() => Promise.resolve()) }))
const mockLogEvent = jest.fn()
jest.mock('@platform/analytics/productAnalytics', () => ({ logEvent: (...a: any[]) => mockLogEvent(...a) }))

import { getPushPermissionStatus, ensurePushPermission } from '../pushPermission'
import { registerPushToken } from '../registerPushToken'
import { enablePushAtIntent, getPushChannelState, requestPushOrOpenSettings, getPushAskMode, openPushSettings, PUSH_OS_BLOCKED_KEY } from '../pushPermission'
import AsyncStorage from '@react-native-async-storage/async-storage'

const RN = require('react-native')
const ORIGINAL_OS = RN.Platform.OS
const get = jest.mocked(Notifications.getPermissionsAsync) as jest.Mock
const req = jest.mocked(Notifications.requestPermissionsAsync) as jest.Mock

beforeEach(() => {
  RN.Platform.OS = 'ios'
})

afterEach(() => {
  RN.Platform.OS = ORIGINAL_OS
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('pushPermission — push efetivo (054 C-23)', () => {
  it('🔴 iOS granted + alerta desligado (só crítico) ⇒ NÃO está ligado', async () => {
    get.mockResolvedValue({ status: 'granted', canAskAgain: true, ios: { allowsAlert: false } })
    expect(await getPushPermissionStatus()).toEqual({ status: 'denied', canAskAgain: false, granted: false })
  })

  it('🔴 ensurePushPermission não registra token nem pede de novo: manda para Ajustes', async () => {
    get.mockResolvedValue({ status: 'granted', canAskAgain: true, ios: { allowsAlert: false } })
    expect(await enablePushAtIntent({ supabase: {}, entryPoint: 'settings' })).toEqual({ granted: false, blocked: true })
    expect(req).not.toHaveBeenCalled()
    expect(registerPushToken).not.toHaveBeenCalled()
  })

  it('iOS granted + alerta ligado ⇒ ligado', async () => {
    get.mockResolvedValue({ status: 'granted', canAskAgain: true, ios: { allowsAlert: true } })
    expect((await getPushPermissionStatus()).granted).toBe(true)
  })

  it('allowsAlert ausente (null) não rebaixa', async () => {
    get.mockResolvedValue({ status: 'granted', canAskAgain: true, ios: { allowsAlert: null } })
    expect((await getPushPermissionStatus()).granted).toBe(true)
  })

  it('Android ignora o campo do iOS', async () => {
    RN.Platform.OS = 'android'
    get.mockResolvedValue({ status: 'granted', canAskAgain: true })
    expect((await ensurePushPermission({ entryPoint: 'settings' })).granted).toBe(true)
  })

  it('prompt concedido mas sem alerta ⇒ evento de NEGAÇÃO', async () => {
    get.mockResolvedValue({ status: 'undetermined', canAskAgain: true })
    req.mockResolvedValue({ status: 'granted', canAskAgain: false, ios: { allowsAlert: false } })
    expect((await ensurePushPermission({ entryPoint: 'settings' })).granted).toBe(false)
    expect(mockLogEvent.mock.calls.map((c) => c[0])).toEqual(['notification_permission_prompt_shown', 'notification_permission_denied'])
  })
})

describe('pushPermission — canal do push comum no Android (054 C-31)', () => {
  const channel = Notifications.getNotificationChannelAsync as jest.Mock
  beforeEach(() => { RN.Platform.OS = 'android' })

  it('🔴 canal desligado (NONE) ⇒ blocked, mesmo com permissão geral', async () => {
    channel.mockResolvedValue({ importance: 1 })
    expect(await getPushChannelState()).toBe('blocked')
  })

  it('canal em Silencioso (LOW/MIN) ⇒ silenced', async () => {
    channel.mockResolvedValue({ importance: 3 })
    expect(await getPushChannelState()).toBe('silenced')
    channel.mockResolvedValue({ importance: 2 })
    expect(await getPushChannelState()).toBe('silenced')
  })

  it('canal ligado ⇒ ok; ausente ou erro ⇒ unknown (não afirmar nada)', async () => {
    channel.mockResolvedValue({ importance: 5 })
    expect(await getPushChannelState()).toBe('ok')
    channel.mockResolvedValue(null)
    expect(await getPushChannelState()).toBe('unknown')
    channel.mockRejectedValue(new Error('x'))
    expect(await getPushChannelState()).toBe('unknown')
  })

  it('iOS não tem canais ⇒ ok, sem ler nada', async () => {
    RN.Platform.OS = 'ios'
    expect(await getPushChannelState()).toBe('ok')
    expect(channel).not.toHaveBeenCalled()
  })
})

describe('requestPushOrOpenSettings — Android sempre pede (054 C-33)', () => {
  const { Linking } = RN
  beforeEach(() => { RN.Platform.OS = 'android' })

  it('🔴 pede ao SO mesmo com canAskAgain:false; concedido registra token', async () => {
    req.mockResolvedValue({ status: 'granted', canAskAgain: true })
    expect(await requestPushOrOpenSettings({ supabase: {}, entryPoint: 'settings' })).toBe(true)
    expect(req).toHaveBeenCalled()
    expect(registerPushToken).toHaveBeenCalled()
  })

  it('🔴 negado na hora (sem diálogo) ⇒ abre Ajustes', async () => {
    const spy = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined)
    req.mockResolvedValue({ status: 'denied', canAskAgain: false })
    expect(await requestPushOrOpenSettings({ supabase: {}, entryPoint: 'settings' })).toBe(false)
    expect(spy).toHaveBeenCalled()
  })

  it('negado pela pessoa no diálogo (demorou) ⇒ não abre Ajustes', async () => {
    const spy = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined)
    const now = jest.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValueOnce(5000)
    req.mockResolvedValue({ status: 'denied', canAskAgain: false })
    expect(await requestPushOrOpenSettings({ supabase: {}, entryPoint: 'settings' })).toBe(false)
    expect(spy).not.toHaveBeenCalled()
    now.mockRestore()
  })
})

// smoke 120: o preparo diz o que o CTA fará — não promete diálogo quando o SO já bloqueou.
describe('getPushAskMode', () => {
  const store = AsyncStorage as unknown as { getItem: jest.Mock; setItem: jest.Mock; removeItem: jest.Mock }

  it('iOS: pode perguntar ⇒ ask; negado ⇒ settings', async () => {
    get.mockResolvedValueOnce({ status: 'undetermined', canAskAgain: true })
    expect(await getPushAskMode()).toBe('ask')
    get.mockResolvedValueOnce({ status: 'denied', canAskAgain: false })
    expect(await getPushAskMode()).toBe('settings')
  })

  it('Android negado: sem histórico ⇒ unknown; com a marca ⇒ settings', async () => {
    RN.Platform.OS = 'android'
    get.mockResolvedValue({ status: 'denied', canAskAgain: false })
    store.getItem.mockResolvedValueOnce(null)
    expect(await getPushAskMode()).toBe('unknown')
    store.getItem.mockResolvedValueOnce('1')
    expect(await getPushAskMode()).toBe('settings')
    expect(store.getItem).toHaveBeenCalledWith(PUSH_OS_BLOCKED_KEY)
  })

  it('Android: negação instantânea grava a marca; concessão apaga', async () => {
    RN.Platform.OS = 'android'
    jest.spyOn(RN.Linking, 'openSettings').mockResolvedValue(undefined)
    get.mockResolvedValue({ status: 'denied', canAskAgain: false })
    req.mockResolvedValueOnce({ status: 'denied', canAskAgain: false })
    await requestPushOrOpenSettings({ supabase: {}, entryPoint: 'today_banner' })
    expect(store.setItem).toHaveBeenCalledWith(PUSH_OS_BLOCKED_KEY, '1')
    req.mockResolvedValueOnce({ status: 'granted', canAskAgain: true })
    await requestPushOrOpenSettings({ supabase: {}, entryPoint: 'today_banner' })
    expect(store.removeItem).toHaveBeenCalledWith(PUSH_OS_BLOCKED_KEY)
  })

  it('leitura falhou ⇒ unknown', async () => {
    get.mockRejectedValueOnce(new Error('x'))
    expect(await getPushAskMode()).toBe('unknown')
  })
})

// 120 US4 / E-6 — `prompt_shown` com `entry_point`, emitido JUNTO da decisão, só quando houve diálogo.
describe('pushPermission — medição por ponto de pedido (120 PO-120-5)', () => {
  const { Linking } = RN
  const names = () => mockLogEvent.mock.calls.map((c) => c[0])

  it('iOS undetermined ⇒ prompt_shown + decisão, ambos com entry_point', async () => {
    get.mockResolvedValue({ status: 'undetermined', canAskAgain: true })
    req.mockResolvedValue({ status: 'granted', canAskAgain: true })
    await ensurePushPermission({ entryPoint: 'treatment_form' })
    expect(mockLogEvent.mock.calls).toEqual([
      ['notification_permission_prompt_shown', { surface: 'mobile', entry_point: 'treatment_form' }],
      ['notification_permission_granted', { surface: 'mobile', entry_point: 'treatment_form' }],
    ])
  })

  it('iOS já concedido ou negado sem repedir ⇒ nenhum evento', async () => {
    get.mockResolvedValue({ status: 'granted', canAskAgain: true })
    await ensurePushPermission({ entryPoint: 'onboarding' })
    get.mockResolvedValue({ status: 'denied', canAskAgain: false })
    await ensurePushPermission({ entryPoint: 'onboarding' })
    expect(mockLogEvent).not.toHaveBeenCalled()
  })

  it('Android com diálogo (≥400 ms) e negado ⇒ prompt_shown + denied', async () => {
    RN.Platform.OS = 'android'
    jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined)
    const now = jest.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValueOnce(5000)
    get.mockResolvedValue({ status: 'denied', canAskAgain: true })
    req.mockResolvedValue({ status: 'denied', canAskAgain: false })
    await requestPushOrOpenSettings({ supabase: {}, entryPoint: 'today_banner' })
    expect(names()).toEqual(['notification_permission_prompt_shown', 'notification_permission_denied'])
    expect(mockLogEvent.mock.calls[1][1]).toEqual({ surface: 'mobile', entry_point: 'today_banner' })
    now.mockRestore()
  })

  it('🔴 Android negação instantânea (sem diálogo) ⇒ nenhum evento (boundary PO-120-5)', async () => {
    RN.Platform.OS = 'android'
    jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined)
    get.mockResolvedValue({ status: 'denied', canAskAgain: false })
    req.mockResolvedValue({ status: 'denied', canAskAgain: false })
    await requestPushOrOpenSettings({ supabase: {}, entryPoint: 'today_banner' })
    expect(mockLogEvent).not.toHaveBeenCalled()
  })

  it('🔴 Android já concedido ⇒ registra o token sem pedir e sem evento', async () => {
    RN.Platform.OS = 'android'
    get.mockResolvedValue({ status: 'granted', canAskAgain: true })
    expect(await requestPushOrOpenSettings({ supabase: {}, entryPoint: 'settings' })).toBe(true)
    expect(req).not.toHaveBeenCalled()
    expect(registerPushToken).toHaveBeenCalled()
    expect(mockLogEvent).not.toHaveBeenCalled()
  })

  it('🔴 C-01: Android denied + canAskAgain:false sem decisão ⇒ ainda pede ao SO (PO-120-11)', async () => {
    RN.Platform.OS = 'android'
    get.mockResolvedValue({ status: 'denied', canAskAgain: false })
    req.mockResolvedValue({ status: 'granted', canAskAgain: true })
    expect(await requestPushOrOpenSettings({ supabase: {}, entryPoint: 'treatment_form' })).toBe(true)
    expect(req).toHaveBeenCalledTimes(1)
  })

  it('INV-2: iOS negado não repede ⇒ Ajustes', async () => {
    const spy = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined)
    get.mockResolvedValue({ status: 'denied', canAskAgain: false })
    expect(await requestPushOrOpenSettings({ supabase: {}, entryPoint: 'today_banner' })).toBe(false)
    expect(req).not.toHaveBeenCalled()
    expect(spy).toHaveBeenCalled()
  })
})

describe('openPushSettings — U-1 (120 C)', () => {
  it('Android com permissão ⇒ abre direto a tela do canal de push', async () => {
    RN.Platform.OS = 'android'
    get.mockResolvedValue({ status: 'granted', canAskAgain: true, granted: true })
    const send = jest.spyOn(RN.Linking, 'sendIntent').mockResolvedValue(undefined)
    const open = jest.spyOn(RN.Linking, 'openSettings').mockResolvedValue(undefined)
    await openPushSettings()
    expect(send).toHaveBeenCalledWith('android.settings.CHANNEL_NOTIFICATION_SETTINGS', [
      { key: 'android.provider.extra.APP_PACKAGE', value: 'app.dosiq.test' },
      { key: 'android.provider.extra.CHANNEL_ID', value: expect.any(String) },
    ])
    expect(open).not.toHaveBeenCalled()
  })

  it('intent falha ⇒ cai na página do app', async () => {
    RN.Platform.OS = 'android'
    get.mockResolvedValue({ status: 'granted', canAskAgain: true, granted: true })
    jest.spyOn(RN.Linking, 'sendIntent').mockRejectedValue(new Error('no activity'))
    const open = jest.spyOn(RN.Linking, 'openSettings').mockResolvedValue(undefined)
    await openPushSettings()
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('Android sem permissão ⇒ página do app (o bloqueio não é o canal)', async () => {
    RN.Platform.OS = 'android'
    get.mockResolvedValue({ status: 'denied', canAskAgain: false, granted: false })
    const send = jest.spyOn(RN.Linking, 'sendIntent').mockResolvedValue(undefined)
    const open = jest.spyOn(RN.Linking, 'openSettings').mockResolvedValue(undefined)
    await openPushSettings()
    expect(send).not.toHaveBeenCalled()
    expect(open).toHaveBeenCalledTimes(1)
  })
})
