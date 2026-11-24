// useTrackedSelection — qual tratamento o módulo da Hoje acompanha (spec 124 B · FR-012/014/019).
//
// Só com > 1 elegível (RC3 E-11): última aplicação de cada um por `Promise.all` de `limit 1`
// (lote único seria enchido por um wedge diário). Erro numa leitura ⇒ aquele tratamento entra sem
// lacuna; a Hoje nunca bloqueia. "Hoje"/"próxima" saem do calendário puro (`listUpcomingDoseDates`).
// Escolha manual: memória do processo, por usuário — "vale até fechar o app" (FR-014, sem storage).
// Evento `today_tracking_switched` (FR-019): só domínio fechado (`wedge|injetavel|outro`), nunca nome
// nem id. Troca manual ⇒ `auto_default:false`; seleção automática ⇒ 1×/sessão `auto_default:true`
// (PO 24/11: medir a regra padrão).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { listUpcomingDoseDates, type TrackedEligible, type WeeklyApplication } from '@dosiq/core'
import { listRecentApplications } from '@dose/services/doseService'
import { logEvent } from '@platform/analytics/productAnalytics'
import { EVENTS, SURFACES } from '@platform/analytics/analyticsEvents'
import {
  pickTrackedDefault,
  trackedKind,
  trackedStatus,
  type TrackedCandidate,
} from '@dashboard/utils/trackedSelection'

type Latest = WeeklyApplication | null | undefined

// Sessão do processo (não sobrevive a fechar o app). Chave = usuário: troca de conta não herda.
const session: { choice: Record<string, string>; autoLogged: Record<string, boolean> } = { choice: {}, autoLogged: {} }

/** Só para testes. */
export function __resetTrackedSession() {
  session.choice = {}
  session.autoLogged = {}
}

export function useTrackedSelection({ userId, eligible, protocols, fallbackId, todayLocal, timezone, reloadKey }: {
  userId: string | null
  eligible: readonly TrackedEligible[]
  /** Protocolos ativos (com `medicine` embutido). */
  protocols: readonly any[]
  /** Tratamento do módulo pela regra da fatia A — vale enquanto as leituras não voltam. */
  fallbackId: string | null
  todayLocal: string
  timezone: string
  reloadKey?: unknown
}) {
  const uid = userId ?? ''
  // States
  const [latest, setLatest] = useState<{ key: string; byId: Record<string, Latest> } | null>(null)
  const [manual, setManual] = useState<string | null>(() => session.choice[uid] ?? null)
  // Memos
  const multi = eligible.length > 1
  const idsKey = useMemo(() => eligible.map((e) => e.id).join(','), [eligible])
  const byId = useMemo(() => new Map(protocols.map((p: any) => [p.id, p])), [protocols])
  const ready = !multi || latest?.key === idsKey
  const candidates = useMemo<TrackedCandidate[]>(() => {
    if (!multi) return []
    return eligible.map((e) => {
      const p = byId.get(e.id)
      return {
        id: e.id,
        isWedge: e.isWedge,
        status: trackedStatus({
          cadence: e.cadence,
          latest: ready ? latest?.byId[e.id] : undefined,
          upcomingDates: p ? listUpcomingDoseDates(p, 2).dates : [],
          todayLocal,
          tz: timezone,
        }),
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reloadKey reavalia "hoje" no calendário
  }, [multi, eligible, byId, ready, latest, todayLocal, timezone, reloadKey])
  const autoId = useMemo(() => (ready ? pickTrackedDefault(candidates) : null), [ready, candidates])
  const manualValid = manual && eligible.some((e) => e.id === manual) ? manual : null
  const selectedId = multi ? (manualValid ?? autoId ?? fallbackId) : (eligible[0]?.id ?? fallbackId)

  // Effects — última aplicação de cada elegível (só > 1).
  useEffect(() => {
    if (!multi) return undefined
    let alive = true
    void Promise.all(
      eligible.map((e) => {
        const p = byId.get(e.id)
        return listRecentApplications({ protocolId: e.id, medicineId: p?.medicine_id ?? p?.medicine?.id ?? null, limit: 1 })
          .then((rows: any[]) => [e.id, rows?.[0] ?? null] as const)
          .catch(() => [e.id, undefined] as const)
      })
    ).then((pairs) => {
      if (alive) setLatest({ key: idsKey, byId: Object.fromEntries(pairs) })
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- idsKey resume `eligible`; reloadKey recarrega
  }, [multi, idsKey, reloadKey])

  // Seleção automática medida 1×/sessão (só quando há escolha de verdade).
  useEffect(() => {
    if (!multi || !ready || !autoId || manualValid || session.autoLogged[uid]) return
    session.autoLogged[uid] = true
    const e = eligible.find((x) => x.id === autoId)
    void logEvent(EVENTS.TODAY_TRACKING_SWITCHED, {
      from_kind: null,
      to_kind: trackedKind(!!e?.isWedge, byId.get(autoId)?.medicine),
      auto_default: true,
      surface: SURFACES.MOBILE,
    })
  }, [multi, ready, autoId, manualValid, uid, eligible, byId])

  // Handlers
  const select = useCallback(
    (id: string) => {
      if (id === selectedId || !eligible.some((e) => e.id === id)) return
      const from = eligible.find((e) => e.id === selectedId)
      const to = eligible.find((e) => e.id === id)
      session.choice[uid] = id
      setManual(id)
      void logEvent(EVENTS.TODAY_TRACKING_SWITCHED, {
        from_kind: from ? trackedKind(from.isWedge, byId.get(from.id)?.medicine) : null,
        to_kind: trackedKind(!!to?.isWedge, byId.get(id)?.medicine),
        auto_default: false,
        surface: SURFACES.MOBILE,
      })
    },
    [selectedId, eligible, uid, byId]
  )

  return { selectedId, multi, ready, candidates, select }
}
