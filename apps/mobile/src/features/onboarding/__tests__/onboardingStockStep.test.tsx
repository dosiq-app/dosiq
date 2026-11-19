// onboardingStockStep.test.tsx — passo de estoque (spec 044 · emenda PO smoke 125, 18/11: nada pré-marcado).
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import OnboardingStockStep from '../screens/OnboardingStockStep'

const mockNav = { navigate: jest.fn(), goBack: jest.fn() }
const mockSetStockTracking = jest.fn()
const mockFinishLater = jest.fn()
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNav }))
jest.mock('../OnboardingContext', () => ({
  useOnboarding: () => ({ setStockTracking: mockSetStockTracking, finishLater: mockFinishLater }),
}))
jest.mock('@features/onboarding/components/OnboardingHeader', () => ({ __esModule: true, default: () => null }))
jest.mock('@shared/components/form/FormActions', () => {
  const { Pressable, Text } = jest.requireActual('react-native')
  return {
    __esModule: true,
    default: ({ primaryLabel, onPrimary, primaryDisabled, footer }) => (
      <>
        <Pressable onPress={onPrimary} accessibilityState={{ disabled: primaryDisabled }} testID="primary"><Text>{primaryLabel}</Text></Pressable>
        {footer}
      </>
    ),
  }
})
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native')
  return { SafeAreaView: View }
})

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('passo de estoque (044 · emenda 125)', () => {
  it('nada pré-marcado; Continuar desabilitado e inerte até escolher', () => {
    const { getAllByRole, getByTestId } = render(<OnboardingStockStep />)
    for (const r of getAllByRole('radio')) expect(r.props.accessibilityState.checked).toBe(false)
    expect(getByTestId('primary').props.accessibilityState.disabled).toBe(true)
    fireEvent.press(getByTestId('primary'))
    expect(mockSetStockTracking).not.toHaveBeenCalled()
    expect(mockNav.navigate).not.toHaveBeenCalled()
  })

  it('escolher "também estoque" e continuar grava true no contexto e vai ao consentimento', () => {
    const { getAllByRole, getByTestId } = render(<OnboardingStockStep />)
    fireEvent.press(getAllByRole('radio')[1])
    fireEvent.press(getByTestId('primary'))
    expect(mockSetStockTracking).toHaveBeenCalledWith(true)
    expect(mockNav.navigate).toHaveBeenCalledWith('OnboardingConsent')
  })

  it('Terminar depois ⇒ consentimento full, passo 3', () => {
    const { getByText } = render(<OnboardingStockStep />)
    fireEvent.press(getByText('Terminar depois'))
    expect(mockFinishLater).toHaveBeenCalledWith(3, 'full')
  })
})
