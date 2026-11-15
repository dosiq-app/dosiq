// Spec 119 · PO-119-9: o convite aparece no máximo uma vez por medicamento.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { dismissCatalogLink, isCatalogLinkDismissed, CATALOG_LINK_DISMISSED_PREFIX } from '../catalogLinkStore'

// O mock global (jest-setup) não guarda estado — memória local por teste.
let mem: Record<string, string>
beforeEach(() => {
  mem = {}
  jest.mocked(AsyncStorage.getItem).mockImplementation(async (k) => mem[k] ?? null)
  jest.mocked(AsyncStorage.setItem).mockImplementation(async (k, v) => {
    mem[k] = v
  })
})
afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('catalogLinkStore (119 PO-119-9)', () => {
  it('não dispensado por padrão; dispensar vale só para aquele id', async () => {
    expect(await isCatalogLinkDismissed('med-1')).toBe(false)
    await dismissCatalogLink('med-1')
    expect(await isCatalogLinkDismissed('med-1')).toBe(true)
    expect(await isCatalogLinkDismissed('med-2')).toBe(false)
  })

  it('a chave guarda só o id (sem nome)', async () => {
    await dismissCatalogLink('med-1')
    expect(Object.keys(mem)).toEqual([`${CATALOG_LINK_DISMISSED_PREFIX}med-1`])
  })

  it('id vazio ⇒ tratado como dispensado e nada é gravado', async () => {
    expect(await isCatalogLinkDismissed(null)).toBe(true)
    await dismissCatalogLink(undefined)
    expect(Object.keys(mem)).toEqual([])
  })

  it('erro de leitura ⇒ dispensado (não insistir); erro de escrita não lança', async () => {
    jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('io'))
    expect(await isCatalogLinkDismissed('med-1')).toBe(true)
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('io'))
    await expect(dismissCatalogLink('med-1')).resolves.toBeUndefined()
  })
})
