// FeedbackScreen.test.tsx — "Problema ou sugestão": card da loja no topo, formulário sem estrelas.
// Framework: Jest (jest-expo) — rodar em apps/mobile/

import { render, fireEvent, screen, waitFor } from '@testing-library/react-native'

const mockGoBack = jest.fn()
const mockShow = jest.fn()
const mockSubmit = jest.fn()
const mockOpenStoreReview = jest.fn()
const mockPlacement = jest.fn()

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, navigate: jest.fn() }),
}))
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native')
  return {
    SafeAreaView: View,
    SafeAreaProvider: ({ children }: { children: unknown }) => children,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  }
})
jest.mock('@shared/components/feedback/Toast', () => ({ useToast: () => ({ show: mockShow }) }))
jest.mock('@platform/supabase/nativeSupabaseClient', () => ({
  supabase: { auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) } },
}))
jest.mock('@dosiq/core', () => ({
  ...jest.requireActual('@dosiq/core'),
  createFeedbackRepository: () => ({ submitFeedback: (p: unknown) => mockSubmit(p) }),
}))
jest.mock('@profile/hooks/useStoreReviewLink', () => ({
  useStoreReviewLink: (placement: string) => {
    mockPlacement(placement)
    return { openStoreReview: mockOpenStoreReview, storeName: 'Google Play' }
  },
}))

import FeedbackScreen from '../FeedbackScreen'

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('FeedbackScreen (047 A)', () => {
  it('título "Problema ou sugestão" e card único da loja no topo, sem o intro antigo', () => {
    render(<FeedbackScreen />)
    expect(screen.getByText('Problema ou sugestão')).toBeTruthy()
    expect(screen.getByText('Quer elogiar? Avalie na Google Play')).toBeTruthy()
    expect(screen.queryByText('Sua opinião importa!')).toBeNull()
    expect(mockPlacement).toHaveBeenCalledWith('feedback_screen_top')
  })

  it('CTA da loja é link com hint e chama a abertura da loja', () => {
    render(<FeedbackScreen />)
    const cta = screen.getByRole('link', { name: 'Avaliar na Google Play' })
    expect(cta.props.accessibilityHint).toBe('Abre a Google Play')
    fireEvent.press(cta)
    expect(mockOpenStoreReview).toHaveBeenCalledTimes(1)
  })

  it('formulário tem cabeçalho próprio e rodapé só com "Enviar" (sem Cancelar)', () => {
    render(<FeedbackScreen />)
    expect(screen.getByRole('header', { name: 'Relatar problema ou sugestão' })).toBeTruthy()
    expect(screen.getByText('Conte o que deu errado ou o que podemos melhorar.')).toBeTruthy()
    expect(screen.getByText('Enviar')).toBeTruthy()
    expect(screen.queryByText('Cancelar')).toBeNull()
  })

  it('sem seletor de estrelas', () => {
    render(<FeedbackScreen />)
    expect(screen.queryByText('Como você avalia nosso app?')).toBeNull()
    expect(screen.queryByLabelText(/Avaliar com \d estrela/)).toBeNull()
  })

  it('envio grava em feedbacks com rating nulo, toast novo e volta', async () => {
    mockSubmit.mockResolvedValue({ id: 'f1' })
    render(<FeedbackScreen />)
    fireEvent.changeText(screen.getByPlaceholderText(/Ex: Erro ao cadastrar/), 'Erro no estoque')
    fireEvent.changeText(screen.getByPlaceholderText(/Escreva aqui/), 'O saldo não atualizou depois da compra.')
    fireEvent.press(screen.getByText('Enviar'))

    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(1))
    expect(mockSubmit.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        subject: 'Erro no estoque',
        comment: 'O saldo não atualizou depois da compra.',
        rating: null,
      }),
    )
    await waitFor(() =>
      expect(mockShow).toHaveBeenCalledWith('Recebemos. Obrigado por avisar!', { variant: 'success' }),
    )
    expect(mockGoBack).toHaveBeenCalled()
  })
})
