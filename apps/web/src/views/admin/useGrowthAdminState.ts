// apps/web/src/views/admin/useGrowthAdminState.ts
// Estado do painel "Crescimento & Wedge" (spec 115 US1/US2).
//
// A tela não calcula métrica nenhuma: totais, wedge e taxas vêm prontos da RPC (unidade = usuário
// distinto, INV-5). O hook só carrega e filtra a lista de usuários no cliente (busca instantânea).

import { useState, useEffect, useCallback, useMemo, useRef, startTransition } from 'react'
import { growthAdminService } from '@services/api/growthAdminService'
import { GROWTH_COHORTS, SMALL_SAMPLE_THRESHOLD, type GrowthCohortKey } from '@dosiq/core'

export type PlatformFilter = 'all' | 'ios' | 'android' | 'web' | 'none'
export type PushFilter = 'all' | 'active' | 'inactive'
export type OnboardingFilter = 'all' | 'pending' | 'done'

export type GrowthTreatment = {
  protocol_id: string
  protocol_name: string
  therapeutic_class: string | null
  therapeutic_class_code: string | null
  wedge: 'glp1_antiobesidade' | 'antidiabeticos_outros' | 'outras' | 'sem_codigo'
  frequency: string | null
  features: {
    titration: boolean
    tracked_measure: string | null
    critical_alarm: boolean
    stock: boolean
    end_date: boolean
  }
}

export type GrowthUser = {
  user_id: string
  email: string | null
  created_at: string
  last_activity_at: string | null
  /** Canais em que a conta já entrou (D-AN-2): aparelhos ∪ sessões no servidor. */
  platforms: Array<'ios' | 'android' | 'web'>
  /** Canal da atividade mais recente. */
  platform: 'ios' | 'android' | 'web' | null
  app_version: string | null
  push_active: boolean
  onboarding_completed: boolean
  protocols_count: number
  treatments: GrowthTreatment[]
}

export type GrowthRate = { users: number; protocols: number; users_pct: number; protocols_pct?: number }

export type GrowthAnalytics = {
  generated_at: string
  excluded_count: number
  total_users: number
  totals: {
    users: number
    new_7d: number
    new_30d: number
    users_with_protocols: number
    protocols: number
    push_active_users: number
    push_active_pct: number
    stock_users_pct: number
    critical_alarm_users_pct: number
    /** Spec 123 FR-014 — funil de cadastro (contas criadas, inclusive não confirmadas). Só contagens. */
    signups: number
    signups_unconfirmed: number
    signups_new_7d: number
    signups_new_30d: number
    confirmation_pct: number
    /** Spec 123 FR-015 — push ativo entre quem tem tratamento ativo. */
    push_treated_users: number
    push_treated_pct: number
  }
  class_distribution: Array<{ class_code: string; label: string | null; wedge: GrowthTreatment['wedge']; users: number; protocols: number; users_pct: number }>
  wedge: Record<GrowthTreatment['wedge'], GrowthRate>
  frequency_distribution: Array<{ frequency: string | null; users: number; protocols: number }>
  feature_rates: Array<GrowthRate & { feature: string; protocols_pct: number }>
  denominators: { users_all: number; protocols_all: number }
  users: GrowthUser[]
}

/** Resposta do endpoint (spec 118): base total sempre; coorte só quando pedido. */
export type GrowthResponse = {
  base: GrowthAnalytics
  cohort: { key: GrowthCohortKey; since: string; data: GrowthAnalytics } | null
}

/** Modo do painel: base total ou um recorte de GROWTH_COHORTS. */
export type GrowthMode = 'total' | GrowthCohortKey

/** Amostra pequena (FR-005): denominador positivo abaixo do limiar. Zero é estado vazio, não aviso. */
export function isSmallSample(n: number | null | undefined): boolean {
  return typeof n === 'number' && n > 0 && n < SMALL_SAMPLE_THRESHOLD
}

/** Referência da base ao lado de um % do coorte (FR-004): "base 33,3%". Sem número ⇒ null. */
export function baselineLabel(pct: number | null | undefined): string | null {
  if (typeof pct !== 'number' || Number.isNaN(pct)) return null
  return `base ${pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

export type GrowthFilters = { query: string; platform: PlatformFilter; push: PushFilter; onboarding?: OnboardingFilter }

/**
 * Filtro puro da tabela: busca por e-mail ou id (sem diferenciar caixa) + plataforma já usada + push
 * + onboarding (spec 123 FR-016: com as não confirmadas fora, "pendente" = confirmou e não terminou).
 */
export function filterGrowthUsers(users: GrowthUser[] = [], { query, platform, push, onboarding = 'all' }: GrowthFilters): GrowthUser[] {
  const q = query.trim().toLowerCase()
  return users.filter((u) => {
    if (q && !(u.email ?? '').toLowerCase().includes(q) && !u.user_id.toLowerCase().includes(q)) return false
    const used = u.platforms ?? []
    if (platform === 'none' && used.length > 0) return false
    if (platform !== 'all' && platform !== 'none' && !used.includes(platform)) return false
    if (push === 'active' && !u.push_active) return false
    if (push === 'inactive' && u.push_active) return false
    if (onboarding === 'pending' && u.onboarding_completed) return false
    if (onboarding === 'done' && !u.onboarding_completed) return false
    return true
  })
}

export function useGrowthAdminState() {
  const [response, setResponse] = useState<GrowthResponse | null>(null)
  const [mode, setMode] = useState<GrowthMode>('total')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all')
  const [pushFilter, setPushFilter] = useState<PushFilter>('all')
  const [onboardingFilter, setOnboardingFilter] = useState<OnboardingFilter>('all')
  const [expandedUserIds, setExpandedUserIds] = useState<Set<string>>(() => new Set())

  // Pedido mais recente: resposta de um modo que não é mais o atual é descartada (G-2, analysis-A).
  const requestSeq = useRef(0)

  /** O que a tela mostra: o coorte no modo recorte, a base no modo total. */
  const data = useMemo<GrowthAnalytics | null>(() => response?.cohort?.data ?? response?.base ?? null, [response])
  /** Base total para comparação — só existe no modo recorte. */
  const reference = useMemo<GrowthAnalytics | null>(() => (response?.cohort ? response.base : null), [response])
  const cohort = useMemo(
    () => (response?.cohort ? { key: response.cohort.key, since: response.cohort.since, label: GROWTH_COHORTS[response.cohort.key].label } : null),
    [response]
  )

  const filteredUsers = useMemo(
    () => filterGrowthUsers(data?.users ?? [], { query: searchQuery, platform: platformFilter, push: pushFilter, onboarding: onboardingFilter }),
    [data, searchQuery, platformFilter, pushFilter, onboardingFilter]
  )
  const hasActiveFilters = searchQuery.trim() !== '' || platformFilter !== 'all' || pushFilter !== 'all' || onboardingFilter !== 'all'

  const load = useCallback(async () => {
    const seq = ++requestSeq.current
    setIsLoading(true)
    setError(null)
    try {
      const body: GrowthResponse = await growthAdminService.load(mode === 'total' ? {} : { cohort: mode })
      if (seq !== requestSeq.current) return
      setResponse(body)
    } catch (err: any) {
      if (seq !== requestSeq.current) return
      setResponse(null)
      setError(err.message)
    } finally {
      if (seq === requestSeq.current) setIsLoading(false)
    }
  }, [mode])

  useEffect(() => {
    startTransition(() => {
      load()
    })
  }, [load])

  const toggleExpanded = useCallback((userId: string) => {
    setExpandedUserIds((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }, [])

  const resetFilters = useCallback(() => {
    setSearchQuery('')
    setPlatformFilter('all')
    setPushFilter('all')
    setOnboardingFilter('all')
  }, [])

  return {
    data,
    reference,
    cohort,
    mode,
    setMode,
    isLoading,
    error,
    reload: load,
    searchQuery,
    setSearchQuery,
    platformFilter,
    setPlatformFilter,
    pushFilter,
    setPushFilter,
    onboardingFilter,
    setOnboardingFilter,
    filteredUsers,
    hasActiveFilters,
    resetFilters,
    expandedUserIds,
    toggleExpanded,
  }
}
