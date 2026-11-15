// getGlp1JourneyStart — smoke 121 A: a janela "Tratamento" parte do 1º GLP-1 da pessoa, ATIVO OU
// ENCERRADO. Classificador real (PO-1: não mockar o classifyWedge); só o client é dublê.

const mockSelect = jest.fn()
const mockEq = jest.fn()
let mockRows: any[] = []
jest.mock('@platform/supabase/nativeSupabaseClient', () => ({
  supabase: {
    from: () => ({
      select: (...a: unknown[]) => {
        mockSelect(...a)
        return { eq: (...e: unknown[]) => { mockEq(...e); return Promise.resolve({ data: mockRows, error: null }) } }
      },
    }),
  },
}))

import { getGlp1JourneyStart } from '../dashboardService'

const UID = '8c0633ef-a0f8-4b74-b1b8-92d4d47034e7'

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

it('início mais antigo entre os GLP-1, sem filtro de ativo; ignora não-GLP-1 e data nula', async () => {
  mockRows = [
    { start_date: '2026-10-30', medicine: { therapeutic_class_code: 'A10S1' } },
    { start_date: '2026-10-15', medicine: { therapeutic_class_code: 'A10S1' } }, // encerrado: entra
    { start_date: '2026-01-01', medicine: { therapeutic_class_code: 'C10A1' } },
    { start_date: null, medicine: { therapeutic_class_code: 'A10S1' } },
    { start_date: '2025-01-01', medicine: null },
  ]
  expect(await getGlp1JourneyStart(UID)).toBe('2026-10-15')
  expect(mockEq.mock.calls).toEqual([['user_id', UID]])
  expect(String(mockSelect.mock.calls[0][0]).replace(/\s+/g, '')).toBe('start_date,medicine:medicines(therapeutic_class_code)')
})

it('sem GLP-1 ⇒ null', async () => {
  mockRows = [{ start_date: '2026-01-01', medicine: { therapeutic_class_code: 'C10A1' } }]
  expect(await getGlp1JourneyStart(UID)).toBeNull()
})
