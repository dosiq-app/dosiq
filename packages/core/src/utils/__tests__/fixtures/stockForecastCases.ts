// stockForecastCases.ts — fixture COMPARTILHADA da spec 072 (PO-072-1 / SC-002).
//
// Uma entrada, quatro leitores: a derivação canônica (`deriveStockForecast`), o alerta do servidor
// (`_computeStockAlertPayload`), o `/estoque` do bot e o resumo de estoque do chatbot. O oráculo é a
// canônica — nenhuma superfície tem valor esperado próprio (boundary da PO-072-1).
//
// Datas são LOCAIS e fixas (AP-270): `STOCK_FORECAST_AS_OF` é o "hoje" de todos os casos.

export const STOCK_FORECAST_AS_OF = '2026-11-12'

export interface StockForecastCase {
  /** id estável do caso (também é o id do medicamento). */
  id: string
  label: string
  medicine: {
    id: string
    name: string
    dosage_unit: string
    units_per_ml?: number | null
    dosage_per_pill?: number | null
  }
  /** saldo somado do medicamento (ml para líquido). */
  quantity: number
  protocols: Array<Record<string, unknown>>
}

const daily = (id: string, medicineId: string, extra: Record<string, unknown> = {}) => ({
  id,
  medicine_id: medicineId,
  active: true,
  frequency: 'diário',
  time_schedule: ['08:00'],
  dosage_per_intake: 1,
  intake_unit: null,
  start_date: '2026-01-01',
  end_date: null,
  ...extra,
})

const solid = (id: string) => ({ id, name: `Med ${id}`, dosage_unit: 'mg', dosage_per_pill: 50 })

export const STOCK_FORECAST_CASES: StockForecastCase[] = [
  {
    id: 'm-cont', label: 'contínuo diário 2x, 15 dias',
    medicine: solid('m-cont'), quantity: 30,
    protocols: [daily('p-cont', 'm-cont', { time_schedule: ['08:00', '20:00'] })],
  },
  {
    id: 'm-d7', label: 'exatamente 7 dias',
    medicine: solid('m-d7'), quantity: 7,
    protocols: [daily('p-d7', 'm-d7')],
  },
  {
    id: 'm-d79', label: '7,9 dias (floor 7)',
    medicine: solid('m-d79'), quantity: 79,
    protocols: [daily('p-d79', 'm-d79', { dosage_per_intake: 10 })],
  },
  {
    id: 'm-d8', label: '8 dias',
    medicine: solid('m-d8'), quantity: 8,
    protocols: [daily('p-d8', 'm-d8')],
  },
  {
    id: 'm-d65', label: '6,5 dias',
    medicine: solid('m-d65'), quantity: 13,
    protocols: [daily('p-d65', 'm-d65', { dosage_per_intake: 2 })],
  },
  {
    id: 'm-zero', label: 'saldo 0 com consumo',
    medicine: solid('m-zero'), quantity: 0,
    protocols: [daily('p-zero', 'm-zero')],
  },
  {
    id: 'm-week', label: 'semanal, 3 doses = 21 dias',
    medicine: solid('m-week'), quantity: 3,
    protocols: [daily('p-week', 'm-week', { frequency: 'semanal' })],
  },
  {
    id: 'm-week-low', label: 'semanal, 1 dose = 7 dias',
    medicine: solid('m-week-low'), quantity: 1,
    protocols: [daily('p-week-low', 'm-week-low', { frequency: 'semanal' })],
  },
  {
    id: 'm-int', label: 'intervalo 3 dias, 2 doses = 6 dias',
    medicine: solid('m-int'), quantity: 2,
    protocols: [daily('p-int', 'm-int', { frequency: 'intervalo_dias', interval_days: 3 })],
  },
  {
    id: 'm-liq', label: 'líquido UI/ml, 0,5 ml a 0,4 ml/dia',
    medicine: { id: 'm-liq', name: 'Insulina', dosage_unit: 'ui/ml', units_per_ml: 100 },
    quantity: 0.5,
    protocols: [daily('p-liq', 'm-liq', { time_schedule: ['08:00', '20:00'], dosage_per_intake: 20, intake_unit: 'UI' })],
  },
  {
    id: 'm-prn', label: 'PRN, 5 unidades',
    medicine: solid('m-prn'), quantity: 5,
    protocols: [daily('p-prn', 'm-prn', { frequency: 'quando_necessário' })],
  },
  {
    id: 'm-sparse', label: 'compra planejada: intervalo 30 dias, 1 dose',
    medicine: solid('m-sparse'), quantity: 1,
    protocols: [daily('p-sparse', 'm-sparse', { frequency: 'intervalo_dias', interval_days: 30 })],
  },
  {
    id: 'm-mixed', label: 'contínuo + esparso (105 AC-G3: alerta volta)',
    medicine: solid('m-mixed'), quantity: 3,
    protocols: [
      daily('p-mixed-a', 'm-mixed'),
      daily('p-mixed-b', 'm-mixed', { frequency: 'intervalo_dias', interval_days: 30 }),
    ],
  },
  {
    id: 'm-ended', label: 'tratamento encerrado (sem consumo)',
    medicine: solid('m-ended'), quantity: 3,
    protocols: [daily('p-ended', 'm-ended', { end_date: '2026-11-01' })],
  },
  {
    id: 'm-nullactive', label: 'active NULL conta como vigente (AP-289)',
    medicine: solid('m-nullactive'), quantity: 4,
    protocols: [daily('p-nullactive', 'm-nullactive', { active: null })],
  },
  {
    id: 'm-multi', label: '2 tratamentos de dose diferente, ordem de chegada invertida',
    medicine: solid('m-multi'), quantity: 6,
    protocols: [
      daily('p-multi-b', 'm-multi', { dosage_per_intake: 2, start_date: '2026-03-01' }),
      daily('p-multi-a', 'm-multi', { dosage_per_intake: 1, start_date: '2026-02-01' }),
    ],
  },
]
