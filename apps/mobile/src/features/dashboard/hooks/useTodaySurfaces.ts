import { useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { getNow } from '@dosiq/core'
import { pickTodaySurfaces, nextSessionGate, OPEN_GATE, type AlertCandidate, type SessionGate } from '@dashboard/utils/pickTodaySurfaces'
import { buildStockCandidates, groupStockCandidates, type StockAlertPayload, type StockAlertItem, type SupplyNoticeItem } from '@dashboard/utils/todayStockCandidates'
import { useTodayAlertDismissals } from '@dashboard/hooks/useTodayAlertDismissals'

/**
 * useTodaySurfaces — junta a ELEGIBILIDADE que cada superfície já calcula e entrega ao árbitro
 * (`pickTodaySurfaces`, spec 120 C · ADR-129). A tela só renderiza o que sai daqui (boundary
 * PO-120-13: nada de prioridade espalhada no TodayScreen).
 *
 * Push (120 A): elegível = lembrável e não utilizável; adiado ("Agora não") = dispensado.
 * Estoque/compra: `buildStockCandidates` + dispensa por chave (D-B).
 */
export interface TodaySurfacesArgs {
  userId: string | null | undefined
  hasHero: boolean
  push: { usable: boolean | null; snoozed: boolean | null; remindable: boolean }
  /** Bateria (068): elegível ignora o dismiss; dispensada ⇒ não aparece, mas sinaliza a casa (S-11). */
  oem: { eligible: boolean; dismissed: boolean; reason?: 'restricted' | 'battery' | null }
  otaReady: boolean
  stockUpsellVisible: boolean
  nudge: unknown
  stockAlerts: StockAlertItem[]
  supplyNotices: SupplyNoticeItem[]
  protocols: any[]
}

export function useTodaySurfaces({
  userId, hasHero, push, oem, otaReady, stockUpsellVisible, nudge, stockAlerts, supplyNotices, protocols,
}: TodaySurfacesArgs) {
  const { isDismissed, dismiss } = useTodayAlertDismissals(userId)
  // S-06: espera de sessão — reabre ao voltar do segundo plano.
  const [gate, setGate] = useState<SessionGate>(OPEN_GATE)
  // S-18: mesma espera para o PROMO — fechou o upsell ⇒ o nudge só no próximo foreground.
  const [promoGate, setPromoGate] = useState<SessionGate>(OPEN_GATE)
  const appState = useRef(AppState.currentState)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (/inactive|background/.test(appState.current) && next === 'active') {
        setGate(OPEN_GATE)
        setPromoGate(OPEN_GATE)
      }
      appState.current = next
    })
    return () => sub.remove()
  }, [])

  // Sem memo no "agora" (AP-366): a janela de 24 h do "sem estoque" vale a cada render.
  const now = getNow()
  // Smoke 125 2a: N do mesmo nível ⇒ 1 card; a dispensa do grupo é checada na chave do grupo.
  const stockCandidates = groupStockCandidates(
    buildStockCandidates(stockAlerts, supplyNotices, protocols, now).map((c) => ({ ...c, dismissed: isDismissed(c.key) })),
  ).map((c) => ({ ...c, dismissed: isDismissed(c.key) }))

  const pushEligible = push.remindable && push.usable === false
  const alerts: Array<AlertCandidate<StockAlertPayload | null>> = [
    ...stockCandidates,
    ...(pushEligible ? [{ kind: 'push' as const, key: 'push', dismissed: push.snoozed === true }] : []),
    ...(oem.eligible ? [{ kind: 'oem' as const, key: 'oem', dismissed: oem.dismissed, oemReason: oem.reason ?? null }] : []),
    ...(otaReady ? [{ kind: 'ota' as const, key: 'ota' }] : []),
  ]

  const raw = pickTodaySurfaces({ hasHero, alerts, stockUpsell: stockUpsellVisible, nudge: !!nudge })
  const activeKeys = new Set(alerts.filter((a) => !a.dismissed).map((a) => a.key))
  const nextGate = nextSessionGate(gate, raw.alert?.key ?? null, activeKeys)
  // Derivar estado de prop no render (padrão React), não em effect.
  if (nextGate !== gate) setGate(nextGate)
  const gated = nextGate.quiet
    ? pickTodaySurfaces({ hasHero, alerts, stockUpsell: stockUpsellVisible, nudge: !!nudge, quiet: true })
    : raw
  const activePromos = new Set([...(stockUpsellVisible ? ['stock_upsell'] : []), ...(nudge ? ['nudge'] : [])])
  const nextPromoGate = nextSessionGate(promoGate, gated.promo, activePromos)
  if (nextPromoGate !== promoGate) setPromoGate(nextPromoGate)
  const surfaces = nextPromoGate.quiet ? { ...gated, promo: null } : gated
  const stockCount = (stockAlerts ?? []).length

  // Chave estável para o evento de medição (1 por foco quando muda) — FR-015.
  const signature = `${surfaces.alert?.key ?? '-'}+${surfaces.companion?.key ?? '-'}|${surfaces.promo ?? '-'}|${surfaces.suppressed.map((s) => s.key).join(',')}`

  return { ...surfaces, stockCount, dismissAlert: dismiss, signature }
}
