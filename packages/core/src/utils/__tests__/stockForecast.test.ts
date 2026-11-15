import { describe, it, expect, afterEach, vi } from 'vitest'
import { deriveStockForecast, STOCK_LOW_DAYS, STOCK_URGENT_DAYS } from '../stockForecast'
import { STOCK_FORECAST_AS_OF, STOCK_FORECAST_CASES, type StockForecastCase } from './fixtures/stockForecastCases'

// Spec 072 — tabela-oráculo da previsão canônica (PO-072-1). As superfícies são comparadas com ESTA
// saída (server/bot/__tests__/stockForecastSurfaces.test.ts); aqui a canônica é comparada com a
// conta feita à mão para cada caso da fixture compartilhada.

afterEach(() => {
  vi.clearAllMocks()
  vi.clearAllTimers()
})

const caseOf = (id: string): StockForecastCase => {
  const c = STOCK_FORECAST_CASES.find((x) => x.id === id)
  if (!c) throw new Error(`caso ausente: ${id}`)
  return c
}

const forecastOf = (c: StockForecastCase, overrides: Partial<Parameters<typeof deriveStockForecast>[0]> = {}) =>
  deriveStockForecast({
    medicineId: c.medicine.id,
    medicine: c.medicine,
    protocols: c.protocols as never,
    quantity: c.quantity,
    asOf: STOCK_FORECAST_AS_OF,
    ...overrides,
  })

// id · regime · daysRemaining · dosesRemaining · isCritical · isLow · isZero · alertExpected
const TABLE: Array<[string, string, number | null, number, boolean, boolean, boolean, boolean]> = [
  ['m-cont', 'continuous', 15, 30, false, false, false, false],
  ['m-d7', 'continuous', 7, 7, true, true, false, true],
  ['m-d79', 'continuous', 7, 7, true, true, false, true],
  ['m-d8', 'continuous', 8, 8, false, false, false, false],
  ['m-d65', 'continuous', 6, 6, true, true, false, true],
  ['m-zero', 'continuous', 0, 0, true, false, true, true],
  ['m-week', 'continuous', 21, 3, false, false, false, false],
  ['m-week-low', 'continuous', 7, 1, true, true, false, true],
  ['m-int', 'continuous', 6, 2, true, true, false, true],
  ['m-liq', 'continuous', 1, 2, true, true, false, true],
  ['m-prn', 'prn', 5, 5, true, true, false, true],
  ['m-sparse', 'planned_purchase', 30, 1, false, false, false, false],
  ['m-mixed', 'continuous', 2, 3, true, true, false, true],
  ['m-ended', 'no_forecast', null, 0, false, false, false, false],
  ['m-nullactive', 'continuous', 4, 4, true, true, false, true],
  ['m-multi', 'continuous', 2, 6, true, true, false, true],
]

// 120 C (C-1): "estoque acabando" da régua da Hoje — diário ≤ STOCK_URGENT_DAYS dias; não diário
// ≤ 1 dose. Saldo zero NÃO é urgente (é `isZero`); só regime com alerta (contínuo/PRN).
const URGENT: Record<string, boolean> = {
  'm-cont': false, 'm-d7': false, 'm-d79': false, 'm-d8': false, 'm-d65': false, 'm-zero': false,
  'm-week': false, 'm-week-low': true, 'm-int': false, 'm-liq': true, 'm-prn': false,
  'm-sparse': false, 'm-mixed': false, 'm-ended': false, 'm-nullactive': false, 'm-multi': true,
}

describe('deriveStockForecast — isUrgent (120 C, C-1)', () => {
  it('limiar é 3 dias (S-20)', () => {
    expect(STOCK_URGENT_DAYS).toBe(3)
  })
  for (const [id, urgent] of Object.entries(URGENT)) {
    it(`${id} ⇒ isUrgent=${urgent}`, () => {
      expect(forecastOf(caseOf(id)).isUrgent).toBe(urgent)
    })
  }
  it('urgente implica alerta esperado (nunca urgente sem alerta)', () => {
    for (const c of STOCK_FORECAST_CASES) {
      const f = forecastOf(c)
      if (f.isUrgent) expect(f.alertExpected).toBe(true)
    }
  })
  it('sem consumo nunca é urgente', () => {
    const f = forecastOf(caseOf('m-ended'), { quantity: 1 })
    expect(f.isUrgent).toBe(false)
  })
})

describe('deriveStockForecast — tabela-oráculo (072 PO-072-1)', () => {
  it('a tabela cobre todos os casos da fixture compartilhada', () => {
    expect(TABLE.map((r) => r[0]).sort()).toEqual(STOCK_FORECAST_CASES.map((c) => c.id).sort())
  })

  for (const [id, regime, days, doses, isCritical, isLow, isZero, alertExpected] of TABLE) {
    it(`${id} — ${caseOf(id).label}`, () => {
      const f = forecastOf(caseOf(id))
      expect(f.regime).toBe(regime)
      expect(f.daysRemaining).toBe(days)
      expect(f.dosesRemaining).toBe(doses)
      expect(f.isCritical).toBe(isCritical)
      expect(f.isLow).toBe(isLow)
      expect(f.isZero).toBe(isZero)
      expect(f.alertExpected).toBe(alertExpected)
    })
  }

  it('limiar D-6: 7,0 e 7,9 dias são críticos; 8,0 não', () => {
    expect(STOCK_LOW_DAYS).toBe(7)
    expect(forecastOf(caseOf('m-d7')).severity).toBe('critico')
    expect(forecastOf(caseOf('m-d79')).severity).toBe('critico')
    expect(forecastOf(caseOf('m-d8')).severity).toBe('baixo')
  })

  it('consumo diário: líquido em ml, semanal 1/7, contínuo+esparso somados', () => {
    expect(forecastOf(caseOf('m-liq')).dailyIntake).toBeCloseTo(0.4)
    expect(forecastOf(caseOf('m-week')).dailyIntake).toBeCloseTo(1 / 7)
    expect(forecastOf(caseOf('m-mixed')).dailyIntake).toBeCloseTo(1 + 1 / 30)
  })

  it('sem consumo: daysRemaining null, runway Infinity, sem alerta', () => {
    const f = forecastOf(caseOf('m-ended'))
    expect(f.dailyIntake).toBe(0)
    expect(f.runwayDays).toBe(Infinity)
    expect(f.severity).toBe('normal')
  })

  it('dose de referência estável: a ordem de chegada dos tratamentos não muda o resultado', () => {
    const c = caseOf('m-multi')
    const reversed = forecastOf(c, { protocols: [...c.protocols].reverse() as never })
    expect(reversed).toEqual(forecastOf(c))
  })

  it('filtra protocolos de OUTROS medicamentos (chatbot passa a lista do usuário inteira)', () => {
    const c = caseOf('m-d7')
    const noise = caseOf('m-cont').protocols
    expect(forecastOf(c, { protocols: [...c.protocols, ...noise] as never })).toEqual(forecastOf(c))
  })

  it('asOf decide a vigência: tratamento encerrado em 01/11 ainda vale em 31/10', () => {
    expect(forecastOf(caseOf('m-ended'), { asOf: '2026-10-31' }).regime).toBe('continuous')
  })

  it('entrada degenerada não lança: protocols null, quantity NaN/undefined', () => {
    const c = caseOf('m-d7')
    expect(forecastOf(c, { protocols: null }).regime).toBe('no_forecast')
    expect(forecastOf(c, { quantity: Number.NaN }).isZero).toBe(true)
    expect(forecastOf(c, { quantity: undefined }).daysRemaining).toBe(0)
  })

  it('INV-4: steps ausente ⇒ só o esparso cala; etapa de passagem cala com a escada', () => {
    const c = caseOf('m-d7')
    expect(forecastOf(c).alertExpected).toBe(true)
    const steps = [
      { titration_id: 't1', position: 1, medicine_id: 'm-d7', status: 'current', protocol_id: 'p-d7' },
      { titration_id: 't1', position: 2, medicine_id: 'outro', status: 'pending', protocol_id: null },
    ]
    const f = forecastOf(c, { steps: steps as never })
    expect(f.regime).toBe('planned_purchase')
    expect(f.alertExpected).toBe(false)
  })
})
