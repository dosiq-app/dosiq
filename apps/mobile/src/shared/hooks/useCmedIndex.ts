import { useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import {
  getNow,
  fetchJson,
  shouldRefreshCache,
  resolveDataUrl,
  decodeCmedIndex,
  type CmedIndex,
} from '@dosiq/core'
import { createFileSystemStorageAdapter, type StorageReadTimings } from '@shared/services/_fileSystemStorageAdapter'
import { ANVISA_BASE_URL } from '@shared/hooks/useMedicineDatabase'

// Carga sob demanda do índice CMED (066 Slice B · FR-022/FR-023 · ADR-107).
//
// Só montar nas telas do cadastro (passo 2 da busca 2C, scanner): nunca no boot. O índice
// (~4 MB, 26 mil linhas) fica em memória no módulo depois da 1ª carga da sessão (C-C6: ler e
// parsear o disco a cada abertura do sheet custava 1,4–8 s nos Android do smoke). Solta ao ir
// para background: aparelho com pouca RAM (LG K8) mata primeiro o app que segura memória parado.
//
// Fluxo (2 fases, como o useMedicineDatabase):
//   1. cache em disco → decodifica → `ready` imediato se íntegro
//   2. manifest remoto → shouldRefreshCache → baixa, troca o índice e grava depois (best-effort)
// O mapa EAN → linhas não é montado aqui: só o scanner precisa (`getEanLookup` do core).
// Estados mapeiam 1:1 para as telas da spec: preparing = f1-prep · offline = x-off ·
// failed = x-idx · version = x-ver.

export type CmedIndexStatus = 'idle' | 'preparing' | 'ready' | 'offline' | 'failed' | 'version'

interface CmedIndexState {
  status: CmedIndexStatus
  index: CmedIndex | null
}

interface CachedManifest {
  version?: string
  cachedAt?: string
  files?: Record<string, { path?: string }>
  [key: string]: unknown
}

interface UseCmedIndexOptions {
  enabled?: boolean
  onLoaded?: (info: CmedIndexLoadInfo) => void
  baseUrl?: string
  ttlMs?: number
}

const FILE_KEY = 'cmedIndex'
const TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 dias

const storageAdapter = createFileSystemStorageAdapter()

const IDLE: CmedIndexState = { status: 'idle', index: null }
const PREPARING: CmedIndexState = { status: 'preparing', index: null }

// Cache de sessão (C-C6): só índice íntegro entra; o manifest acompanha para a revalidação.
let memory: { state: CmedIndexState; manifest: CachedManifest | undefined } | null = null

export function handleCmedAppState(next: string) {
  if (next === 'background') memory = null
}
AppState.addEventListener('change', handleCmedAppState)

/** Só para testes: esvazia o cache de sessão. */
export function resetCmedIndexMemory() {
  memory = null
}

function initialState(enabled: boolean): CmedIndexState {
  if (!enabled) return IDLE
  return memory ? memory.state : PREPARING
}

// Tempo da carga para o PO-8 (066) em release e no campo — o console não chega ao logcat em release.
// O evento é emitido por quem monta o hook (`onLoaded`): o hook é strict island e o wrapper de
// analytics não é.
// Fases (ms, relógio JS) para separar I/O, parse e CPU de decode no aparelho real. Ausente = a
// fase não rodou nesta carga. `durationMs` segue sendo a carga inteira até o índice pronto.
export interface CmedIndexLoadPhases {
  yieldMs?: number
  readMs?: number
  parseMs?: number
  fetchMs?: number
  decodeMs?: number
  eanMs?: number
  writeMs?: number
}

export interface CmedIndexLoadInfo extends CmedIndexLoadPhases {
  source: 'disk' | 'network'
  durationMs: number
  status: CmedIndexStatus
  rowCount: number
}

// Espera o aviso de preparo ser pintado antes do trabalho pesado (ler/parsear ~4 MB na thread JS):
// no LG K8 a tela parecia travada sem o aviso. O 1º quadro aplica o estado; o 2º garante que ele
// foi desenhado. Sem rAF no ambiente, cede um tick.
function yieldFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'function') {
      setTimeout(resolve, 0)
      return
    }
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

// Decodifica uma vez; falha vira o estado de erro da tela.
function toState(raw: unknown, phases: CmedIndexLoadPhases): CmedIndexState {
  const startedAt = performance.now()
  const decoded = decodeCmedIndex(raw)
  phases.decodeMs = performance.now() - startedAt
  if (decoded.ok === false) {
    return { status: decoded.reason === 'version' ? 'version' : 'failed', index: null }
  }
  return { status: 'ready', index: decoded.index }
}

function roundPhases(phases: CmedIndexLoadPhases): CmedIndexLoadPhases {
  const out: CmedIndexLoadPhases = {}
  for (const [key, value] of Object.entries(phases) as [keyof CmedIndexLoadPhases, number | undefined][]) {
    if (typeof value === 'number') out[key] = Math.max(0, Math.round(value))
  }
  return out
}

// fetchJson lança `HTTP <status> em <url>` quando o servidor responde; o resto é rede/timeout.
function isHttpError(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith('HTTP ')
}

export function useCmedIndex({
  enabled = true,
  baseUrl = ANVISA_BASE_URL,
  ttlMs = TTL_MS,
  onLoaded,
}: UseCmedIndexOptions = {}) {
  // Callback em ref: trocar a função a cada render não pode recarregar o índice.
  const onLoadedRef = useRef(onLoaded)
  // States
  const loadKey = `${enabled}|${baseUrl}|${ttlMs}`
  const [state, setState] = useState<CmedIndexState>(() => initialState(enabled))
  const [prevLoadKey, setPrevLoadKey] = useState(loadKey)

  // Opções mudaram: recomeça já no render (desabilitar solta o índice da memória).
  if (loadKey !== prevLoadKey) {
    setPrevLoadKey(loadKey)
    setState(initialState(enabled))
  }

  // Effects
  useEffect(() => {
    onLoadedRef.current = onLoaded
  }, [onLoaded])

  useEffect(() => {
    if (!enabled) return undefined
    let canceled = false

    function reportLoaded(
      source: 'disk' | 'network',
      durationMs: number,
      loaded: CmedIndexState,
      phases: CmedIndexLoadPhases,
    ) {
      onLoadedRef.current?.({
        ...roundPhases(phases),
        source,
        durationMs: Math.round(durationMs),
        status: loaded.status,
        rowCount: loaded.index?.n ?? 0,
      })
    }

    async function load() {
      const t0 = performance.now()
      let cached: { manifest: CachedManifest | undefined; data?: unknown } | null
      let cachedState: CmedIndexState | null
      if (memory) {
        // 0. Cache de sessão: já está na tela desde o 1º render, sem ler o disco.
        cached = { manifest: memory.manifest }
        cachedState = memory.state
      } else {
        const diskPhases: CmedIndexLoadPhases = {}
        await yieldFrame()
        diskPhases.yieldMs = performance.now() - t0
        if (canceled) return
        // 1. Cache em disco
        const timings: StorageReadTimings = {}
        cached = (await storageAdapter.read(FILE_KEY, { timings })) as { manifest: CachedManifest; data: unknown } | null
        diskPhases.readMs = timings.readMs
        diskPhases.parseMs = timings.parseMs
        if (canceled) return
        cachedState = cached ? toState(cached.data, diskPhases) : null
        if (cachedState?.status === 'ready') {
          memory = { state: cachedState, manifest: cached?.manifest }
          setState(cachedState)
          reportLoaded('disk', performance.now() - t0, cachedState, diskPhases)
        }
      }
      const hasData = cachedState?.status === 'ready'

      // 2. Revalida no remoto
      const netPhases: CmedIndexLoadPhases = {}
      const tNet = performance.now()
      try {
        const remoteManifest = (await fetchJson(`${baseUrl}/manifest.json`)) as CachedManifest
        if (canceled) return
        const refresh = shouldRefreshCache({
          remoteManifest,
          cachedManifest: cached?.manifest,
          ttlMs,
          hasData,
        })
        // Sem cache íntegro (hasData false) shouldRefreshCache é sempre true.
        if (!refresh) return
        const remoteData = await fetchJson(resolveDataUrl(baseUrl, remoteManifest, FILE_KEY))
        netPhases.fetchMs = performance.now() - tNet
        if (canceled) return
        const nextState = toState(remoteData, netPhases)
        // Índice novo inválido não derruba um cache íntegro já na tela.
        if (nextState.status === 'ready' || !hasData) setState(nextState)
        // Pronto = estado na tela; a gravação em disco vem depois e não segura a busca.
        const durationMs = performance.now() - t0
        if (nextState.status === 'ready') {
          const manifest = { ...remoteManifest, cachedAt: getNow().toISOString() }
          memory = { state: nextState, manifest }
          const writeAt = performance.now()
          try {
            await storageAdapter.write(FILE_KEY, { manifest, data: remoteData })
          } catch (writeErr) {
            // Sem disco a sessão segue com o índice em memória; a próxima abertura baixa de novo.
            console.warn('[useCmedIndex] gravação do cache falhou:', (writeErr as Error)?.message)
          }
          netPhases.writeMs = performance.now() - writeAt
        }
        // A carga terminou com o índice na tela: o evento sai mesmo se a tela desmontou na gravação.
        if (!hasData) reportLoaded('network', durationMs, nextState, netPhases)
      } catch (fetchErr) {
        if (canceled || hasData) return
        if (cachedState) {
          setState(cachedState)
          return
        }
        const failed: CmedIndexState = { status: isHttpError(fetchErr) ? 'failed' : 'offline', index: null }
        setState(failed)
        reportLoaded('network', performance.now() - t0, failed, netPhases)
      }
    }

    load()
    return () => {
      canceled = true
    }
  }, [enabled, baseUrl, ttlMs])

  return state
}

export default useCmedIndex
