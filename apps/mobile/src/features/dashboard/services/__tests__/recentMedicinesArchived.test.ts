// recentMedicinesArchived.test.ts — spec 125 fatia 2 (smoke 20/11): excluir remédio/tratamento é ARQUIVAR
// (`archived_at`). "Falta 1 passo" não vê remédio arquivado, e tratamento arquivado não conta como "tem
// tratamento". Colunas e SELECT de `authenticated` conferidos em prod e QA (R-295).

const mockCalls: Array<[string, unknown[]]> = []
const mockRows = {
  current: [] as any[],
}
jest.mock('@platform/supabase/nativeSupabaseClient', () => {
  const chain: any = {}
  ;['select', 'eq', 'is', 'gte', 'limit'].forEach((m) => {
    chain[m] = (...args: unknown[]) => {
      mockCalls.push([m, args])
      return chain
    }
  })
  chain.order = () => Promise.resolve({ data: mockRows.current, error: null })
  return { supabase: { from: () => chain } }
})

import { getRecentMedicines } from '../dashboardService'

afterEach(() => {
  mockCalls.length = 0
  jest.clearAllMocks()
  jest.clearAllTimers()
})

const UID = '8c0633ef-a0f8-4b74-b1b8-92d4d47034e7'

it('filtra remédio arquivado e traz archived_at do tratamento', async () => {
  await getRecentMedicines(UID, 14)
  expect(mockCalls).toContainEqual(['is', ['archived_at', null]])
  const select = String(mockCalls.find(([m]) => m === 'select')?.[1][0]).replace(/\s+/g, '')
  expect(select).toContain('protocols(id,archived_at)')
})

it('tratamento arquivado não conta: remédio fica sem tratamento', async () => {
  mockRows.current = [{ id: 'm1', protocols: [{ id: 'p1', archived_at: '2026-11-20T10:00:00Z' }] }, { id: 'm2', protocols: [{ id: 'p2', archived_at: null }] }]
  const rows = await getRecentMedicines(UID, 14)
  expect(rows.map((r: any) => r.protocols.length)).toEqual([0, 1])
})

// Fix smoke 124 B (24/11): etapa de escada e dose registrada vêm no select, 1 linha de cada (existência).
it('traz titration_steps(id) e medicine_logs(id) limitados a 1', async () => {
  await getRecentMedicines(UID, 14)
  const select = String(mockCalls.find(([m]) => m === 'select')?.[1][0]).replace(/\s+/g, '')
  expect(select).toContain('titration_steps(id)')
  expect(select).toContain('medicine_logs(id)')
  expect(mockCalls).toContainEqual(['limit', [1, { referencedTable: 'titration_steps' }]])
  expect(mockCalls).toContainEqual(['limit', [1, { referencedTable: 'medicine_logs' }]])
})
