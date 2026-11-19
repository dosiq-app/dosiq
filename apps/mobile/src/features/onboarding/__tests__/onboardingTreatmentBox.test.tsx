// onboardingTreatmentBox.test.tsx — spec 125 1b: dose pela embalagem no passo do tratamento.
// Framework: Jest (jest-expo) — rodar em apps/mobile/

import React from 'react'
import { render, fireEvent, act } from '@testing-library/react-native'

const mockSetTreatment = jest.fn()
const mockFinishLater = jest.fn()
let mockTreatment = null
let mockMedicine: any = { name: 'Amoxicilina', presentation: 'comprimido', dosage_per_pill: '500', dosage_unit: 'mg' }
const mockNavigate = jest.fn()
const mockShow = jest.fn()
let mockIntakeUnit = null
let mockSource: any = 'anvisa_search'
let mockBox: any = null
jest.mock('../OnboardingContext', () => ({
  useOnboarding: () => ({
    medicine: mockMedicine,
    medicineIntakeUnit: mockIntakeUnit,
    medicineSource: mockSource,
    medicineBox: mockBox,
    treatment: mockTreatment,
    setTreatment: (...args) => mockSetTreatment(...args),
    skip: jest.fn(),
    finishLater: (...args) => mockFinishLater(...args),
  }),
}))
const mockAddListener = jest.fn((..._a: any[]) => () => {})
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), navigate: mockNavigate, addListener: (...a) => mockAddListener(...a) }),
}))
jest.mock('@shared/components/feedback/Toast', () => ({ useToast: () => ({ show: mockShow }) }))
jest.mock('@features/onboarding/components/OnboardingHeader', () => ({ __esModule: true, default: () => null }))
// Rodapé usa safe-area insets (fora do escopo deste teste).
jest.mock('@shared/components/form/FormActions', () => {
  const { Pressable, Text } = jest.requireActual('react-native')
  return {
    __esModule: true,
    default: ({ primaryLabel, onPrimary, footer }) => (
      <>
        <Pressable onPress={onPrimary}><Text>{primaryLabel}</Text></Pressable>
        {footer}
      </>
    ),
  }
})
// Seletores de data/hora nativos fora do escopo: o dublê mostra o rótulo (a pergunta) e mais nada.
jest.mock('@shared/components/form', () => {
  const { Text } = jest.requireActual('react-native')
  return { FormDatePicker: ({ label }) => <Text>{label}</Text>, FormTimePicker: ({ label }) => <Text>{label}</Text> }
})

import OnboardingTreatmentStep from '../screens/OnboardingTreatmentStep'

function last() {
  const calls = mockSetTreatment.mock.calls
  return calls[calls.length - 1][0]
}

// Rascunho do onboarding guarda o valor da CAIXA ("2,5 mg / 0,5 mL" ⇒ 2,5).
const MOUNJARO = { name: 'Mounjaro', presentation: 'injetavel', dosage_per_pill: '2.5', dosage_unit: 'mg/ml', concentration_volume_ml: '0.5' }
const BOX = { dosageUnit: 'mg/ml', dialDoses: [] }
const OZEMPIC = { name: 'Ozempic', presentation: 'injetavel', dosage_per_pill: '1.34', dosage_unit: 'mg/ml', concentration_volume_ml: '' }
const OZEMPIC_BOX = { dosageUnit: 'mg/ml', dialDoses: [0.25, 0.5, 1] }

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
  mockTreatment = null
  mockIntakeUnit = null
  mockSource = 'anvisa_search'
  mockBox = null
})

describe('125 1b — tela da dose (smoke 19/11: a dose é da receita)', () => {
  it('subtítulo fala da receita; campo sem sugestão', () => {
    mockMedicine = OZEMPIC
    mockIntakeUnit = 'mg'
    mockBox = OZEMPIC_BOX
    const { getByText, getByDisplayValue } = render(<OnboardingTreatmentStep />)
    expect(getByText('O número escrito na sua receita médica.')).toBeTruthy()
    expect(getByDisplayValue('').props.placeholder).toBeUndefined()
  })
})

describe('125 1b — dose pela embalagem (PO-125-9)', () => {
  it('Mounjaro pela caixa: 2,5 mg preenchido, origem visível, sem pergunta', () => {
    mockMedicine = MOUNJARO
    mockIntakeUnit = 'mg'
    mockBox = BOX
    const { getByDisplayValue, getByTestId, queryByText, getByText } = render(<OnboardingTreatmentStep />)
    expect(getByDisplayValue('2.5')).toBeTruthy()
    expect(getByTestId('dose-origin').props.children).toBe('Da embalagem: 2,5 mg por aplicação.')
    expect(queryByText(/é uma aplicação\?/)).toBeNull()
    fireEvent.press(getByText('Continuar'))
    expect(last()).toMatchObject({ dosage_per_intake: 2.5, intake_unit: 'mg' })
  })

  it('RC5 1b: só o chip mg — sem mL ao lado da dose da caixa (2,5 viraria 2,5 mL)', () => {
    mockMedicine = MOUNJARO
    mockIntakeUnit = 'mg'
    mockBox = BOX
    const { getByTestId, queryByTestId } = render(<OnboardingTreatmentStep />)
    expect(getByTestId('intake-unit-mg')).toBeTruthy()
    expect(queryByTestId('intake-unit-ml')).toBeNull()
  })

  it('editável: digitar outra dose mantém o valor digitado', () => {
    mockMedicine = MOUNJARO
    mockIntakeUnit = 'mg'
    mockBox = BOX
    const { getByDisplayValue, getByText } = render(<OnboardingTreatmentStep />)
    fireEvent.changeText(getByDisplayValue('2.5'), '5')
    fireEvent.press(getByText('Continuar'))
    expect(last()).toMatchObject({ dosage_per_intake: 5, intake_unit: 'mg' })
  })

  it('PO-125-11: manual (Lipoless 2,5 mg / 0,6 mL) ⇒ dose vazia, sem origem, embalagem antiga ignorada', () => {
    mockMedicine = { ...MOUNJARO, name: 'Lipoless', concentration_volume_ml: '0.6' }
    mockIntakeUnit = 'mg'
    mockSource = 'manual'
    mockBox = BOX
    const { queryByTestId } = render(<OnboardingTreatmentStep />)
    expect(queryByTestId('dose-origin')).toBeNull()
    expect(last()).toMatchObject({ dosage_per_intake: '' })
  })
})

describe('125 1b — caneta multidose (PO-125-10)', () => {
  it('Ozempic: dose vazia, atalhos da caixa; tocar 0,5 preenche; sem conteúdo da caneta', () => {
    mockMedicine = OZEMPIC
    mockIntakeUnit = 'mg'
    mockBox = OZEMPIC_BOX
    const { getByTestId, queryByTestId, queryByText } = render(<OnboardingTreatmentStep />)
    expect(last()).toMatchObject({ dosage_per_intake: '' })
    expect(queryByTestId('dose-origin')).toBeNull()
    expect(queryByText(/Esta caneta tem/)).toBeNull()
    fireEvent.press(getByTestId('dial-dose-0.5'))
    expect(last()).toMatchObject({ dosage_per_intake: 0.5, intake_unit: 'mg' })
    expect(getByTestId('dial-dose-1')).toBeTruthy()
  })
})
