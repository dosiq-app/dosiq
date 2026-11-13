// ProtocolStockCard — 117 Fatia A (US-2 · FR-003): estoque do medicamento no detalhe do tratamento.
//
// - Mesmo item e mesma regra de exibição da aba Estoque (`useStockItem` + `stockItemView`): saldo,
//   pill, CTA de 1ª compra e "Próxima compra até" — nada calculado aqui (INV-5, boundary da PO-3).
// - Estoque desligado (opt-in global) ⇒ não renderiza e não lê nada (AC-2.5, mesmo gate da tab bar).
// - Toque com estoque abre o detalhe do estoque (AC-2.2), só com `medicineId`/`medicineName` (o detalhe
//   recalcula o consumo — C1.5 U-2). Sem estoque registrado, abre direto o formulário de compra daquele
//   remédio, como o item da aba (`StockScreen` `isInitialStock`) — o CTA promete compra, entrega compra
//   (smoke 117 A, 2026-11-13).
// - Carregando ou erro sem dado: não renderiza (não inventa saldo).

import { useCallback, useEffect, useRef } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
// TODO(040-strict): named imports do lucide-react-native batem em TS2305 — ver TreatmentsScreen.tsx
import * as LucideIcons from 'lucide-react-native'
import { formatStockQuantity } from '@dosiq/core'
import SectionCard from '@shared/components/ui/SectionCard'
import { useStockTracking } from '@shared/hooks/useStockTracking'
import { useStockItem } from '@stock/hooks/useStockItem'
import { stockItemView } from '@stock/hooks/_stockDataTransformer'
import StockLevelBadge from '@stock/components/StockLevelBadge'
import NewPurchaseBadge from '@stock/components/NewPurchaseBadge'
import { navigateCrossTab } from '@navigation/navigateCrossTab'
import { ROUTES } from '@navigation/routes'
import { logEvent } from '@platform/analytics/productAnalytics'
import { EVENTS, SURFACES } from '@platform/analytics/analyticsEvents'
import { selectionTap } from '@shared/utils/haptics'
import { colors, spacing } from '@shared/styles/tokens'

const { ChevronRight } = LucideIcons as any

type Props = {
  medicine: { id: string; name: string; dosage_unit?: string | null; dosage_per_pill?: number | null } | null
  treatmentId: string
  /**
   * Muda quando o tratamento muda de um jeito que mexe no consumo (dose, remédio, etapa). O estoque
   * deriva a previsão da dose DO TRATAMENTO: iniciar uma etapa troca a dose sem trocar de foco, e sem
   * isto o card ficava com o consumo da dose antiga (smoke 117 A, Android, 2026-11-13).
   */
  revision?: string
}

export default function ProtocolStockCard({ medicine, treatmentId, revision = '' }: Props) {
  const { enabled, ready } = useStockTracking()
  if (!ready || !enabled || !medicine?.id) return null
  return <ProtocolStockCardBody medicine={medicine} treatmentId={treatmentId} revision={revision} />
}

function ProtocolStockCardBody({
  medicine,
  treatmentId,
  revision,
}: {
  medicine: NonNullable<Props['medicine']>
  treatmentId: string
  revision: string
}) {
  // States
  const { item, ready, refresh } = useStockItem(medicine.id)
  const viewedRef = useRef<string | null>(null)
  const firstFocusRef = useRef(true)
  const lastRevisionRef = useRef(revision)

  // Memos (derivação trivial, sem custo)
  const view = item ? stockItemView(item) : null
  const isEmpty = !item || view?.showInitialStockHint === true
  const state = isEmpty ? 'empty' : 'level'

  // Effects
  // Volta da compra/detalhe do estoque: relê e conta nova exibição. O 1º foco é pulado — o
  // `useStock` já lê no mount (sem isto, duas leituras ao abrir o detalhe).
  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false
        return
      }
      viewedRef.current = null
      refresh(true)
    }, [refresh])
  )

  // Tratamento mudou na própria tela (iniciar etapa, troca de remédio): relê o estoque.
  useEffect(() => {
    if (lastRevisionRef.current === revision) return
    lastRevisionRef.current = revision
    refresh(true)
  }, [revision, refresh])

  useEffect(() => {
    if (!ready || viewedRef.current === state) return
    viewedRef.current = state
    logEvent(EVENTS.TREATMENT_STOCK_VIEWED, { state, treatment_id: treatmentId, surface: SURFACES.MOBILE })
  }, [ready, state, treatmentId])

  // Handlers
  const openStock = useCallback(() => {
    selectionTap()
    logEvent(EVENTS.TREATMENT_STOCK_TAPPED, { state, treatment_id: treatmentId, surface: SURFACES.MOBILE })
    if (isEmpty) {
      navigateCrossTab(ROUTES.STOCK, ROUTES.PURCHASE_FORM, {
        mode: 'create',
        medicineId: medicine.id,
        medicineName: medicine.name,
      })
      return
    }
    navigateCrossTab(ROUTES.STOCK, ROUTES.STOCK_DETAIL, { medicineId: medicine.id, medicineName: medicine.name })
  }, [state, isEmpty, treatmentId, medicine.id, medicine.name])

  if (!ready) return null

  return (
    <Pressable
      onPress={openStock}
      accessibilityRole="button"
      accessibilityLabel={isEmpty ? 'Sem estoque registrado. Registrar nova compra' : 'Abrir estoque do medicamento'}
      testID="protocol-stock-card"
    >
      {({ pressed }) => (
        <SectionCard
          title="ESTOQUE"
          headerAction={<ChevronRight size={20} color={colors.primary[700]} />}
          style={pressed ? styles.pressed : undefined}
        >
          {isEmpty ? (
            <View style={styles.row}>
              <Text style={styles.emptyText}>Sem estoque registrado</Text>
              <NewPurchaseBadge />
            </View>
          ) : (
            <>
              <View style={styles.row}>
                <Text style={styles.quantity}>
                  Saldo:{' '}
                  <Text style={styles.bold}>
                    {formatStockQuantity(item.totalQuantity, {
                      dosage_unit: item.dosage_unit,
                      dosage_per_pill: item.dosage_per_pill,
                    })}
                  </Text>
                </Text>
                {view?.showBadge ? (
                  <StockLevelBadge
                    status={item.status}
                    daysRemaining={item.daysRemaining}
                    dosesRemaining={item.dosesRemaining}
                    isDailyStock={item.isDailyStock}
                  />
                ) : null}
              </View>
              {view?.supplyLabel ? (
                <Text style={styles.supply} testID="protocol-stock-supply">{view.supplyLabel}</Text>
              ) : null}
            </>
          )}
        </SectionCard>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  quantity: { flex: 1, fontSize: 14, color: colors.text.primary },
  bold: { fontWeight: '700', color: colors.text.primary },
  supply: { fontSize: 13, fontWeight: '600', color: colors.text.secondary, marginTop: spacing[1] },
  emptyText: { flex: 1, fontSize: 14, color: colors.text.secondary },
})
