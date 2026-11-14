// Permissão de push — modelo CONTEXTUAL (não pedir no 1º load).
//
// Princípio (persona dona Maria, non-tech): o prompt do OS é "bala única". Pedir
// sem contexto → usuário nega por reflexo → push morre (reativar exige ir nas
// Configurações do SO, que ela não faz). Então só pedimos em momentos de INTENÇÃO
// clara: toggle de lembrete no onboarding, criação manual do 1º tratamento, ou ao
// ligar notificações nas Configurações.
//
// - getPushPermissionStatus(): leitura PURA do status, NUNCA dispara prompt.
// - ensurePushPermission(): pede só se ainda dá (undetermined). Se negado e sem
//   poder repedir, retorna { blocked:true } para o caller oferecer deep link p/
//   as Configurações do SO.
// - enablePushAtIntent(): ensure + registra o token se concedido (one-call dos
//   pontos de intenção).

import * as Notifications from 'expo-notifications'
import { Linking, Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { registerPushToken } from './registerPushToken'
import { debugLog } from '@shared/utils/debugLog'
import { logEvent } from '@platform/analytics/productAnalytics'
import { EVENTS, SURFACES, type PermissionEntryPoint } from '@platform/analytics/analyticsEvents'
import { ANDROID_PUSH_CHANNEL } from '@dosiq/core'

// 054 C-23: no iOS, Alertas Críticos permitidos deixam o app "autorizado" mesmo com alerta/som/banner
// DESLIGADOS — o `granted` do expo é só `authorizationStatus == Authorized`
// (EXUserFacingNotificationsPermissionsRequester.m:38). Push "ligado" exige o alerta habilitado.
// `allowsAlert: null` (não informado) não rebaixa. Já decidido ⇒ não dá para repedir (só Ajustes).
function _effective(perm: Notifications.NotificationPermissionsStatus | null | undefined) {
  const alertOff = Platform.OS === 'ios' && perm?.ios?.allowsAlert === false
  if (perm?.status === 'granted' && alertOff) return { status: 'denied', canAskAgain: false, granted: false }
  return { status: perm?.status, canAskAgain: perm?.canAskAgain, granted: perm?.status === 'granted' }
}

// Status puro — sem efeitos colaterais. 'granted' | 'undetermined' | 'denied'.
export async function getPushPermissionStatus() {
  return _effective(await Notifications.getPermissionsAsync())
}

// 054 C-31: no Android a permissão geral pode estar concedida com o CANAL do push comum desligado
// (Ajustes › Apps › dosiq › Notificações) — o SO descarta tudo que chega nele e o "Celular" mentia.
// 'blocked' = importância NONE · 'silenced' = MIN/LOW (chega sem som) · 'unknown' = canal ausente
// ou leitura falhou (não afirmar nada) · iOS não tem canais ⇒ sempre 'ok'.
export async function getPushChannelState(): Promise<'ok' | 'blocked' | 'silenced' | 'unknown'> {
  if (Platform.OS !== 'android') return 'ok'
  try {
    const channel = await Notifications.getNotificationChannelAsync(ANDROID_PUSH_CHANNEL.DEFAULT)
    if (!channel) return 'unknown'
    const { NONE, MIN, LOW } = Notifications.AndroidImportance
    if (channel.importance === NONE) return 'blocked'
    if (channel.importance === MIN || channel.importance === LOW) return 'silenced'
    return 'ok'
  } catch {
    return 'unknown'
  }
}

// 120 US4 / E-6: o diálogo do SO de fato apareceu ⇒ `prompt_shown` + decisão, JUNTOS e post-hoc
// (nunca antes do pedido: no Android só se sabe depois, pela demora). `entry_point` em ambos.
async function _logDecision(granted: boolean, entryPoint: PermissionEntryPoint) {
  const props = { surface: SURFACES.MOBILE, entry_point: entryPoint }
  await logEvent(EVENTS.NOTIFICATION_PERMISSION_PROMPT_SHOWN, props)
  await logEvent(granted ? EVENTS.NOTIFICATION_PERMISSION_GRANTED : EVENTS.NOTIFICATION_PERMISSION_DENIED, props)
}

// Pede permissão apenas em ponto de intenção. Nunca repete prompt já negado.
// Retorna { granted, blocked }: blocked=true quando negado e não dá p/ repedir
// (caller deve oferecer abrir Configurações do SO).
export async function ensurePushPermission({ entryPoint }: { entryPoint: PermissionEntryPoint }) {
  const { status, canAskAgain } = _effective(await Notifications.getPermissionsAsync())
  if (status === 'granted') return { granted: true, blocked: false }
  if (canAskAgain) {
    const res = _effective(await Notifications.requestPermissionsAsync())
    const granted = res.granted
    // 065 US5: só aqui o prompt do SO de fato apareceu — é a DECISÃO da pessoa. Já concedido ou
    // negado sem poder repedir não é decisão nova e não emite. O prompt só existe com o app aberto.
    await _logDecision(granted, entryPoint)
    return { granted, blocked: !granted && res.canAskAgain === false }
  }
  // negado + não pode repedir → só via Configurações do SO
  return { granted: false, blocked: true }
}

// 054 C-33: no Android o `canAskAgain` do expo não distingue "nunca perguntado" de "negado de vez"
// depois de um diálogo dispensado (cache `didAsk` do expo + `shouldShowRequestPermissionRationale`
// falso). Medido no smoke (0.33.36): POST_NOTIFICATIONS sem USER_SET/USER_FIXED e mesmo assim
// `canAskAgain:false` ⇒ o app mandava aos Ajustes algo que 1 "Permitir" resolvia. Então no Android
// a gente SEMPRE pede: o SO mostra o diálogo se ainda pode; se não pode, devolve negado na hora,
// sem diálogo — e só aí (resposta instantânea) cabe abrir os Ajustes.
const INSTANT_DENIAL_MS = 400

// 120 smoke: o Android não diz ANTES se ainda vai perguntar. Guardamos o que ele já mostrou: negou
// na hora (sem diálogo) ⇒ próxima vez o preparo já fala em Ajustes, não em "o sistema vai perguntar".
export const PUSH_OS_BLOCKED_KEY = 'dosiq:push-os-blocked'

async function _setOsBlocked(blocked: boolean) {
  try {
    if (blocked) await AsyncStorage.setItem(PUSH_OS_BLOCKED_KEY, '1')
    else await AsyncStorage.removeItem(PUSH_OS_BLOCKED_KEY)
  } catch {
    // memória de UX: falhar só deixa a cópia neutra
  }
}

export type PushAskMode = 'ask' | 'settings' | 'unknown'

/**
 * O que acontece ao tocar no CTA do preparo — para a cópia não prometer um diálogo que não vem.
 * 'ask' = o SO pergunta · 'settings' = abre os Ajustes · 'unknown' = Android negado sem histórico
 * (pode perguntar ou não — C-33). Leitura pura; falha ⇒ 'unknown'.
 */
export async function getPushAskMode(): Promise<PushAskMode> {
  try {
    const { status, canAskAgain, granted } = _effective(await Notifications.getPermissionsAsync())
    if (granted) return 'ask'
    if (Platform.OS !== 'android') return canAskAgain ? 'ask' : 'settings'
    if (status === 'undetermined') return 'ask'
    return (await AsyncStorage.getItem(PUSH_OS_BLOCKED_KEY)) === '1' ? 'settings' : 'unknown'
  } catch {
    return 'unknown'
  }
}

export async function requestPushOrOpenSettings({ supabase, entryPoint }: { supabase: unknown; entryPoint: PermissionEntryPoint }): Promise<boolean> {
  if (Platform.OS !== 'android') {
    const res = await enablePushAtIntent({ supabase, entryPoint })
    if (!res.granted && res.blocked) Linking.openSettings()
    return res.granted
  }
  // 120: já concedido ⇒ sem pedido e sem evento (não é decisão); só garante o token.
  if (_effective(await Notifications.getPermissionsAsync().catch(() => null)).granted) {
    await _registerQuietly(supabase)
    return true
  }
  const startedAt = Date.now()
  const res = _effective(await Notifications.requestPermissionsAsync())
  if (res.granted) {
    await _setOsBlocked(false)
    await _logDecision(true, entryPoint)
    await _registerQuietly(supabase)
    return true
  }
  if (Date.now() - startedAt < INSTANT_DENIAL_MS) {
    // Sem diálogo: o Android já não pergunta ⇒ Ajustes (e nenhum evento — não houve decisão).
    await _setOsBlocked(true)
    Linking.openSettings()
  } else {
    await _logDecision(false, entryPoint)
  }
  return false
}

// A falha já vira `push_token_register_failed` dentro do `registerPushToken` (120 E-5); aqui só não
// derruba o fluxo de intenção — o retry vem no próximo foreground (`usePushNotifications`).
async function _registerQuietly(supabase: unknown) {
  try {
    await registerPushToken({ supabase })
  } catch (err) {
    debugLog('pushPermission', 'registerPushToken falhou', err?.message)
  }
}

// One-call para pontos de intenção: pede (se cabível) e, se concedido, registra
// o token imediatamente (para os lembretes funcionarem já, sem esperar relaunch).
export async function enablePushAtIntent({ supabase, entryPoint }: { supabase: unknown; entryPoint: PermissionEntryPoint }) {
  const { granted, blocked } = await ensurePushPermission({ entryPoint })
  if (granted) await _registerQuietly(supabase)
  return { granted, blocked }
}
