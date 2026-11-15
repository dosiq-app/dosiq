import { useCallback, useMemo, useSyncExternalStore } from 'react'
import {
  getNow,
  parseISO,
  fetchJson,
  shouldRefreshCache,
  resolveDataUrl,
  normalizeText,
  matchesPrefix,
} from '@dosiq/core'
import { createAsyncStorageAdapter } from '@shared/services/_asyncStorageAdapter'
import { nativePublicAppConfig } from '@platform/config/nativePublicAppConfig'

interface Medicine {
  name: string
  activeIngredient: string
  [key: string]: unknown
}

interface CachedManifest {
  cachedAt?: string
  files?: Record<string, { path?: string }>
  [key: string]: unknown
}

// Extrai mensagem de erro de valores que não são instâncias de Error
// (ex: erros de rede/fetch, que trafegam como objetos { message }).
function getErrorMessage(err: unknown): string | undefined {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return undefined
}

// Hook que baixa, faz cache local e expõe busca na base ANVISA de medicamentos.
// 119 C: a carga e a lista vivem num store de módulo compartilhado; o hook só lê (1 leitura de
// disco, ≤1 consulta de versão e 1 cópia por execução, qualquer que seja o número de consumidores).
// Fluxo:
//   1. Primeiro mount: lê manifest cacheado em AsyncStorage (via storage adapter)
//   2. Busca remoto manifest.json em background
//   3. Se versão remota difere ou cache vazio: baixa medicineDatabase.json
//      e atualiza o cache
//   4. TTL 7 dias força re-check mesmo com versão igual
//
// Falha de rede → degradação graciosa: form continua funcional sem autocomplete.
//
// 037 Slice 2: a lógica pura (fetch/timeout, manifest/TTL, normalize, match) vive
// em `@dosiq/core` (CON-027/ADR-073), compartilhada com a web; aqui o hook só orquestra
// a UX de 2 fases (cache instantâneo + refresh em background) e a persistência via
// `_asyncStorageAdapter` (AsyncStorage). Comportamento idêntico ao anterior.
//
// Uso:
//   const { search, getByName, isReady, isLoading, lastUpdated, error } = useMedicineDatabase()
//   const results = search('paracetamol', 10)

// Subdomínio do Supabase vem do env (EXPO_PUBLIC_SUPABASE_URL via nativePublicAppConfig),
// nunca hardcoded — repo é opensource público.
export const ANVISA_BASE_URL = `${nativePublicAppConfig.supabaseUrl}/storage/v1/object/public/dosiq-assets/anvisa/v1`

// Mínimo de letras para buscar (066 E, C-8): uma fonte só para a busca e para quem mostra o aviso —
// o fluxo da busca 2C liberava com 2 e a base devolvia vazio ("Nenhum resultado" enganoso).
export const MIN_SEARCH_CHARS = 3

const FILE_KEY = 'medicineDatabase'

const TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 dias

const storageAdapter = createAsyncStorageAdapter()

// Persiste novo manifest+data via adapter; retorna manifestToCache (com cachedAt).
async function persistRemote(remoteManifest: CachedManifest, remoteData: unknown) {
  const manifestToCache: CachedManifest = {
    ...remoteManifest,
    cachedAt: getNow().toISOString(),
  }
  await storageAdapter.write(FILE_KEY, { manifest: manifestToCache, data: remoteData })
  return manifestToCache
}

interface NormalizedEntry {
  med: Medicine
  nName: string
  nIngredient: string
}

// 119 C (FR-012/013): snapshot imutável do store — trocado só quando o estado muda, para o
// `useSyncExternalStore` comparar por referência (snapshot novo a cada leitura = render em loop).
interface MedicineDatabaseSnapshot {
  database: Medicine[] | null
  normalized: NormalizedEntry[] | null
  manifest: CachedManifest | null
  isLoading: boolean
  error: string | null
}

interface StoreEntry {
  snapshot: MedicineDatabaseSnapshot
  promise: Promise<void> | null
  listeners: Set<() => void>
}

const INITIAL_SNAPSHOT: MedicineDatabaseSnapshot = {
  database: null,
  normalized: null,
  manifest: null,
  isLoading: true,
  error: null,
}

// Store de módulo, um por baseUrl (E-4): uma carga em andamento por vez (E-1) e a lista
// normalizada 1× (E-2), compartilhadas por todo consumidor do hook (form, onboarding, detalhe).
const stores = new Map<string, StoreEntry>()

function getEntry(baseUrl: string): StoreEntry {
  let entry = stores.get(baseUrl)
  if (!entry) {
    entry = { snapshot: INITIAL_SNAPSHOT, promise: null, listeners: new Set() }
    stores.set(baseUrl, entry)
  }
  return entry
}

function update(entry: StoreEntry, patch: Partial<MedicineDatabaseSnapshot>) {
  const next = { ...entry.snapshot, ...patch }
  // Pré-normaliza nome e princípio ativo uma única vez por lista (evita NFD + regex em ~6800
  // registros a cada keystroke e, desde a 119 C, uma cópia normalizada por consumidor).
  if (patch.database !== undefined && patch.database !== entry.snapshot.database) {
    next.normalized = patch.database
      ? patch.database.map((med) => ({
          med,
          nName: normalizeText(med.name),
          nIngredient: normalizeText(med.activeIngredient),
        }))
      : null
  }
  entry.snapshot = next
  entry.listeners.forEach((listener) => listener())
}

// Mesmo fluxo de antes (cache local → manifest → download se preciso), agora 1× por store.
// Sem `canceled`: desmontar no meio não descarta o resultado — o próximo consumidor o recebe (E-6).
async function bootstrap(entry: StoreEntry, baseUrl: string, ttlMs: number) {
  let hasData = entry.snapshot.database !== null
  try {
    // 1. Cache local primeiro (UX instantânea)
    const cached = (await storageAdapter.read(FILE_KEY)) as
      | { manifest: CachedManifest; data: Medicine[] }
      | null
    if (cached) {
      update(entry, { manifest: cached.manifest, database: cached.data, isLoading: false })
      hasData = true
    }

    // 2. Background: busca remoto e decide se re-download é necessário
    try {
      const remoteManifest = (await fetchJson(`${baseUrl}/manifest.json`)) as CachedManifest
      const refresh = shouldRefreshCache({
        remoteManifest,
        cachedManifest: cached?.manifest,
        ttlMs,
        hasData,
      })

      if (refresh) {
        const remoteData = (await fetchJson(
          resolveDataUrl(baseUrl, remoteManifest, FILE_KEY),
        )) as Medicine[]
        const manifestToCache = await persistRemote(remoteManifest, remoteData)
        update(entry, { manifest: manifestToCache, database: remoteData, error: null })
      }
    } catch (fetchErr) {
      // Degradação graciosa: se já tem cache, ignora erro de rede
      if (!hasData) {
        const message = getErrorMessage(fetchErr)
        update(entry, { error: message || 'Falha ao baixar base ANVISA' })
      }
    }
  } finally {
    entry.promise = null
    if (entry.snapshot.isLoading) update(entry, { isLoading: false })
  }
}

// Dispara a carga quando ainda não houve nenhuma, ou quando a última falhou SEM dados (E-3:
// o próximo assinante novo tenta de novo, como cada mount fazia). Após sucesso não reconsulta
// a versão nesta execução do app (E-7). O gatilho é a assinatura (mount), nunca o import (INV-7).
function ensureLoaded(entry: StoreEntry, baseUrl: string, ttlMs: number) {
  if (entry.promise) return
  const { snapshot } = entry
  const neverLoaded = snapshot === INITIAL_SNAPSHOT
  const failedWithoutData = snapshot.database === null && snapshot.error !== null
  if (!neverLoaded && !failedWithoutData) return
  if (failedWithoutData) update(entry, { isLoading: true, error: null })
  entry.promise = bootstrap(entry, baseUrl, ttlMs)
}

/** Só para testes (E-5): zera o store de módulo entre cenários. */
export function __resetMedicineDatabaseStore() {
  stores.clear()
}

interface UseMedicineDatabaseOptions {
  baseUrl?: string
  /** Vale só na carga que cria o store deste baseUrl (E-4). */
  ttlMs?: number
}

export function useMedicineDatabase({
  baseUrl = ANVISA_BASE_URL,
  ttlMs = TTL_MS,
}: UseMedicineDatabaseOptions = {}) {
  // States
  const entry = getEntry(baseUrl)
  // Memo (não useCallback) para respeitar a ordem R-010: o snapshot alimenta os memos abaixo.
  const { subscribe, getSnapshot } = useMemo(
    () => ({
      subscribe: (listener: () => void) => {
        entry.listeners.add(listener)
        ensureLoaded(entry, baseUrl, ttlMs)
        return () => {
          entry.listeners.delete(listener)
        }
      },
      getSnapshot: () => entry.snapshot,
    }),
    [entry, baseUrl, ttlMs],
  )
  const { database, normalized: normalizedDatabase, manifest, isLoading, error } =
    useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  // Memos (R-010: declarados antes de Effects e Handlers)
  const lastUpdated = useMemo(
    () => (manifest?.cachedAt ? parseISO(manifest.cachedAt) : null),
    [manifest],
  )

  // Handlers
  // Busca autocomplete: word-boundary prefix em name OU activeIngredient.
  // Ranking: matches no name vêm antes dos só-em-activeIngredient.
  // Early break: para de iterar assim que atinge o limite total.
  const search = useCallback(
    (query: string | null | undefined, limit = 10): Medicine[] => {
      if (!normalizedDatabase || !query || query.trim().length < MIN_SEARCH_CHARS) return []
      const q = normalizeText(query)
      const nameMatches: Medicine[] = []
      const ingredientMatches: Medicine[] = []
      for (const entry of normalizedDatabase) {
        if (matchesPrefix(entry.nName, q)) {
          nameMatches.push(entry.med)
          if (nameMatches.length + ingredientMatches.length >= limit) break
          continue
        }
        if (matchesPrefix(entry.nIngredient, q)) {
          ingredientMatches.push(entry.med)
          if (nameMatches.length + ingredientMatches.length >= limit) break
        }
      }
      return [...nameMatches, ...ingredientMatches].slice(0, limit)
    },
    [normalizedDatabase],
  )

  const getByName = useCallback(
    (name: string | null | undefined): Medicine | null => {
      if (!normalizedDatabase || !name) return null
      const n = normalizeText(name)
      const exact = normalizedDatabase.find((entry) => entry.nName === n)
      if (exact) return exact.med
      const partial = normalizedDatabase.find((entry) => entry.nName.includes(n))
      return partial ? partial.med : null
    },
    [normalizedDatabase],
  )

  return {
    search,
    getByName,
    // 119 B: base crua para as sugestões dos campos (o índice de sugestão é montado por quem usa).
    items: database,
    isReady: database !== null,
    isLoading,
    lastUpdated,
    error,
  }
}

export default useMedicineDatabase
