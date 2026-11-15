import { useCallback, useEffect } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { homesWithSignal, type TodaySurfaces } from '@dashboard/utils/pickTodaySurfaces'
import { setSignalHomes } from '@dashboard/state/todaySurfaceSignal'
import { logEvent } from '@platform/analytics/productAnalytics'
import { EVENTS, SURFACES } from '@platform/analytics/analyticsEvents'

/**
 * Publica a saída do árbitro: (1) casas com sinal discreto (D-6) e (2) `today_surface_shown`
 * 1× por foco e quando a escolha muda com a tela focada (FR-015 / SC-005 — responde se algum
 * alerta passa semanas suprimido). Só tipos, nunca nome de remédio (R-042).
 */
export function useTodaySurfaceSignal(surfaces: TodaySurfaces & { signature: string }) {
  const { suppressed, alert, promo, signature } = surfaces

  useEffect(() => {
    setSignalHomes(homesWithSignal(suppressed))
  }, [signature]) // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(
    useCallback(() => {
      logEvent(EVENTS.TODAY_SURFACE_SHOWN, {
        surface: SURFACES.MOBILE,
        alert: alert?.kind ?? null,
        promo: promo ?? null,
        suppressed: suppressed.map((s) => s.kind),
        suppressed_count: suppressed.length,
      })
    }, [signature]), // eslint-disable-line react-hooks/exhaustive-deps
  )
}
