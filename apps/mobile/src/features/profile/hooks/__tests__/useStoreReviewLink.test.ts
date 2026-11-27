// Framework: Jest (jest-expo) — rodar em apps/mobile/
import { renderHook, act } from '@testing-library/react-native'
import { useStoreReviewLink } from '../useStoreReviewLink'

const mockShow = jest.fn()
const mockLogEvent = jest.fn()
const mockRecord = jest.fn()
const mockOpen = jest.fn()
const mockCapture = jest.fn()

jest.mock('@shared/components/feedback/Toast', () => ({ useToast: () => ({ show: mockShow }) }))
jest.mock('@platform/analytics/productAnalytics', () => ({
  logEvent: (...a: unknown[]) => mockLogEvent(...a),
}))
jest.mock('@profile/services/profileService', () => ({
  recordStoreReviewClicked: () => mockRecord(),
}))
jest.mock('@platform/versionGate/storeUrls', () => ({
  openStoreReviewPage: () => mockOpen(),
}))
jest.mock('@sentry/react-native', () => ({
  captureException: (...a: unknown[]) => mockCapture(...a),
}))

const flush = () => new Promise((r) => setImmediate(r))

describe('useStoreReviewLink', () => {
  afterEach(() => {
    jest.clearAllMocks()
    jest.clearAllTimers()
  })

  it('toque: emite evento com placement, grava o clique e abre a loja, sem toast', async () => {
    mockRecord.mockResolvedValue(undefined)
    mockOpen.mockResolvedValue(true)
    const { result } = renderHook(() => useStoreReviewLink('profile_about'))

    await act(async () => {
      await result.current.openStoreReview()
    })

    expect(mockLogEvent).toHaveBeenCalledWith('store_review_link_tapped', {
      placement: 'profile_about',
      surface: 'mobile',
    })
    expect(mockRecord).toHaveBeenCalledTimes(1)
    expect(mockOpen).toHaveBeenCalledTimes(1)
    expect(mockShow).not.toHaveBeenCalled()
  })

  it('gravação rejeita ⇒ loja abre mesmo assim, sem toast, erro vai ao Sentry (RC3 E2)', async () => {
    const boom = new Error('42501')
    mockRecord.mockRejectedValue(boom)
    mockOpen.mockResolvedValue(true)
    const { result } = renderHook(() => useStoreReviewLink('feedback_screen_top'))

    await act(async () => {
      await result.current.openStoreReview()
      await flush()
    })

    expect(mockOpen).toHaveBeenCalledTimes(1)
    expect(mockShow).not.toHaveBeenCalled()
    expect(mockCapture).toHaveBeenCalledWith(boom, expect.anything())
  })

  it('gravação pendurada não segura a abertura da loja', async () => {
    mockRecord.mockReturnValue(new Promise(() => {}))
    mockOpen.mockResolvedValue(true)
    const { result } = renderHook(() => useStoreReviewLink('profile_about'))

    await act(async () => {
      await result.current.openStoreReview()
    })

    expect(mockOpen).toHaveBeenCalledTimes(1)
  })

  it('loja não abre (primária e reserva) ⇒ toast de erro', async () => {
    mockRecord.mockResolvedValue(undefined)
    mockOpen.mockResolvedValue(false)
    const { result } = renderHook(() => useStoreReviewLink('profile_about'))

    await act(async () => {
      await result.current.openStoreReview()
    })

    expect(mockShow).toHaveBeenCalledWith('Não foi possível abrir a loja agora.', { variant: 'error' })
  })
})
