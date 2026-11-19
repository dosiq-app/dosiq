// onboardingTreatmentReview.test.tsx — "Está certo?" (spec 125, AC4.1/AC4.2, PO-125-8).
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import OnboardingTreatmentReviewStep from '../screens/OnboardingTreatmentReviewStep'
import { OnboardingContext } from '../OnboardingContext'

const mockNav = { navigate: jest.fn(), goBack: jest.fn() }
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNav }))
jest.mock('@features/onboarding/components/OnboardingHeader', () => ({ __esModule: true, default: () => null }))
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
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native')
  return { SafeAreaView: View }
})

function renderWith(ctx) {
  return render(
    <OnboardingContext.Provider value={ctx}>
      <OnboardingTreatmentReviewStep />
    </OnboardingContext.Provider>,
  )
}

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('Está certo? (AC4.1)', () => {
  // Emendas PO smoke 18/11: "Próxima" com horário; "Terminar depois" (full, passo 2); lembrete aqui.
  it('frase do core para a caneta semanal; Próxima com horário; Terminar depois sem Pular', () => {
    const finishLater = jest.fn()
    const { getByTestId, getByText, queryByText } = renderWith({
      finishLater,
      setTreatment: jest.fn(),
      medicine: { name: 'Mounjaro', presentation: 'injetavel', dosage_per_pill: '2.5', dosage_unit: 'mg' },
      medicineIntakeUnit: null,
      treatment: { dosage_per_intake: 1, frequency: 'semanal', weekdays: ['terça'], time_schedule: ['08:00'], start_date: '2026-11-18' },
    })
    expect(getByTestId('treatment-sentence').props.children).toBe('Mounjaro · injetável · 1 aplicação de 2,5 mg · toda terça às 08:00')
    expect(getByTestId('treatment-next').props.children).toMatch(/^Próxima: (hoje|amanhã|terça, \d{2}\/\d{2}) às 08:00$/)
    expect(queryByText('Pular')).toBeNull()
    fireEvent.press(getByText('Terminar depois'))
    expect(finishLater).toHaveBeenCalledWith(2, 'full')
  })

  it('"Continuar" segue ao estoque; "Ajustar" (link no card, hi-fi O-5) volta ao passo "quando" (AC4.2)', () => {
    const { getByText } = renderWith({
      setTreatment: jest.fn(),
      finishLater: jest.fn(),
      medicine: { name: 'Losartana', presentation: 'comprimido', dosage_per_pill: '50', dosage_unit: 'mg' },
      medicineIntakeUnit: null,
      treatment: { dosage_per_intake: 1, frequency: 'diário', time_schedule: ['08:00'], start_date: '2026-11-18' },
    })
    fireEvent.press(getByText('Continuar'))
    expect(mockNav.navigate).toHaveBeenCalledWith('OnboardingStock')
    fireEvent.press(getByText('Ajustar'))
    expect(mockNav.goBack).toHaveBeenCalled()
  })
})
