// RC6 #957: sem dias conhecidos (cache sem previsão) o título não imprime "null dias".
import { stockAlertCopy } from '../stockAlertCopy'

describe('stockAlertCopy — dias desconhecidos', () => {
  afterEach(() => { jest.clearAllMocks() })
  it('daysRemaining nulo ⇒ texto sem número', () => {
    const item = { medicineId: 'm', medicineName: 'Glifage', daysRemaining: null, isDailyStock: true }
    const copy = stockAlertCopy({ type: 'stock', level: 'stock_low', item, nextDose: null } as any)
    expect(copy.title).toBe('Estoque de Glifage acabando')
    expect(copy.title).not.toMatch(/null/)
  })
})

// Smoke 125 2a (PO 22/11): N remédios no mesmo nível ⇒ um card; nomes numa linha, só a dose mais cedo.
describe('stockAlertCopy — grupo', () => {
  const now = new Date(2026, 10, 22, 15, 0)
  const zero = (id: string, name: string) => ({ medicineId: id, medicineName: name, daysRemaining: 0, isZero: true })

  it('sem estoque de 2: título com a contagem, nomes e a primeira dose', () => {
    const copy = stockAlertCopy({ type: 'stock_group', level: 'stock_zero', items: [zero('a', 'Rybelsus'), zero('b', 'Ozempic')], nextDose: { date: '2026-11-23', time: '08:00' } }, now)
    expect(copy.title).toBe('Sem estoque de 2 remédios')
    expect(copy.subtitle).toBe('Rybelsus e Ozempic.\nA primeira dose sem estoque é amanhã às 08:00.')
  })

  it('4 ou mais: a lista corta em "e mais N"', () => {
    const items = ['A', 'B', 'C', 'D'].map((n) => zero(n, n))
    expect(stockAlertCopy({ type: 'stock_group', level: 'stock_zero', items, nextDose: null }, now).subtitle.split('\n')[0]).toBe('A, B e mais 2.')
  })
})
