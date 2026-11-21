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
// Emenda PO smoke 125 (20/11): só o FOCO da Hoje tem fundo colorido. Fora dele o card fica branco e o tom
// vai para a borda (o ícone já carrega a cor). Erro (sem estoque com dose em 24 h) mantém o fundo sempre.
const TONE_BORDER: Record<PromoCardTone, string> = {
  warning: colors.status.warning,
  error: colors.status.error,
  neutral: colors.border.default,
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
  /** 125 fatia 2: só o foco da Hoje tem botão cheio; fora dele o CTA vira contorno. Default: cheio. */
  emphasis?: boolean
  testID?: string
}

export default function PromoCardShell({ icon, title, subtitle, primary, secondary, dismiss, tone = 'warning', emphasis = true, testID }: PromoCardShellProps) {
  // Fora do foco, o contorno do botão segue o tom (âmbar/vermelho) — o verde de ação fica só no foco (PO 20/11).
  // Neutro mantém o verde (cinza pareceria desabilitado).
  const toneCta = tone === 'neutral' ? null : TONE_BORDER[tone]
  return (
    // D-7: um rótulo único (título + subtítulo) para o leitor de tela.
    <View style={[styles.card, emphasis || tone === 'error' ? { backgroundColor: TONE_BG[tone] } : { backgroundColor: colors.bg.card, borderColor: TONE_BORDER[tone] }]} accessibilityRole="summary" testID={testID}>
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
          style={({ pressed }) => [emphasis ? styles.ctaPrimary : styles.ctaOutline, !emphasis && toneCta && { borderColor: toneCta }, pressed && styles.ctaPressed]}
          onPress={primary.onPress}
          disabled={primary.loading}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={primary.accessibilityLabel}
          accessibilityState={{ disabled: !!primary.loading, busy: !!primary.loading }}
          testID={primary.testID}
        >
          {primary.loading ? (
            <ActivityIndicator size="small" color={emphasis ? colors.text.inverse : toneCta ?? colors.brand.primary} />
          ) : (
            <Text style={emphasis ? styles.ctaPrimaryText : [styles.ctaOutlineText, toneCta && { color: toneCta }]}>{primary.label}</Text>
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
    borderRadius: borderRadius.md, // CTA = retângulo arredondado; pílula só p/ chips de seleção (PO 20/11)
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[5],
  },
  ctaPrimaryText: { fontSize: 14, fontWeight: '700', color: colors.text.inverse },
  ctaNeutral: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: borderRadius.md, // CTA = retângulo arredondado; pílula só p/ chips de seleção (PO 20/11)
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[5],
  },
  ctaNeutralText: { fontSize: 14, fontWeight: '700', color: colors.text.primary },
  ctaOutline: {
    backgroundColor: colors.bg.card,
    borderWidth: 1.5,
    borderColor: colors.brand.primary,
    borderRadius: borderRadius.md, // CTA = retângulo arredondado; pílula só p/ chips de seleção (PO 20/11)
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[5],
  },
  ctaOutlineText: { fontSize: 14, fontWeight: '700', color: colors.brand.primary },
  ctaPressed: { opacity: 0.85 },
})
