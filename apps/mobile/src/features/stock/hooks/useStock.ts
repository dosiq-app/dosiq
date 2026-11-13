import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { AppState } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getTodayLocal, getNow, parseISO, addDays, describeLoadFailure } from '@dosiq/core'
import { supabase } from '../../../platform/supabase/nativeSupabaseClient'
import { stockService } from '../services/stockService'
import { debugLog } from '@shared/utils/debugLog'
import { supplyRunwayService } from '../services/supplyRunwayService'
import { transformStockData, splitStockItems, attachSupplyRunway, supplyEligibleMedicineIds, supplyBuyIdsMissing, attachSupplyBuyNames } from './_stockDataTransformer'

const STOCK_CACHE_KEY = '@dosiq/stock-snapshot'

async function _resolveUser() {
  const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession()
  let user = currentSession?.user
  if (sessionError || !user) {
    const { data: { user: verifiedUser }, error: userError } = await supabase.auth.getUser()
    if (userError || !verifiedUser) throw new Error('Sessão expirada')
    user = verifiedUser
  }
  return user
}

async function _fetchOpenedAtMap() {
  // Busca o opened_at mais recente de stock entries com saldo, agrupado por medicine_id.
  // Usado para eixo TTL (012 Fase A) na listagem de estoque. Silencia erros (não-crítico).
  try {
    const { data } = await supabase
      .from('stock')
      .select('medicine_id, opened_at')
      .gt('quantity', 0)
      .not('opened_at', 'is', null)
    if (!data) return {}
    // Para cada medicine_id, pega o opened_at mais ANTIGO entre lotes com saldo —
    // é o primeiro a expirar (mostrar o recente subnotificaria o vencimento).
    const map = {}
    for (const row of data) {
      if (!row.opened_at) continue
      if (!map[row.medicine_id] || row.opened_at < map[row.medicine_id]) {
        map[row.medicine_id] = row.opened_at
      }
    }
    return map
  } catch {
    return {}
  }
}

/** Etapas de escada; falha ⇒ `null` ⇒ sem Programado por etapa e alerta como hoje (INV-2 / AP-277). */
async function _fetchSteps() {
  try {
    return await supplyRunwayService.getSteps()
  } catch (err) {
    debugLog('useStock', `Etapas indisponíveis (sem Programado por etapa; alerta segue como hoje): ${err?.message}`)
    return null
  }
}

/**
 * 105 Fatia B: anota predicado e data de compra (core). Doses só dos elegíveis (lista curta, quase
 * sempre vazia). Falha nas doses ⇒ sem data (FR-010), mas o silêncio do alerta continua valendo.
 */
async function _withSupplyRunway(items, steps) {
  const now = getNow()
  let instances = []
  const eligible = supplyEligibleMedicineIds(items, steps)
  if (eligible.length > 0) {
    try {
      // Recua 1 dia: o core descarta o que é de antes de hoje local (mesma regra do servidor).
      instances = await supplyRunwayService.getPendingInstances(eligible, addDays(now, -1).toISOString())
    } catch (err) {
      debugLog('useStock', `Doses pendentes indisponíveis (sem data de compra): ${err?.message}`)
    }
  }
  const annotated = attachSupplyRunway(items, { steps, instances, now })
  // Escada: o remédio da próxima etapa pode não estar na lista (cadastro arquivado, etc.).
  let summaries = []
  const missing = supplyBuyIdsMissing(annotated)
  if (missing.length > 0) {
    try {
      summaries = await supplyRunwayService.getMedicineSummaries(missing)
    } catch (err) {
      debugLog('useStock', `Cadastro do remédio a comprar indisponível (texto genérico): ${err?.message}`)
    }
  }
  return attachSupplyBuyNames(annotated, summaries)
}

async function _fetchAndPersistStock(setState, dataRef) {
  // 117 Fatia B (FR-005, RC3 E-1): leitura SEM corte por hoje (`getStockOverview`) — tratamento
  // futuro, pausado e o remédio da próxima etapa chegam ao app; a classificação do core decide a seção.
  const [rawData, openedAtMap, steps] = await Promise.all([
    stockService.getStockOverview(),
    _fetchOpenedAtMap(),
    _fetchSteps(),
  ])
  // Injeta opened_at no rawData para que o transformer possa calcular o eixo TTL.
  const rawWithTtl = rawData.map((item) => ({
    ...item,
    _latestOpenedAt: openedAtMap[item.id] ?? null,
  }))
  const today = getTodayLocal()
  const transformed = transformStockData(rawWithTtl, { steps, today })
  const { active, scheduled, inactive } = splitStockItems(await _withSupplyRunway(transformed, steps))
  const newData = { active, scheduled, inactive, localDay: today }
  const snapshot = { data: newData, capturedAt: getNow().toISOString(), rawData }
  await AsyncStorage.setItem(STOCK_CACHE_KEY, JSON.stringify(snapshot))
  dataRef.current = newData
  setState({ data: newData, loading: false, error: null, stale: false, refreshing: false })
}

async function _tryLoadCache(err, setState, dataRef) {
  const cached = await AsyncStorage.getItem(STOCK_CACHE_KEY)
  // Sem cache pra tentar (1ª abertura, ou storage limpo) — não relançar `err` cru: em modo
  // avião/sem rede é erro de fetch nativo (RN), sempre em inglês, e vazaria pra tela via
  // describeLoadFailure. Mensagem própria em PT (achado no smoke 055).
  if (!cached) throw new Error('Não identificamos conexão com a Internet, nem dados salvos neste aparelho. Conecte-se a rede para continuar.')
  const parsed = JSON.parse(cached)
  const diffHours = (getNow().getTime() - parseISO(parsed.capturedAt).getTime()) / (1000 * 60 * 60)
  // "Cache expirado" é jargão técnico — Dona Maria não sabe o que é cache (achado no smoke 055).
  if (diffHours >= 24) throw new Error('Não identificamos conexão com a Internet e seus dados no app estão desatualizados (mais de 24h). Conecte-se à rede para atualizar.')
  dataRef.current = parsed.data
  setState({ data: parsed.data, loading: false, error: null, stale: true, refreshing: false })
}

function _setupMidnightAndAppState(loadStock, dataRef) {
  let midnightTimer
  const scheduleMidnightRefresh = () => {
    const now = getNow()
    const nextMidnight = addDays(now, 1)
    nextMidnight.setHours(0, 0, 0, 0)
    clearTimeout(midnightTimer)
    midnightTimer = setTimeout(() => {
      debugLog('useStock', 'Meia-noite detectada: Refreshing...')
      loadStock()
      scheduleMidnightRefresh()
    }, nextMidnight.getTime() - now.getTime() + 1000)
  }
  scheduleMidnightRefresh()
  const handleStateChange = (nextState) => {
    if (nextState === 'active') {
      const today = getTodayLocal()
      if (dataRef.current?.localDay && dataRef.current.localDay !== today) {
        debugLog('useStock', 'Dia alterado via background: Refreshing...')
        loadStock()
      }
    }
  }
  const subscription = AppState.addEventListener('change', handleStateChange)
  return () => { subscription.remove(); clearTimeout(midnightTimer) }
}

/**
 * Hook para gerenciar e calcular dados de estoque conforme ADR-018.
 */
export function useStock() {
  const [state, setState] = useState({
    data: null,
    loading: true,
    error: null,
    stale: false,
    refreshing: false
  })

  const dataRef = useRef(null)
  const lastFetchedRef = useRef(0)
  const loadStockRef = useRef(null)

  // 117 Fatia B (E-9 / PO-5): a 2ª cópia do predicado de período que re-dividia as seções aqui saiu —
  // a seção vem da classificação do core. Virada do dia: `_setupMidnightAndAppState` recarrega (R-175),
  // e cache de outro dia é recarregado no foco (`localDay`). Cache antigo sem `scheduled` ⇒ [].
  const refinedData = useMemo(() => {
    if (!state.data) return state.data
    return { ...state.data, scheduled: state.data.scheduled ?? [] }
  }, [state.data])

  // refresh estável (useMemo) — arrow inline no useMemo recriava a função a
  // cada setState, causando loop em consumidores com useFocusEffect([refresh]).
  const refresh = useMemo(() => (bypassThrottle = true) => {
    if (loadStockRef.current) {
      loadStockRef.current(true, bypassThrottle)
    }
  }, [])

  const result = useMemo(() => ({
    ...state,
    data: refinedData,
    refresh,
  }), [state, refinedData, refresh])

  const loadStock = useCallback(async (isRefreshing = false, bypassThrottle = false) => {
    const now = Date.now()
    const isWithinThrottle = now - lastFetchedRef.current < 10000
    if (!bypassThrottle && isWithinThrottle && dataRef.current) {
      debugLog('useStock', 'Throttled focus/mount refresh: skip network fetch, using memory.')
      setState(prev => ({ ...prev, loading: false, refreshing: false }))
      return
    }

    if (isRefreshing) setState(prev => ({ ...prev, refreshing: true, error: null }))
    else setState(prev => ({ ...prev, loading: true, error: null }))
    try {
      // Guard: garante sessão antes de buscar (lança "Sessão expirada" se deslogado).
      await _resolveUser()
      await _fetchAndPersistStock(setState, dataRef)
      lastFetchedRef.current = Date.now()
    } catch (err) {
      if (__DEV__) console.warn('[useStock] Fetch failed, checking cache:', err.message)
      try {
        await _tryLoadCache(err, setState, dataRef)
      } catch (fallbackErr) {
        // AP-314: erro de servidor não pode se disfarçar de cache/offline.
        setState(prev => ({
          ...prev,
          loading: false,
          refreshing: false,
          error: describeLoadFailure(err, fallbackErr, 'Erro ao carregar estoque.'),
        }))
      }
    }
  }, [])

  useEffect(() => {
    loadStockRef.current = loadStock
  })

  useEffect(() => { loadStock() }, [loadStock])

  useEffect(() => _setupMidnightAndAppState(loadStock, dataRef), [loadStock])

  return result
}
