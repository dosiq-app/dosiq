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
