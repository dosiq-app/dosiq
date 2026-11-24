// useTodayWeekRows — aberto/fechado de cada linha do módulo "Semana do tratamento" (spec 121 FR-006).
// Persistido por usuário (`todayWeekRows:{uid}`, mesmo formato de chave do `stepsStorageKey` da 069 —
// RC3 E-7). Sem valor salvo vale o padrão do perfil: wedge = Peso aberta; misto = tudo fechado.
// Leitura que falha ou JSON corrompido ⇒ padrão do perfil (nunca trava a Hoje).
// 124 B (FR-016, RC3 E-14 revisto): L2 por medida — glicemia/PA ganham linha própria na MESMA chave
// (escolha de peso já salva segue valendo; nada órfão). Padrão glicemia/PA = aberta (mock C-5).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { WedgeProfile } from '@dosiq/core'
import { logEvent } from '@platform/analytics/productAnalytics'
import { EVENTS, SURFACES } from '@platform/analytics/analyticsEvents'

export type WeekRow = 'dose' | 'peso' | 'glicemia' | 'pressao_arterial' | 'evolucao'
const ROWS: readonly WeekRow[] = ['dose', 'peso', 'glicemia', 'pressao_arterial', 'evolucao']
export type WeekRowsState = Record<'dose' | 'peso' | 'evolucao', boolean>
export type BiomarkerRowKey = 'glicemia' | 'pressao_arterial'
type SavedRows = Partial<Record<WeekRow, boolean>>

export const todayWeekRowsKey = (userId: string) => `todayWeekRows:${userId}`

export function defaultWeekRows(profile: WedgeProfile): WeekRowsState {
  return { dose: false, peso: profile === 'wedge', evolucao: false }
}

function parseSaved(raw: string | null): SavedRows | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const out: SavedRows = {}
    for (const row of ROWS) {
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
  const [savedFor, setSavedFor] = useState<{ uid: string | null; value: SavedRows | null }>({ uid: null, value: null })
  const saved = savedFor.uid === (userId ?? null) ? savedFor.value : null
  // Toque antes da leitura do storage terminar ganha da leitura (senão a escolha volta atrás).
  const touchedRef = useRef(false)
  // Memos
  const rows = useMemo<WeekRowsState>(() => {
    const d = defaultWeekRows(profile)
    return { dose: saved?.dose ?? d.dose, peso: saved?.peso ?? d.peso, evolucao: saved?.evolucao ?? d.evolucao }
  }, [profile, saved])
  // 124 B: glicemia/PA abertas por padrão (mock C-5), fora de `rows` (forma da 121 intacta).
  const biomarkerOpen = useMemo<Record<BiomarkerRowKey, boolean>>(
    () => ({ glicemia: saved?.glicemia ?? true, pressao_arterial: saved?.pressao_arterial ?? true }),
    [saved]
  )

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
      const current = row === 'glicemia' || row === 'pressao_arterial' ? biomarkerOpen[row] : rows[row]
      const next: SavedRows = { ...(saved ?? {}), ...rows, ...biomarkerOpen, [row]: !current }
      touchedRef.current = true
      setSavedFor({ uid: userId ?? null, value: next })
      if (userId) AsyncStorage.setItem(todayWeekRowsKey(userId), JSON.stringify(next)).catch(() => {})
      void logEvent(EVENTS.TODAY_WEEK_ROW_TOGGLED, { row, open: next[row], surface: SURFACES.MOBILE })
    },
    [userId, rows, biomarkerOpen, saved]
  )

  return { rows, biomarkerOpen, toggle }
}
