// 125 1c (PO-125-28 · AC7.7/AC7.8/AC7.9) — form de compra de injetável na ordem nova:
// Medicamento › Ler a caixa › Como vem (chips = os 5 do CHECK) › quantidade + volume › preço ›
// data da compra (visível) › "Mais detalhes" FECHADO (validade, farmácia, laboratório, EAN, observações).
// Rótulos e total na língua do recipiente; "≈ N aplicações" só com mL por aplicação de um tratamento ativo.

import React from 'react'
import { render, fireEvent, act, waitFor } from '@testing-library/react-native'
import { INJECTION_CONTAINERS } from '@dosiq/core'
import PurchaseFormScreen from '../PurchaseFormScreen'
import { containerWords, mlPerApplication, purchaseTotalText } from '@stock/utils/purchaseContainer'

const mockGetById = jest.fn()
const mockProtocols: { rows: any[] } = { rows: [] }
const mockRoute: { current: any } = { current: { params: {} } }

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn(), setParams: jest.fn(), popTo: jest.fn() }),
  useRoute: () => mockRoute.current,
}))
jest.mock('@stock/hooks/useStockMutation', () => ({
  useStockMutation: () => ({ createPurchase: jest.fn(), createLiquidPurchase: jest.fn(), updatePurchase: jest.fn(), isLoading: false }),
}))
jest.mock('@medications/services/medicineService', () => ({
  medicineService: { getById: (...args: any[]) => mockGetById(...args) },
}))
jest.mock('@treatments/services/protocolService', () => ({
  protocolService: { getByMedicineId: jest.fn(async () => mockProtocols.rows) },
}))
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native')
  return { SafeAreaView: View, SafeAreaProvider: ({ children }) => children, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }
})

// Mounjaro 2,5 mg/0,5 mL, salvo como razão 5 mg/mL com volume 0,5.
const MOUNJARO = {
  id: 'm-mj', name: 'Mounjaro', presentation: 'injetavel', dosage_per_pill: 5, dosage_unit: 'mg/ml',
  concentration_volume_ml: 0.5, regulatory_category: 'Novo', laboratory: 'Lilly',
}

async function renderPurchase(medicine = MOUNJARO) {
  mockGetById.mockResolvedValue(medicine)
  mockRoute.current = { params: { mode: 'create', medicineId: medicine.id, medicineName: medicine.name } }
  const utils = render(<PurchaseFormScreen />)
  await waitFor(() => expect(mockGetById).toHaveBeenCalled())
  await act(async () => {})
  return utils
}

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
  mockProtocols.rows = []
})

describe('PO-125-28 — form de compra de injetável', () => {
  it('"Como vem" em chips com os 5 valores do CHECK, antes da quantidade', async () => {
    const utils = await renderPurchase()
    for (const c of INJECTION_CONTAINERS) expect(utils.getByTestId(`container-${c}`)).toBeTruthy()
    expect(utils.getByText('Nº de unidades')).toBeTruthy() // sem recipiente: rótulo neutro
  })

  it('recipiente escolhido muda os rótulos; tocar de novo desmarca', async () => {
    const utils = await renderPurchase()
    fireEvent.press(utils.getByTestId('container-caneta'))
    expect(utils.getByText('Nº de canetas')).toBeTruthy()
    expect(utils.getByText('mL por caneta')).toBeTruthy()
    fireEvent.press(utils.getByTestId('container-caneta'))
    expect(utils.getByText('Nº de unidades')).toBeTruthy()
  })

  it('data da compra visível; validade, farmácia e código de barras em "Mais detalhes" fechado', async () => {
    const utils = await renderPurchase()
    expect(utils.getAllByText(/Data da compra/).length).toBeGreaterThan(0)
    expect(utils.queryByText('Farmácia')).toBeNull()
    expect(utils.queryByText('Código de barras')).toBeNull()
    fireEvent.press(utils.getByTestId('purchase-more-details'))
    expect(utils.getByText('Farmácia')).toBeTruthy()
    expect(utils.getByText('Código de barras')).toBeTruthy()
  })
})

describe('regras do total (AC7.8)', () => {
  it('rótulos: injetável sem recipiente = unidade; frasco_ampola = frasco; líquido oral = frasco; refil→refis', () => {
    expect(containerWords(true, '')).toEqual({ singular: 'unidade', plural: 'unidades' })
    expect(containerWords(true, 'frasco_ampola')).toEqual({ singular: 'frasco', plural: 'frascos' })
    expect(containerWords(false, null)).toEqual({ singular: 'frasco', plural: 'frascos' })
    expect(containerWords(true, 'refil').plural).toBe('refis')
  })

  it('mL por aplicação: mg ÷ concentração por mL; mL direto; sem tratamento/dose/concentração ⇒ null', () => {
    expect(mlPerApplication(MOUNJARO, [{ active: true, dosage_per_intake: 2.5, intake_unit: 'mg' }])).toBeCloseTo(0.5)
    expect(mlPerApplication(MOUNJARO, [{ active: true, dosage_per_intake: 0.3, intake_unit: 'ml' }])).toBe(0.3)
    expect(mlPerApplication(MOUNJARO, [])).toBeNull()
    expect(mlPerApplication(MOUNJARO, null)).toBeNull()
    expect(mlPerApplication(MOUNJARO, [{ active: false, dosage_per_intake: 2.5, intake_unit: 'mg' }])).toBeNull()
    expect(mlPerApplication(MOUNJARO, [{ active: true, dosage_per_intake: 0, intake_unit: 'mg' }])).toBeNull()
    expect(mlPerApplication({ ...MOUNJARO, dosage_per_pill: null }, [{ active: true, dosage_per_intake: 2.5, intake_unit: 'mg' }])).toBeNull()
  })

  it('total: "1 caneta · 2,4 mL ≈ 4 aplicações"; sem mL por aplicação, sem o "≈"', () => {
    const words = containerWords(true, 'caneta')
    expect(purchaseTotalText(1, 2.4, words, 0.6)).toBe('1 caneta · 2,4 mL ≈ 4 aplicações')
    expect(purchaseTotalText(2, 0.5, words, null)).toBe('2 canetas · 1 mL')
  })
})
