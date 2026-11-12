// ttlMapStore.ts — mapa `{ [chave]: epochMs }` em AsyncStorage com TTL e escrita serializada.
//
// Forma comum de `resolvedDoseStore` (082 D2) e `surfaceEmissionStore` (084 Slice B, RC3 E6). Vale no
// headless (AsyncStorage não depende de React). Expirados são podados na leitura e somem na próxima
// escrita. Leitura falha/ilegível ⇒ mapa vazio (best-effort; quem consome decide o default seguro).
// Escritas encadeadas por instância da loja: ler-mutar-gravar em paralelo perdia a marca de quem
// gravou primeiro (RC6 #930, AP-258).

import AsyncStorage from '@react-native-async-storage/async-storage'

type TtlMap = Record<string, number>

interface TtlMapStorage {
  getItem: (key: string) => Promise<string | null>
  setItem: (key: string, value: string) => Promise<void>
}

export interface TtlMapStoreOptions {
  key: string
  ttlMs: number
  storage?: TtlMapStorage
}

export interface TtlMapStore {
  /** Mapa vigente (sem expirados). Falha ⇒ `{}`. */
  read: (nowMs: number) => Promise<TtlMap>
  /** Lê → muta → grava, serializado. `true` só se gravou. Nunca rejeita. */
  write: (mutate: (map: TtlMap, nowMs: number) => void, nowMs: number) => Promise<boolean>
}

export function createTtlMapStore({ key, ttlMs, storage = AsyncStorage }: TtlMapStoreOptions): TtlMapStore {
  let chain: Promise<unknown> = Promise.resolve()

  async function read(nowMs: number): Promise<TtlMap> {
    try {
      const raw = await storage.getItem(key)
      const parsed = raw ? JSON.parse(raw) : {}
      const out: TtlMap = {}
      for (const [id, ms] of Object.entries(parsed || {})) {
        if (typeof ms === 'number' && Number.isFinite(ms) && ms + ttlMs > nowMs) out[id] = ms
      }
      return out
    } catch {
      return {}
    }
  }

  function write(mutate: (map: TtlMap, nowMs: number) => void, nowMs: number): Promise<boolean> {
    const run = chain.then(async () => {
      const map = await read(nowMs)
      mutate(map, nowMs)
      await storage.setItem(key, JSON.stringify(map))
      return true
    })
    const safe = run.catch(() => false)
    chain = safe
    return safe
  }

  return { read, write }
}
