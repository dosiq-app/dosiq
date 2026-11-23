import React, { useCallback } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import PromoCardShell, { type PromoCardTone } from '@shared/components/ui/PromoCardShell'
import { colors } from '@shared/styles/tokens'
import { logEvent } from '@platform/analytics/productAnalytics'
import { EVENTS, SURFACES } from '@platform/analytics/analyticsEvents'
import { navigateCrossTab } from '@navigation/navigateCrossTab'
import { ROUTES } from '@navigation/routes'
import type { StockAlertPayload, StockLevel } from '@dashboard/utils/todayStockCandidates'
import { stockAlertCopy } from '@dashboard/utils/stockAlertCopy'
// TODO(040-strict): named imports do lucide-react-native batem em TS2305 sob nodenext
import * as LucideIcons from 'lucide-react-native'

const { PackageX, PackagePlus, PackageSearch } = LucideIcons as any

/**
 * TodayAlertCard — alerta OPERACIONAL da Hoje (estoque e próxima compra), spec 120 C.
 * D-13: moldura única (`PromoCardShell`, DC-1) e ícone + tom por situação; o texto também muda —
 * a cor nunca vem sozinha (a11y):
 *   sem estoque c/ dose em 24 h ⇒ PackageX · erro · acabando ⇒ PackagePlus · aviso
 *   próxima compra ⇒ PackagePlus · neutro  · baixo ⇒ PackageSearch · neutro
 * 1º toque (FR-012 / PO-120-15): registro de compra DAQUELE remédio (`PURCHASE_FORM`, travado).
 * Dispensa por X (DC-2 · D-B) — quem guarda é o `useTodayAlertDismissals`.
 */
interface Props {
  payload: StockAlertPayload
  /** Quantos alertas de estoque estão elegíveis (só para o `stock_low_viewed`). */
  stockCount?: number
  onDismiss?: () => void
  /** 125 fatia 2: foco da Hoje ⇒ botão cheio; senão contorno. */
  emphasis?: boolean
}

type Look = { tone: PromoCardTone; Icon: any; color: string }

const LOOK: Record<StockLevel | 'supply', Look> = {
  stock_zero: { tone: 'error', Icon: PackageX, color: colors.status.error },
  stock_urgent: { tone: 'warning', Icon: PackagePlus, color: colors.status.warning },
  supply: { tone: 'neutral', Icon: PackagePlus, color: colors.text.secondary },
  stock_low: { tone: 'neutral', Icon: PackageSearch, color: colors.text.secondary },
}

export default function TodayAlertCard({ payload, stockCount = 1, onDismiss, emphasis = true }: Props) {
  const level = payload.type === 'supply' ? 'supply' : payload.level
  // S-21: compra escalada usa o visual do degrau (âmbar D-2..D-1, vermelho em D).
  const urgency = payload.type === 'supply' ? payload.urgency : null
  const lookKey = urgency === 'due' ? 'stock_zero' : urgency === 'soon' ? 'stock_urgent' : level
  const { tone, Icon, color } = LOOK[lookKey]
  const copy = stockAlertCopy(payload)

  // 065 C2 — `stock_low_viewed` (evento de visualização, 1×/foco). Nível no vocabulário antigo do
  // evento (critical/low) para não quebrar a série; compra não emite (não é falta).
  const viewedKind = level === 'stock_low' ? 'low' : level === 'supply' ? null : 'critical'
  useFocusEffect(
    useCallback(() => {
      if (!viewedKind) return
      logEvent(EVENTS.STOCK_LOW_VIEWED, { surface: SURFACES.MOBILE, kind: viewedKind, count: stockCount })
    }, [viewedKind, stockCount])
  )

  // Grupo (smoke 125 2a): não há UM remédio para travar o form ⇒ abre o Estoque.
  const group = payload.type === 'stock_group'
  const openPurchase = () => group
    ? navigateCrossTab(ROUTES.STOCK, ROUTES.STOCK_MAIN)
    : navigateCrossTab(ROUTES.STOCK, ROUTES.PURCHASE_FORM, {
      mode: 'create',
      medicineId: copy.medicineId,
      medicineName: copy.name,
    })

  return (
    <PromoCardShell
      testID="today-alert-card"
      tone={tone}
      emphasis={emphasis}
      icon={<Icon size={22} color={color} />}
      title={copy.title}
      subtitle={copy.subtitle}
      primary={{
        label: 'Registrar compra',
        accessibilityLabel: group ? `Abrir o estoque: ${copy.name}` : `Registrar compra de ${copy.name}`,
        onPress: openPurchase,
        testID: 'today-alert-cta',
      }}
      dismiss={onDismiss ? {
        accessibilityLabel: group ? 'Dispensar aviso de estoque' : `Dispensar aviso de estoque de ${copy.name}`,
        onPress: onDismiss,
        testID: 'today-alert-dismiss',
      } : undefined}
    />
  )
}
