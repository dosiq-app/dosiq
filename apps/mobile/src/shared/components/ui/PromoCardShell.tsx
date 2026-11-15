import React, { type ReactNode } from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import * as LucideIcons from 'lucide-react-native'
import { colors, spacing, borderRadius, typography } from '@shared/styles/tokens'

const { X } = LucideIcons as any

/**
 * PromoCardShell — casca dos avisos inline da Hoje (spec 120 D-2, extraída do card da 068).
 * Tom de AVISO (`status.warningLight`), nunca erro. Ícone + título + subtítulo + CTA primário
 * (`brand.primary`) + botão neutro. NÃO é modal (R-239).
 *
 * 120 C (RC2-C DC-1/DC-2): é a casca ÚNICA do slot de alerta da Hoje. `tone` muda só o fundo
 * (erro/aviso/neutro — default aviso, push e 068 inalterados); `secondary` é opcional (alerta
 * operacional tem 1 CTA) e `dismiss` põe um X de 44 pt no canto.
 */
export type PromoCardTone = 'warning' | 'error' | 'neutral'

const TONE_BG: Record<PromoCardTone, string> = {
  warning: colors.status.warningLight,
  error: colors.status.errorLight,
  neutral: colors.bg.card,
}
// D-7: alvo de toque ≥44 pt sem mudar o desenho do botão (12+12 de padding + ~17 de texto).
const HIT_SLOP = { top: 4, bottom: 4, left: 0, right: 0 }

export interface PromoCardAction {
  label: string
  accessibilityLabel: string
  onPress: () => void
  /** D-5: em voo ⇒ spinner + desabilitado (duplo toque não reabre o SO). */
  loading?: boolean
  testID?: string
}

interface PromoCardShellProps {
  icon: ReactNode
  title: string
  subtitle: string
  primary: PromoCardAction
  secondary?: PromoCardAction
  dismiss?: { accessibilityLabel: string; onPress: () => void; testID?: string }
  tone?: PromoCardTone
  testID?: string
}

export default function PromoCardShell({ icon, title, subtitle, primary, secondary, dismiss, tone = 'warning', testID }: PromoCardShellProps) {
  return (
    // D-7: um rótulo único (título + subtítulo) para o leitor de tela.
    <View style={[styles.card, { backgroundColor: TONE_BG[tone] }]} accessibilityRole="summary" testID={testID}>
      {dismiss && (
        <Pressable
          style={styles.dismiss}
          onPress={dismiss.onPress}
          accessibilityRole="button"
          accessibilityLabel={dismiss.accessibilityLabel}
          testID={dismiss.testID}
        >
          <X size={18} color={colors.text.secondary} />
        </Pressable>
      )}
      <View style={[styles.body, dismiss && styles.bodyWithDismiss]} accessible accessibilityLabel={`${title}. ${subtitle}`}>
        <View style={styles.iconWrap}>{icon}</View>
        <View style={styles.text}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.ctaPrimary, pressed && styles.ctaPressed]}
          onPress={primary.onPress}
          disabled={primary.loading}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={primary.accessibilityLabel}
          accessibilityState={{ disabled: !!primary.loading, busy: !!primary.loading }}
          testID={primary.testID}
        >
          {primary.loading ? (
            <ActivityIndicator size="small" color={colors.text.inverse} />
          ) : (
            <Text style={styles.ctaPrimaryText}>{primary.label}</Text>
          )}
        </Pressable>
        {secondary && (<Pressable
          style={({ pressed }) => [styles.ctaNeutral, pressed && styles.ctaPressed]}
          onPress={secondary.onPress}
          disabled={primary.loading}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={secondary.accessibilityLabel}
          testID={secondary.testID}
        >
          <Text style={styles.ctaNeutralText}>{secondary.label}</Text>
        </Pressable>)}
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
  bodyWithDismiss: { paddingRight: 32 },
  // DC-2/DC-7: alvo de 44 pt no canto, sem empurrar o texto (o corpo reserva 32 à direita).
  dismiss: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
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
