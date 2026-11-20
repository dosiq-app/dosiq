import { useMemo, useSyncExternalStore } from 'react'
import {
  getNow,
  fetchJson,
  shouldRefreshCache,
  resolveDataUrl,
  decodeCmedStrengths,
  isStrengthsAligned,
  indexByRegistration,
  type CmedStrengths,
} from '@dosiq/core'
import { createFileSystemStorageAdapter } from '@shared/services/_fileSystemStorageAdapter'
import { ANVISA_BASE_URL } from '@shared/hooks/useMedicineDatabase'

// Sidecar de forças CMED (spec 127 · CON-048 · 125 fatia 2-pré · ADR-107 emenda).
//
// Mesmo fluxo em 2 fases do useCmedIndex (disco → manifest → baixa se preciso), com o store de
// módulo do useMedicineDatabase: uma carga por baseUrl, N consumidores. Diferente do cmedIndex
// (~4 MB), o sidecar (~0,5 MB) fica na memória da sessão — NÃO solta ao ir para background: a
// Hoje o consulta a cada abertura. 3ª cópia do carregador: extração comum é dívida da fatia app
// da 127 (125 RC3 E-1).
//
// Só é lido junto do manifest com que foi baixado (`isStrengthsAligned`): versão diferente ou
// `medCount` ≠ itens ⇒ `unavailable`, nunca `ready` com posições deslocadas.

export type CmedStrengthsStatus = 'idle' | 'loading' | 'ready' | 'unavailable'
export type CmedStrengthsUnavailableReason = 'offline' | 'failed' | 'version' | 'misaligned'

export interface CmedStrengthsState {
  status: CmedStrengthsStatus
  strengths: CmedStrengths | null
  byRegistration: Map<string, number> | null
  reason: CmedStrengthsUnavailableReason | null
}

interface CachedManifest {
  version?: string
  cachedAt?: string
  files?: Record<string, { path?: string }>
  [key: string]: unknown
}

interface StoreEntry {
  state: CmedStrengthsState
  manifest: CachedManifest | undefined
  promise: Promise<void> | null
  listeners: Set<() => void>
}

interface UseCmedStrengthsOptions {
  enabled?: boolean
  baseUrl?: string
  /** Vale só na carga que cria o store deste baseUrl. */
  ttlMs?: number
}

const FILE_KEY = 'cmedStrengths'
const TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 dias

const storageAdapter = createFileSystemStorageAdapter()

const IDLE: CmedStrengthsState = { status: 'idle', strengths: null, byRegistration: null, reason: null }
const LOADING: CmedStrengthsState = { status: 'loading', strengths: null, byRegistration: null, reason: null }

const stores = new Map<string, StoreEntry>()

/** Só para testes: zera o store de módulo entre cenários. */
export function __resetCmedStrengthsStore() {
  stores.clear()
}

function getEntry(baseUrl: string): StoreEntry {
  let entry = stores.get(baseUrl)
  if (!entry) {
    entry = { state: LOADING, manifest: undefined, promise: null, listeners: new Set() }
    stores.set(baseUrl, entry)
  }
  return entry
}

function unavailable(reason: CmedStrengthsUnavailableReason): CmedStrengthsState {
  return { status: 'unavailable', strengths: null, byRegistration: null, reason }
}

// Decodifica e confere o alinhamento com o manifest que acompanhou o arquivo.
function toState(raw: unknown, manifestVersion: unknown): CmedStrengthsState {
  const decoded = decodeCmedStrengths(raw)
  if (decoded.ok === false) return unavailable(decoded.reason === 'version' ? 'version' : 'failed')
  if (!isStrengthsAligned(decoded.strengths, manifestVersion)) return unavailable('misaligned')
  return {
    status: 'ready',
    strengths: decoded.strengths,
    byRegistration: indexByRegistration(decoded.strengths),
    reason: null,
  }
}

// fetchJson lança `HTTP <status> em <url>` quando o servidor responde; o resto é rede/timeout.
function isHttpError(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith('HTTP ')
}

function publish(entry: StoreEntry, state: CmedStrengthsState, manifest?: CachedManifest) {
  entry.state = state
  if (manifest) entry.manifest = manifest
  entry.listeners.forEach((listener) => listener())
}

// Sem `canceled`: desmontar no meio não descarta o resultado — o próximo consumidor o recebe.
async function bootstrap(entry: StoreEntry, baseUrl: string, ttlMs: number) {
  let hasData = entry.state.status === 'ready'
  let fallback: CmedStrengthsState | null = null
  try {
    // 1. Cache em disco
    if (!hasData) {
      const cached = (await storageAdapter.read(FILE_KEY)) as
        | { manifest: CachedManifest; data: unknown }
        | null
      if (cached) {
        const cachedState = toState(cached.data, cached.manifest?.version)
        if (cachedState.status === 'ready') {
          publish(entry, cachedState, cached.manifest)
          hasData = true
        } else {
          fallback = cachedState
        }
      }
    }

    // 2. Revalida no remoto
    try {
      const remoteManifest = (await fetchJson(`${baseUrl}/manifest.json`)) as CachedManifest
      const refresh = shouldRefreshCache({
        remoteManifest,
        cachedManifest: entry.manifest,
        ttlMs,
        hasData,
      })
      if (!refresh) return
      const remoteData = await fetchJson(resolveDataUrl(baseUrl, remoteManifest, FILE_KEY))
      const nextState = toState(remoteData, remoteManifest.version)
      if (nextState.status === 'ready') {
        const manifestToCache = { ...remoteManifest, cachedAt: getNow().toISOString() }
        publish(entry, nextState, manifestToCache)
        try {
          await storageAdapter.write(FILE_KEY, { manifest: manifestToCache, data: remoteData })
        } catch (writeErr) {
          // Sem disco a sessão segue com o sidecar em memória; a próxima abertura baixa de novo.
          console.warn('[useCmedStrengths] gravação do cache falhou:', (writeErr as Error)?.message)
        }
      } else if (!hasData) {
        // Arquivo novo inválido não derruba um sidecar íntegro já em uso.
        publish(entry, nextState)
      }
    } catch (fetchErr) {
      if (hasData) return
      publish(entry, fallback ?? unavailable(isHttpError(fetchErr) ? 'failed' : 'offline'))
    }
  } catch (err) {
    // Disco ilegível etc.: falha fechada, sem exceção para a tela.
    if (!hasData) publish(entry, unavailable('failed'))
    console.warn('[useCmedStrengths] carga falhou:', (err as Error)?.message)
  } finally {
    entry.promise = null
  }
}

// Carrega na 1ª assinatura, ou de novo quando a última terminou indisponível (o próximo
// assinante novo tenta outra vez). Após `ready` não reconsulta nesta execução do app.
function ensureLoaded(entry: StoreEntry, baseUrl: string, ttlMs: number) {
  if (entry.promise || entry.state.status === 'ready') return
  if (entry.state.status === 'unavailable') publish(entry, LOADING)
  entry.promise = bootstrap(entry, baseUrl, ttlMs)
}

export function useCmedStrengths({
  enabled = true,
  baseUrl = ANVISA_BASE_URL,
  ttlMs = TTL_MS,
}: UseCmedStrengthsOptions = {}): CmedStrengthsState {
  // Memos
  const { subscribe, getSnapshot } = useMemo(() => {
    if (!enabled) {
      return { subscribe: () => () => {}, getSnapshot: () => IDLE }
    }
    const entry = getEntry(baseUrl)
    return {
      subscribe: (listener: () => void) => {
        entry.listeners.add(listener)
        ensureLoaded(entry, baseUrl, ttlMs)
        return () => {
          entry.listeners.delete(listener)
        }
      },
      getSnapshot: () => entry.state,
    }
  }, [enabled, baseUrl, ttlMs])

  return useSyncExternalStore(subscribe, getSnapshot)
}

export default useCmedStrengths
