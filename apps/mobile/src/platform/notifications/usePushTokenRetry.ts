// usePushTokenRetry — recupera o token de push perdido após a concessão (spec 120 FR-007 / E-5).
//
// B5 (c3c122c1): permissão concedida, `registerPushToken` falhou em silêncio e a próxima tentativa
// só vinha no próximo launch — a pessoa não voltou e ficou sem push. Aqui: a cada volta ao primeiro
// plano, com permissão efetiva e SEM token local (`PUSH_TOKEN_KEY`), tenta de novo.
// Nenhuma consulta ao banco só para checar o token (a chave local basta; `endSession` a limpa).
// Spec 091 (INV-3): só com a conta confirmada no servidor (`canRegister`).
// Listener PRÓPRIO: o do `useTodayData` é do relógio (103 A-5), não misturar.

import { useEffect } from 'react'
import { AppState } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getPushPermissionStatus } from './pushPermission'
import { PUSH_TOKEN_KEY, registerPushToken } from './registerPushToken'

interface Params {
  supabase: unknown
  userId: string | null
  canRegister: boolean
}

export function usePushTokenRetry({ supabase, userId, canRegister }: Params) {
  useEffect(() => {
    if (!supabase || !userId || !canRegister) return
    let alive = true
    let inFlight = false

    const attempt = async () => {
      if (inFlight) return
      inFlight = true
      try {
        if (await AsyncStorage.getItem(PUSH_TOKEN_KEY)) return
        const { granted } = await getPushPermissionStatus()
        if (!granted || !alive) return
        // A falha já vira `push_token_register_failed` dentro do registerPushToken.
        await registerPushToken({ supabase, userId })
      } catch {
        // tenta de novo no próximo foreground
      } finally {
        inFlight = false
      }
    }

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void attempt()
    })
    return () => {
      alive = false
      sub?.remove?.()
    }
  }, [supabase, userId, canRegister])
}
