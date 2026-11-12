// 084 Slice B (RC3 E6): fábrica comum de mapa com TTL — modos de falha da analysis-B §5.

import { createTtlMapStore } from '../ttlMapStore'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: jest.fn(async (k: string) => data.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      data.set(k, v)
    }),
  }
}

const KEY = '@test/ttl'
const TTL = 1000

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('createTtlMapStore', () => {
  it('JSON ilegível ⇒ mapa vazio', async () => {
    const storage = memoryStorage({ [KEY]: '{x' })
    const store = createTtlMapStore({ key: KEY, ttlMs: TTL, storage })
    expect(await store.read(0)).toEqual({})
  })

  it('getItem lança ⇒ mapa vazio', async () => {
    const storage = memoryStorage()
    storage.getItem.mockRejectedValueOnce(new Error('io'))
    const store = createTtlMapStore({ key: KEY, ttlMs: TTL, storage })
    expect(await store.read(0)).toEqual({})
  })

  it('poda valor não numérico e expirado', async () => {
    const storage = memoryStorage({ [KEY]: JSON.stringify({ a: 'x', b: 100, c: 900 }) })
    const store = createTtlMapStore({ key: KEY, ttlMs: TTL, storage })
    expect(await store.read(1100)).toEqual({ c: 900 })
  })

  it('escritas concorrentes não se perdem (AP-258)', async () => {
    const storage = memoryStorage()
    const store = createTtlMapStore({ key: KEY, ttlMs: TTL, storage })
    const results = await Promise.all([
      store.write((m, at) => (m.a = at), 10),
      store.write((m, at) => (m.b = at), 20),
    ])
    expect(results).toEqual([true, true])
    expect(await store.read(30)).toEqual({ a: 10, b: 20 })
  })

  it('setItem lança ⇒ false, sem rejeitar, e a fila segue', async () => {
    const storage = memoryStorage()
    storage.setItem.mockRejectedValueOnce(new Error('full'))
    const store = createTtlMapStore({ key: KEY, ttlMs: TTL, storage })
    expect(await store.write((m) => (m.a = 1), 1)).toBe(false)
    expect(await store.write((m) => (m.b = 2), 2)).toBe(true)
    expect(await store.read(3)).toEqual({ b: 2 })
  })
})
