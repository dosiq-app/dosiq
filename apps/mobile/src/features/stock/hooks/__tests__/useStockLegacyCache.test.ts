// RC6 #948: snapshot do estoque gravado antes da 117 B (itens sem `section`) não é exibido offline —
// o formato antigo não diz a seção e dava selo de nível falso em órfão.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { _tryLoadCache } from '../useStock'

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn() }))
jest.mock('../../../../platform/supabase/nativeSupabaseClient', () => ({ supabase: {} }))
jest.mock('../../services/stockService', () => ({ stockService: {} }))
jest.mock('../../services/supplyRunwayService', () => ({ supplyRunwayService: {} }))

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

const snapshot = (items: Record<string, unknown>[]) =>
  JSON.stringify({ capturedAt: new Date().toISOString(), data: { active: items, inactive: [], localDay: '2026-11-13' } })

describe('_tryLoadCache — formato pré-117 B', () => {
  it('itens sem section ⇒ tratado como sem cache (não exibe)', async () => {
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue(snapshot([{ id: 'O', status: 'HIGH' }]))
    const setState = jest.fn()
    await expect(_tryLoadCache(new Error('offline'), setState, { current: null })).rejects.toThrow(/nem dados salvos/)
    expect(setState).not.toHaveBeenCalled()
  })

  it('formato novo ⇒ exibe o snapshot como stale', async () => {
    ;(AsyncStorage.getItem as jest.Mock).mockResolvedValue(snapshot([{ id: 'A', section: 'in_use', status: 'HIGH' }]))
    const setState = jest.fn()
    await _tryLoadCache(new Error('offline'), setState, { current: null })
    expect(setState).toHaveBeenCalledWith(expect.objectContaining({ stale: true }))
  })
})
