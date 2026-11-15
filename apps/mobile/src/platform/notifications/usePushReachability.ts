// usePushReachability — "o push de dose chega a este aparelho?" (spec 120 E-7, fonte única).
//
// Lido pelo card da Hoje (US1), pelo gate do card de bateria da 068 (S-2) e por Configurações.
// Junta: permissão EFETIVA (`_effective`: alerta desligado no iOS conta como negado, 054 C-23) +
// canal do push no Android (054 C-31) + adiamento local do card (FR-003: 7 dias, teto 3).
//
// Android 13+ (C-01): o Expo responde `denied` para "nunca pedido" (não há `undetermined`). Então no
// Android todo "não concedido" vira `undetermined` para o card — o CTA pede ao SO e, se o SO negar
// na hora, o próprio `requestPushOrOpenSettings` manda aos Ajustes (054 C-33).
//
// Reavalia no foco e ao voltar do background (voltar dos Ajustes não muda o foco — D-3 da 068).
// Adiamento por `userId` (E-10: troca de conta no aparelho não herda o teto), via
// `nativeStorageAdapter` (H3.1).

import { useState, useEffect, useCallback, useRef } from 'react'
import { AppState, Platform } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { getPushPermissionStatus, getPushChannelState } from './pushPermission'
import { nativeStorageAdapter } from '@platform/storage/nativeStorageAdapter'
import { ANDROID_PUSH_CHANNEL } from '@dosiq/core'

export type ReachReason = 'undetermined' | 'denied' | 'channel_blocked'

export const PUSH_REACH_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000
export const PUSH_REACH_SNOOZE_MAX = 3
export const pushReachSnoozeKey = (userId: string) => `dosiq:push-reach-snooze:${userId}`

type EffectivePerm = { status?: string | null; granted?: boolean } | null
export type ChannelState = 'ok' | 'blocked' | 'silenced' | 'unknown'

/** Pura. `null` perm = leitura falhou ⇒ não acusa (sem card). */
export function evaluateReachability(
  os: string,
  perm: EffectivePerm,
  channel: ChannelState
): { usable: boolean; reason: ReachReason | null } {
  if (!perm) return { usable: true, reason: null }
  if (perm.granted) {
    // 'silenced'/'unknown' não afirmam bloqueio (chega sem som / não dá para saber).
    return channel === 'blocked' ? { usable: false, reason: 'channel_blocked' } : { usable: true, reason: null }
  }
  if (os === 'android') return { usable: false, reason: 'undetermined' }
  return { usable: false, reason: perm.status === 'undetermined' ? 'undetermined' : 'denied' }
}

/**
 * Canais que o push precisa (120 C, smoke U-1): o comum sempre; o CRÍTICO (`dosiq-critical-v1`) só
 * quando há tratamento com alarme crítico — desligado, a dose essencial some calada. Devolve o estado
 * consolidado e QUAL canal está bloqueado (o toque abre direto nele).
 */
export async function readPushChannels(critical: boolean): Promise<{ channel: ChannelState; blockedChannel: string | null }> {
  const channel: ChannelState = await getPushChannelState(ANDROID_PUSH_CHANNEL.DEFAULT)
  if (channel === 'blocked') return { channel, blockedChannel: ANDROID_PUSH_CHANNEL.DEFAULT }
  if (critical && (await getPushChannelState(ANDROID_PUSH_CHANNEL.CRITICAL)) === 'blocked') {
    return { channel: 'blocked', blockedChannel: ANDROID_PUSH_CHANNEL.CRITICAL }
  }
  return { channel, blockedChannel: null }
}

export type SnoozeRecord = { count: number; until: number }

/** Pura. Registro inválido ⇒ sem adiamento. */
export function parseSnooze(raw: string | null): SnoozeRecord {
  try {
    const v = raw ? JSON.parse(raw) : null
    const count = Number.isInteger(v?.count) && v.count > 0 ? v.count : 0
    const until = typeof v?.until === 'number' ? v.until : 0
    return { count, until }
  } catch {
    return { count: 0, until: 0 }
  }
}

/** Pura. Oculto se já adiado 3× (para sempre) ou dentro dos 7 dias. */
export function isSnoozed(rec: SnoozeRecord, nowMs: number): boolean {
  return rec.count >= PUSH_REACH_SNOOZE_MAX || rec.until > nowMs
}

export function nextSnooze(rec: SnoozeRecord, nowMs: number): SnoozeRecord {
  return { count: rec.count + 1, until: nowMs + PUSH_REACH_SNOOZE_MS }
}

export interface PushReachability {
  /** `null` = ainda lendo. */
  usable: boolean | null
  reason: ReachReason | null
  /** Permissão efetiva concedida (independe do canal). `null` = ainda lendo. */
  granted: boolean | null
  /** Canal do push no Android ('ok' no iOS). Configurações mostra 'silenced'. */
  channel: ChannelState
  /** Canal bloqueado que o toque deve abrir (`null` = nenhum ou não é canal). */
  blockedChannel: string | null
  /** Card adiado agora (7 dias ou teto). `null` = storage não lido. */
  snoozed: boolean | null
  /** Quantas vezes foi adiado (D-5: no 3º o botão vira "Não mostrar de novo"). */
  snoozeCount: number
  refresh: () => Promise<{ usable: boolean; reason: ReachReason | null }>
  snooze: () => void
}

export function usePushReachability({ userId, critical = false }: { userId: string | null; critical?: boolean }): PushReachability {
  // 1. States
  const [state, setState] = useState<{ usable: boolean | null; reason: ReachReason | null; granted: boolean | null; channel: ChannelState; blockedChannel: string | null }>({
    usable: null,
    reason: null,
    granted: null,
    channel: 'ok',
    blockedChannel: null,
  })
  // `hidden` calculado no callback (Date.now fora do render — React Compiler).
  const [snoozeRec, setSnoozeRec] = useState<{ rec: SnoozeRecord; hidden: boolean } | null>(null)
  const mounted = useRef(true)
  // Foco + AppState disparam quase juntos ao voltar dos Ajustes: só a leitura mais nova aplica (AP-365).
  const gen = useRef(0)
  // Smoke 120: adiamento vale para AQUELE bloqueio. Push voltou a chegar ⇒ apaga; bloqueio novo depois
  // mostra o card de novo (o "Agora não" antigo não cala um problema novo). Refs porque a leitura do
  // status e a do storage correm em paralelo no foco — quem chegar por último decide.
  const usableRef = useRef<boolean | null>(null)
  // Ref: `refresh` fica estável (foco/AppState) e lê o valor mais novo de "tem tratamento crítico".
  const criticalRef = useRef(critical)
  const snoozeRef = useRef<SnoozeRecord | null>(null)

  const clearSnoozeIfUsable = useCallback(() => {
    const rec = snoozeRef.current
    if (!userId || usableRef.current !== true || !rec || (rec.count === 0 && rec.until === 0)) return
    snoozeRef.current = { count: 0, until: 0 }
    if (mounted.current) setSnoozeRec({ rec: { count: 0, until: 0 }, hidden: false })
    void nativeStorageAdapter.removeItem(pushReachSnoozeKey(userId)).catch(() => {})
  }, [userId])

  // 2. Handlers usados pelos effects
  const refresh = useCallback(async () => {
    const mine = ++gen.current
    let perm: EffectivePerm = null
    try {
      perm = await getPushPermissionStatus()
    } catch {
      perm = null
    }
    const { channel, blockedChannel } = perm?.granted ? await readPushChannels(criticalRef.current) : { channel: 'ok' as ChannelState, blockedChannel: null }
    const next = evaluateReachability(Platform.OS, perm, channel)
    if (mounted.current && mine === gen.current) {
      setState({ ...next, granted: perm ? !!perm.granted : null, channel, blockedChannel })
      // Leitura falhou (perm null) dá usable:true sem afirmar nada — não apaga adiamento por ela.
      usableRef.current = perm ? next.usable : null
      clearSnoozeIfUsable()
    }
    return next
  }, [clearSnoozeIfUsable])

  const readSnooze = useCallback(() => {
    if (!userId) {
      setSnoozeRec(null)
      return
    }
    nativeStorageAdapter
      .getItem(pushReachSnoozeKey(userId))
      .then((raw) => {
        if (!mounted.current) return
        const rec = parseSnooze(raw)
        snoozeRef.current = rec
        setSnoozeRec({ rec, hidden: isSnoozed(rec, Date.now()) })
        clearSnoozeIfUsable()
      })
      .catch(() => {
        // fail-safe: na dúvida, não mostra o card (padrão 068)
        if (mounted.current) setSnoozeRec({ rec: { count: PUSH_REACH_SNOOZE_MAX, until: 0 }, hidden: true })
      })
  }, [userId, clearSnoozeIfUsable])

  // 3. Effects
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      readSnooze()
      void refresh()
    }, [readSnooze, refresh])
  )

  // Tratamentos chegam depois do 1º foco: virou crítico ⇒ relê os canais (senão só no próximo foco).
  useEffect(() => {
    criticalRef.current = critical
    if (critical) void refresh()
  }, [critical, refresh])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh()
    })
    return () => sub?.remove?.()
  }, [refresh])

  // 4. Handlers
  const snooze = useCallback(() => {
    if (!userId) return
    const next = nextSnooze(snoozeRec?.rec ?? { count: 0, until: 0 }, Date.now())
    snoozeRef.current = next
    setSnoozeRec({ rec: next, hidden: true })
    void nativeStorageAdapter.setItem(pushReachSnoozeKey(userId), JSON.stringify(next)).catch(() => {})
  }, [userId, snoozeRec])

  return {
    usable: state.usable,
    reason: state.reason,
    granted: state.granted,
    channel: state.channel,
    blockedChannel: state.blockedChannel,
    snoozed: snoozeRec ? snoozeRec.hidden : null,
    snoozeCount: snoozeRec?.rec.count ?? 0,
    refresh,
    snooze,
  }
}
