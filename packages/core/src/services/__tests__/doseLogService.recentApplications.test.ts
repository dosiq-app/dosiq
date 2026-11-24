import { describe, it, expect, afterEach, vi } from 'vitest'

// Mesma isolação do doseLogService.test principal.
vi.mock('../../repositories/createDoseInstanceRepository.js', () => ({
  createDoseInstanceRepository: () => ({ findAnchorInstance: vi.fn(), getById: vi.fn(), revertToUnregistered: vi.fn() }),
}))

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@dosiq/shared-data'
import { createDoseLogService } from '../doseLogService'

const PROT = '57f8a12f-4e2b-4022-9bb6-e0f5b38c7f04'
const MED = '833db412-7140-4005-866a-86e01343a586'
const LOG = '2bbc633a-0625-4d43-84b9-42d05184a2fb'
// E-8: taken_at com microssegundos — a string do banco segue crua, nunca via Date.
const T_MICRO = '2026-11-15T11:26:51.666123+00:00'

type Call = [string, ...unknown[]]

/** Builder do supabase-js que grava a cadeia e resolve com `rows`. */
function makeClient(rows: unknown[] = [], error: unknown = null) {
  const calls: Call[] = []
  const builder: any = {}
  for (const m of ['select', 'eq', 'or', 'order', 'limit']) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, ...args])
      return builder
    }
  }
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error })
  const client = { from: vi.fn((table: string) => { calls.push(['from', table]); return builder }) }
  return { client: client as unknown as SupabaseClient<Database>, calls }
}

const getUserId = async () => 'user-123'
const svc = (client: SupabaseClient<Database>) => createDoseLogService({ client, getUserId })
const of = (calls: Call[], m: string) => calls.filter((c) => c[0] === m)

afterEach(() => {
  vi.clearAllMocks()
  vi.clearAllTimers()
})

describe('listRecentApplications — cursor keyset (124 A · PO-1/PO-3)', () => {
  it('sem cursor: chamada idêntica à 121 B (1 or, 1 order, limit 4) — PO-6', async () => {
    const { client, calls } = makeClient()
    await svc(client).listRecentApplications({ protocolId: PROT, medicineId: MED })
    expect(of(calls, 'or')).toEqual([['or', `protocol_id.eq.${PROT},medicine_id.eq.${MED}`]])
    expect(of(calls, 'order')).toEqual([['order', 'taken_at', { ascending: false, nullsFirst: false }]])
    expect(of(calls, 'limit')).toEqual([['limit', 4]])
  })

  it('before: (taken_at,id) < cursor, ordem desc estável, limit 1, string do banco intacta (E-8)', async () => {
    const { client, calls } = makeClient()
    await svc(client).listRecentApplications({ protocolId: PROT, medicineId: MED, limit: 1, before: { takenAt: T_MICRO, id: LOG } })
    expect(of(calls, 'or')).toEqual([
      ['or', `protocol_id.eq.${PROT},medicine_id.eq.${MED}`],
      ['or', `taken_at.lt.${T_MICRO},and(taken_at.eq.${T_MICRO},id.lt.${LOG})`],
    ])
    expect(of(calls, 'order')).toEqual([
      ['order', 'taken_at', { ascending: false, nullsFirst: false }],
      ['order', 'id', { ascending: false }],
    ])
    expect(of(calls, 'limit')).toEqual([['limit', 1]])
  })

  it('after: (taken_at,id) > cursor, ordem asc estável', async () => {
    const { client, calls } = makeClient()
    await svc(client).listRecentApplications({ protocolId: PROT, medicineId: null, limit: 1, after: { takenAt: T_MICRO, id: LOG } })
    expect(of(calls, 'or')[1]).toEqual(['or', `taken_at.gt.${T_MICRO},and(taken_at.eq.${T_MICRO},id.gt.${LOG})`])
    expect(of(calls, 'order')).toEqual([
      ['order', 'taken_at', { ascending: true, nullsFirst: false }],
      ['order', 'id', { ascending: true }],
    ])
  })

  it('fim da lista: [] (sem erro)', async () => {
    const { client } = makeClient([])
    await expect(svc(client).listRecentApplications({ protocolId: PROT, limit: 1, before: { takenAt: T_MICRO, id: LOG } })).resolves.toEqual([])
  })

  it('devolve o local de CADA linha (R-299 · PO-2)', async () => {
    const rows = [
      { id: 'a', taken_at: '2026-11-01T12:00:00+00:00', injection_site: 'gluteo_d', medicine_id: MED, protocol_id: PROT },
      { id: 'b', taken_at: '2026-10-02T12:00:00+00:00', injection_site: 'gluteo_e', medicine_id: MED, protocol_id: PROT },
      { id: 'c', taken_at: '2026-09-02T12:00:00+00:00', injection_site: null, medicine_id: MED, protocol_id: PROT },
    ]
    const { client } = makeClient(rows)
    const out = await svc(client).listRecentApplications({ protocolId: PROT })
    expect(out.map((r) => r.injection_site)).toEqual(['gluteo_d', 'gluteo_e', null])
  })

  it('before e after juntos ⇒ lança', async () => {
    const { client } = makeClient()
    const cur = { takenAt: T_MICRO, id: LOG }
    await expect(svc(client).listRecentApplications({ protocolId: PROT, before: cur, after: cur })).rejects.toThrow(/cursor/i)
  })

  it.each([
    ['id não UUID', { takenAt: T_MICRO, id: 'x,or(1)' }],
    ['takenAt vazio', { takenAt: '', id: LOG }],
    ['takenAt com vírgula/parêntese', { takenAt: '2026-11-15T11:26:51Z),id.gt.0', id: LOG }],
  ])('cursor inválido (%s) ⇒ lança antes de montar o filtro', async (_l, cur) => {
    const { client, calls } = makeClient()
    await expect(svc(client).listRecentApplications({ protocolId: PROT, before: cur })).rejects.toThrow(/cursor/i)
    expect(of(calls, 'or')).toEqual([])
  })

  it('erro do banco ⇒ lança (nunca falso vazio)', async () => {
    const { client } = makeClient([], { message: 'boom' })
    await expect(svc(client).listRecentApplications({ protocolId: PROT, limit: 1, before: { takenAt: T_MICRO, id: LOG } })).rejects.toBeTruthy()
  })
})
