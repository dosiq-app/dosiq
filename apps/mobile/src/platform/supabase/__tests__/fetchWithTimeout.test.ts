// C-B4 (smoke 084 B): requisição presa não pode prender o cliente Supabase para sempre.

import { createFetchWithTimeout } from '../fetchWithTimeout'

/** fetch falso que só termina quando o signal aborta (conexão morta). */
const hangingFetch = jest.fn(
  (_input: any, init: any) =>
    new Promise((_, reject) => {
      if (init.signal.aborted) return reject(new Error('AbortError')) // como o fetch real
      init.signal.addEventListener('abort', () => reject(new Error('AbortError')))
    }),
)

beforeEach(() => jest.useFakeTimers())
afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
  jest.useRealTimers()
})

describe('createFetchWithTimeout', () => {
  it('requisição presa rejeita após o teto', async () => {
    const f = createFetchWithTimeout(hangingFetch, 1000)
    const p = f('https://x', {})
    const assertion = expect(p).rejects.toThrow('AbortError')
    await jest.advanceTimersByTimeAsync(1000)
    await assertion
  })

  it('resposta antes do teto passa intacta e limpa o timer', async () => {
    const ok = jest.fn(async (_input: any, _init?: any) => ({ status: 200 }))
    const f = createFetchWithTimeout(ok, 1000)
    await expect(f('https://x', { method: 'PATCH' })).resolves.toEqual({ status: 200 })
    expect(ok.mock.calls[0]?.[1]?.method).toBe('PATCH')
    expect(jest.getTimerCount()).toBe(0)
  })

  it('signal do chamador abortado aborta a requisição', async () => {
    const f = createFetchWithTimeout(hangingFetch, 60000)
    const outer = new AbortController()
    const p = f('https://x', { signal: outer.signal })
    outer.abort()
    await expect(p).rejects.toThrow('AbortError')
  })
})
