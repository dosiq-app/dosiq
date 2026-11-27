import { useCallback } from 'react'
import { Platform } from 'react-native'
import * as Sentry from '@sentry/react-native'
import { useToast } from '@shared/components/feedback/Toast'
import { logEvent } from '@platform/analytics/productAnalytics'
import { EVENTS, SURFACES, type StoreReviewPlacement } from '@platform/analytics/analyticsEvents'
import { openStoreReviewPage } from '@platform/versionGate/storeUrls'
import { recordStoreReviewClicked } from '@profile/services/profileService'

export const STORE_NAME = Platform.OS === 'android' ? 'Google Play' : 'App Store'

/**
 * Botão de avaliar na loja. A gravação do clique roda em segundo plano e nunca segura nem
 * bloqueia a abertura da loja: offline, a loja abre e o erro vai só ao Sentry.
 */
export function useStoreReviewLink(placement: StoreReviewPlacement) {
  const { show } = useToast()

  const openStoreReview = useCallback(async () => {
    void logEvent(EVENTS.STORE_REVIEW_LINK_TAPPED, { placement, surface: SURFACES.MOBILE })
    recordStoreReviewClicked().catch((err) => {
      Sentry.captureException(err, { tags: { feature: 'store_review_link' } })
    })
    const opened = await openStoreReviewPage()
    if (!opened) show('Não foi possível abrir a loja agora.', { variant: 'error' })
  }, [placement, show])

  return { openStoreReview, storeName: STORE_NAME }
}
