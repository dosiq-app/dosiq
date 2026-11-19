// Spec 119 fatia B · RC2 D-1 · PO-119-11 (parte automatizável): "Digitar à mão" do onboarding sugere
// da lista oficial com o MESMO componente do cadastro, e a caixa escolhida preenche pelo mesmo
// `applySelection` da busca (código de classe incluído). Primeiro remédio ⇒ sem pergunta de candidatos.

import React from 'react'
import { render, fireEvent, act } from '@testing-library/react-native'
import OnboardingMedicineStep from '../screens/OnboardingMedicineStep'
import { OnboardingContext } from '../OnboardingContext'

const mockNav = { navigate: jest.fn(), goBack: jest.fn(), popTo: jest.fn(), addListener: jest.fn(() => () => {}) }
const mockSheet: { props: any } = { props: null }
const MOUNJARO = { name: 'Mounjaro', activeIngredient: 'Tirzepatida', laboratory: 'Lilly', regulatoryCategory: 'Novo', forms: ['injetavel'] }

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNav,
  useRoute: () => ({ params: { manualEntry: true } }),
}))
jest.mock('@shared/hooks/useMedicineDatabase', () => ({
  useMedicineDatabase: () => ({ items: [MOUNJARO], isLoading: false }),
}))
jest.mock('@medications/components/MedicineAnvisaSheet', () => ({
  MedicineAnvisaSheet: (props: any) => {
    mockSheet.props = props
    return null
  },
}))
jest.mock('@shared/components/feedback/Toast', () => ({ useToast: () => ({ show: jest.fn() }) }))
jest.mock('@platform/analytics/productAnalytics', () => ({ logEvent: jest.fn() }))
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native')
  return {
    SafeAreaView: View,
    SafeAreaProvider: ({ children }) => children,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  }
})

function renderStep() {
  const ctx = {
    medicine: null,
    setMedicine: jest.fn(),
    setMedicineSource: jest.fn(),
    setMedicineIntakeUnit: jest.fn(),
    skip: jest.fn(),
  }
  return { ...render(<OnboardingContext.Provider value={ctx as any}><OnboardingMedicineStep /></OnboardingContext.Provider>), ctx }
}

beforeEach(() => jest.useFakeTimers())
afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
  jest.useRealTimers()
  mockSheet.props = null
})

describe('onboarding "Digitar à mão" — sugestões do catálogo (119 B)', () => {
  it('erro de digitação no "Nome do remédio" sugere; tocar abre a escolha da caixa do item', () => {
    const { getByLabelText, getByText, getByRole } = renderStep()
    expect(mockSheet.props.open).toBe(false)
    fireEvent.changeText(getByLabelText('Nome do remédio'), 'tizerpatida')
    act(() => {
      jest.advanceTimersByTime(200)
    })
    expect(getByText('Você quis dizer…')).toBeTruthy()
    fireEvent.press(getByRole('button', { name: 'Mounjaro, Tirzepatida, Lilly' }))
    expect(mockSheet.props).toMatchObject({ open: true, initialItem: MOUNJARO, entryPoint: 'catalog_suggestion' })
  })

  it('a caixa escolhida preenche com código de classe e vai ao contexto com origem anvisa_search', () => {
    const { getByText, ctx } = renderStep()
    act(() =>
      mockSheet.props.onSelect({
        anvisaItem: MOUNJARO,
        cmedDraft: {
          name: 'Mounjaro', active_ingredient: 'Tirzepatida', dosage_per_pill: 5, dosage_unit: 'mg/ml',
          presentation: 'injetavel', laboratory: 'Lilly', anvisa_registration: '112600202',
          regulatory_category: 'Novo', therapeutic_class_code: 'A10S', strengthLabel: '5 mg/ml',
          displayLaboratory: 'Lilly', boxQuantity: 4, doseAmbiguous: false, strengthChoices: [], isGeneric: false,
        },
      })
    )
    expect(mockSheet.props.open).toBe(false)
    fireEvent.press(getByText('Continuar'))
    expect(ctx.setMedicine.mock.calls[0][0]).toMatchObject({ name: 'Mounjaro', therapeutic_class_code: 'A10S', anvisa_registration: '112600202' })
    expect(ctx.setMedicineSource).toHaveBeenCalledWith('anvisa_search')
  })

  it('ignorar as sugestões ⇒ manual, sem código', () => {
    const { getByLabelText, getByText, getByTestId, ctx } = renderStep()
    fireEvent.changeText(getByLabelText('Nome do remédio'), 'tizerpatida')
    fireEvent.changeText(getByLabelText('Concentração'), '5')
    fireEvent.press(getByTestId('presentation-chip-injetavel'))
    fireEvent.press(getByText('Continuar'))
    expect(ctx.setMedicine.mock.calls[0][0].therapeutic_class_code ?? null).toBeNull()
    expect(ctx.setMedicineSource).toHaveBeenCalledWith('manual')
  })
})
