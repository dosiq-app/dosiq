// ProfileScreen.storeReview.test.tsx — Sobre o dosiq: avaliar na loja, relatar, privacidade.

import { fireEvent, render, screen } from '@testing-library/react-native'

const mockNavigate = jest.fn()
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
  useFocusEffect: jest.fn(),
}))
jest.mock('@profile/hooks/useProfile', () => ({
  useProfile: () => ({
    user: { id: 'u1' },
    loading: false,
    error: null,
    refresh: jest.fn(),
    hasProfile: true,
    displayName: 'Ana',
    initials: 'A',
    age: null,
    location: null,
  }),
}))
jest.mock('@profile/hooks/useNudges', () => ({
  useNudges: () => ({ nudge: null, dismiss: jest.fn(), handleAction: jest.fn(), refresh: jest.fn() }),
}))
jest.mock('@shared/hooks/useUnreadBadgeCount', () => ({
  useUnreadBadgeCount: () => ({ unreadCount: 0, refreshBadge: jest.fn() }),
}))
jest.mock('@profile/services/profileService', () => ({ logoutUser: jest.fn() }))
jest.mock('@platform/session/endSession', () => ({ drainAuditQueue: jest.fn() }))
jest.mock('@platform/updates/bundleInfo', () => ({
  getBundleInfo: () => ({}),
  formatBundleLabel: () => '',
  formatChannelLabel: () => '',
}))
jest.mock('@features/_dev/components/DevBadge', () => () => null)
jest.mock('@platform/supabase/nativeSupabaseClient', () => ({ supabase: { auth: {} } }))
const mockOpenStoreReview = jest.fn()
let mockStoreName = 'App Store'
jest.mock('@profile/hooks/useStoreReviewLink', () => ({
  useStoreReviewLink: (placement: string) => {
    mockPlacement(placement)
    return { openStoreReview: mockOpenStoreReview, storeName: mockStoreName }
  },
}))
const mockPlacement = jest.fn()

import ProfileScreen from '../ProfileScreen'
import { ROUTES } from '@navigation/routes'

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('ProfileScreen — Sobre o dosiq (047 A)', () => {
  it.each(['App Store', 'Google Play'])('linha "Avaliar na %s" é link com hint e abre a loja', (store) => {
    mockStoreName = store
    render(<ProfileScreen />)
    const row = screen.getByRole('link', { name: `Avaliar na ${store}` })
    expect(row.props.accessibilityHint).toBe(`Abre a ${store}`)
    fireEvent.press(row)
    expect(mockOpenStoreReview).toHaveBeenCalledTimes(1)
    expect(mockPlacement).toHaveBeenCalledWith('profile_about')
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('ordem: Avaliar → Relatar problema ou sugestão → Privacidade e dados; "Enviar feedback" saiu', () => {
    mockStoreName = 'App Store'
    render(<ProfileScreen />)
    const labels = screen
      .getAllByText(/^(Avaliar na App Store|Relatar problema ou sugestão|Privacidade e dados)$/)
      .map((n) => n.props.children)
    expect(labels).toEqual(['Avaliar na App Store', 'Relatar problema ou sugestão', 'Privacidade e dados'])
    expect(screen.queryByText('Enviar feedback')).toBeNull()
  })

  it('"Relatar problema ou sugestão" leva ao formulário', () => {
    render(<ProfileScreen />)
    fireEvent.press(screen.getByText('Relatar problema ou sugestão'))
    expect(mockNavigate).toHaveBeenCalledWith(ROUTES.FEEDBACK)
  })
})
