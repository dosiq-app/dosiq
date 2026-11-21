// useTodaySetup — superfície SETUP da Hoje (spec 125 fatia 2 · AC6.1–AC6.7 · FR-017..FR-019, FR-024).
//
// Monta as entradas da fila e delega a escolha ao core (`pickSetupCard`, INV-6): a Hoje só mostra.
// - "1º uso": `created_at` ≤ 14 d e nenhum registro do tratamento nos 14 d que a Hoje já carrega.
// - Confira: `classifyCoherence` sobre as forças do REGISTRO no sidecar 127 (`useCmedStrengths`), que só
//   carrega quando há injetável com registro (RC3 E-4). O slot espera o veredito, teto 2 s (AC6.4e):
//   nunca mostra "Tratamento cadastrado" e troca por "Confira" em seguida.
// - Confirmações ficam NO APARELHO (sem coluna, Q3 b), via `nativeStorageAdapter`:
//     dosiq:setup-confirmed:<coherenceKey>   ("Aplico X mesmo" — vale para a combinação, AC6.4a)
//     dosiq:setup-schedule:<id>:<agenda>     ("Sim" do dia/hora — agenda mudou ⇒ pergunta de novo)
// - Snapshot offline (stale): sem card (falha fechada — o cache não prova "sem dose registrada").

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { classifyCoherence, coherenceKey, pickSetupCard, strengthEntriesFor, SETUP_WINDOW_DAYS, getTodayLocal } from '@dosiq/core'
import type { CoherenceVerdict, SetupCardPick, StrengthEntry } from '@dosiq/core'
import { nativeStorageAdapter } from '@platform/storage/nativeStorageAdapter'
import { useCmedStrengths } from '@shared/hooks/useCmedStrengths'
import { getRecentMedicines } from '@dashboard/services/dashboardService'

/** AC6.4e: espera máxima pelo sidecar antes de escolher o card. */
export const SETUP_VERDICT_TIMEOUT_MS = 2000

const CONFIRMED_PREFIX = 'dosiq:setup-confirmed:'
const SCHEDULE_PREFIX = 'dosiq:setup-schedule:'

export function scheduleKey(p: any): string {
  const days = Array.isArray(p?.weekdays) ? [...p.weekdays].sort().join(',') : ''
  const times = Array.isArray(p?.time_schedule) ? [...p.time_schedule].sort().join(',') : ''
  return `${SCHEDULE_PREFIX}${p?.id}:${p?.frequency ?? ''}|${p?.interval_days ?? ''}|${days}|${times}|${p?.start_date ?? ''}`
}

function uniqueById(list: any[]): any[] {
  const seen = new Set<string>()
  return list.filter((p) => p?.id && !seen.has(p.id) && seen.add(p.id))
}

function needsStrengths(protocols: any[]): boolean {
  return protocols.some((p) => p?.medicine?.presentation === 'injetavel' && !!p?.medicine?.anvisa_registration)
}

export interface TodaySetupState {
  /** null enquanto o veredito, as confirmações ou os remédios recentes não chegaram (AC6.4e). */
  card: SetupCardPick | null
  protocol: any | null
  medicine: any | null
  /** AC6.2: o dia/hora deste tratamento já foi confirmado neste aparelho. */
  scheduleConfirmed: boolean
  /** Forças do registro do remédio do card (sidecar); [] quando indisponível. */
  entries: StrengthEntry[]
  confirmCoherence: () => Promise<void>
  /** `next` = tratamento com a agenda nova (após "Mudar" salvo), para não perguntar de novo. */
  confirmSchedule: (next?: any) => Promise<void>
}

/** Ids estáveis para deps de memo (a lista nasce nova a cada render). */
const EMPTY: string[] = []

export function useTodaySetup({ data, stale, onScreenProtocolIds = EMPTY }: {
  data: any
  stale: boolean
  /**
   * Tratamentos que a Hoje já mostra (widget + agenda de hoje): não ganham "Tratamento cadastrado"
   * (PO smoke 20/11 — o setup do widget vive no miolo da L1). O Confira continua valendo para eles.
   */
  onScreenProtocolIds?: string[]
}): TodaySetupState {
  // States
  const [stored, setStored] = useState<Record<string, boolean> | null>(null)
  const [recent, setRecent] = useState<any[] | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  // RC6 #971: confirmações desta sessão — a releitura do storage não pode desfazer um toque já dado.
  const touched = useRef(new Set<string>())

  // Memos
  const protocols = useMemo(
    () => uniqueById([...(data?.protocols ?? []), ...(data?.scheduledProtocols ?? [])]),
    [data?.protocols, data?.scheduledProtocols],
  )
  const wantsStrengths = useMemo(() => needsStrengths(protocols), [protocols])
  const strengths = useCmedStrengths({ enabled: wantsStrengths && !stale })
  const keys = useMemo(
    () => protocols.flatMap((p) => [CONFIRMED_PREFIX + coherenceKey(p, p.medicine ?? {}), scheduleKey(p)]),
    [protocols],
  )
  const keysSignature = keys.join('\n')
  const verdictSettled = !wantsStrengths || strengths.status === 'ready' || strengths.status === 'unavailable' || timedOut

  const verdicts = useMemo(() => {
    const out: Record<string, CoherenceVerdict> = {}
    if (!stored) return out
    const ready = strengths.status === 'ready' && strengths.strengths && strengths.byRegistration
    for (const p of protocols) {
      const med = p.medicine
      if (!med || stored[CONFIRMED_PREFIX + coherenceKey(p, med)]) continue
      const entries = ready ? strengthEntriesFor(strengths.strengths!, strengths.byRegistration!, med.anvisa_registration) : null
      out[p.id] = classifyCoherence(p, med, entries)
    }
    return out
  }, [protocols, stored, strengths])

  const onScreenKey = onScreenProtocolIds.join(',')
  const card = useMemo(() => {
    if (!data || stale || !stored || recent === null || !verdictSettled) return null
    const withTreatment = new Set(protocols.map((p) => p.medicine_id))
    const onScreen = new Set(onScreenKey ? onScreenKey.split(',') : [])
    const input = {
      protocols,
      loggedProtocolIds: (data.logs ?? []).map((l: any) => l?.protocol_id).filter(Boolean),
      verdicts,
      // Sem NENHUM tratamento (pausado conta — smoke 20/11). Campo ausente (resposta antiga) ⇒ não entra.
      orphanMedicines: recent.filter((m) => !withTreatment.has(m.id) && Array.isArray(m.protocols) && m.protocols.length === 0),
      today: data.localDay ?? getTodayLocal(),
    }
    const pick = pickSetupCard(input)
    if (pick?.kind !== 'cadastrado' || !onScreen.has(pick.protocolId)) return pick
    // Confira já foi descartado acima (pick seria ele) ⇒ refazer sem os da tela só muda o "cadastrado".
    return pickSetupCard({ ...input, protocols: protocols.filter((p) => !onScreen.has(p.id)) })
  }, [data, stale, stored, recent, verdictSettled, protocols, verdicts, onScreenKey])

  const protocol = useMemo(
    () => (card && card.kind !== 'falta' ? protocols.find((p) => p.id === card.protocolId) ?? null : null),
    [card, protocols],
  )
  const medicine = useMemo(
    // O mapa de remédios da Hoje (`getMedicinesData`) NÃO traz `id` — vem de `medicine_id` do tratamento
    // (smoke 20/11: "Escolher a caixa" gravava em `undefined`, 22P02).
    () => (card?.kind === 'falta'
      ? (recent ?? []).find((m) => m.id === card.medicineId) ?? null
      : protocol?.medicine ? { ...protocol.medicine, id: protocol.medicine_id } : null),
    [card, recent, protocol],
  )
  const entries = useMemo(() => {
    if (!medicine?.anvisa_registration || strengths.status !== 'ready' || !strengths.strengths || !strengths.byRegistration) return []
    return strengthEntriesFor(strengths.strengths, strengths.byRegistration, medicine.anvisa_registration)
  }, [medicine, strengths])

  // Effects
  useEffect(() => {
    let cancelled = false
    const list = keysSignature ? keysSignature.split('\n') : []
    Promise.all(list.map((k) => nativeStorageAdapter.getItem(k).catch(() => null)))
      .then((values) => {
        if (cancelled) return
        setStored(Object.fromEntries(list.map((k, i) => [k, values[i] === '1' || touched.current.has(k)])))
      })
    return () => {
      cancelled = true
    }
  }, [keysSignature])

  const userId = data?.user?.id ?? null
  const capturedAt = data?.capturedAt ?? null
  useEffect(() => {
    let cancelled = false
    // Offline/sem sessão: o card já é null (stale) — não consulta.
    if (!userId || stale) return
    // Best-effort: falhar aqui só tira o "Falta 1 passo" (nunca a agenda).
    getRecentMedicines(userId, SETUP_WINDOW_DAYS)
      .catch(() => [])
      .then((rows) => {
        if (!cancelled) setRecent(Array.isArray(rows) ? rows : [])
      })
    return () => {
      cancelled = true
    }
  }, [userId, capturedAt, stale])

  useEffect(() => {
    if (!wantsStrengths || verdictSettled) return
    const id = setTimeout(() => setTimedOut(true), SETUP_VERDICT_TIMEOUT_MS)
    return () => clearTimeout(id)
  }, [wantsStrengths, verdictSettled])

  // Handlers

  const remember = useCallback(async (key: string) => {
    touched.current.add(key)
    setStored((prev) => ({ ...(prev ?? {}), [key]: true }))
    try {
      await nativeStorageAdapter.setItem(key, '1')
    } catch {
      // Só nesta sessão: a pergunta volta na próxima abertura (nada se perde no banco).
    }
  }, [])

  const confirmCoherence = useCallback(
    () => (protocol ? remember(CONFIRMED_PREFIX + coherenceKey(protocol, protocol.medicine ?? {})) : Promise.resolve()),
    [protocol, remember],
  )
  const confirmSchedule = useCallback(
    (next?: any) => (protocol ? remember(scheduleKey({ ...protocol, ...(next ?? {}) })) : Promise.resolve()),
    [protocol, remember],
  )


  return {
    card,
    protocol,
    medicine,
    scheduleConfirmed: !!(protocol && stored?.[scheduleKey(protocol)]),
    entries,
    confirmCoherence,
    confirmSchedule,
  }
}

export default useTodaySetup
