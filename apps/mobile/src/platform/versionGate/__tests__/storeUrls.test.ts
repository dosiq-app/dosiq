import { Linking } from 'react-native'
import { openStoreReviewPage, STORE_REVIEW_URLS } from '../storeUrls'

describe('openStoreReviewPage', () => {
  let openURL: jest.SpyInstance

  beforeEach(() => {
    openURL = jest.spyOn(Linking, 'openURL')
  })

  afterEach(() => {
    jest.clearAllMocks()
    jest.clearAllTimers()
    openURL.mockRestore()
  })

  it('links de escrita de avaliação levam action=write-review no iOS', () => {
    expect(STORE_REVIEW_URLS.ios.primary).toBe(
      'itms-apps://itunes.apple.com/app/viewContentsUserReviews/id6762740948?action=write-review',
    )
    expect(STORE_REVIEW_URLS.ios.fallback).toBe(
      'https://apps.apple.com/br/app/id6762740948?action=write-review',
    )
    expect(STORE_REVIEW_URLS.android.primary).toBe('market://details?id=com.coelhotv.dosiq')
    expect(STORE_REVIEW_URLS.android.fallback).toBe(
      'https://play.google.com/store/apps/details?id=com.coelhotv.dosiq',
    )
  })

  it.each(['ios', 'android'] as const)('%s: primária abre ⇒ true, sem tentar a reserva', async (os) => {
    openURL.mockResolvedValueOnce(true)
    await expect(openStoreReviewPage(os)).resolves.toBe(true)
    expect(openURL).toHaveBeenCalledTimes(1)
    expect(openURL).toHaveBeenCalledWith(STORE_REVIEW_URLS[os].primary)
  })

  it.each(['ios', 'android'] as const)('%s: primária falha ⇒ tenta a reserva em silêncio', async (os) => {
    openURL.mockRejectedValueOnce(new Error('no handler')).mockResolvedValueOnce(true)
    await expect(openStoreReviewPage(os)).resolves.toBe(true)
    expect(openURL).toHaveBeenNthCalledWith(2, STORE_REVIEW_URLS[os].fallback)
  })

  it('ambas falham ⇒ false, sem lançar', async () => {
    openURL.mockRejectedValue(new Error('no handler'))
    await expect(openStoreReviewPage('ios')).resolves.toBe(false)
    expect(openURL).toHaveBeenCalledTimes(2)
  })
})
