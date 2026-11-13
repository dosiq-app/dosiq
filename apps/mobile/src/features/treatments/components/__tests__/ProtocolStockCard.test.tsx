// 117 PO-3 — card de estoque do detalhe do tratamento = item da aba Estoque.
// Os itens saem do transformer REAL da aba (`transformStockData`) e são renderizados pelo card E
// pelo `StockItem`: saldo, pill e "próxima compra" têm que bater (INV-5, AC-2.4). Só o dataset
// (`useStockItem`) é injetado — calcular saldo no card é o que a boundary da PO-3 proíbe.
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import ProtocolStockCard from '../ProtocolStockCard'
import StockItem from '@stock/components/StockItem'
import { transformStockData } from '@stock/hooks/_stockDataTransformer'
import { ROUTES } from '@navigation/routes'

const mockUseStockTracking = jest.fn()
jest.mock('@shared/hooks/useStockTracking', () => ({ useStockTracking: () => mockUseStockTracking() }))
const mockUseStockItem = jest.fn()
jest.mock('@stock/hooks/useStockItem', () => ({ useStockItem: (id: string) => mockUseStockItem(id) }))
const mockNavigateCrossTab = jest.fn()
jest.mock('@navigation/navigateCrossTab', () => ({ navigateCrossTab: (...a: unknown[]) => mockNavigateCrossTab(...a) }))
const mockLogEvent = jest.fn()
jest.mock('@platform/analytics/productAnalytics', () => ({ logEvent: (...a: unknown[]) => mockLogEvent(...a) }))
jest.mock('@shared/utils/haptics', () => ({ selectionTap: jest.fn() }))
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => jest.requireActual('react').useEffect(cb, [cb]),
}))
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }))

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

const MEDICINE = { id: 'm-1', name: 'Metropolol', dosage_unit: 'mg', dosage_per_pill: 25 }
const protocol = (over = {}) => ({
  id: 'p-1',
  active: true,
  frequency: 'diário',
  time_schedule: ['08:00'],
  dosage_per_intake: 1,
  start_date: '2026-01-01',
  end_date: null,
  ...over,
})
const raw = (qty: number, entries: number, protocols = [protocol()]) => ({
  ...MEDICINE,
  medicine_stock_summary: [{ total_quantity: qty, stock_entries_count: entries }],
  protocols,
})
const itemOf = (r: ReturnType<typeof raw>) => transformStockData([r])[0]

function setup(item: unknown, { enabled = true, ready = true } = {}) {
  mockUseStockTracking.mockReturnValue({ enabled, ready })
  mockUseStockItem.mockReturnValue({ item, ready: true, loading: false, error: null, refresh: jest.fn() })
  return render(<ProtocolStockCard medicine={MEDICINE} treatmentId="p-1" />)
}

/** Textos visíveis de uma árvore, sem o título da seção. */
function texts(tree: ReturnType<typeof render>) {
  return tree.UNSAFE_root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children)
}

describe('117 PO-3 — card do detalhe × aba', () => {
  it.each([
    ['crítico', raw(5, 2)],
    ['baixo', raw(10, 2)],
    ['bom', raw(90, 2)],
  ])('mesmo saldo e mesma pill (%s)', (_label, r) => {
    const item = itemOf(r)
    const card = setup(item)
    const tab = render(<StockItem medicine={item} />)
    const pill = (t: string[]) => t.filter((x) => /Crítico|Baixo|Normal|Bom|Planejado|dias?|doses?/.test(x))
    expect(card.getByText(/un\.|mg/)).toBeTruthy()
    expect(pill(texts(tab)).length).toBeGreaterThan(0) // a comparação não pode medir nada
    expect(pill(texts(card))).toEqual(pill(texts(tab)))
  })

  it('"próxima compra" do item aparece igual nos dois', () => {
    const item = { ...itemOf(raw(3, 1)), supply: { status: 'due', date: '2026-12-09', reason: 'runway', medicineId: 'm-1' } }
    const card = setup(item)
    const tab = render(<StockItem medicine={item} />)
    expect(card.getByTestId('protocol-stock-supply').props.children).toBe(
      tab.getByTestId('stock-item-supply').props.children
    )
  })

  it('nunca comprou → convida a registrar (AC-2.3), igual ao CTA da aba', () => {
    const card = setup(itemOf(raw(0, 0)))
    expect(card.getByText('Sem estoque registrado')).toBeTruthy()
  })

  it('medicamento fora da lista → convida a registrar', () => {
    expect(setup(null).getByText('Sem estoque registrado')).toBeTruthy()
  })

  it('estoque desligado → não renderiza nem lê (AC-2.5)', () => {
    const tree = setup(itemOf(raw(5, 2)), { enabled: false })
    expect(tree.toJSON()).toBeNull()
    expect(mockUseStockItem).not.toHaveBeenCalled()
  })

  it('toque abre o detalhe do estoque só com id e nome (AC-2.2) e registra o evento', () => {
    const card = setup(itemOf(raw(5, 2)))
    fireEvent.press(card.getByTestId('protocol-stock-card'))
    expect(mockNavigateCrossTab).toHaveBeenCalledWith(ROUTES.STOCK, ROUTES.STOCK_DETAIL, { medicineId: 'm-1', medicineName: 'Metropolol' })
    expect(mockLogEvent).toHaveBeenCalledWith('treatment_stock_tapped', { state: 'level', treatment_id: 'p-1', surface: 'mobile' })
    expect(mockLogEvent).toHaveBeenCalledWith('treatment_stock_viewed', { state: 'level', treatment_id: 'p-1', surface: 'mobile' })
  })
})

describe('117 smoke Android 2026-11-13 — iniciar etapa relê o estoque', () => {
  it('nova revision do tratamento (dose/etapa) → refresh; mesma revision → nada', () => {
    const refresh = jest.fn()
    mockUseStockTracking.mockReturnValue({ enabled: true, ready: true })
    mockUseStockItem.mockReturnValue({ item: itemOf(raw(5, 2)), ready: true, loading: false, error: null, refresh })
    const tree = render(<ProtocolStockCard medicine={MEDICINE} treatmentId="p-1" revision="m-1|0.25|s1:current" />)
    expect(refresh).not.toHaveBeenCalled() // mount: o useStock já lê
    tree.rerender(<ProtocolStockCard medicine={MEDICINE} treatmentId="p-1" revision="m-1|0.25|s1:current" />)
    expect(refresh).not.toHaveBeenCalled()
    tree.rerender(<ProtocolStockCard medicine={MEDICINE} treatmentId="p-1" revision="m-1|0.5|s1:completed,s2:current" />)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalledWith(true)
  })
})

describe('117 smoke iOS 2026-11-13 — mensal que zera de propósito não pede 1ª compra', () => {
  it('nunca comprou + zerar planejado → selo Planejado e data de compra, sem CTA, igual à aba', () => {
    const item = {
      ...itemOf(raw(0, 0, [protocol({ frequency: 'intervalo_dias', interval_days: 30 })])),
      runwayAlertExpected: false,
      status: 'PLANNED',
      statusLabel: 'Planejado',
      supply: { status: 'due', date: '2026-12-08', reason: 'sparse', medicineId: 'm-1' },
    }
    const card = setup(item)
    const tab = render(<StockItem medicine={item} />)
    expect(card.queryByText('Sem estoque registrado')).toBeNull()
    expect(tab.queryByText('Nova compra')).toBeNull()
    expect(card.getByText('Planejado')).toBeTruthy()
    expect(tab.getByText('Planejado')).toBeTruthy()
    expect(card.getByTestId('protocol-stock-supply')).toHaveTextContent('Próxima compra até 08/12')
  })

  it('nunca comprou e alerta esperado (diário) → segue o CTA de 1ª compra', () => {
    const card = setup({ ...itemOf(raw(0, 0)), runwayAlertExpected: true })
    expect(card.getByText('Sem estoque registrado')).toBeTruthy()
  })
})

describe('117 smoke 2026-11-13 — CTA de compra abre a compra', () => {
  it('sem estoque registrado → toque abre o formulário de compra do remédio (como a aba)', () => {
    const card = setup(itemOf(raw(0, 0)))
    expect(card.getByText('Nova compra')).toBeTruthy()
    // mesma pílula da aba (componente único)
    expect(card.getByTestId('new-purchase-badge')).toBeTruthy()
    fireEvent.press(card.getByTestId('protocol-stock-card'))
    expect(mockNavigateCrossTab).toHaveBeenCalledWith(ROUTES.STOCK, ROUTES.PURCHASE_FORM, {
      mode: 'create',
      medicineId: 'm-1',
      medicineName: 'Metropolol',
    })
    expect(mockLogEvent).toHaveBeenCalledWith('treatment_stock_tapped', { state: 'empty', treatment_id: 'p-1', surface: 'mobile' })
    expect(render(<StockItem medicine={itemOf(raw(0, 0))} />).getByTestId('new-purchase-badge')).toBeTruthy()
  })
})
