// useTodayWeekRows — aberto/fechado de cada linha do módulo "Semana do tratamento" (spec 121 FR-006).
// Persistido por usuário (`todayWeekRows:{uid}`, mesmo formato de chave do `stepsStorageKey` da 069 —
// RC3 E-7). Sem valor salvo vale o padrão do perfil: wedge = Peso aberta; misto = tudo fechado.
// Leitura que falha ou JSON corrompido ⇒ padrão do perfil (nunca trava a Hoje).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { WedgeProfile } from '@dosiq/core'
import { logEvent } from '@platform/analytics/productAnalytics'
import { EVENTS, SURFACES } from '@platform/analytics/analyticsEvents'

export type WeekRow = 'dose' | 'peso' | 'evolucao'
export type WeekRowsState = Record<WeekRow, boolean>

export const todayWeekRowsKey = (userId: string) => `todayWeekRows:${userId}`

export function defaultWeekRows(profile: WedgeProfile): WeekRowsState {
  return { dose: false, peso: profile === 'wedge', evolucao: false }
}

function parseSaved(raw: string | null): Partial<WeekRowsState> | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const out: Partial<WeekRowsState> = {}
    for (const row of ['dose', 'peso', 'evolucao'] as const) {
      if (typeof parsed[row] === 'boolean') out[row] = parsed[row]
    }
    return out
  } catch {
    return null
  }
}

export function useTodayWeekRows(userId: string | null | undefined, profile: WedgeProfile) {
  // States — só o que o usuário escolheu; o resto vem do padrão do perfil.
  // Escolha salva carimbada com o dono: troca de conta nunca herda a escolha de outro usuário.
  const [savedFor, setSavedFor] = useState<{ uid: string | null; value: Partial<WeekRowsState> | null }>({ uid: null, value: null })
  const saved = savedFor.uid === (userId ?? null) ? savedFor.value : null
  // Toque antes da leitura do storage terminar ganha da leitura (senão a escolha volta atrás).
  const touchedRef = useRef(false)
  // Memos
  const rows = useMemo<WeekRowsState>(() => ({ ...defaultWeekRows(profile), ...(saved ?? {}) }), [profile, saved])

  // Effects — troca de usuário recarrega (estado não vaza entre contas no aparelho).
  useEffect(() => {
    let alive = true
    touchedRef.current = false
    if (!userId) return () => { alive = false }
    AsyncStorage.getItem(todayWeekRowsKey(userId))
      .then((raw) => { if (alive && !touchedRef.current) setSavedFor({ uid: userId, value: parseSaved(raw) }) })
      .catch(() => {})
    return () => { alive = false }
  }, [userId])

  // Handlers
  const toggle = useCallback(
    (row: WeekRow) => {
      const next = { ...rows, [row]: !rows[row] }
      touchedRef.current = true
      setSavedFor({ uid: userId ?? null, value: next })
      if (userId) AsyncStorage.setItem(todayWeekRowsKey(userId), JSON.stringify(next)).catch(() => {})
      void logEvent(EVENTS.TODAY_WEEK_ROW_TOGGLED, { row, open: next[row], surface: SURFACES.MOBILE })
    },
    [userId, rows]
  )

  return { rows, toggle }
}
