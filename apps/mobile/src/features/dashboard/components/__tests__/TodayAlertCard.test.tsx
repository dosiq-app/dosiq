// spec 120 C · PO-120-19 (moldura única + ícone/tom por situação) · PO-120-15 (1º toque) ·
// 065 C2 (stock_low_viewed) · 103 G1 (texto por cadência) — migrados do StockAlertInline.
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'

const mockLogEvent = jest.fn()
jest.mock('@platform/analytics/productAnalytics', () => ({
  logEvent: (...args) => mockLogEvent(...args),
}))
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react')
  return { useFocusEffect: (cb) => useEffect(cb, [cb]) }
})
const mockCrossTab = jest.fn()
jest.mock('@navigation/navigateCrossTab', () => ({
  navigateCrossTab: (...args) => mockCrossTab(...args),
}))
const mockIcons: string[] = []
jest.mock('lucide-react-native', () => {
  const icon = (name: string) => () => { mockIcons.push(name); return null }
  return { PackageX: icon('PackageX'), PackagePlus: icon('PackagePlus'), PackageSearch: icon('PackageSearch'), X: () => null }
})

import TodayAlertCard from '../TodayAlertCard'
import { stockAlertCopy } from '../../utils/stockAlertCopy'
import { colors } from '@shared/styles/tokens'

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
  mockIcons.length = 0
})

const NOW = new Date(2026, 10, 14, 21, 30)
const item = (over: any = {}) => ({ medicineId: 'm1', medicineName: 'Glifage', daysRemaining: 5, dosesRemaining: 5, isDailyStock: true, ...over })
const stock = (level: any, over: any = {}, nextDose: any = null) => ({ type: 'stock' as const, level, item: item(over), nextDose })
const supply = { type: 'supply' as const, item: { medicineId: 'm3', medicineName: 'Mounjaro 10', buyMedicineId: 'm4', buyMedicineName: 'Mounjaro 12,5 mg', date: '2026-11-20', daysUntil: 6, reason: 'step_switch' } }
const bgOf = (el: any) => [].concat(el.props.style).reduce((acc: any, s: any) => ({ ...acc, ...(s || {}) }), {}).backgroundColor

describe('TodayAlertCard — moldura única, ícone e tom (D-13 / PO-120-19)', () => {
  it.each([
    ['stock_zero', stock('stock_zero', { isZero: true, daysRemaining: 0, dosesRemaining: 0 }), 'PackageX', colors.status.errorLight],
    ['stock_urgent', stock('stock_urgent', { daysRemaining: 2 }), 'PackagePlus', colors.status.warningLight],
    ['supply', supply, 'PackagePlus', colors.bg.card],
    ['stock_low', stock('stock_low'), 'PackageSearch', colors.bg.card],
  ])('%s ⇒ %s, mesma casca', (_l, payload, icon, bg) => {
    const { getByTestId } = render(<TodayAlertCard payload={payload as any} />)
    expect(mockIcons).toContain(icon)
    expect(bgOf(getByTestId('today-alert-card'))).toBe(bg)
  })
})

describe('TodayAlertCard — texto (DC-2, 103 G1)', () => {
  it('sem estoque com dose amanhã', () => {
    const c = stockAlertCopy(stock('stock_zero', { isZero: true, daysRemaining: 0, dosesRemaining: 0 }, { date: '2026-11-15', time: '08:00' }), NOW)
    expect(c.title).toBe('Sem estoque de Glifage')
    expect(c.subtitle).toBe('A próxima dose é amanhã às 08:00. Registre a compra para não faltar.')
  })
  it('sem estoque sem dose em 24 h', () => {
    expect(stockAlertCopy(stock('stock_urgent', { dosesRemaining: 0, daysRemaining: 0 }), NOW).subtitle).toBe('Registre a compra antes da próxima dose.')
  })
  it('diário em dias; não diário em doses', () => {
    expect(stockAlertCopy(stock('stock_low', { daysRemaining: 5 }), NOW).title).toBe('Glifage acaba em 5 dias')
    expect(stockAlertCopy(stock('stock_urgent', { daysRemaining: 1 }), NOW).title).toBe('Glifage acaba em 1 dia')
    expect(stockAlertCopy(stock('stock_urgent', { medicineName: 'Wegovy', isDailyStock: false, dosesRemaining: 1, daysRemaining: 7 }), NOW).title).toBe('Resta 1 dose de Wegovy')
    expect(stockAlertCopy(stock('stock_low', { isDailyStock: false, dosesRemaining: 3, daysRemaining: 6 }), NOW).title).toBe('Restam 3 doses de Glifage')
  })
  it('próxima compra: texto da 105 (etapa)', () => {
    const c = stockAlertCopy(supply as any, NOW)
    expect(c.title).toBe('A próxima etapa usa Mounjaro 12,5 mg')
    expect(c.subtitle).toBe('Garanta até 20/11 — você ainda não tem estoque dela.')
  })
})

describe('TodayAlertCard — 1º toque e dispensa (PO-120-15 / D-B)', () => {
  it('estoque ⇒ registro de compra DAQUELE remédio', () => {
    const { getByLabelText } = render(<TodayAlertCard payload={stock('stock_low') as any} />)
    fireEvent.press(getByLabelText('Registrar compra de Glifage'))
    expect(mockCrossTab).toHaveBeenCalledWith('Estoque', 'PurchaseForm', { mode: 'create', medicineId: 'm1', medicineName: 'Glifage' })
  })
  it('próxima compra ⇒ compra do remédio da próxima etapa', () => {
    const { getByLabelText } = render(<TodayAlertCard payload={supply as any} />)
    fireEvent.press(getByLabelText('Registrar compra de Mounjaro 12,5 mg'))
    expect(mockCrossTab).toHaveBeenCalledWith('Estoque', 'PurchaseForm', { mode: 'create', medicineId: 'm4', medicineName: 'Mounjaro 12,5 mg' })
  })
  it('X dispensa com rótulo do remédio; sem onDismiss não há X', () => {
    const onDismiss = jest.fn()
    const { getByLabelText, rerender, queryByLabelText } = render(<TodayAlertCard payload={stock('stock_low') as any} onDismiss={onDismiss} />)
    fireEvent.press(getByLabelText('Dispensar aviso de estoque de Glifage'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
    rerender(<TodayAlertCard payload={stock('stock_low') as any} />)
    expect(queryByLabelText('Dispensar aviso de estoque de Glifage')).toBeNull()
  })
})

describe('TodayAlertCard — stock_low_viewed (065 C2)', () => {
  it('baixo ⇒ low; acabando/zerado ⇒ critical; compra não emite', () => {
    render(<TodayAlertCard payload={stock('stock_low') as any} stockCount={2} />)
    expect(mockLogEvent).toHaveBeenLastCalledWith('stock_low_viewed', expect.objectContaining({ kind: 'low', count: 2 }))
    render(<TodayAlertCard payload={stock('stock_urgent', { daysRemaining: 1 }) as any} />)
    expect(mockLogEvent).toHaveBeenLastCalledWith('stock_low_viewed', expect.objectContaining({ kind: 'critical' }))
    mockLogEvent.mockClear()
    render(<TodayAlertCard payload={supply as any} />)
    expect(mockLogEvent).not.toHaveBeenCalled()
  })
})
