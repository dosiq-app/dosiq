// Registra o Expo push token no backend — assume permissão JÁ concedida (não
// pede). Usado pelo setup global (register-only) e pelos pontos de intenção
// (após enablePushAtIntent conceder). Idempotente.
//
// 120 FR-007 / E-5: toda falha emite `push_token_register_failed` AQUI (um ponto só, não nos 4
// callers que engolem). `reason` é enum fechado (RC-SEC S-5) — nunca a mensagem do erro.

import AsyncStorage from '@react-native-async-storage/async-storage'
import { getExpoPushToken } from './getExpoPushToken'
import { syncNotificationDevice } from './syncNotificationDevice'
import { debugLog } from '@shared/utils/debugLog'
import { logEvent } from '@platform/analytics/productAnalytics'
import { EVENTS, SURFACES, PUSH_TOKEN_FAILURE_REASONS, type PushTokenFailureReason } from '@platform/analytics/analyticsEvents'

export const PUSH_TOKEN_KEY = '@dosiq/expo-push-token'

const NETWORK_ERROR = /network|fetch|timeout|timed out|offline|internet/i

/** Mapeia o erro para o enum. Só classifica pela mensagem — nunca a repassa. @private */
export function classifyTokenError(err: unknown): PushTokenFailureReason {
  const message = err instanceof Error ? err.message : ''
  if (message.includes('[syncNotificationDevice] Upsert failed')) return PUSH_TOKEN_FAILURE_REASONS.SERVER
  if (NETWORK_ERROR.test(message)) return PUSH_TOKEN_FAILURE_REASONS.NETWORK
  return PUSH_TOKEN_FAILURE_REASONS.UNKNOWN
}

function _reportFailure(reason: PushTokenFailureReason) {
  void logEvent(EVENTS.PUSH_TOKEN_REGISTER_FAILED, { surface: SURFACES.MOBILE, reason })
}

// Resolve userId pela sessão atual quando não passado. Retorna o token ou null.
// nativeAlarmEnabled propaga o flag do alarme nativo pro device (gate de duplicata,
// Spec 001 A2); se não passado, lê o estado atual do toggle (default OFF).
export async function registerPushToken({ supabase, userId, nativeAlarmEnabled }: { supabase: any; userId?: any; nativeAlarmEnabled?: any }) {
  try {
    const token = await getExpoPushToken()
    if (!token) {
      _reportFailure(PUSH_TOKEN_FAILURE_REASONS.NO_TOKEN)
      return null
    }

    let uid = userId
    if (!uid) {
      const { data } = await supabase.auth.getUser()
      uid = data?.user?.id
    }
    if (!uid) {
      debugLog('registerPushToken', 'sem userId — abortado')
      _reportFailure(PUSH_TOKEN_FAILURE_REASONS.NO_USER)
      return null
    }

    const alarmFlag = nativeAlarmEnabled ?? true
    await syncNotificationDevice({ supabase, userId: uid, token, nativeAlarmEnabled: alarmFlag })
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token)
    debugLog('registerPushToken', 'token registrado', token.substring(0, 20) + '...')
    return token
  } catch (err) {
    _reportFailure(classifyTokenError(err))
    throw err
  }
}
