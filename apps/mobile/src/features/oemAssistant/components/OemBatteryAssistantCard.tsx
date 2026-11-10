import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
// TODO(040-strict): named imports do lucide-react-native batem em TS2305 sob nodenext
import * as LucideIcons from 'lucide-react-native'
const { TriangleAlert } = LucideIcons as any
import { colors, spacing, borderRadius, typography } from '@shared/styles/tokens'
import type { AssistantReason } from '@features/oemAssistant/hooks/useOemBatteryAssistant'

/**
 * OemBatteryAssistantCard — aviso inline na Hoje (spec 068 T011). NÃO é modal (R-239).
 * Forma do `StockUpsellCard`; rótulos honestos (D-4): "Ajustar" leva aos passos e
 * "Não mostrar de novo" é definitivo (AC-10) — "Agora não" é proibido aqui.
 */
interface OemBatteryAssistantCardProps {
  reason: Exclude<AssistantReason, null>
  onAdjust: () => void
  onDismiss: () => void
}

export default function OemBatteryAssistantCard({ reason, onAdjust, onDismiss }: OemBatteryAssistantCardProps) {
  const subtitle =
    reason === 'restricted'
      ? 'O aparelho está segurando o Dosiq em segundo plano. Um ajuste rápido ajuda o alarme a tocar na hora.'
      : 'A economia de bateria deste aparelho pode adiar os alarmes. Um ajuste rápido ajuda a evitar isso.'
  return (
    <View style={styles.card} accessibilityRole="summary">
      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <TriangleAlert size={22} color={colors.status.warning} strokeWidth={2} />
        </View>
        <View style={styles.text}>
          <Text style={styles.title}>O alarme pode não tocar neste aparelho</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.ctaPrimary, pressed && styles.ctaPressed]}
          onPress={onAdjust}
          accessibilityRole="button"
          accessibilityLabel="Ajustar o aparelho para o alarme tocar"
        >
          <Text style={styles.ctaPrimaryText}>Ajustar</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.ctaNeutral, pressed && styles.ctaPressed]}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Não mostrar de novo o aviso de bateria"
        >
          <Text style={styles.ctaNeutralText}>Não mostrar de novo</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.status.warningLight,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: borderRadius.lg,
    padding: spacing[4],
    marginHorizontal: 20,
    marginBottom: spacing[4],
  },
  body: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3], marginBottom: spacing[3] },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.bg.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
  title: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: typography.fontFamily.medium || 'System',
    color: colors.text.primary,
    marginBottom: 4,
    lineHeight: 22,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: typography.fontFamily.regular || 'System',
    color: colors.text.secondary,
    lineHeight: 20,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  ctaPrimary: {
    backgroundColor: colors.brand.primary,
    borderRadius: borderRadius.full,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[5],
  },
  ctaPrimaryText: { fontSize: 14, fontWeight: '700', color: colors.text.inverse },
  ctaNeutral: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: borderRadius.full,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[5],
  },
  ctaNeutralText: { fontSize: 14, fontWeight: '700', color: colors.text.primary },
  ctaPressed: { opacity: 0.85 },
})
