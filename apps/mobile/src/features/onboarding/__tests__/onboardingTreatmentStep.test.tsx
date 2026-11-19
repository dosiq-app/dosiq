// onboardingTreatmentStep.test.tsx — passo "quando" do onboarding (spec 086 · spec 125 T014/AC2.x/AC3.x)
// Framework: Jest (jest-expo) — rodar em apps/mobile/
//
// O passo não grava nada (spec 044): só guarda no contexto via `setTreatment`. Ida e volta no wizard
// remonta o passo com `treatment` do contexto — o preset reaparece porque é derivado dos horários.

import React from 'react'
import { render, fireEvent, act } from '@testing-library/react-native'

const mockSetTreatment = jest.fn()
const mockFinishLater = jest.fn()
let mockTreatment = null
let mockMedicine: any = { name: 'Amoxicilina', presentation: 'comprimido', dosage_per_pill: '500', dosage_unit: 'mg' }
const mockNavigate = jest.fn()
const mockShow = jest.fn()
let mockIntakeUnit = null
jest.mock('../OnboardingContext', () => ({
  useOnboarding: () => ({
    medicine: mockMedicine,
    medicineIntakeUnit: mockIntakeUnit,
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

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
  mockTreatment = null
  mockIntakeUnit = null
  mockMedicine = { name: 'Amoxicilina', presentation: 'comprimido', dosage_per_pill: '500', dosage_unit: 'mg' }
})

describe('comprimido (AC2.3, AC3.1)', () => {
  // Emenda PO smoke 18/11 (AC2.3): atalhos 1x–4x por FREQUÊNCIA (diário/dias alternados), em qualquer forma.
  it('"Quantos comprimidos por vez?" nasce 1; Todo dia e 08:00 marcados; com atalhos 1x–4x; card com Alterar', () => {
    const { getByText, getByTestId, queryByTestId, getByDisplayValue } = render(<OnboardingTreatmentStep />)
    expect(getByText('Quantos comprimidos por vez?')).toBeTruthy()
    expect(getByDisplayValue('1')).toBeTruthy()
    expect(getByTestId('frequency-segment-diário').props.accessibilityState.checked).toBe(true)
    expect(last()).toMatchObject({ frequency: 'diário', time_schedule: ['08:00'] })
    expect(queryByTestId('schedule-presets')).toBeTruthy()
    expect(getByTestId('onboarding-medicine-card')).toBeTruthy()
    expect(getByText('Alterar')).toBeTruthy()
  })

  it('Continuar vai à conferência com medição (dose default, plausível)', () => {
    const { getByText } = render(<OnboardingTreatmentStep />)
    fireEvent.press(getByText('Continuar'))
    expect(mockNavigate).toHaveBeenCalledWith('OnboardingTreatmentReview')
    expect(last()).toMatchObject({ dosage_per_intake: 1, _dose_source: 'manual', _dose_plausible: true })
  })

  it('voltar com tratamento no contexto preserva horários e frequência', () => {
    mockTreatment = {
      medicine_id: 'm-1', name: 'Amoxicilina', dosage_per_intake: 1, frequency: 'diário', weekdays: [],
      time_schedule: ['07:00', '15:00', '23:00'], start_date: '2026-09-29',
    }
    render(<OnboardingTreatmentStep />)
    expect(last().time_schedule).toEqual(['07:00', '15:00', '23:00'])
  })
})

describe('líquido em gotas (AC2.4)', () => {
  it('sem default, ordem da forma, nada pré-marcado; Continuar barra sem frequência e sem gotas', () => {
    mockMedicine = { name: 'Amplictil', presentation: 'liquido', dosage_per_pill: '40', dosage_unit: 'mg/ml' }
    mockIntakeUnit = 'gotas'
    const { getByText, getByTestId, getByLabelText } = render(<OnboardingTreatmentStep />)
    expect(getByText('Quanto toma de cada vez? (gotas)')).toBeTruthy()
    expect(last()).toMatchObject({ dosage_per_intake: '', frequency: '', intake_unit: 'gotas' })
    expect(getByTestId('frequency-segment-diário').props.accessibilityState.checked).toBe(false)
    fireEvent.press(getByText('Continuar'))
    expect(mockShow).toHaveBeenLastCalledWith('Escolha de quanto em quanto tempo.', { variant: 'error' })
    fireEvent.press(getByTestId('frequency-segment-diário'))
    fireEvent.press(getByText('Continuar'))
    expect(mockShow).toHaveBeenLastCalledWith('Digite quanto usa de cada vez.', { variant: 'error' })
    fireEvent.changeText(getByLabelText('Quanto toma de cada vez? (gotas)'), '20')
    fireEvent.press(getByText('Continuar'))
    expect(mockNavigate).toHaveBeenCalledWith('OnboardingTreatmentReview')
    expect(last()).toMatchObject({ _dose_source: 'manual' })
  })
})

describe('injetável (AC2.2, AC2.5, AC2.5b, AC3.3)', () => {
  it('caneta em mg: 1 aplicação, sem campo de dose; Semanal primeiro, nada marcado', () => {
    mockMedicine = { name: 'Mounjaro', presentation: 'injetavel', dosage_per_pill: '2.5', dosage_unit: 'mg' }
    const { queryByText, getAllByRole } = render(<OnboardingTreatmentStep />)
    expect(queryByText(/de cada vez/)).toBeNull()
    expect(last()).toMatchObject({ dosage_per_intake: '1', frequency: '' })
    const radios = getAllByRole('radio').map((r) => r.props.testID).filter((id) => id?.startsWith('frequency-segment'))
    expect(radios).toEqual(['frequency-segment-semanal', 'frequency-segment-diário', 'frequency-segment-mensal_30', 'frequency-segment-dias_alternados', 'frequency-segment-quando_necessário'])
  })

  it('semanal pergunta o dia da aplicação (nada marcado) e o horário do lembrete; o dia ancora a semana', () => {
    mockMedicine = { name: 'Mounjaro', presentation: 'injetavel', dosage_per_pill: '2.5', dosage_unit: 'mg' }
    const { getByText, getByTestId, queryByText } = render(<OnboardingTreatmentStep />)
    fireEvent.press(getByTestId('frequency-segment-semanal'))
    expect(getByText('Quando foi (ou será) a aplicação?')).toBeTruthy()
    expect(getByText('Horário do lembrete')).toBeTruthy()
    expect(queryByText('Dias da semana')).toBeNull()
    for (const id of ['ontem', 'hoje', 'outro']) expect(getByTestId(`application-day-${id}`).props.accessibilityState.checked).toBe(false)
    fireEvent.press(getByText('Continuar'))
    expect(mockShow).toHaveBeenLastCalledWith('Escolha o dia da aplicação.', { variant: 'error' })
    fireEvent.press(getByTestId('application-day-hoje'))
    expect(last().weekdays).toHaveLength(1)
    fireEvent.press(getByText('Continuar'))
    expect(mockNavigate).toHaveBeenCalledWith('OnboardingTreatmentReview')
  })

  it('mg/mL (hi-fi O-3): dose em tela própria, obrigatória, unidade mg; 0,6 avisa "parece mL" sem bloquear; depois o "quando"', () => {
    mockMedicine = { name: 'Ozempic', presentation: 'injetavel', dosage_per_pill: '2.5', dosage_unit: 'mg/ml', concentration_volume_ml: '0.5' }
    mockIntakeUnit = 'mg'
    const { getByText, getByLabelText, getByTestId, queryByTestId, queryByText } = render(<OnboardingTreatmentStep />)
    expect(getByText('Quanto aplica de cada vez?')).toBeTruthy()
    expect(getByText('O número escrito no rótulo da embalagem.')).toBeTruthy()
    expect(getByTestId('intake-unit-mg').props.accessibilityState.checked).toBe(true)
    expect(queryByText('De quanto em quanto tempo?')).toBeNull()
    fireEvent.press(getByText('Continuar'))
    expect(mockShow).toHaveBeenLastCalledWith('Digite quanto usa de cada vez.', { variant: 'error' })
    fireEvent.changeText(getByLabelText('Dose por aplicação'), '0,6')
    expect(getByText(/A dose é em mg\? Confira o número com "mg" ao lado\./)).toBeTruthy()
    fireEvent.press(getByText('Usar 0,6 mg mesmo assim'))
    expect(queryByTestId('dose-warnings')).toBeNull()
    fireEvent.press(getByText('Continuar'))
    expect(getByText('De quanto em quanto tempo?')).toBeTruthy()
    expect(getByTestId('onboarding-medicine-card')).toBeTruthy()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  // Smoke 18/11: remontar com tratamento no contexto abre na DOSE (o "Ajustar" da conferência é goBack e
  // reencontra a tela montada no "quando"; remontagem é ida e volta pelo remédio — a dose é revista).
  it('remontar com tratamento no contexto abre na dose, com a dose preservada', () => {
    mockMedicine = { name: 'Ozempic', presentation: 'injetavel', dosage_per_pill: '2.5', dosage_unit: 'mg/ml', concentration_volume_ml: '0.5' }
    mockIntakeUnit = 'mg'
    mockTreatment = { name: 'Ozempic', dosage_per_intake: 0.5, frequency: 'semanal', weekdays: ['terça'], time_schedule: ['08:00'], start_date: '2026-11-18', _application_date: '2026-11-17' }
    const { getByText, queryByText } = render(<OnboardingTreatmentStep />)
    expect(getByText('Quanto aplica de cada vez?')).toBeTruthy()
    expect(queryByText('De quanto em quanto tempo?')).toBeNull()
  })

  it('no "quando", o voltar do SO volta à dose (beforeRemove), não sai do passo', () => {
    mockMedicine = { name: 'Ozempic', presentation: 'injetavel', dosage_per_pill: '2.5', dosage_unit: 'mg/ml', concentration_volume_ml: '0.5' }
    mockIntakeUnit = 'mg'
    const { getByText, getByLabelText } = render(<OnboardingTreatmentStep />)
    fireEvent.changeText(getByLabelText('Dose por aplicação'), '0,5')
    fireEvent.press(getByText('Continuar'))
    expect(getByText('De quanto em quanto tempo?')).toBeTruthy()
    const call = mockAddListener.mock.calls.find((c: any[]) => c[0] === 'beforeRemove') as any[]
    expect(call).toBeTruthy()
    const e = { data: { action: { type: 'GO_BACK' } }, preventDefault: jest.fn() }
    act(() => { call[1](e) })
    expect(e.preventDefault).toHaveBeenCalled()
    expect(getByText('Quanto aplica de cada vez?')).toBeTruthy()
  })
})

describe('Mensal (086 FR-022 / PO-4b)', () => {
  // Emenda PO smoke 18/11: o onboarding não consulta a trava 085/086 — conta nova sempre vê Mensal.
  it('sem trava no onboarding: Mensal sempre, sem esqueleto', () => {
    mockMedicine = { name: 'Mesigyna', presentation: 'injetavel', dosage_per_pill: '5', dosage_unit: 'mg' }
    const r = render(<OnboardingTreatmentStep />)
    expect(r.getByTestId('frequency-segment-mensal_30')).toBeTruthy()
    expect(r.queryByTestId('frequency-skeleton')).toBeNull()
  })

  it('comprimido: ordem da forma, Mensal antes de Quando precisar (emenda FR-021)', () => {
    const { getAllByRole } = render(<OnboardingTreatmentStep />)
    const radios = getAllByRole('radio').map((r) => r.props.testID).filter((id) => id?.startsWith('frequency-segment'))
    expect(radios).toEqual(['frequency-segment-diário', 'frequency-segment-dias_alternados', 'frequency-segment-semanal', 'frequency-segment-mensal_30', 'frequency-segment-quando_necessário'])
  })

  it('injetável: Mensal ⇒ intervalo_dias/30, rótulo com o número, dia da aplicação; → Todo dia limpa interval_days', () => {
    mockMedicine = { name: 'Mesigyna', presentation: 'injetavel', dosage_per_pill: '5', dosage_unit: 'mg' }
    const { getByTestId, getByText } = render(<OnboardingTreatmentStep />)
    fireEvent.press(getByTestId('frequency-segment-mensal_30'))
    expect(last()).toMatchObject({ frequency: 'intervalo_dias', interval_days: 30 })
    expect(getByText('Mensal')).toBeTruthy()
    expect(getByText('Quando foi (ou será) a aplicação?')).toBeTruthy()
    fireEvent.press(getByTestId('frequency-segment-diário'))
    expect(last()).toMatchObject({ frequency: 'diário', interval_days: null })
  })

  it('voltar com Mensal no contexto ⇒ Mensal segue marcado', () => {
    mockMedicine = { name: 'Mesigyna', presentation: 'injetavel', dosage_per_pill: '5', dosage_unit: 'mg' }
    mockTreatment = {
      medicine_id: 'm-1', name: 'Mesigyna', dosage_per_intake: 1, frequency: 'intervalo_dias', interval_days: 30,
      weekdays: [], time_schedule: ['08:00'], start_date: '2026-10-20',
    }
    const { getByTestId } = render(<OnboardingTreatmentStep />)
    expect(getByTestId('frequency-segment-mensal_30').props.accessibilityState.checked).toBe(true)
  })
})

describe('unidade da tomada (066 E, C-7)', () => {
  it('voltou depois de trocar o remédio: a unidade segue o remédio atual', () => {
    mockIntakeUnit = 'UI'
    mockTreatment = {
      medicine_id: 'm-1', name: 'Amoxicilina', dosage_per_intake: 1, frequency: 'diário', weekdays: [],
      time_schedule: ['08:00'], start_date: '2026-09-29', intake_unit: 'gotas',
    }
    render(<OnboardingTreatmentStep />)
    expect(last()).toMatchObject({ intake_unit: 'UI' })
  })
})

describe('Terminar depois (spec 125, AC1.2)', () => {
  it('sai pelo consentimento só com o remédio (medicine_only, passo 2)', () => {
    const { getByText } = render(<OnboardingTreatmentStep />)
    fireEvent.press(getByText('Terminar depois'))
    expect(mockFinishLater).toHaveBeenCalledWith(2, 'medicine_only')
  })
})
