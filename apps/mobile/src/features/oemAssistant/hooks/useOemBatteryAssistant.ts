// useOemBatteryAssistant — visibilidade + dismiss do assistente anti-Doze (spec 068 T009/T013).
//
// Gate (FR-001 revisada + decisão do PO 2026-11-08, analysis-pr1.md §Correções 1):
//   não-Android                          → oculto
//   notificações não liberadas (≠ true)  → oculto (o pedido certo é a permissão — onboarding/082)
//   card: sem tratamento ativo na Hoje   → oculto (nada a proteger; smoke conta nova 2026-11-10)
//   backgroundRestricted === true        → VISÍVEL em qualquer fabricante (passo 1: segundo plano)
//   xiaomi/samsung + otimizado === true  → VISÍVEL (Motorola/genérico: só se restrito — 2026-11-10)
//   ↳ histórico: xiaomi/samsung/motorola + otimizado === true (Xiaomi igual aos demais desde o smoke
//     2026-11-10: "Nenhuma restrição" do HyperOS ⇔ app na exceção de bateria — OQ-6 superada)
//   resto / fato desconhecido (null)     → oculto (desconhecido nunca vira positivo)
//   qualquer exceção                     → oculto (FR-005 / INV-1)
// Hibernação e notificações NÃO entram no gate do card (INV-6); a tela as mostra na checklist.
//
// Re-sonda ao ganhar foco E ao voltar do background: voltar das Configurações do SO não muda o
// foco de navegação, então só `useFocusEffect` nunca veria o retorno (D-3).
// Dismiss é LOCAL e definitivo (AC-10), via `nativeStorageAdapter` (H3.1 — nunca AsyncStorage cru).

import { useState, useEffect, useCallback, useRef } from 'react'
import { AppState, Platform } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { probeDevice, type DeviceFacts } from '@platform/device/deviceProbe'
import { resolveOemFamily, type OemFamily } from '@platform/device/oemFamily'
import { nativeStorageAdapter } from '@platform/storage/nativeStorageAdapter'
import type { ChecklistFacts } from '@features/oemAssistant/oemChecklist'

export const OEM_ASSISTANT_DISMISS_KEY = 'dosiq:oem-battery-assistant-dismissed'

export type AssistantReason = 'restricted' | 'battery' | null

/** Avalia o gate. Pura (testável sem SO). `null` = nada a mostrar. */
export function evaluateOemAssistant(
  isAndroid: boolean,
  family: OemFamily,
  facts: Pick<DeviceFacts, 'backgroundRestricted' | 'batteryOptimized' | 'notificationsAllowed'> | null
): AssistantReason {
  if (!isAndroid || !facts) return null
  if (facts.notificationsAllowed !== true) return null
  if (facts.backgroundRestricted === true) return 'restricted'
  // Motorola sai (2026-11-10): Android quase puro, "Otimizado" basta; só restrito abre o card.
  if ((family === 'xiaomi' || family === 'samsung') && facts.batteryOptimized === true) {
    return 'battery'
  }
  return null
}

export interface OemAssistantState {
  /** Card da Hoje: há motivo E não foi dispensado. */
  visible: boolean
  /** Motivo atual, ignorando dismiss (a tela usa para sucesso/pendência). `undefined` = sondando. */
  reason: AssistantReason | undefined
  family: OemFamily
  /** Activity de energia do OEM (`null` = sem deep link — instrução escrita é o caminho). */
  powerManagerActivity: string | null
  /** Fatos da checklist da tela (`null` = ainda sondando ou leitura falhou). Hibernação e
   * notificações nunca abrem o card — só entram na checklist (INV-6). */
  facts: ChecklistFacts | null
  recheck: () => Promise<AssistantReason>
  dismiss: () => void
}

export interface OemAssistantOptions {
  /** Card só com algo a proteger: `hasRemindableTreatment` (ativo, com horário, ≠ quando_necessário). Omitido (tela) ⇒ não restringe. */
  hasTreatment?: boolean
}

export function useOemBatteryAssistant({ hasTreatment = true }: OemAssistantOptions = {}): OemAssistantState {
  // 1. States
  const [dismissed, setDismissed] = useState<boolean | null>(null) // null = storage não lido
  const [reason, setReason] = useState<AssistantReason | undefined>(undefined)
  const [activity, setActivity] = useState<string | null>(null)
  const [facts, setFacts] = useState<ChecklistFacts | null>(null)
  const [family] = useState<OemFamily>(() => {
    try {
      return resolveOemFamily()
    } catch {
      return 'generic'
    }
  })
  const mounted = useRef(true)

  const visible = dismissed === false && !!reason && hasTreatment

  // 2. Handlers usados pelos effects
  const recheck = useCallback(async (): Promise<AssistantReason> => {
    const isAndroid = Platform.OS === 'android'
    if (!isAndroid) {
      if (mounted.current) setReason(null)
      return null
    }
    try {
      const probed = await probeDevice()
      const next = evaluateOemAssistant(true, family, probed)
      if (mounted.current) {
        setReason(next)
        setActivity(probed.powerManagerActivity ?? null)
        setFacts({
          notificationsAllowed: probed.notificationsAllowed ?? null,
          backgroundRestricted: probed.backgroundRestricted ?? null,
          batteryOptimized: probed.batteryOptimized ?? null,
          hibernationEnabled: probed.hibernationEnabled ?? null,
        })
      }
      return next
    } catch {
      if (mounted.current) {
        setReason(null)
        setFacts(null)
      }
      return null
    }
  }, [family])

  // 3. Effects
  // Cada tela tem sua instância do hook: o "Já ajustei" da tela grava o dismiss, e a Hoje (que
  // não remonta ao voltar) só o enxerga relendo o storage no foco (smoke POCO 2026-11-10).
  const readDismissed = useCallback(() => {
    nativeStorageAdapter
      .getItem(OEM_ASSISTANT_DISMISS_KEY)
      .then((raw) => {
        if (mounted.current) setDismissed(raw === '1')
      })
      .catch(() => {
        if (mounted.current) setDismissed(true) // fail-safe: na dúvida, não mostra
      })
  }, [])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      readDismissed()
      void recheck()
    }, [readDismissed, recheck])
  )

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void recheck()
    })
    return () => sub?.remove?.()
  }, [recheck])

  // 4. Handlers
  const dismiss = useCallback(() => {
    setDismissed(true)
    void nativeStorageAdapter.setItem(OEM_ASSISTANT_DISMISS_KEY, '1').catch(() => {})
  }, [])

  return { visible, reason, family, powerManagerActivity: activity, facts, recheck, dismiss }
}
