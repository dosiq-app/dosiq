import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('@services/api/growthAdminService', () => ({
  growthAdminService: { load: vi.fn() },
}))

import { useGrowthAdminState, filterGrowthUsers, isSmallSample, baselineLabel, type GrowthUser } from '../useGrowthAdminState'
import { growthAdminService } from '@services/api/growthAdminService'

const svc = growthAdminService as any

const user = (over: Partial<GrowthUser>): GrowthUser => ({
  user_id: 'aaaaaaaa-0000-4000-8000-000000000000',
  email: 'ana@exemplo.com',
  created_at: '2026-11-01T12:00:00Z',
  last_activity_at: null,
  platforms: ['ios'],
  platform: 'ios',
  app_version: '0.34.0',
  push_active: true,
  onboarding_completed: true,
  protocols_count: 1,
  treatments: [],
  ...over,
})

const USERS = [
  user({}),
  // deslogou do app: sem aparelho vinculado, mas já usou Android e Web (D-AN-2)
  user({ user_id: 'bbbbbbbb-0000-4000-8000-000000000000', email: 'BRUNO@exemplo.com', platforms: ['android', 'web'], platform: 'web', push_active: false }),
  user({ user_id: 'cccccccc-0000-4000-8000-000000000000', email: null, platforms: [], platform: null, push_active: false }),
]

describe('filterGrowthUsers', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.clearAllTimers()
  })

  it('busca por e-mail sem caixa e por id; e-mail nulo não quebra', () => {
    expect(filterGrowthUsers(USERS, { query: 'bruno', platform: 'all', push: 'all' })).toHaveLength(1)
    expect(filterGrowthUsers(USERS, { query: ' cccccccc ', platform: 'all', push: 'all' })).toHaveLength(1)
    expect(filterGrowthUsers(USERS, { query: '', platform: 'all', push: 'all' })).toHaveLength(3)
  })

  it('plataforma casa com qualquer canal já usado; "none" pega quem não tem registro', () => {
    expect(filterGrowthUsers(USERS, { query: '', platform: 'ios', push: 'all' }).map((u) => u.email)).toEqual(['ana@exemplo.com'])
    expect(filterGrowthUsers(USERS, { query: '', platform: 'web', push: 'all' }).map((u) => u.email)).toEqual(['BRUNO@exemplo.com'])
    expect(filterGrowthUsers(USERS, { query: '', platform: 'none', push: 'all' })).toHaveLength(1)
    expect(filterGrowthUsers(USERS, { query: '', platform: 'all', push: 'inactive' })).toHaveLength(2)
    expect(filterGrowthUsers(USERS, { query: '', platform: 'android', push: 'active' })).toHaveLength(0)
  })

  it('onboarding (123 FR-016): pendente/concluído; ausente = todos', () => {
    const lista = [...USERS, user({ user_id: 'dddddddd-0000-4000-8000-000000000000', email: 'dani@exemplo.com', onboarding_completed: false })]
    expect(filterGrowthUsers(lista, { query: '', platform: 'all', push: 'all', onboarding: 'pending' }).map((u) => u.email)).toEqual(['dani@exemplo.com'])
    expect(filterGrowthUsers(lista, { query: '', platform: 'all', push: 'all', onboarding: 'done' })).toHaveLength(3)
    expect(filterGrowthUsers(lista, { query: '', platform: 'all', push: 'all' })).toHaveLength(4)
    expect(filterGrowthUsers(lista, { query: '', platform: 'all', push: 'inactive', onboarding: 'pending' })).toHaveLength(0)
  })

  it('lista ausente vira vazia', () => {
    expect(filterGrowthUsers(undefined, { query: 'x', platform: 'all', push: 'all' })).toEqual([])
  })
})

describe('useGrowthAdminState', () => {
  beforeEach(() => {
    svc.load.mockResolvedValue({ base: { users: USERS, excluded_count: 2 }, cohort: null })
  })
  afterEach(() => {
    vi.clearAllMocks()
    vi.clearAllTimers()
  })

  it('carrega, filtra no cliente sem novo fetch e reseta filtros', async () => {
    const { result } = renderHook(() => useGrowthAdminState())
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.filteredUsers).toHaveLength(3)

    act(() => { result.current.setPlatformFilter('android') })
    expect(result.current.filteredUsers).toHaveLength(1)
    expect(result.current.hasActiveFilters).toBe(true)
    expect(svc.load).toHaveBeenCalledTimes(1)

    act(() => { result.current.resetFilters() })
    expect(result.current.filteredUsers).toHaveLength(3)
    expect(result.current.hasActiveFilters).toBe(false)
  })

  it('expande e recolhe o drill-down por usuário', async () => {
    const { result } = renderHook(() => useGrowthAdminState())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    act(() => { result.current.toggleExpanded(USERS[0].user_id) })
    expect(result.current.expandedUserIds.has(USERS[0].user_id)).toBe(true)
    act(() => { result.current.toggleExpanded(USERS[0].user_id) })
    expect(result.current.expandedUserIds.size).toBe(0)
  })

  it('falha do servidor vira erro e o reload tenta de novo', async () => {
    svc.load.mockRejectedValueOnce(new Error('Não autorizado.'))
    const { result } = renderHook(() => useGrowthAdminState())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBe('Não autorizado.')
    expect(result.current.data).toBeNull()

    await act(async () => { await result.current.reload() })
    expect(result.current.error).toBeNull()
    expect(result.current.data?.excluded_count).toBe(2)
  })
})

describe('recorte pós-v0.34 (spec 118 · PO-118-3/4)', () => {
  const BASE = { users: USERS, excluded_count: 2, total_users: 3 }
  const COHORT = { users: [USERS[0]], excluded_count: 2, total_users: 1 }
  const cohortBody = { base: BASE, cohort: { key: 'v034', since: '2026-10-22T00:00:00-03:00', data: COHORT } }
  afterEach(() => {
    vi.clearAllMocks()
    vi.clearAllTimers()
  })

  it('isSmallSample: 0 é vazio (false), 12 e 29 avisam, 30 e 40 não', () => {
    expect(isSmallSample(0)).toBe(false)
    expect(isSmallSample(12)).toBe(true)
    expect(isSmallSample(29)).toBe(true)
    expect(isSmallSample(30)).toBe(false)
    expect(isSmallSample(40)).toBe(false)
    expect(isSmallSample(undefined)).toBe(false)
  })

  it('baselineLabel formata pt-BR e some sem número', () => {
    expect(baselineLabel(33.3)).toBe('base 33,3%')
    expect(baselineLabel(25)).toBe('base 25%')
    expect(baselineLabel(0)).toBe('base 0%')
    expect(baselineLabel(null)).toBeNull()
  })

  it('modo total: sem referência; trocar de modo refaz o fetch com cohort e mostra o coorte', async () => {
    svc.load.mockResolvedValueOnce({ base: BASE, cohort: null }).mockResolvedValueOnce(cohortBody)
    const { result } = renderHook(() => useGrowthAdminState())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(svc.load).toHaveBeenLastCalledWith({})
    expect(result.current.reference).toBeNull()
    expect(result.current.cohort).toBeNull()
    expect(result.current.data?.total_users).toBe(3)

    act(() => { result.current.setMode('v034') })
    await waitFor(() => expect(result.current.cohort?.key).toBe('v034'))
    expect(svc.load).toHaveBeenLastCalledWith({ cohort: 'v034' })
    expect(result.current.data?.total_users).toBe(1)
    expect(result.current.reference?.total_users).toBe(3)
    expect(result.current.cohort?.label).toBe('Pós-v0.34')
    expect(result.current.filteredUsers).toHaveLength(1)
  })

  it('resposta atrasada do modo anterior não sobrescreve o modo atual (G-2)', async () => {
    let resolveTotal: (v: unknown) => void = () => {}
    svc.load
      .mockImplementationOnce(() => new Promise((res) => { resolveTotal = res }))
      .mockResolvedValueOnce(cohortBody)
    const { result } = renderHook(() => useGrowthAdminState())
    await waitFor(() => expect(svc.load).toHaveBeenCalledTimes(1))
    act(() => { result.current.setMode('v034') })
    await waitFor(() => expect(result.current.cohort?.key).toBe('v034'))
    await act(async () => { resolveTotal({ base: BASE, cohort: null }) })
    expect(result.current.cohort?.key).toBe('v034')
    expect(result.current.data?.total_users).toBe(1)
    expect(result.current.isLoading).toBe(false)
  })
})
