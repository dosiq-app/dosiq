// useFullScreenCheck — sheet de tela cheia do alarme crítico com estado medido (spec 128 A · RC3 E-1..E-5 ·
// RC2 D-1..D-9 · C-6). Substitui o "sempre no Android 14+" (054) pela leitura real:
//   - `fullScreen`: `NotificationManager.canUseFullScreenIntent()` — no HyperOS reflete "Abrir novas janelas
//     enquanto executa em segundo plano" (matriz POCO 2026-11-26);
//   - `lockScreen` (só Xiaomi/HyperOS): "Mostrar na Tela de bloqueio" (MIUIOP 10020).
// Abre só com algo medido como faltando (`false`), ou com a tela cheia ilegível (`null` ⇒ manual — INV-3).
// Quem está no padrão (tudo ligado) não vê sheet: nada de checklist "para garantir" na aquisição (PO C-6).
// Mostra só as linhas que faltavam ao abrir; na volta dos Ajustes (AppState 'active') relê: todas liberadas
// ⇒ "Pronto" e fecha sozinho (~1,5 s); alguma ainda negada ⇒ "Ainda falta…" e o CTA fica.
// Leituras SÍNCRONAS (Functions do módulo Expo): sem sondas concorrentes a ordenar.

import { useState, useEffect, useCallback, useRef } from 'react'
import { AppState, AccessibilityInfo } from 'react-native'
import { canUseFullScreenIntent } from '@platform/device/fullScreenIntent'
import { canShowOnLockScreenMiui } from '@platform/device/miuiLockScreen'
import { resolveOemFamily, type OemFamily } from '@platform/device/oemFamily'
import { openFullScreenIntentSettings } from '@platform/alarms/alarmService'
import { logEvent } from '@platform/analytics/productAnalytics'
import { EVENTS, SURFACES } from '@platform/analytics/analyticsEvents'
import { FULL_SCREEN_COPY } from '@features/oemAssistant/oemBatteryGuides'
import type { ChecklistItemState } from '@features/oemAssistant/oemChecklist'

/** Tempo do "Pronto" na tela antes de fechar sozinho (RC2 D-1). */
export const GRANTED_CLOSE_MS = 1500

/** Resultado da releitura na volta dos Ajustes; `null` = ainda não voltou. */
export type FullScreenRecheck = 'granted' | 'still_pending' | null

export type FullScreenRowId = 'fullScreen' | 'lockScreen'
export interface FullScreenRow {
  id: FullScreenRowId
  state: ChecklistItemState
}

interface Facts {
  fullScreen: boolean | null
  lockScreen: boolean | null
}

/** Estado de uma chave a partir do fato lido: `null` ⇒ manual (nem ✓ nem ○ — RC2 D-4). */
export function fullScreenItemState(allowed: boolean | null): ChecklistItemState {
  if (allowed === null) return 'manual'
  return allowed ? 'done' : 'pending'
}

/** Linhas que FALTAM: tela cheia não-✓ (inclui ilegível, INV-3); tela de bloqueio só se medida negada. */
export function missingRows(facts: Facts): FullScreenRowId[] {
  const rows: FullScreenRowId[] = []
  if (facts.fullScreen !== true) rows.push('fullScreen')
  if (facts.lockScreen === false) rows.push('lockScreen')
  return rows
}

/** Gate puro do sheet (PO-A1/A2 · C-6): abre só com algo faltando. */
export function shouldShowFullScreenGuide(facts: Facts): boolean {
  return missingRows(facts).length > 0
}

function readFacts(): Facts {
  return { fullScreen: canUseFullScreenIntent(), lockScreen: canShowOnLockScreenMiui() }
}

function readFamily(): OemFamily {
  try {
    return resolveOemFamily()
  } catch {
    return 'generic'
  }
}

export function useFullScreenCheck() {
  // 1. States
  const [visible, setVisible] = useState(false)
  const [facts, setFacts] = useState<Facts>({ fullScreen: null, lockScreen: null })
  const [rowIds, setRowIds] = useState<FullScreenRowId[]>([])
  const [recheckResult, setRecheckResult] = useState<FullScreenRecheck>(null)
  const [family, setFamily] = useState<OemFamily>('generic')
  const awaitingReturn = useRef(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mounted = useRef(true)

  // 2. Handlers usados pelos effects
  const close = useCallback(() => {
    awaitingReturn.current = false
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = null
    setVisible(false)
  }, [])

  const recheck = useCallback(() => {
    if (!awaitingReturn.current) return
    awaitingReturn.current = false
    const next = readFacts()
    setFacts(next)
    const values = rowIds.map((id) => next[id])
    if (values.every((v) => v === true)) {
      setRecheckResult('granted')
      AccessibilityInfo.announceForAccessibility(FULL_SCREEN_COPY.granted)
      void logEvent(EVENTS.FULL_SCREEN_GRANTED_AFTER_SETTINGS, { oem_family: family, surface: SURFACES.MOBILE })
      closeTimer.current = setTimeout(() => mounted.current && setVisible(false), GRANTED_CLOSE_MS)
    } else if (values.some((v) => v === false)) {
      setRecheckResult('still_pending')
      AccessibilityInfo.announceForAccessibility(FULL_SCREEN_COPY.stillPending)
    }
    // só ilegível: segue manual, sem anunciar resultado que não foi medido.
  }, [family, rowIds])

  // 3. Effects
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (closeTimer.current) clearTimeout(closeTimer.current)
    }
  }, [])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') recheck()
    })
    return () => sub?.remove?.()
  }, [recheck])

  // 4. Handlers
  /** Chamado ao ligar o alarme crítico (Android). Lê os fatos AGORA (FR-002), sem cache. */
  const check = useCallback(async () => {
    const current = readFacts()
    const missing = missingRows(current)
    if (!mounted.current || missing.length === 0) return
    const fam = readFamily()
    setFamily(fam)
    setFacts(current)
    setRowIds(missing)
    setRecheckResult(null)
    setVisible(true)
    void logEvent(EVENTS.FULL_SCREEN_GUIDE_SHOWN, { oem_family: fam, surface: SURFACES.MOBILE })
  }, [])

  /** Abre o destino da marca (notificações do app; no Xiaomi, Informações do app › Outras permissões). */
  const openSettings = useCallback(async () => {
    awaitingReturn.current = true
    setRecheckResult(null)
    void logEvent(EVENTS.FULL_SCREEN_SETTINGS_OPENED, { oem_family: family, surface: SURFACES.MOBILE })
    await openFullScreenIntentSettings()
  }, [family])

  const rows: FullScreenRow[] = rowIds.map((id) => ({ id, state: fullScreenItemState(facts[id]) }))

  return { visible, family, rows, recheckResult, check, openSettings, dismiss: close }
}
