import { useCallback, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { fetchIntervalCadenceAvailability, getRawNow } from '@dosiq/core'
import { Platform } from 'react-native'
import * as Application from 'expo-application'
import { supabase } from '@platform/supabase/nativeSupabaseClient'

// 125: este aparelho é, por definição, recente e na versão instalada (mesma fonte do heartbeat,
// syncDeviceActivity). Instante real (não getNow): compara com timestamps do banco.
function selfInstallRow() {
  const seen = getRawNow().toISOString()
  return [{ platform: Platform.OS, app_version: Application.nativeApplicationVersion ?? null, last_seen_at: seen }]
}

/** Teto de espera pela trava antes de desenhar as opções sem ela (086 FR-022 / RC2 D-8). */
export const CADENCE_GATE_TIMEOUT_MS = 1500

export interface IntervalCadenceAvailability {
  /** A cadência "a cada N dias" (e "Mensal") pode ser oferecida a esta usuária. */
  available: boolean
  /** Já há resposta — ou o teto passou. Antes disso quem desenha opções mostra esqueleto. */
  settled: boolean
}

/**
 * A cadência "a cada N dias" pode ser oferecida a esta usuária? (085 C2 — trava por usuária)
 *
 * Mesmo neste app atualizado a resposta pode ser `false`: basta outro aparelho DELA com versão
 * antiga — é ele que trataria a cadência como diária. Começa `false`; erro também é `false`.
 *
 * 086 (RC3 E-3): tri-estado. `settled` vira `true` com a resposta ou após o teto de 1,5 s (lado
 * seguro: segue sem a opção). A trava é reconsultada a cada foco (o heartbeat do aparelho pode ter
 * gravado entretanto — U-1). Resposta tardia (depois do teto) é aplicada na hora: no formulário as
 * opções só aparecem ao abrir o seletor, não há salto (smoke 086).
 *
 * 125 (smoke 18/11): o onboarding NÃO usa mais esta trava — conta nova sempre vê Mensal (o único
 * aparelho dela é este, já atualizado). Saiu junto o `holdLateAnswer`, que só o onboarding usava.
 */
export function useIntervalCadenceAvailability(): IntervalCadenceAvailability {
  const [state, setState] = useState<IntervalCadenceAvailability>({ available: false, settled: false })

  useFocusEffect(
    useCallback(() => {
      let cancelled = false

      const timer = setTimeout(() => {
        if (!cancelled) setState((prev) => (prev.settled ? prev : { available: false, settled: true }))
      }, CADENCE_GATE_TIMEOUT_MS)

      supabase.auth
        .getUser()
        // `as never`: o mobile resolve uma cópia própria do supabase-js — mesmo padrão de
        // createConsentService (platform/consent/useConsentGate.tsx).
        .then(({ data }) => fetchIntervalCadenceAvailability(supabase as never, data?.user?.id ?? null, undefined, selfInstallRow()))
        .catch(() => false)
        .then((ok) => {
          if (cancelled) return
          clearTimeout(timer)
          setState({ available: ok, settled: true })
        })

      return () => {
        cancelled = true
        clearTimeout(timer)
      }
    }, [])
  )

  return state
}
