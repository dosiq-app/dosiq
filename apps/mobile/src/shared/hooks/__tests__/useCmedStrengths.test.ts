// Fronteiras mockadas: adapter em disco (Map), fetch e AppState. Núcleo cmedStrengths e helpers do
// core são os reais.
const mockCache = new Map<string, { manifest: unknown; data: unknown }>()
const mockWriteFail = { on: false }
jest.mock('@shared/services/_fileSystemStorageAdapter', () => ({
  createFileSystemStorageAdapter: () => ({
    read: jest.fn(async (k: string) => mockCache.get(k) ?? null),
    write: jest.fn(async (k: string, v: { manifest: unknown; data: unknown }) => {
      if (mockWriteFail.on) throw new Error('ENOSPC')
      mockCache.set(k, v)
    }),
  }),
}))

jest.mock('@dosiq/core/utils/dateUtils', () => {
  const actual = jest.requireActual('@dosiq/core/utils/dateUtils')
  return { ...actual, getNow: () => new Date('2026-11-19T12:00:00.000Z') }
})

import { act, renderHook, waitFor } from '@testing-library/react-native'
import { AppState } from 'react-native'
import { strengthEntriesFor } from '@dosiq/core'
import fixture from '@dosiq/core/services/cmed/__tests__/fixtures/cmed-strengths-fixture.json'
import { useCmedStrengths, __resetCmedStrengthsStore } from '../useCmedStrengths'

global.fetch = jest.fn() as unknown as typeof fetch
const fetchMock = global.fetch as unknown as jest.Mock

const BASE = 'https://test/anvisa/v1'
const remoteManifest = {
  version: '1.3.0',
  files: { cmedStrengths: { path: 'anvisa/v1/cmedStrengths.json' } },
}
const ok = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) })
const httpError = () => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })
const offline = () => Promise.reject(new TypeError('Network request failed'))

function routeFetch(routes: Record<string, () => Promise<unknown>>) {
  fetchMock.mockImplementation((url: string) => {
    const key = Object.keys(routes).find((suffix) => url.endsWith(suffix))
    return key ? routes[key]() : Promise.reject(new Error(`rota inesperada ${url}`))
  })
}

function seedCache(manifest: Record<string, unknown> = {}, data: unknown = fixture) {
  mockCache.set('cmedStrengths', {
    manifest: { ...remoteManifest, cachedAt: '2026-11-19T11:00:00.000Z', ...manifest },
    data,
  })
}

const render = (opts = {}) => renderHook(() => useCmedStrengths({ baseUrl: BASE, ...opts }))

describe('useCmedStrengths — sidecar de forças na sessão (PO-125-31)', () => {
  beforeEach(() => {
    mockCache.clear()
    mockWriteFail.on = false
    __resetCmedStrengthsStore()
  })
  afterEach(() => {
    jest.clearAllMocks()
    jest.clearAllTimers()
  })

  it('enabled=false: idle e nenhum I/O', () => {
    const { result } = render({ enabled: false })
    expect(result.current.status).toBe('idle')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sem cache: loading → baixa, grava em disco, ready com busca por registro', async () => {
    routeFetch({ 'manifest.json': () => ok(remoteManifest), 'cmedStrengths.json': () => ok(fixture) })
    const { result } = render()
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const { strengths, byRegistration } = result.current
    expect(strengthEntriesFor(strengths!, byRegistration!, '112600202').map((e) => e.d)).toEqual([5, 10, 15, 20, 25, 30])
    expect(mockCache.get('cmedStrengths')?.manifest).toMatchObject({ version: '1.3.0', cachedAt: '2026-11-19T12:00:00.000Z' })
  })

  it('offline sem cache ⇒ unavailable(offline)', async () => {
    routeFetch({ 'manifest.json': offline })
    const { result } = render()
    await waitFor(() => expect(result.current.status).toBe('unavailable'))
    expect(result.current.reason).toBe('offline')
    expect(result.current.strengths).toBeNull()
  })

  it('HTTP erro sem cache ⇒ unavailable(failed)', async () => {
    routeFetch({ 'manifest.json': httpError })
    const { result } = render()
    await waitFor(() => expect(result.current.reason).toBe('failed'))
  })

  it('v desconhecido ⇒ unavailable(version)', async () => {
    routeFetch({ 'manifest.json': () => ok(remoteManifest), 'cmedStrengths.json': () => ok({ ...fixture, v: 2 }) })
    const { result } = render()
    await waitFor(() => expect(result.current.reason).toBe('version'))
    expect(mockCache.has('cmedStrengths')).toBe(false)
  })

  it('arquivo de outra versão que o manifest ⇒ unavailable(misaligned), nunca ready', async () => {
    routeFetch({
      'manifest.json': () => ok({ ...remoteManifest, version: '1.3.1' }),
      'cmedStrengths.json': () => ok(fixture),
    })
    const { result } = render()
    await waitFor(() => expect(result.current.status).toBe('unavailable'))
    expect(result.current.reason).toBe('misaligned')
  })

  it('medCount ≠ itens ⇒ unavailable(misaligned)', async () => {
    routeFetch({ 'manifest.json': () => ok(remoteManifest), 'cmedStrengths.json': () => ok({ ...fixture, medCount: 8 }) })
    const { result } = render()
    await waitFor(() => expect(result.current.reason).toBe('misaligned'))
  })

  it('cache íntegro + rede caída ⇒ ready do disco', async () => {
    seedCache()
    routeFetch({ 'manifest.json': offline })
    const { result } = render()
    await waitFor(() => expect(result.current.status).toBe('ready'))
  })

  it('cache desalinhado + rede caída ⇒ unavailable(misaligned)', async () => {
    seedCache({ version: '1.2.9' })
    routeFetch({ 'manifest.json': offline })
    const { result } = render()
    await waitFor(() => expect(result.current.reason).toBe('misaligned'))
  })

  it('cache íntegro + remoto novo inválido ⇒ mantém o do cache', async () => {
    seedCache({ version: '1.3.0', cachedAt: '2026-01-01T00:00:00.000Z' })
    routeFetch({
      'manifest.json': () => ok({ ...remoteManifest, version: '1.4.0' }),
      'cmedStrengths.json': () => ok({ ...fixture, v: 2 }),
    })
    const { result } = render()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(result.current.status).toBe('ready')
    expect(result.current.strengths?.version).toBe('1.3.0')
  })

  it('falha na gravação em disco não impede ready', async () => {
    mockWriteFail.on = true
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    routeFetch({ 'manifest.json': () => ok(remoteManifest), 'cmedStrengths.json': () => ok(fixture) })
    const { result } = render()
    await waitFor(() => expect(result.current.status).toBe('ready'))
    warn.mockRestore()
  })

  it('2 consumidores ⇒ 1 download (store de módulo)', async () => {
    routeFetch({ 'manifest.json': () => ok(remoteManifest), 'cmedStrengths.json': () => ok(fixture) })
    const a = render()
    const b = render()
    await waitFor(() => expect(a.result.current.status).toBe('ready'))
    await waitFor(() => expect(b.result.current.status).toBe('ready'))
    const downloads = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('cmedStrengths.json'))
    expect(downloads).toHaveLength(1)
  })

  it('ir para background não solta o sidecar (ADR-107 emenda)', async () => {
    routeFetch({ 'manifest.json': () => ok(remoteManifest), 'cmedStrengths.json': () => ok(fixture) })
    const { result, unmount } = render()
    await waitFor(() => expect(result.current.status).toBe('ready'))
    act(() => {
      ;(AppState as unknown as { currentState: string }).currentState = 'background'
    })
    unmount()
    const again = render()
    expect(again.result.current.status).toBe('ready')
  })

  it('indisponível + novo assinante ⇒ tenta de novo', async () => {
    routeFetch({ 'manifest.json': offline })
    const first = render()
    await waitFor(() => expect(first.result.current.status).toBe('unavailable'))
    first.unmount()
    routeFetch({ 'manifest.json': () => ok(remoteManifest), 'cmedStrengths.json': () => ok(fixture) })
    const second = render()
    await waitFor(() => expect(second.result.current.status).toBe('ready'))
  })
})
