import { useCallback, useEffect, useRef, useState } from 'react'
import { nativeStorageAdapter } from '@platform/storage/nativeStorageAdapter'

/**
 * Dispensa dos alertas OPERACIONAIS da Hoje (spec 120 C · RC2-C DC-2 · C1.5 D-B, PO 14/11).
 *
 * A chave é a do candidato do árbitro (`<degrau>:<medicineId>`): o degrau faz parte dela, então
 * quando o nível SOBE (baixo → acabando → sem estoque) a chave muda e o alerta volta sozinho.
 * Fora isso, volta em 7 dias. Enquanto dispensado, o árbitro o devolve em `suppressed` e a aba
 * Estoque mostra o sinal (D-6). Por usuário e por aparelho (como o adiamento do push, 120 A FR-003).
 */
export const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const alertDismissKey = (userId: string) => `dosiq:today-alert-dismiss:${userId}`

export type DismissMap = Record<string, number>

export function parseDismissMap(raw: string | null): DismissMap {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: DismissMap = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

export function isDismissed(map: DismissMap, key: string, nowMs: number): boolean {
  const at = map[key]
  return typeof at === 'number' && nowMs - at >= 0 && nowMs - at < DISMISS_TTL_MS
}

/** Remove os vencidos (o mapa não cresce sem limite). */
export function pruneDismissMap(map: DismissMap, nowMs: number): DismissMap {
  const out: DismissMap = {}
  for (const [k, at] of Object.entries(map)) if (isDismissed(map, k, nowMs)) out[k] = at
  return out
}

const EMPTY: DismissMap = {}

export function useTodayAlertDismissals(userId: string | null | undefined) {
  // Estado chaveado pelo usuário: trocar de conta descarta o mapa anterior sem setState no effect.
  const [state, setState] = useState<{ userId: string | null; map: DismissMap }>({ userId: null, map: {} })
  const mapRef = useRef<{ userId: string | null; map: DismissMap }>({ userId: null, map: {} })
  const map = state.userId === (userId ?? null) ? state.map : EMPTY

  useEffect(() => {
    let alive = true
    if (!userId) return () => { alive = false }
    nativeStorageAdapter
      .getItem(alertDismissKey(userId))
      .then((raw) => {
        if (!alive) return
        const next = { userId, map: pruneDismissMap(parseDismissMap(raw), Date.now()) }
        mapRef.current = next
        setState(next)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [userId])

  const dismiss = useCallback((key: string) => {
    if (!userId || !key) return
    const base = mapRef.current.userId === userId ? mapRef.current.map : {}
    const next = { userId, map: { ...pruneDismissMap(base, Date.now()), [key]: Date.now() } }
    mapRef.current = next
    setState(next)
    // Fail-silent: perder a dispensa só faz o aviso voltar (lado audível).
    void nativeStorageAdapter.setItem(alertDismissKey(userId), JSON.stringify(next.map)).catch(() => {})
  }, [userId])

  const isKeyDismissed = useCallback((key: string) => isDismissed(map, key, Date.now()), [map])

  return { isDismissed: isKeyDismissed, dismiss }
}
