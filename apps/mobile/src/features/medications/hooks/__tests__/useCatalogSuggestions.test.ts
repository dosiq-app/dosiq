// Spec 119 · PO-119-7 / PO-119-12: estados das sugestões; base ausente nunca bloqueia.
import { renderHook, act } from '@testing-library/react-native'
import { useCatalogSuggestions, SUGGESTION_DEBOUNCE_MS } from '../useCatalogSuggestions'

const mockDb: { items: any[] | null; isLoading: boolean } = { items: null, isLoading: false }
jest.mock('@shared/hooks/useMedicineDatabase', () => ({
  useMedicineDatabase: () => mockDb,
}))

const BASE = [
  { name: 'Mounjaro', activeIngredient: 'Tirzepatida', laboratory: 'Lilly' },
  { name: 'Tirzepatida', activeIngredient: 'Tirzepatida', laboratory: null },
  { name: 'Ozempic', activeIngredient: 'Semaglutida', laboratory: 'Novo' },
]

function run(query: string, enabled = true) {
  const hook = renderHook(({ q, e }) => useCatalogSuggestions(q, { enabled: e }), { initialProps: { q: query, e: enabled } })
  act(() => {
    jest.advanceTimersByTime(SUGGESTION_DEBOUNCE_MS)
  })
  return hook
}

beforeEach(() => {
  jest.useFakeTimers()
  mockDb.items = BASE
  mockDb.isLoading = false
})
afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
  jest.useRealTimers()
})

describe('useCatalogSuggestions (119 B)', () => {
  it('menos de 3 caracteres ⇒ idle, sem lista', () => {
    const { result } = run('mo')
    expect(result.current).toMatchObject({ state: 'idle', exact: [], approx: [] })
  })

  it('base carregando ⇒ loading, sem lista nem erro (PO-119-7)', () => {
    mockDb.items = null
    mockDb.isLoading = true
    expect(run('mounj').result.current).toMatchObject({ state: 'loading', exact: [], approx: [] })
  })

  it('base indisponível (offline sem cache) ⇒ unavailable, sem lista (PO-119-7)', () => {
    mockDb.items = null
    expect(run('mounj').result.current).toMatchObject({ state: 'unavailable', exact: [], approx: [] })
  })

  it('zero resultados ⇒ empty', () => {
    expect(run('creatina').result.current).toMatchObject({ state: 'empty', exact: [], approx: [] })
  })

  it('prefixo ⇒ exact; erro de digitação ⇒ approx', () => {
    expect(run('mounj').result.current.exact.map((i: any) => i.name)).toEqual(['Mounjaro'])
    const typo = run('tizerpatida').result.current
    expect(typo.state).toBe('results')
    expect(typo.exact).toEqual([])
    expect(typo.approx.map((i: any) => i.name)).toEqual(['Mounjaro', 'Tirzepatida'])
  })

  it('desligado (edição com código) ⇒ nada', () => {
    expect(run('mounj', false).result.current).toMatchObject({ state: 'idle', exact: [], approx: [] })
  })

  it('debounce: lista da query anterior não aparece enquanto a nova não assenta', () => {
    const hook = run('mounj')
    expect(hook.result.current.exact).toHaveLength(1)
    hook.rerender({ q: 'ozemp', e: true })
    expect(hook.result.current.exact).toEqual([])
    act(() => {
      jest.advanceTimersByTime(SUGGESTION_DEBOUNCE_MS)
    })
    expect(hook.result.current.exact.map((i: any) => i.name)).toEqual(['Ozempic'])
  })
})
