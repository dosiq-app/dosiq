// onboardingManual.test.tsx — caminho manual forma › nome › dosagem (spec 125, AC2.0/AC2.1/AC2.1b/AC2.6, PO-125-3/4).
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import OnboardingPresentationStep from '../screens/OnboardingPresentationStep'
import OnboardingNameStep from '../screens/OnboardingNameStep'
import OnboardingStrengthStep from '../screens/OnboardingStrengthStep'
import { OnboardingContext } from '../OnboardingContext'

const mockNav = { navigate: jest.fn(), goBack: jest.fn(), popTo: jest.fn(), addListener: jest.fn(() => () => {}) }
const mockRoute: { current: any } = { current: { params: {} } }
const mockShow = jest.fn()
const mockActivate = jest.fn()

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNav,
  useRoute: () => mockRoute.current,
}))
jest.mock('@shared/components/feedback/Toast', () => ({ useToast: () => ({ show: mockShow }) }))
jest.mock('@medications/hooks/useCatalogSuggestionSheet', () => ({
  useCatalogSuggestionSheet: () => ({
    field: null,
    activate: mockActivate,
    bindChange: (handler) => (name, value) => handler(name, value),
  }),
}))
jest.mock('@medications/components/CatalogSuggestionList', () => ({ CatalogFieldSuggestions: () => null }))
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native')
  return { SafeAreaView: View, SafeAreaProvider: ({ children }) => children, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }
})

function ctx(over: Record<string, unknown> = {}) {
  return {
    medicine: null,
    setMedicine: jest.fn(),
    setMedicineSource: jest.fn(),
    setMedicineIntakeUnit: jest.fn(),
    skip: jest.fn(),
    finishLater: jest.fn(),
    ...over,
  }
}

function renderWith(ui: React.ReactElement, params: Record<string, unknown>, c = ctx()) {
  mockRoute.current = { params }
  return { ...render(<OnboardingContext.Provider value={c as any}>{ui}</OnboardingContext.Provider>), c }
}

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('F-2 forma (AC2.1)', () => {
  it('7 chips sem pré-seleção; Continuar só após a escolha; leva o texto da busca', () => {
    const { getByTestId, getByText } = renderWith(<OnboardingPresentationStep />, { query: 'lipoless' })
    const all = ['comprimido', 'capsula', 'liquido', 'injetavel', 'pomada', 'spray', 'outro']
    for (const p of all) expect(getByTestId(`presentation-chip-${p}`).props.accessibilityState).toMatchObject({ checked: false })
    fireEvent.press(getByText('Continuar'))
    expect(mockNav.navigate).not.toHaveBeenCalled()
    fireEvent.press(getByTestId('presentation-chip-injetavel'))
    fireEvent.press(getByText('Continuar'))
    expect(mockNav.navigate).toHaveBeenCalledWith('OnboardingMedicineName', { presentation: 'injetavel', query: 'lipoless' })
  })

  it('ainda sem remédio: "Pular" do topo continua (AC1.3)', () => {
    const { getByText, c } = renderWith(<OnboardingPresentationStep />, {})
    fireEvent.press(getByText('Pular'))
    expect(c.skip).toHaveBeenCalledWith(1)
  })
})

describe('F-3 nome (AC2.1b)', () => {
  it('vem com o texto da busca, roda a sugestão e segue à mão para a dosagem', () => {
    const { getByText, queryByText } = renderWith(<OnboardingNameStep />, { presentation: 'injetavel', query: 'lipoless' })
    expect(mockActivate).toHaveBeenCalledWith('name')
    expect(queryByText('Pular')).toBeNull()
    fireEvent.press(getByText('Continuar com "lipoless"'))
    expect(mockNav.navigate).toHaveBeenCalledWith('OnboardingMedicineStrength', { presentation: 'injetavel', name: 'lipoless' })
  })

  it('pomada não tem dosagem: grava nome + forma + un e vai ao tratamento (C-3)', () => {
    const { getByText, c } = renderWith(<OnboardingNameStep />, { presentation: 'pomada', query: 'Nebacetin' })
    fireEvent.press(getByText('Continuar com "Nebacetin"'))
    expect(c.setMedicine).toHaveBeenCalledWith(expect.objectContaining({ name: 'Nebacetin', presentation: 'pomada', dosage_unit: 'un' }))
    expect(c.setMedicineSource).toHaveBeenCalledWith('manual')
    expect(c.setMedicineIntakeUnit).toHaveBeenCalledWith(null)
    expect(mockNav.navigate).toHaveBeenCalledWith('OnboardingTreatment')
  })
})

describe('F-4 dosagem (AC2.6, C-2)', () => {
  it('unidades filtradas pela forma, nenhuma marcada', () => {
    const { getByTestId, queryByTestId } = renderWith(<OnboardingStrengthStep />, { presentation: 'injetavel', name: 'X' })
    for (const u of ['mg/ml', 'ui/ml', 'mg', 'ui']) expect(getByTestId(`unit-chip-${u}`).props.accessibilityState).toMatchObject({ checked: false })
    expect(queryByTestId('unit-chip-mcg')).toBeNull()
  })

  it('sem número ou sem unidade não segue', () => {
    const { getByText, getByLabelText } = renderWith(<OnboardingStrengthStep />, { presentation: 'comprimido', name: 'X' })
    fireEvent.press(getByText('Continuar'))
    expect(mockShow).toHaveBeenCalledWith('Digite o número escrito na caixa.', { variant: 'error' })
    fireEvent.changeText(getByLabelText('Dosagem'), '50')
    fireEvent.press(getByText('Continuar'))
    expect(mockShow).toHaveBeenLastCalledWith('Escolha a unidade.', { variant: 'error' })
    expect(mockNav.navigate).not.toHaveBeenCalled()
  })

  it('injetável mg/mL: forma injetável preservada, tomada em mg', () => {
    const { getByText, getByLabelText, getByTestId, c } = renderWith(<OnboardingStrengthStep />, { presentation: 'injetavel', name: 'Ozempic' })
    fireEvent.changeText(getByLabelText('Dosagem'), '1,34')
    fireEvent.press(getByTestId('unit-chip-mg/ml'))
    fireEvent.press(getByText('Continuar'))
    expect(c.setMedicine).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ozempic', presentation: 'injetavel', dosage_unit: 'mg/ml', dosage_per_pill: '1.34' }))
    expect(c.setMedicineIntakeUnit).toHaveBeenCalledWith('mg')
    expect(mockNav.navigate).toHaveBeenCalledWith('OnboardingTreatment')
  })

  it('injetável em mg por caneta: tomada em aplicações (intake null)', () => {
    const { getByText, getByLabelText, getByTestId, c } = renderWith(<OnboardingStrengthStep />, { presentation: 'injetavel', name: 'Mounjaro' })
    fireEvent.changeText(getByLabelText('Dosagem'), '2,5')
    fireEvent.press(getByTestId('unit-chip-mg'))
    fireEvent.press(getByText('Continuar'))
    expect(c.setMedicine).toHaveBeenCalledWith(expect.objectContaining({ presentation: 'injetavel', dosage_unit: 'mg' }))
    expect(c.setMedicineIntakeUnit).toHaveBeenCalledWith(null)
  })

  it('/mL: número depois da barra só pelo atalho; 20 mL avisa sem bloquear (AC3.4)', () => {
    const { getByText, getByLabelText, getByTestId, queryByLabelText, c } = renderWith(<OnboardingStrengthStep />, { presentation: 'liquido', name: 'Amplictil' })
    fireEvent.changeText(getByLabelText('Dosagem'), '40')
    fireEvent.press(getByTestId('unit-chip-mg/ml'))
    expect(queryByLabelText('Número depois da barra (mL)')).toBeNull()
    fireEvent.press(getByTestId('volume-shortcut'))
    fireEvent.changeText(getByLabelText('Número depois da barra (mL)'), '20')
    expect(getByTestId('volume-warning').props.children).toBe('20 mL parece o tamanho do frasco. Na caixa, o número depois da barra costuma ser menor.')
    fireEvent.press(getByText('Continuar'))
    expect(c.setMedicine).toHaveBeenCalledWith(expect.objectContaining({ presentation: 'liquido', concentration_volume_ml: '20' }))
    expect(c.setMedicineIntakeUnit).toHaveBeenCalledWith('gotas')
  })

  it('Terminar depois com dosagem completa ⇒ remédio no contexto e consentimento medicine_only (AC1.1, C-1)', () => {
    const { getByText, getByLabelText, getByTestId, c } = renderWith(<OnboardingStrengthStep />, { presentation: 'comprimido', name: 'Losartana' })
    fireEvent.changeText(getByLabelText('Dosagem'), '50')
    fireEvent.press(getByTestId('unit-chip-mg'))
    fireEvent.press(getByText('Terminar depois'))
    expect(c.setMedicine).toHaveBeenCalledWith(expect.objectContaining({ name: 'Losartana', dosage_unit: 'mg' }))
    expect(c.finishLater).toHaveBeenCalledWith(1, 'medicine_only')
    expect(mockNav.navigate).not.toHaveBeenCalled()
  })

  it('Terminar depois sem dosagem não sai (Zod exige unidade — C-1)', () => {
    const { getByText, c } = renderWith(<OnboardingStrengthStep />, { presentation: 'comprimido', name: 'Losartana' })
    fireEvent.press(getByText('Terminar depois'))
    expect(c.finishLater).not.toHaveBeenCalled()
  })
})

describe('"Confira" sem caixa (AC3.5 boundary)', () => {
  it('à mão o campo continua editável (a trava é só da caixa)', () => {
    // Coberto pelo F-4: OnboardingStrengthStep sempre edita; aqui garantimos que a trava exige caixa.
    const { getByLabelText, queryByTestId } = renderWith(<OnboardingStrengthStep />, { presentation: 'comprimido', name: 'X' })
    expect(queryByTestId('strength-locked')).toBeNull()
    expect(getByLabelText('Dosagem')).toBeTruthy()
  })
})
