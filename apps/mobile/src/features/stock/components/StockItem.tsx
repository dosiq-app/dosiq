import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
// TODO(040-strict): named imports do lucide-react-native batem em TS2305 sob
// apps/mobile/tsconfig.json — ver nota em TreatmentsScreen.tsx
import * as LucideIcons from 'lucide-react-native'
const { Syringe } = LucideIcons as any
import SectionCard from '../../../shared/components/ui/SectionCard'
import StockLevelBadge from './StockLevelBadge'
import NewPurchaseBadge from './NewPurchaseBadge'
import { formatStockQuantity, formatConcentration } from '@dosiq/core'
import { colors, spacing, borderRadius } from '../../../shared/styles/tokens'
import { stockItemView } from '@stock/hooks/_stockDataTransformer'

/**
 * Item de lista para exibição de estoque.
 */
export default function StockItem({ medicine }) {
  const {
    name,
    laboratory,
    totalQuantity,
    dosage_unit,
    dosage_per_pill,
    concentration_volume_ml,
    daysRemaining,
    dosesRemaining,
    isDailyStock,
    ttlExpired,
    ttlDaysLeft,
    ttlAlertActive,
  } = medicine

  // 117 A (INV-5): mesma regra de exibição do card do detalhe do tratamento. 105 FR-009: a data de
  // compra do core; sem data ⇒ null (FR-010).
  // 117 B: CTA com tom (AC-4.5/FR-013), selo da seção (PLANEJADO/PAUSADO) e linha "começa" do Programado.
  const { purchaseCta, badge, supplyLabel, scheduleLabel } = stockItemView(medicine)

  // Líquido → "X ml"; sólido → hint princípio ativo / "X un." (formatStockQuantity)
  const saldoText = formatStockQuantity(totalQuantity, { dosage_unit, dosage_per_pill })

  return (
    <SectionCard 
      title={
        <View style={styles.titleWrapper}>
          <Text style={styles.titleText}>{name}</Text>
          {dosage_per_pill && (
            <View style={styles.dosagePill}>
              <Text style={styles.dosagePillText}>
                {formatConcentration(dosage_per_pill, dosage_unit, concentration_volume_ml)}
              </Text>
            </View>
          )}
        </View>
      }
    >
      <View style={styles.container}>
        <View style={styles.infoRow}>
          <View style={styles.mainInfo}>
            {laboratory ? (
              <Text style={styles.lab}>{laboratory}</Text>
            ) : null}
            {scheduleLabel ? (
              <Text style={styles.schedule} testID="stock-item-schedule">{scheduleLabel}</Text>
            ) : null}
            <Text style={styles.quantity}>
              Saldo: <Text style={styles.bold}>{saldoText}</Text>
            </Text>
          </View>

          {purchaseCta ? (
            <NewPurchaseBadge tone={purchaseCta.tone} />
          ) : badge ? (
            <StockLevelBadge
              status={badge}
              daysRemaining={daysRemaining}
              dosesRemaining={dosesRemaining}
              isDailyStock={isDailyStock}
            />
          ) : null}
        </View>

        {/* 105 FR-009: largura total, abaixo do saldo+selo — ao lado do selo quebrava cedo (smoke 2026-11-06) */}
        {supplyLabel ? (
          <Text style={styles.supply} testID="stock-item-supply">{supplyLabel}</Text>
        ) : null}

        {/* Alerta TTL pós-abertura (012 Fase A) — eixo paralelo, não substitui badge volume */}
        {ttlAlertActive && (
          <View style={[styles.ttlRow, ttlExpired ? styles.ttlRowExpired : styles.ttlRowWarning]}>
            <Syringe
              size={11}
              color={colors.status.error}
              strokeWidth={2.5}
            />
            <Text style={[styles.ttlText, { color: colors.status.error }]}>
              {ttlExpired
                ? 'Vencido (validade após aberto)'
                : ttlDaysLeft === 0
                ? 'Vence hoje (validade após aberto)'
                : ttlDaysLeft === 1
                ? 'Vence amanhã (validade após aberto)'
                : `Vence em ${ttlDaysLeft} dias (validade após aberto)`}
            </Text>
          </View>
        )}
      </View>
    </SectionCard>
  )
}

// Tons suaves originais do chip de aviso de estoque (preserva suave tom pastel e opacidade)
const STOCK_WARNING_BG = '#fffbeb'
const STOCK_WARNING_BORDER = 'rgba(144, 77, 0, 0.35)'

const styles = StyleSheet.create({
  titleWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing[2],
  },
  titleText: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  dosagePill: {
    backgroundColor: colors.neutral[100],
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: colors.neutral[300],
  },
  dosagePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.neutral[700],
  },
  container: {
    paddingTop: 4
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  mainInfo: {
    flex: 1,
    marginRight: 10
  },
  lab: {
    fontSize: 13,
    color: colors.text.secondary,
    marginBottom: 4
  },
  quantity: {
    fontSize: 14,
    color: colors.text.primary
  },
  schedule: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 4,
  },
  supply: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
    marginTop: 4,
  },
  bold: {
    fontWeight: '700',
    color: colors.text.primary
  },
  // Linha de alerta TTL pós-abertura (012 Fase A)
  ttlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    paddingHorizontal: spacing[2],
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    alignSelf: 'flex-start',
    minHeight: 26,
  },
  ttlRowExpired: {
    backgroundColor: colors.status.errorLight,
    borderColor: colors.status.error,
  },
  ttlRowWarning: {
    backgroundColor: STOCK_WARNING_BG,
    borderColor: STOCK_WARNING_BORDER,
  },
  ttlText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
})
