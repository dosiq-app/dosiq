// Fronteiras mockadas: adapter em disco (Map) e fetch. Núcleo cmed e helpers do core são os reais.
const mockCache = new Map<string, { manifest: unknown; data: unknown }>()
const mockWriteFail = { on: false }
const mockReads = { count: 0 }
const mockWriteGate: { wait: Promise<void> | null } = { wait: null }
jest.mock('@shared/services/_fileSystemStorageAdapter', () => ({
  createFileSystemStorageAdapter: () => ({
    read: jest.fn(async (k: string, opts?: { timings?: { readMs?: number; parseMs?: number } }) => {
      mockReads.count += 1
      const hit = mockCache.get(k) ?? null
      if (hit && opts?.timings) {
        opts.timings.readMs = 7
        opts.timings.parseMs = 3
      }
      return hit
    }),
    write: jest.fn(async (k: string, v: { manifest: unknown; data: unknown }) => {
      if (mockWriteGate.wait) await mockWriteGate.wait
      if (mockWriteFail.on) throw new Error('ENOSPC')
      mockCache.set(k, v)
    }),
  }),
}))

// Mapa EAN espionado: a carga do índice não pode montá-lo (129 PO-3).
jest.mock('@dosiq/core', () => {
  const actual = jest.requireActual('@dosiq/core')
  return {
    ...actual,
    buildEanLookup: jest.fn(actual.buildEanLookup),
    getEanLookup: jest.fn(actual.getEanLookup),
  }
})

jest.mock('@dosiq/core/utils/dateUtils', () => {
  const actual = jest.requireActual('@dosiq/core/utils/dateUtils')
  return { ...actual, getNow: () => new Date('2026-10-13T12:00:00.000Z') }
})

import { renderHook, waitFor } from '@testing-library/react-native'
import fixture from '@dosiq/core/services/cmed/__tests__/fixtures/cmed-fixture.json'
import { buildEanLookup, getEanLookup } from '@dosiq/core'
import { useCmedIndex, resetCmedIndexMemory, handleCmedAppState } from '../useCmedIndex'

global.fetch = jest.fn() as unknown as typeof fetch
const fetchMock = global.fetch as unknown as jest.Mock

const BASE = 'https://test/anvisa/v1'
const remoteManifest = {
  version: '1.1.11',
  files: { cmedIndex: { path: 'anvisa/v1/cmedIndex.json' } },
}
const ok = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) })

function routeFetch(routes: Record<string, () => Promise<unknown>>) {
  fetchMock.mockImplementation((url: string) => {
    const key = Object.keys(routes).find((suffix) => url.endsWith(suffix))
    return key ? routes[key]() : Promise.reject(new Error(`rota inesperada ${url}`))
  })
}

function seedCache(manifest: Record<string, unknown> = {}, data: unknown = fixture) {
  mockCache.set('cmedIndex', {
    manifest: { ...remoteManifest, cachedAt: '2026-10-13T11:00:00.000Z', ...manifest },
    data,
  })
}

const render = (opts = {}) => renderHook(() => useCmedIndex({ baseUrl: BASE, ...opts }))

describe('useCmedIndex — carga sob demanda do índice CMED (FR-023)', () => {
  beforeEach(() => {
    mockCache.clear()
    mockWriteFail.on = false
    mockWriteGate.wait = null
    mockReads.count = 0
    resetCmedIndexMemory()
  })
  afterEach(() => {
    jest.clearAllMocks()
    jest.clearAllTimers()
  })

  it('enabled=false: idle e nenhum I/O', async () => {
    const { result } = render({ enabled: false })
    expect(result.current.status).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('desabilitar depois de pronto solta o índice (idle)', async () => {
    seedCache()
    routeFetch({ 'manifest.json': () => ok(remoteManifest) })
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useCmedIndex({ baseUrl: BASE, enabled }),
      { initialProps: { enabled: true } },
    )
    await waitFor(() => expect(result.current.status).toBe('ready'))
    rerender({ enabled: false })
    expect(result.current).toEqual({ status: 'idle', index: null })
  })

  it('sem cache: preparing → baixa, grava em disco, ready sem montar o mapa EAN (129 PO-3)', async () => {
    routeFetch({ 'manifest.json': () => ok(remoteManifest), 'cmedIndex.json': () => ok(fixture) })
    const { result } = render()
    expect(result.current.status).toBe('preparing')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.index?.n).toBe((fixture as { n: number }).n)
    expect(result.current).not.toHaveProperty('lookup')
    expect(buildEanLookup).not.toHaveBeenCalled()
    expect(getEanLookup).not.toHaveBeenCalled()
    expect(mockCache.get('cmedIndex')?.manifest).toMatchObject({ version: '1.1.11', cachedAt: '2026-10-13T12:00:00.000Z' })
  })

  it('carga do disco também não monta o mapa EAN (129 PO-3)', async () => {
    seedCache()
    routeFetch({ 'manifest.json': () => ok(remoteManifest) })
    const { result } = render()
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(buildEanLookup).not.toHaveBeenCalled()
    expect(getEanLookup).not.toHaveBeenCalled()
  })

  it('rede: índice pronto antes da gravação em disco terminar (129 FR-008)', async () => {
    let release: () => void = () => {}
    mockWriteGate.wait = new Promise<void>((resolve) => {
      release = resolve
    })
    routeFetch({ 'manifest.json': () => ok(remoteManifest), 'cmedIndex.json': () => ok(fixture) })
    const onLoaded = jest.fn()
    const { result } = render({ onLoaded })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(mockCache.has('cmedIndex')).toBe(false)
    expect(onLoaded).not.toHaveBeenCalled()
    release()
    await waitFor(() => expect(onLoaded).toHaveBeenCalledTimes(1))
    expect(mockCache.has('cmedIndex')).toBe(true)
    const info = onLoaded.mock.calls[0][0]
    expect(info.writeMs).toBeGreaterThanOrEqual(0)
  })

  it('leitura do disco só começa depois de dois quadros (129 PO-7 · C-C5)', async () => {
    const frames: FrameRequestCallback[] = []
    const rafSpy = jest
      .spyOn(global, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => frames.push(cb))
    seedCache()
    routeFetch({ 'manifest.json': () => ok(remoteManifest) })
    const { result } = render()
    expect(result.current.status).toBe('preparing')
    await waitFor(() => expect(frames).toHaveLength(1))
    expect(mockReads.count).toBe(0)
    frames.shift()?.(0)
    expect(frames).toHaveLength(1)
    expect(mockReads.count).toBe(0)
    frames.shift()?.(16)
    await waitFor(() => expect(result.current.status).toBe('ready'))
    rafSpy.mockRestore()
  })

  it('onLoaded (PO-8): rede → source network com tempo e linhas; disco → source disk', async () => {
    routeFetch({ 'manifest.json': () => ok(remoteManifest), 'cmedIndex.json': () => ok(fixture) })
    const onLoaded = jest.fn()
    const first = render({ onLoaded })
    await waitFor(() => expect(first.result.current.status).toBe('ready'))
    expect(onLoaded).toHaveBeenCalledWith(expect.objectContaining({ source: 'network', status: 'ready', rowCount: (fixture as { n: number }).n }))
    expect(onLoaded.mock.calls[0][0].durationMs).toBeGreaterThanOrEqual(0)
    first.unmount()
    resetCmedIndexMemory() // app reaberto: a memória se foi, o disco ficou

    onLoaded.mockClear()
    const second = render({ onLoaded })
    await waitFor(() => expect(second.result.current.status).toBe('ready'))
    expect(onLoaded).toHaveBeenCalledWith(expect.objectContaining({ source: 'disk', status: 'ready' }))
  })

  describe('fases da carga (129 PO-1)', () => {
    const PHASES = ['yieldMs', 'readMs', 'parseMs', 'fetchMs', 'decodeMs', 'eanMs', 'writeMs'] as const
    // Relógio controlado: cada leitura avança 5 ms.
    let clock = 0
    let nowSpy: jest.SpyInstance
    beforeEach(() => {
      clock = 0
      nowSpy = jest.spyOn(performance, 'now').mockImplementation(() => (clock += 5))
    })
    afterEach(() => nowSpy.mockRestore())

    function phaseSum(info: Record<string, number | undefined>) {
      return PHASES.reduce((sum, key) => sum + (info[key] ?? 0), 0)
    }

    it('disco: yield, leitura, parse e decode ≥ 0, soma ≤ duration_ms; campos antigos iguais', async () => {
      seedCache()
      routeFetch({ 'manifest.json': () => ok(remoteManifest) })
      const onLoaded = jest.fn()
      const { result } = render({ onLoaded })
      await waitFor(() => expect(result.current.status).toBe('ready'))
      const info = onLoaded.mock.calls[0][0]
      expect(info).toMatchObject({ source: 'disk', status: 'ready', rowCount: (fixture as { n: number }).n })
      for (const key of ['yieldMs', 'readMs', 'parseMs', 'decodeMs'] as const) {
        expect(info[key]).toBeGreaterThanOrEqual(0)
      }
      expect(info.eanMs).toBeUndefined()
      expect(info.readMs).toBe(7)
      expect(info.parseMs).toBe(3)
      expect(info.fetchMs).toBeUndefined()
      expect(info.writeMs).toBeUndefined()
      expect(phaseSum(info)).toBeLessThanOrEqual(info.durationMs + PHASES.length)
    })

    it('rede: fetch, decode e gravação ≥ 0, sem fases de disco, soma ≤ duration_ms', async () => {
      routeFetch({ 'manifest.json': () => ok(remoteManifest), 'cmedIndex.json': () => ok(fixture) })
      const onLoaded = jest.fn()
      const { result } = render({ onLoaded })
      await waitFor(() => expect(result.current.status).toBe('ready'))
      const info = onLoaded.mock.calls[0][0]
      expect(info.source).toBe('network')
      for (const key of ['fetchMs', 'decodeMs', 'writeMs'] as const) {
        expect(info[key]).toBeGreaterThanOrEqual(0)
      }
      expect(info.readMs).toBeUndefined()
      expect(phaseSum(info)).toBeLessThanOrEqual(info.durationMs + PHASES.length)
    })

    it('rede caiu sem cache: offline sem fases de decode', async () => {
      fetchMock.mockRejectedValue(new TypeError('Network request failed'))
      const onLoaded = jest.fn()
      const { result } = render({ onLoaded })
      await waitFor(() => expect(result.current.status).toBe('offline'))
      const info = onLoaded.mock.calls[0][0]
      expect(info.decodeMs).toBeUndefined()
      expect(info.durationMs).toBeGreaterThanOrEqual(0)
    })
  })

  it('2ª abertura na mesma sessão: ready no 1º render, sem ler o disco nem reportar carga (C-C6)', async () => {
    seedCache()
    routeFetch({ 'manifest.json': () => ok(remoteManifest) })
    const first = render()
    await waitFor(() => expect(first.result.current.status).toBe('ready'))
    first.unmount()
    mockCache.clear()

    const onLoaded = jest.fn()
    const second = render({ onLoaded })
    expect(second.result.current.status).toBe('ready')
    expect(second.result.current.index?.n).toBe((fixture as { n: number }).n)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(onLoaded).not.toHaveBeenCalled()
  })

  it('app em background solta a memória: a próxima abertura volta a ler o disco (LG K8)', async () => {
    seedCache()
    routeFetch({ 'manifest.json': () => ok(remoteManifest) })
    const first = render()
    await waitFor(() => expect(first.result.current.status).toBe('ready'))
    first.unmount()
    handleCmedAppState('inactive')
    expect(render().result.current.status).toBe('ready')
    handleCmedAppState('background')
    const third = render()
    expect(third.result.current.status).toBe('preparing')
    await waitFor(() => expect(third.result.current.status).toBe('ready'))
  })

  it('onLoaded: sem cache + rede cai ⇒ reporta offline', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'))
    const onLoaded = jest.fn()
    const { result } = render({ onLoaded })
    await waitFor(() => expect(result.current.status).toBe('offline'))
    expect(onLoaded).toHaveBeenCalledWith(expect.objectContaining({ source: 'network', status: 'offline', rowCount: 0 }))
  })

  it('cache fresco e mesma versão: ready sem baixar o índice', async () => {
    seedCache()
    routeFetch({ 'manifest.json': () => ok(remoteManifest) })
    const { result } = render()
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })

  it('cache presente + rede cai: ready com o cache', async () => {
    seedCache()
    fetchMock.mockRejectedValue(new TypeError('Network request failed'))
    const { result } = render()
    await waitFor(() => expect(result.current.status).toBe('ready'))
  })

  it('sem cache + rede cai: offline', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'))
    const { result } = render()
    await waitFor(() => expect(result.current.status).toBe('offline'))
    expect(result.current.index).toBeNull()
  })

  it('sem cache + HTTP 404: failed', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 })
    const { result } = render()
    await waitFor(() => expect(result.current.status).toBe('failed'))
  })

  it('v desconhecido: version', async () => {
    routeFetch({ 'manifest.json': () => ok(remoteManifest), 'cmedIndex.json': () => ok({ ...fixture, v: 2 }) })
    const { result } = render()
    await waitFor(() => expect(result.current.status).toBe('version'))
  })

  it('shape inválido: failed', async () => {
    routeFetch({ 'manifest.json': () => ok(remoteManifest), 'cmedIndex.json': () => ok({ v: 1 }) })
    const { result } = render()
    await waitFor(() => expect(result.current.status).toBe('failed'))
  })

  it('cache com v desconhecido + rede cai: version (não offline)', async () => {
    seedCache({}, { ...fixture, v: 2 })
    fetchMock.mockRejectedValue(new TypeError('Network request failed'))
    const { result } = render()
    await waitFor(() => expect(result.current.status).toBe('version'))
  })

  it('versão remota nova: troca o índice', async () => {
    seedCache({ version: '1.1.10' })
    routeFetch({ 'manifest.json': () => ok(remoteManifest), 'cmedIndex.json': () => ok(fixture) })
    const { result } = render()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(mockCache.get('cmedIndex')?.manifest).toMatchObject({ version: '1.1.11' }))
    expect(result.current.status).toBe('ready')
  })

  it('gravação em disco falha: segue ready com o dado em memória', async () => {
    mockWriteFail.on = true
    routeFetch({ 'manifest.json': () => ok(remoteManifest), 'cmedIndex.json': () => ok(fixture) })
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = render()
    await waitFor(() => expect(result.current.status).toBe('ready'))
    warn.mockRestore()
  })

  it('desmontar no meio da carga não atualiza estado', async () => {
    let release: (v: unknown) => void = () => {}
    fetchMock.mockImplementation(() => new Promise((resolve) => { release = resolve }))
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})
    const { unmount } = render()
    unmount()
    release({ ok: true, json: () => Promise.resolve(remoteManifest) })
    await new Promise((r) => setImmediate(r))
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })
})
