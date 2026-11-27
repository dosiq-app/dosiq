// useTreatmentWeekDose.ts — dados da L1 Dose e da L3 Evolução da "Semana do tratamento" (spec 121 B).
//
// Três leituras independentes, depois do 1º paint (InteractionManager, como a L2):
//  1. últimas aplicações do tratamento — 4 no semanal; 20 no diário (121 C: cobre a semana com até
//     2 registros/dia, teto do core; é LEITURA para a contagem, nada disso vira lista na tela) (core `listRecentApplications`) — ERRO é estado próprio,
//     nunca "1ª dose" (falso vazio);
//  2. escada COMPLETA por `titration_id` (`getLadderForProtocol`) — o embed da Hoje é recorte por
//     `protocol_id` e daria "Estável" falso (AP-311, G-B1). Best-effort: falha ⇒ sem L3/sem contagem;
//  3. diário (121 C, RC6/R-299): ocorrências GRAVADAS dos últimos 7 d — as doses previstas do passado
//     saem delas, não do tratamento vivo. Best-effort: falha ⇒ null ⇒ calendário atual;
//  4. ocorrências do tratamento nos próximos dias (âncora do "Já apliquei", ADR-130). Best-effort:
//     falha ⇒ sem botão (nunca registro sem ocorrência).
// Recarrega com `reloadKey` (capturedAt da Hoje): registrar por qualquer via atualiza a linha.
// 124 A (smoke 23/11): stale-while-revalidate — L1 e L3 nascem com o último resultado guardado
// (`weekCache`, memória + aparelho) e a leitura atualiza por baixo. Sem cache: `loading` (1ª carga).
// Falha com cache: mantém o dado guardado (o erro só aparece para quem nunca carregou).

import { useCallback, useEffect, useState } from 'react'
import { InteractionManager } from 'react-native'
import { createDoseInstanceRepository, getRawNow, parseTimestamp } from '@dosiq/core'
import { anchorLookaheadDays } from '@dashboard/utils/earlyRegister'
import { supabase } from '@platform/supabase/nativeSupabaseClient'
import { listRecentApplications } from '@dose/services/doseService'
import { getLadderForProtocol } from '@treatments/services/titrationService'
import { isNetworkError } from '@shared/utils/networkError'
import { hydrateWeekCache, readWeekCache, weekCacheKey, writeWeekCache } from '@dashboard/utils/weekCache'

const RECENT_LIMIT = 4
/** 121 C (PO-20): diário lê a semana na MESMA chamada — 7 d × 2 registros, teto do core (20). */
export const DAILY_RECENT_LIMIT = 20

export function recentLimitFor(kind: 'daily' | 'weekly' | null | undefined): number {
  return kind === 'daily' ? DAILY_RECENT_LIMIT : RECENT_LIMIT
}

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
  /** Leitura bateu no limite: a semana pode estar cortada no começo (C-A3). */
  truncated: boolean
  ladder: any[] | null
  upcoming: any[]
  /** Diário: ocorrências gravadas da janela passada; null = não lidas (fallback no calendário). */
  pastInstances: any[] | null
}

const EMPTY: WeekDoseState = { loading: true, error: null, recent: [], truncated: false, ladder: null, upcoming: [], pastInstances: null }

/** Janela passada do diário: 7 d inteiros para trás (o core recorta pelo dia local). */
const PAST_WINDOW_MS = 8 * 86_400_000

async function loadPastInstances(userId: string, protocolId: string): Promise<any[] | null> {
  try {
    const repo = createDoseInstanceRepository({ client: supabase })
    const now = getRawNow()
    // Smoke 124 A: até +24 h — as ocorrências de HOJE (inclusive as que ainda vêm) dizem se há dose hoje.
    const rows = await repo.getWindow(userId, parseTimestamp(now.getTime() - PAST_WINDOW_MS), parseTimestamp(now.getTime() + 86_400_000))
    return (rows ?? []).filter((r: any) => r?.protocol_id === protocolId)
  } catch {
    return null
  }
}

async function loadUpcoming(userId: string, protocolId: string, lookaheadDays: number): Promise<any[]> {
  try {
    const repo = createDoseInstanceRepository({ client: supabase })
    // RC6: instante real — `getNow` desloca para o relógio de parede do fuso.
    const now = getRawNow()
    const to = parseTimestamp(now.getTime() + lookaheadDays * 86_400_000)
    // Smoke 124 A: desde −24 h — a ocorrência de HOJE que já passou do horário mas segue na janela
    // (hero "Ainda dá tempo") diz se hoje ainda vale. A âncora ignora passado (resolveEarlyAnchorInstance).
    const rows = await repo.getWindow(userId, parseTimestamp(now.getTime() - 86_400_000), to)
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
  cadenceDays = null,
  cadenceKind = 'weekly',
  userId,
  protocolId,
  medicineId,
  reloadKey,
}: {
  enabled: boolean
  /** L1 elegível (G-B5). Sem L1, só a escada é lida — aplicações e janela não servem a ninguém. */
  doseEnabled?: boolean
  /** Cadência da L1 — dimensiona a janela de instâncias futuras. */
  cadenceDays?: number | null
  /** 121 C: diário amplia a leitura e dispensa a janela de âncora ("Já apliquei" é só semanal). */
  cadenceKind?: 'daily' | 'weekly'
  userId: string | null
  protocolId: string | null
  medicineId: string | null
  reloadKey?: unknown
}) {
  // States
  // Estado CARIMBADO com o tratamento (RC5): troca de tratamento nunca mostra/ancora no anterior.
  const [stamped, setStamped] = useState<{ key: string | null; value: WeekDoseState }>({ key: null, value: EMPTY })
  const key = protocolId ? `${protocolId}:${medicineId ?? ''}` : null
  const cacheKey = enabled && userId && key ? weekCacheKey(userId, 'dose', key, cadenceKind, doseEnabled ? '1' : '0') : null
  const [hydrated, setHydrated] = useState<{ key: string | null; value: WeekDoseState | null }>({ key: null, value: null })
  const cached = readWeekCache<WeekDoseState>(cacheKey) ?? (hydrated.key === cacheKey ? hydrated.value : null)
  const state = stamped.key === key ? stamped.value : (cached ?? EMPTY)
  const [tick, setTick] = useState(0)

  // Effects
  // Cold start: lê o último resultado do aparelho enquanto a rede não volta.
  useEffect(() => {
    if (!cacheKey || readWeekCache(cacheKey)) return undefined
    let alive = true
    hydrateWeekCache<WeekDoseState>(cacheKey).then((value) => { if (alive && value) setHydrated({ key: cacheKey, value }) })
    return () => { alive = false }
  }, [cacheKey])

  useEffect(() => {
    if (!enabled || !userId || !protocolId) return undefined
    let alive = true
    // Recarga mantém o dado anterior na tela (sem piscar); `loading` só é verdadeiro na 1ª carga.
    const limit = recentLimitFor(cadenceKind)
    const daily = cadenceKind === 'daily'
    const task = InteractionManager.runAfterInteractions(async () => {
      const [recentRes, ladder, upcoming, pastInstances] = await Promise.all([
        doseEnabled
          ? listRecentApplications({ protocolId, medicineId, limit }).then(
            (rows) => ({ rows: rows as RecentApplicationRow[], error: null as WeekDoseState['error'] }),
            (err) => ({ rows: [] as RecentApplicationRow[], error: (isNetworkError(err) ? 'network' : 'other') as WeekDoseState['error'] })
          )
          : Promise.resolve({ rows: [] as RecentApplicationRow[], error: null as WeekDoseState['error'] }),
        loadLadder(protocolId),
        doseEnabled && !daily ? loadUpcoming(userId, protocolId, anchorLookaheadDays(cadenceDays)) : Promise.resolve([]),
        doseEnabled && daily ? loadPastInstances(userId, protocolId) : Promise.resolve(null),
      ])
      if (!alive) return
      const stampKey = `${protocolId}:${medicineId ?? ''}`
      const storeKey = weekCacheKey(userId, 'dose', stampKey, cadenceKind, doseEnabled ? '1' : '0')
      // RC6 #976: cold start offline — erro rápido pode chegar antes da hidratação; consulta o disco.
      const previous = readWeekCache<WeekDoseState>(storeKey) ?? (recentRes.error ? await hydrateWeekCache<WeekDoseState>(storeKey) : null)
      if (!alive) return
      if (recentRes.error && previous) {
        // Falha com dado guardado: segue mostrando o guardado (nunca troca dado por erro).
        setStamped({ key: stampKey, value: previous })
        return
      }
      const value: WeekDoseState = { loading: false, error: recentRes.error, recent: recentRes.rows, truncated: recentRes.rows.length >= limit, ladder, upcoming, pastInstances }
      // Sem `upcoming` no cache: o "Já apliquei" só ancora em ocorrência lida AGORA (ADR-130).
      if (!recentRes.error) writeWeekCache(storeKey, { ...value, upcoming: [] })
      setStamped({ key: stampKey, value })
    })
    return () => {
      alive = false
      task?.cancel?.()
    }
  }, [enabled, doseEnabled, cadenceDays, cadenceKind, userId, protocolId, medicineId, reloadKey, tick])

  // Handlers
  const retry = useCallback(() => setTick((t) => t + 1), [])

  return { ...state, retry }
}
