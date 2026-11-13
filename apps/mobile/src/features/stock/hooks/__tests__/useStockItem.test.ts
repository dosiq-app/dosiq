// 117 PO-3 — `useStockItem` devolve o objeto do dataset da aba (`useStock`), sem recalcular nada.
import { renderHook } from '@testing-library/react-native'
import { useStockItem } from '../useStockItem'

const mockUseStock = jest.fn()
jest.mock('../useStock', () => ({ useStock: () => mockUseStock() }))

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

const A = { id: 'm-1', totalQuantity: 5, status: 'CRITICAL' }
const B = { id: 'm-2', totalQuantity: 9, status: 'HIGH' }

function withData(data: unknown, extra = {}) {
  mockUseStock.mockReturnValue({ data, loading: false, error: null, refresh: jest.fn(), ...extra })
}

describe('117 useStockItem', () => {
  it('acha o item em "em uso" e devolve a MESMA referência', () => {
    withData({ active: [A], inactive: [B] })
    expect(renderHook(() => useStockItem('m-1')).result.current.item).toBe(A)
  })

  it('acha o item em "sem tratamento ativo"', () => {
    withData({ active: [A], inactive: [B] })
    expect(renderHook(() => useStockItem('m-2')).result.current.item).toBe(B)
  })

  it('fora da lista → null, pronto', () => {
    withData({ active: [A], inactive: [] })
    const { result } = renderHook(() => useStockItem('m-9'))
    expect(result.current.item).toBeNull()
    expect(result.current.ready).toBe(true)
  })

  it('sem dado ainda (carregando ou erro) → não pronto, item null', () => {
    withData(null, { loading: true })
    const { result } = renderHook(() => useStockItem('m-1'))
    expect(result.current).toMatchObject({ item: null, ready: false, loading: true })
  })

  it('id ausente → null', () => {
    withData({ active: [A], inactive: [] })
    expect(renderHook(() => useStockItem(null)).result.current.item).toBeNull()
  })
})
