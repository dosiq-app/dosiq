// useTreatmentWeekDose.ts — dados da L1 Dose e da L3 Evolução da "Semana do tratamento" (spec 121 B).
//
// Três leituras independentes, depois do 1º paint (InteractionManager, como a L2):
//  1. últimas 4 aplicações do tratamento (core `listRecentApplications`) — ERRO é estado próprio,
//     nunca "1ª dose" (falso vazio);
//  2. escada COMPLETA por `titration_id` (`getLadderForProtocol`) — o embed da Hoje é recorte por
//     `protocol_id` e daria "Estável" falso (AP-311, G-B1). Best-effort: falha ⇒ sem L3/sem contagem;
//  3. ocorrências do tratamento nos próximos dias (âncora do "Já apliquei", ADR-130). Best-effort:
//     falha ⇒ sem botão (nunca registro sem ocorrência).
// Recarrega com `reloadKey` (capturedAt da Hoje): registrar por qualquer via atualiza a linha.

import { useCallback, useEffect, useState } from 'react'
import { InteractionManager } from 'react-native'
import { createDoseInstanceRepository, getNow, parseTimestamp } from '@dosiq/core'
import { supabase } from '@platform/supabase/nativeSupabaseClient'
import { listRecentApplications } from '@dose/services/doseService'
import { getLadderForProtocol } from '@treatments/services/titrationService'
import { isNetworkError } from '@shared/utils/networkError'

const RECENT_LIMIT = 4
const ANCHOR_LOOKAHEAD_DAYS = 8

export type RecentApplicationRow = {
  id: string
  taken_at: string
  injection_site: string | null
  medicine_id: string | null
  protocol_id: string | null
}

export type WeekDoseState = {
  loading: boolean
  error: 'network' | 'other' | null
  recent: RecentApplicationRow[]
  ladder: any[] | null
  upcoming: any[]
}

const EMPTY: WeekDoseState = { loading: true, error: null, recent: [], ladder: null, upcoming: [] }

async function loadUpcoming(userId: string, protocolId: string): Promise<any[]> {
  try {
    const repo = createDoseInstanceRepository({ client: supabase as any })
    const now = getNow()
    const to = parseTimestamp(now.getTime() + ANCHOR_LOOKAHEAD_DAYS * 86_400_000)
    const rows = await repo.getWindow(userId, now, to)
    return (rows ?? []).filter((r: any) => r?.protocol_id === protocolId)
  } catch {
    return []
  }
}

async function loadLadder(protocolId: string): Promise<any[] | null> {
  try {
    const steps = await getLadderForProtocol(protocolId)
    return Array.isArray(steps) && steps.length > 0 ? steps : null
  } catch {
    return null
  }
}

export function useTreatmentWeekDose({
  enabled,
  doseEnabled = true,
  userId,
  protocolId,
  medicineId,
  reloadKey,
}: {
  enabled: boolean
  /** L1 elegível (G-B5). Sem L1, só a escada é lida — aplicações e janela não servem a ninguém. */
  doseEnabled?: boolean
  userId: string | null
  protocolId: string | null
  medicineId: string | null
  reloadKey?: unknown
}) {
  // States
  // Estado CARIMBADO com o tratamento (RC5): troca de tratamento nunca mostra/ancora no anterior.
  const [stamped, setStamped] = useState<{ key: string | null; value: WeekDoseState }>({ key: null, value: EMPTY })
  const key = protocolId ? `${protocolId}:${medicineId ?? ''}` : null
  const state = stamped.key === key ? stamped.value : EMPTY
  const [tick, setTick] = useState(0)

  // Effects
  useEffect(() => {
    if (!enabled || !userId || !protocolId) return undefined
    let alive = true
    // Recarga mantém o dado anterior na tela (sem piscar); `loading` só é verdadeiro na 1ª carga.
    const task = InteractionManager.runAfterInteractions(async () => {
      const [recentRes, ladder, upcoming] = await Promise.all([
        doseEnabled
          ? listRecentApplications({ protocolId, medicineId, limit: RECENT_LIMIT }).then(
            (rows) => ({ rows: rows as RecentApplicationRow[], error: null as WeekDoseState['error'] }),
            (err) => ({ rows: [] as RecentApplicationRow[], error: (isNetworkError(err) ? 'network' : 'other') as WeekDoseState['error'] })
          )
          : Promise.resolve({ rows: [] as RecentApplicationRow[], error: null as WeekDoseState['error'] }),
        loadLadder(protocolId),
        doseEnabled ? loadUpcoming(userId, protocolId) : Promise.resolve([]),
      ])
      if (!alive) return
      setStamped({ key: `${protocolId}:${medicineId ?? ''}`, value: { loading: false, error: recentRes.error, recent: recentRes.rows, ladder, upcoming } })
    })
    return () => {
      alive = false
      task?.cancel?.()
    }
  }, [enabled, doseEnabled, userId, protocolId, medicineId, reloadKey, tick])

  // Handlers
  const retry = useCallback(() => setTick((t) => t + 1), [])

  return { ...state, retry }
}
