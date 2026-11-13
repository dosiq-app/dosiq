// 117 Fatia B — aba Estoque em três seções (PO-5, PO-7, PO-9, PO-11, FR-013).
// Os itens saem do transformer REAL (`transformStockData` → classificação + previsão canônica do
// core) e são renderizados pelo `StockItem` real. Só o relógio (`today`) é fixado.
import React from 'react'
import { render } from '@testing-library/react-native'
import StockItem from '@stock/components/StockItem'
import {
  transformStockData,
  splitStockItems,
  attachSupplyRunway,
  stockItemView,
} from '../_stockDataTransformer'
import { calculateCounts, getFilteredSections } from '@stock/screens/stockSections'

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }))
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
  useRoute: () => ({ params: {} }),
  useFocusEffect: jest.fn(),
}))
jest.mock('@stock/hooks/useStock', () => ({ useStock: jest.fn() }))
jest.mock('@medications/hooks/useMedicines', () => ({ useMedicines: () => ({ data: [], refresh: jest.fn() }) }))
jest.mock('@platform/analytics/productAnalytics', () => ({ logEvent: jest.fn() }))
jest.mock('@navigation/navigateCrossTab', () => ({ navigateCrossTab: jest.fn() }))

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

const TODAY = '2026-11-13'

const summary = (qty: number, entries = qty > 0 ? 1 : 0) => [{ total_quantity: qty, stock_entries_count: entries }]
const proto = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  name: 'Tratamento',
  active: true,
  start_date: '2026-10-01',
  end_date: null,
  archived_at: null,
  frequency: 'diário',
  interval_days: null,
  time_schedule: ['08:00'],
  dosage_per_intake: 1,
  intake_unit: null,
  ...over,
})
const med = (id: string, qty: number, protocols: Record<string, unknown>[] = [], over: Record<string, unknown> = {}) => ({
  id,
  name: id,
  dosage_unit: 'mg',
  dosage_per_pill: 10,
  medicine_stock_summary: summary(qty),
  protocols,
  ...over,
})

// Escada: A (vigente, semanal) → B (próxima troca).
const steps = [
  { id: 's0', titration_id: 't1', position: 0, medicine_id: 'A', status: 'current', protocol_id: 'pA', dose: 1, intake_unit: null, started_at: '2026-11-07T12:00:00Z', duration_days: 28 },
  { id: 's1', titration_id: 't1', position: 1, medicine_id: 'B', status: 'upcoming', protocol_id: null, dose: 1, intake_unit: null, started_at: null, duration_days: 28 },
]

const build = (raw: any[], s: any[] | null = steps) =>
  splitStockItems(transformStockData(raw, { steps: s, today: TODAY }))

describe('PO-5 — uma seção por medicamento, prioridade Em uso → Programado → Sem tratamentos', () => {
  it('divide a aba nas três seções, sem repetir medicamento (INV-2)', () => {
    const { active, scheduled, inactive } = build([
      med('A', 2, [proto({ id: 'pA', name: 'Mounjaro configurado', frequency: 'semanal' })]),
      med('B', 0),
      med('F', 0, [proto({ id: 'pF', start_date: '2026-12-09' })]),
      med('P', 0, [proto({ id: 'pP', active: false })]),
      med('O', 5),
      med('Z', 0),
    ])
    expect(active.map((i: any) => i.id)).toEqual(['A'])
    expect(scheduled.map((i: any) => i.id)).toEqual(['B', 'F']) // 05/12 antes de 09/12
    expect(inactive.map((i: any) => i.id)).toEqual(['P', 'O']) // pausado primeiro, depois órfão
    const ids = [...active, ...scheduled, ...inactive].map((i: any) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('PO-11 (CP-1): semanal com saldo zero em dia sem dose continua Em uso', () => {
    const { active } = build([med('W', 0, [proto({ frequency: 'semanal', weekdays: [1] })])])
    expect(active.map((i: any) => i.id)).toEqual(['W'])
  })
})

describe('PO-7 — Programado: PLANEJADO | N contado do início; zero ⇒ CTA com tom pela data', () => {
  it('com saldo, diário ⇒ dias a partir do início; nunca BAIXO/CRÍTICO', () => {
    // 3 comprimidos, 1/dia: a partir de hoje seriam "CRÍTICO 3 dias"; Programado mostra PLANEJADO | 3 dias.
    const [item] = build([med('F', 3, [proto({ start_date: '2026-12-09' })])]).scheduled
    expect(stockItemView(item, TODAY)).toMatchObject({ badge: 'PLANNED', purchaseCta: null, scheduleLabel: 'Começa 09/12' })
    const { getByText, getByTestId } = render(<StockItem medicine={item} />)
    expect(getByTestId('stock-level-badge-PLANNED')).toBeTruthy()
    expect(getByText('3 dias')).toBeTruthy()
  })

  it('com saldo, não diário (etapa semanal) ⇒ doses', () => {
    const items = attachSupplyRunway(
      transformStockData([med('A', 1, [proto({ id: 'pA', name: 'Mounjaro configurado', frequency: 'semanal' })]), med('B', 2)], { steps, today: TODAY }),
      { steps, instances: [], now: new Date('2026-11-13T15:00:00Z') },
    )
    const b = splitStockItems(items).scheduled[0]
    const { getByText } = render(<StockItem medicine={b} />)
    expect(getByText('2 doses')).toBeTruthy()
    expect(getByText('Etapa 2 de Mounjaro configurado · começa ~05/12')).toBeTruthy()
  })

  it('smoke 117 B: data da troca só no card do Programado, não repetida no card em uso', () => {
    const now = new Date('2026-11-13T15:00:00Z')
    const raw = [med('A', 2, [proto({ id: 'pA', name: 'Mounjaro configurado', frequency: 'semanal' })]), med('B', 0)]
    const items = attachSupplyRunway(transformStockData(raw, { steps, today: TODAY }), { steps, instances: [], now })
    const { active, scheduled } = splitStockItems(items)
    expect(stockItemView(scheduled[0], TODAY).supplyLabel).toMatch(/^Próxima compra até \d{2}\/\d{2}$/)
    expect(stockItemView(active[0], TODAY).supplyLabel).toBeNull()
  })

  it('zero com compra futura ⇒ CTA neutro + "Próxima compra até" (véspera do início, U-B1)', () => {
    const items = attachSupplyRunway(transformStockData([med('F', 0, [proto({ start_date: '2026-12-09' })])], { steps: [], today: TODAY }), {
      steps: [],
      instances: [],
      now: new Date('2026-11-13T15:00:00Z'),
    })
    const view = stockItemView(splitStockItems(items).scheduled[0], TODAY)
    expect(view).toMatchObject({ purchaseCta: { tone: 'neutral' }, supplyLabel: 'Próxima compra até 08/12', tapOpensPurchase: true })
  })

  it('zero com compra vencida ⇒ CTA vermelho (início amanhã: comprar até hoje)', () => {
    const items = attachSupplyRunway(transformStockData([med('F', 0, [proto({ start_date: '2026-11-14' })])], { steps: [], today: TODAY }), {
      steps: [],
      instances: [],
      now: new Date('2026-11-13T15:00:00Z'),
    })
    const item = splitStockItems(items).scheduled[0]
    expect(stockItemView(item, TODAY).purchaseCta).toEqual({ tone: 'alert' })
    const { getByTestId } = render(<StockItem medicine={item} />)
    expect(getByTestId('new-purchase-badge-alert')).toBeTruthy()
  })

  it('etapa de avanço manual sem saldo ⇒ CTA neutro, sem data', () => {
    const manual = steps.map((s) => (s.id === 's0' ? { ...s, duration_days: null } : s))
    const items = attachSupplyRunway(
      transformStockData([med('A', 1, [proto({ id: 'pA', frequency: 'semanal' })]), med('B', 0)], { steps: manual, today: TODAY }),
      { steps: manual, instances: [], now: new Date('2026-11-13T15:00:00Z') },
    )
    const b = splitStockItems(items).scheduled[0]
    expect(stockItemView(b, TODAY)).toMatchObject({ purchaseCta: { tone: 'neutral' }, supplyLabel: null })
  })

  it('chip Programado: contagem = itens da seção; filtra só a seção (FR-011)', () => {
    const data = build([med('A', 2, [proto({ id: 'pA', frequency: 'semanal' })]), med('B', 0), med('F', 0, [proto({ id: 'pF', start_date: '2026-12-09' })]), med('O', 5)])
    const counts = calculateCounts(data.active, data.scheduled, data.inactive)
    expect(counts).toMatchObject({ todos: 4, programado: 2, sem_tratamento: 1 })
    const sections = getFilteredSections(data, 'programado', data.active, data.scheduled, data.inactive)
    expect(sections).toHaveLength(1)
    expect(sections[0]).toMatchObject({ title: 'Programado', key: 'scheduled' })
    expect(sections[0].data.map((i: any) => i.id)).toEqual(['B', 'F'])
  })
})

describe('PO-9 — pausado: PAUSADO neutro, só adicionar estoque', () => {
  it.each([0, 5])('saldo %s', (qty) => {
    const [item] = build([med('P', qty, [proto({ active: false })])]).inactive
    const view = stockItemView(item, TODAY)
    expect(view).toMatchObject({ badge: 'PAUSED', purchaseCta: null })
    const { getByTestId, queryByText } = render(<StockItem medicine={item} />)
    expect(getByTestId('stock-level-badge-PAUSED')).toBeTruthy()
    expect(queryByText(/retomar/i)).toBeNull()
  })
})

describe('FR-013 — régua do zerar planejado EM USO (mensal), D = 2026-11-20', () => {
  const sparseItem = () => ({
    ...transformStockData([med('M', 0, [proto({ id: 'pM', frequency: 'personalizado', interval_days: 30 })], { medicine_stock_summary: summary(0, 2) })], {
      steps: [],
      today: TODAY,
    })[0],
    runwayAlertExpected: false,
    supply: { status: 'due', date: '2026-11-20', medicineId: 'M', reason: 'sparse', protocolId: 'pM' },
  })
  it.each([
    ['2026-11-17', null, 'PLANNED', 'Próxima compra até 20/11'],
    ['2026-11-18', 'neutral', null, 'Comprar até 20/11'],
    ['2026-11-19', 'neutral', null, 'Comprar até 20/11'],
    ['2026-11-20', 'alert', null, 'Comprar até 20/11'],
    ['2026-11-21', 'alert', null, 'Comprar até 20/11'],
  ])('hoje %s', (today, tone, badge, label) => {
    const item = { ...sparseItem(), status: 'PLANNED' }
    const view = stockItemView(item, today)
    expect(view.purchaseCta).toEqual(tone ? { tone } : null)
    expect(view.badge).toBe(badge)
    expect(view.supplyLabel).toBe(label)
  })

  it('dose registrada: o core devolve o D do próximo ciclo ⇒ volta ao selo', () => {
    const item = { ...sparseItem(), status: 'PLANNED', supply: { status: 'due', date: '2026-12-20', medicineId: 'M', reason: 'sparse', protocolId: 'pM' } }
    expect(stockItemView(item, '2026-11-21')).toMatchObject({ purchaseCta: null, badge: 'PLANNED', supplyLabel: 'Próxima compra até 20/12' })
  })
})
