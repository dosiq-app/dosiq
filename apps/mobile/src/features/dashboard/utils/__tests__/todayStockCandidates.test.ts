// spec 120 C · PO-120-13/19 — degraus da régua para estoque e compra (D-13, C1.5 C-1/C-2).
import { buildStockCandidates, stockLevelOf, isWithin24h, nextDoseOfMedicine } from '../todayStockCandidates'

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

// Datas LOCAIS (AP-270): 14/11/2026 21:30 no fuso do aparelho.
const NOW = new Date(2026, 10, 14, 21, 30)
const daily = (id: string, time = '08:00') => ({
  id: `p-${id}`, medicine_id: id, frequency: 'diário', time_schedule: [time],
  start_date: '2026-01-01', end_date: null, active: true,
})
const item = (over: any = {}) => ({ medicineId: 'm1', medicineName: 'Glifage', daysRemaining: 5, dosesRemaining: 5, isDailyStock: true, ...over })

describe('isWithin24h', () => {
  it.each([
    [{ date: '2026-11-14', time: '22:00' }, true],
    [{ date: '2026-11-15', time: '08:00' }, true],
    [{ date: '2026-11-15', time: '21:30' }, true],
    [{ date: '2026-11-15', time: '21:31' }, false],
    [{ date: '2026-11-17', time: '08:00' }, false],
    [null, false],
  ])('%j ⇒ %s', (occ, expected) => {
    expect(isWithin24h(occ as any, NOW)).toBe(expected)
  })
})

describe('nextDoseOfMedicine', () => {
  it('menor ocorrência entre os tratamentos do remédio; ignora outros remédios', () => {
    const r = nextDoseOfMedicine('m1', [daily('m1', '20:00'), daily('m1', '08:00'), daily('m2', '22:00')], NOW)
    expect(r).toEqual({ date: '2026-11-15', time: '08:00' })
  })
  it('sem tratamento do remédio ⇒ null', () => {
    expect(nextDoseOfMedicine('m9', [daily('m1')], NOW)).toBeNull()
    expect(nextDoseOfMedicine('m1', null, NOW)).toBeNull()
  })
})

describe('stockLevelOf', () => {
  const soon = { date: '2026-11-15', time: '08:00' }
  const far = { date: '2026-11-20', time: '08:00' }
  it('zerado com dose em 24 h ⇒ stock_zero (#1)', () => {
    expect(stockLevelOf(item({ isZero: true, daysRemaining: 0, dosesRemaining: 0 }), soon, NOW)).toBe('stock_zero')
  })
  it('zerado sem dose em 24 h (semanal) ⇒ stock_urgent (#3)', () => {
    expect(stockLevelOf(item({ isZero: true, daysRemaining: 0, dosesRemaining: 0 }), far, NOW)).toBe('stock_urgent')
    expect(stockLevelOf(item({ dosesRemaining: 0, daysRemaining: 0 }), null, NOW)).toBe('stock_urgent')
  })
  it('isUrgent da canônica decide', () => {
    expect(stockLevelOf(item({ isUrgent: true }), soon, NOW)).toBe('stock_urgent')
    expect(stockLevelOf(item({ isUrgent: false, daysRemaining: 1 }), soon, NOW)).toBe('stock_low')
  })
  it('cache sem forecast: diário ≤ 3 dias; não diário ≤ 1 dose (S-20)', () => {
    expect(stockLevelOf(item({ daysRemaining: 3 }), soon, NOW)).toBe('stock_urgent')
    expect(stockLevelOf(item({ daysRemaining: 4 }), soon, NOW)).toBe('stock_low')
    expect(stockLevelOf(item({ isDailyStock: false, dosesRemaining: 1, daysRemaining: 7 }), soon, NOW)).toBe('stock_urgent')
    expect(stockLevelOf(item({ isDailyStock: false, dosesRemaining: 2, daysRemaining: 2 }), soon, NOW)).toBe('stock_low')
  })
  it('daysRemaining nulo e sem doses ⇒ baixo, nunca urgente', () => {
    expect(stockLevelOf(item({ daysRemaining: null, dosesRemaining: null }), null, NOW)).toBe('stock_low')
  })
})

describe('buildStockCandidates', () => {
  it('estoque + compra viram candidatos com chave por remédio e ordem por dias', () => {
    const r = buildStockCandidates(
      [item({ medicineId: 'm1', daysRemaining: 5 }), item({ medicineId: 'm2', medicineName: 'Cozaar', isZero: true, daysRemaining: 0, dosesRemaining: 0 })],
      [{ medicineId: 'm3', medicineName: 'Mounjaro', date: '2026-11-20', daysUntil: 6 }],
      [daily('m2')],
      NOW,
    )
    expect(r.map((c) => [c.kind, c.key, c.order])).toEqual([
      ['stock_low', 'stock_low:m1', 5],
      ['stock_zero', 'stock_zero:m2', 0],
      ['supply', 'supply:m3', 6],
    ])
  })
  it('entradas vazias/nulas ⇒ []', () => {
    expect(buildStockCandidates(null, undefined, null, NOW)).toEqual([])
    expect(buildStockCandidates([{} as any], [{} as any], [], NOW)).toEqual([])
  })
})

describe('S-21 — próxima compra escala pela régua da aba Estoque', () => {
  const NOW15 = new Date(2026, 10, 15, 0, 10)
  const notice = (date: string, daysUntil: number) => ({ medicineId: 'm-ac', medicineName: 'AC', date, daysUntil, reason: 'sparse' })
  it.each([
    ['2026-11-22', 7, 'supply', 'supply:m-ac'],
    ['2026-11-16', 1, 'stock_urgent', 'supply_soon:m-ac'],
    ['2026-11-15', 0, 'stock_zero', 'supply_due:m-ac'],
  ])('compra em %s ⇒ %s', (date, d, kind, key) => {
    const [c] = buildStockCandidates([], [notice(date as string, d as number)], [], NOW15)
    expect(c.kind).toBe(kind)
    expect(c.key).toBe(key)
  })
})
