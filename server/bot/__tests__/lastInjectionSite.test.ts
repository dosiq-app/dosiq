import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchLastInjectionSites, type InjectionSiteClient } from '../reminders/lastInjectionSite.js'

vi.mock('../logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}))

type Row = { user_id: string; injection_site: string | null; taken_at: string }

// Cliente falso que APLICA os filtros da query (não devolve a mesma fixture p/ todo mundo): sem isso
// o teste de 2 usuários passaria por vacuidade.
function fakeClient(rows: Row[], opts: { failFor?: string; throwFor?: string } = {}) {
  const calls: Array<{ userId: string; limit: number }> = []
  const client = {
    from: () => ({
      select: () => ({
        eq: (_c: string, userId: string) => ({
          not: () => ({
            order: (_o: string, { ascending }: { ascending: boolean }) => ({
              limit: (n: number) => {
                calls.push({ userId, limit: n })
                if (opts.throwFor === userId) throw new Error('boom')
                if (opts.failFor === userId) return Promise.resolve({ data: null, error: { code: '57014' } })
                const mine = rows
                  .filter((r) => r.user_id === userId && r.injection_site !== null)
                  .sort((a, b) => (ascending ? 1 : -1) * a.taken_at.localeCompare(b.taken_at))
                  .slice(0, n)
                  .map((r) => ({ injection_site: r.injection_site }))
                return Promise.resolve({ data: mine, error: null })
              },
            }),
          }),
        }),
      }),
    }),
  }
  return { client: client as unknown as InjectionSiteClient, calls }
}

afterEach(() => {
  vi.clearAllMocks()
  vi.clearAllTimers()
})

describe('fetchLastInjectionSites (120 B, PO-SEC-1)', () => {
  const rows: Row[] = [
    // Usuário A e B, MESMO remédio de catálogo, locais diferentes (ataque do RC-SEC S-1).
    { user_id: 'user-a', injection_site: 'coxa_d', taken_at: '2026-11-01T10:00:00Z' },
    { user_id: 'user-a', injection_site: 'abdomen_e', taken_at: '2026-11-08T10:00:00Z' },
    { user_id: 'user-b', injection_site: 'coxa_d', taken_at: '2026-11-09T10:00:00Z' },
    { user_id: 'user-b', injection_site: null, taken_at: '2026-11-10T10:00:00Z' },
  ]

  it('cada usuário recebe só o próprio último local', async () => {
    const { client } = fakeClient(rows)
    const map = await fetchLastInjectionSites(client, ['user-a', 'user-b'])
    expect(map.get('user-a')).toBe('abdomen_e')
    expect(map.get('user-b')).toBe('coxa_d')
  })

  it('uma consulta limit(1) por usuário, sem duplicar ids', async () => {
    const { client, calls } = fakeClient(rows)
    await fetchLastInjectionSites(client, ['user-a', 'user-a', 'user-b'])
    expect(calls).toEqual([{ userId: 'user-a', limit: 1 }, { userId: 'user-b', limit: 1 }])
  })

  it('usuário sem log com local ⇒ fora do Map', async () => {
    const { client } = fakeClient(rows)
    const map = await fetchLastInjectionSites(client, ['user-c'])
    expect(map.has('user-c')).toBe(false)
  })

  it('lista vazia ⇒ nenhuma consulta', async () => {
    const { client, calls } = fakeClient(rows)
    const map = await fetchLastInjectionSites(client, [])
    expect(map.size).toBe(0)
    expect(calls).toHaveLength(0)
  })

  it('erro de banco de um usuário ⇒ fail-open só para ele', async () => {
    const { client } = fakeClient(rows, { failFor: 'user-a' })
    const map = await fetchLastInjectionSites(client, ['user-a', 'user-b'])
    expect(map.has('user-a')).toBe(false)
    expect(map.get('user-b')).toBe('coxa_d')
  })

  it('exceção do cliente ⇒ fail-open, nunca lança', async () => {
    const { client } = fakeClient(rows, { throwFor: 'user-b' })
    const map = await fetchLastInjectionSites(client, ['user-a', 'user-b'])
    expect(map.get('user-a')).toBe('abdomen_e')
    expect(map.has('user-b')).toBe(false)
  })
})
