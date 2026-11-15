// useTodayWeightSeries — série de peso da linha Peso da Hoje (spec 121 FR-011/FR-014 · RC3 E-4).
// Tela quente: nada no mount. A 1ª leitura (30 dias) espera o fim das interações (1º paint) e só
// roda com `enabled`. "Tratamento" lê sob demanda, paginada até a página vir incompleta (AP-186).
// 1 ponto por dia local, a pesagem mais recente do dia — a mesma regra do detalhe (069 E-9).
// Erro nunca vira vazio (padrão 069 B-5): `error` = 'network' | 'other'.

import { useCallback, useEffect, useRef, useState } from 'react'
import { InteractionManager } from 'react-native'
import { formatLocalDate, getTodayLocal, getUserTime, parseISO, shiftDay } from '@dosiq/core'
import { measuresRepo } from '@measures/services/measuresRepo'
import { getGlp1JourneyStart } from '@dashboard/services/dashboardService'
import { isNetworkError } from '@shared/utils/networkError'

export type { WeightWindow } from '@dashboard/utils/treatmentWeek'
export type WeightPoint = { day: string; kg: number }
export type WeightLast = { kg: number; measuredAt: string }

export const WEIGHT_PAGE_SIZE = 500

/** Um ponto por dia local (a pesagem mais recente), em ordem crescente de dia. */
export function dailyWeightPoints(rows: ReadonlyArray<{ value: number; measured_at: string }>, timezone: string): WeightPoint[] {
  const byDay = new Map<string, { kg: number; t: number }>()
  for (const r of rows) {
    const date = parseISO(r.measured_at)
    const t = date.getTime()
    if (!Number.isFinite(t) || !Number.isFinite(r.value)) continue
    const day = formatLocalDate(getUserTime(date, timezone))
    const prev = byDay.get(day)
    if (!prev || t > prev.t) byDay.set(day, { kg: r.value, t })
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ day, kg: v.kg }))
}

/** Lê TODAS as pesagens desde `fromTs` (desc por measured_at): pagina por `toTs` até página incompleta. */
export async function listAllWeights(fromTs: string | undefined): Promise<any[]> {
  const all: any[] = []
  let toTs: string | undefined
  for (;;) {
    const page = (await measuresRepo.list({ type: 'peso', fromTs, toTs, limit: WEIGHT_PAGE_SIZE })) ?? []
    all.push(...page)
    if (page.length < WEIGHT_PAGE_SIZE) return all
    // Próxima página: estritamente antes da mais antiga desta (o repo usa `lt`). Empate exato de
    // measured_at na fronteira de página é o caso cego declarado (analysis-A, uncertainty).
    toTs = page[page.length - 1].measured_at
  }
}

export function useTodayWeightSeries({
  enabled,
  userId,
  timezone,
  treatmentStart,
  reloadKey,
}: {
  enabled: boolean
  /** Dono da jornada GLP-1 (início da janela "Tratamento" inclui tratamentos encerrados). */
  userId?: string | null
  timezone: string
  /** Início mais antigo entre os GLP-1 ATIVOS (YYYY-MM-DD) — fallback se a jornada não puder ser lida. */
  treatmentStart: string | null
  /** Muda quando há pesagem nova por outra via (foco/refresh da Hoje). */
  reloadKey?: unknown
}) {
  // States
  const [recent, setRecent] = useState<WeightPoint[] | null>(null)
  const [full, setFull] = useState<WeightPoint[] | null>(null)
  const [last, setLast] = useState<WeightLast | null>(null)
  const [error, setError] = useState<'network' | 'other' | null>(null)
  const [loading, setLoading] = useState(false)
  const [journeyStart, setJourneyStart] = useState<string | null>(null)
  const reqRef = useRef(0)
  const fullLoadedRef = useRef(false)

  // Handlers
  const loadRecent = useCallback(async () => {
    const req = ++reqRef.current
    setLoading(true)
    try {
      // Meia-noite LOCAL de 30 dias atrás (R-020): cobre a janela 30d inteira em dias locais.
      const fromTs = parseISO(`${shiftDay(getTodayLocal(timezone), -30)}T00:00:00`).toISOString()
      const [rows, latest] = await Promise.all([listAllWeights(fromTs), measuresRepo.getLatest('peso')])
      if (req !== reqRef.current) return
      setRecent(dailyWeightPoints(rows, timezone))
      setLast(latest && Number.isFinite(latest.value) ? { kg: latest.value, measuredAt: latest.measured_at } : null)
      setError(null)
    } catch (err) {
      if (req === reqRef.current) setError(isNetworkError(err) ? 'network' : 'other')
    } finally {
      if (req === reqRef.current) setLoading(false)
    }
  }, [timezone])

  const loadTreatment = useCallback(async () => {
    const req = ++reqRef.current
    setLoading(true)
    try {
      // Jornada GLP-1 inteira (ativos + encerrados); falha na leitura ⇒ início dos ativos (nunca trava).
      const journey = userId ? await getGlp1JourneyStart(userId).catch(() => null) : null
      const start = [journey, treatmentStart].filter((d): d is string => !!d).sort()[0] ?? null
      const fromTs = start ? parseISO(`${start}T00:00:00`).toISOString() : undefined
      const rows = await listAllWeights(fromTs)
      if (req !== reqRef.current) return
      setJourneyStart(start)
      setFull(dailyWeightPoints(rows, timezone))
      fullLoadedRef.current = true
      setError(null)
    } catch (err) {
      if (req === reqRef.current) setError(isNetworkError(err) ? 'network' : 'other')
    } finally {
      if (req === reqRef.current) setLoading(false)
    }
  }, [timezone, treatmentStart, userId])

  // Recarga (peso novo, foco): 30d sempre; "Tratamento" só se já foi aberto — sem isso a janela
  // "Tratamento" ficava com a série velha ou presa no carregando (RC5 2026-11-15).
  const reload = useCallback(async () => {
    await loadRecent()
    if (fullLoadedRef.current) await loadTreatment()
  }, [loadRecent, loadTreatment])

  // Effects — depois do 1º paint (MOBILE_PERFORMANCE), e de novo a cada recarga da Hoje.
  useEffect(() => {
    if (!enabled) return
    const task = InteractionManager.runAfterInteractions(() => { void reload() })
    return () => task.cancel?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reloadKey = recarga da Hoje
  }, [enabled, reloadKey])

  return { recent, full, last, error, loading, retry: reload, loadTreatment, reload, journeyStart }
}
