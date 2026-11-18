// SignupConfirmView.tsx — "Confirme seu e-mail" após o cadastro (spec 123, US2/US3).
// Mostra o endereço usado (com "Corrigir"), aceita link OU código de 8 dígitos e deixa pedir outro
// envio depois de 60 s. Todo estado vive na SignupScreen (senha só em memória — INV-3); esta view
// só desenha e repassa toques. Nenhuma mensagem varia pela existência da conta (RC-SEC S-3).

import {
  View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Mail, ArrowLeft, Pencil, Check, Clock } from 'lucide-react-native'
import { OtpCodeField } from '@shared/components/form'
import { OTP_LENGTH } from '@shared/components/form/OtpCodeField'
import { colors, spacing, borderRadius, typography } from '@shared/styles/tokens'

export type SignupConfirmNotice = 'corrected' | 'resent' | null

const CORRECTED_COPY = 'E-mail corrigido. A confirmação foi para esse endereço.'
const RESENT_COPY = 'Novo e-mail enviado agora'

interface SignupConfirmViewProps {
  email: string
  otpCode: string
  onOtpChange: (value: string) => void
  onVerify: (code: string) => void
  verifying: boolean
  otpError: string | null
  resendSecondsLeft: number
  resending: boolean
  resendError: string | null
  onResend: () => void
  notice: SignupConfirmNotice
  onCorrect: () => void
  onGoToLogin: () => void
}

export default function SignupConfirmView({
  email,
  otpCode,
  onOtpChange,
  onVerify,
  verifying,
  otpError,
  resendSecondsLeft,
  resending,
  resendError,
  onResend,
  notice,
  onCorrect,
  onGoToLogin,
}: SignupConfirmViewProps) {
  const canVerify = otpCode.length === OTP_LENGTH && !verifying
  const resendBlocked = resendSecondsLeft > 0 || resending
  const sentNow = notice !== null

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          onPress={onCorrect}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Voltar e corrigir o e-mail"
        >
          <ArrowLeft size={24} color={colors.text.primary} />
        </Pressable>
      </View>

      {/* AP-288/R-303: edge-to-edge no Android não redimensiona a janela — sem isto o teclado do
          código cobre "Confirmar e entrar" e o reenvio (RC6 #965). */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
      <ScrollView style={styles.flex} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.iconWrapper}>
          <Mail size={30} color={colors.brand.primary} strokeWidth={2.2} />
        </View>
        <Text style={styles.title}>Confirme seu e-mail</Text>
        <Text style={styles.lead}>Enviamos a confirmação para</Text>

        {/* D6 — e-mail em cartão próprio, "Corrigir" à direita; destacado após a troca (C-4) */}
        <View style={[styles.emailCard, notice === 'corrected' && styles.emailCardHighlight]}>
          <Mail size={18} color={colors.text.muted} />
          <Text style={styles.email} numberOfLines={1}>{email}</Text>
          <Pressable
            onPress={onCorrect}
            hitSlop={8}
            style={styles.correctPill}
            accessibilityRole="button"
            accessibilityLabel="Corrigir"
          >
            <Pencil size={14} color={colors.brand.primary} strokeWidth={2.2} />
            <Text style={styles.correctText}>Corrigir</Text>
          </Pressable>
        </View>
        {notice === 'corrected' ? <Text style={styles.correctedNote}>{CORRECTED_COPY}</Text> : null}

        <Text style={styles.body}>Toque no link que enviamos ou digite o código de 8 dígitos</Text>

        <OtpCodeField
          value={otpCode}
          onChange={onOtpChange}
          onComplete={onVerify}
          editable={!verifying}
          hasError={Boolean(otpError)}
        />
        {otpError ? <Text style={styles.error}>{otpError}</Text> : null}

        <Pressable
          style={[styles.primary, !canVerify && styles.disabled]}
          onPress={() => onVerify(otpCode)}
          disabled={!canVerify}
          accessibilityRole="button"
          accessibilityLabel="Confirmar e entrar"
        >
          {verifying ? (
            <ActivityIndicator color={colors.text.inverse} />
          ) : (
            <Text style={styles.primaryText}>Confirmar e entrar</Text>
          )}
        </Pressable>

        {/* Linha de reenvio (mock B): texto, não botão de contorno */}
        <View style={styles.resendBlock}>
          <Text style={styles.hint}>Não chegou? Veja a caixa de spam.</Text>
          {sentNow ? (
            <View style={styles.inlineRow}>
              <Check size={14} color={colors.status.successDark} strokeWidth={2.6} />
              <Text style={styles.sentText}>{RESENT_COPY}</Text>
            </View>
          ) : null}
          <Pressable
            onPress={onResend}
            disabled={resendBlocked}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Reenviar e-mail"
            accessibilityState={{ disabled: resendBlocked }}
          >
            {resending ? (
              <ActivityIndicator color={colors.brand.primary} />
            ) : resendSecondsLeft > 0 ? (
              <View style={styles.inlineRow}>
                <Clock size={14} color={colors.text.muted} />
                <Text style={styles.waitText}>Reenviar e-mail em {formatCountdown(resendSecondsLeft)}</Text>
              </View>
            ) : (
              <Text style={styles.resendText}>Reenviar e-mail</Text>
            )}
          </Pressable>
          {resendError ? <Text style={styles.error}>{resendError}</Text> : null}
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      <Pressable style={styles.footer} onPress={onGoToLogin} accessibilityRole="link">
        <Text style={styles.footerText}>
          Já tem conta? <Text style={styles.link}>Entrar</Text>
        </Text>
      </Pressable>
    </SafeAreaView>
  )
}

/** 60 → "1:00", 42 → "0:42" (copy do design: "Reenviar e-mail em {m:ss}"). */
function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.screen },
  flex: { flex: 1 },
  header: { paddingHorizontal: spacing[4], paddingTop: spacing[2], height: 40, justifyContent: 'center' },
  container: { flexGrow: 1, paddingHorizontal: spacing[6], paddingBottom: spacing[6] },
  iconWrapper: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: colors.bg.brand, alignSelf: 'center',
    justifyContent: 'center', alignItems: 'center', marginTop: spacing[2], marginBottom: spacing[3],
  },
  title: {
    fontSize: 24, fontWeight: '800', color: colors.text.primary, textAlign: 'center',
    fontFamily: typography.fontFamily.bold,
  },
  lead: { fontSize: 15, color: colors.text.secondary, textAlign: 'center', marginTop: spacing[1] },
  emailCard: {
    marginTop: spacing[3], flexDirection: 'row', alignItems: 'center', gap: spacing[2],
    paddingVertical: 10, paddingLeft: 14, paddingRight: 10, backgroundColor: colors.bg.card,
    borderWidth: 1.5, borderColor: colors.border.default, borderRadius: borderRadius.md,
  },
  emailCardHighlight: { borderColor: colors.brand.primary },
  email: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: '700', color: colors.text.primary },
  correctPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: borderRadius.sm, backgroundColor: colors.bg.brand,
  },
  correctText: { fontSize: 13, fontWeight: '700', color: colors.brand.primary },
  correctedNote: { fontSize: 13, color: colors.status.successDark, textAlign: 'center', marginTop: 6 },
  body: { fontSize: 14, color: colors.text.secondary, textAlign: 'center', lineHeight: 20, marginTop: spacing[5], marginBottom: spacing[3] },
  error: { color: colors.status.error, fontSize: 13, textAlign: 'center', marginTop: spacing[2], lineHeight: 18 },
  primary: {
    backgroundColor: colors.brand.primary, height: 54,
    borderRadius: borderRadius.lg, alignItems: 'center', justifyContent: 'center', marginTop: spacing[5],
  },
  primaryText: { color: colors.text.inverse, fontSize: 16, fontWeight: '700', fontFamily: typography.fontFamily.bold },
  disabled: { opacity: 0.45 },
  resendBlock: { alignItems: 'center', marginTop: spacing[4], gap: 4 },
  hint: { fontSize: 13, color: colors.text.secondary, textAlign: 'center', lineHeight: 19 },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sentText: { fontSize: 13, fontWeight: '600', color: colors.status.successDark },
  waitText: { fontSize: 13, color: colors.text.muted },
  resendText: { fontSize: 15, fontWeight: '700', color: colors.brand.primary },
  link: { fontSize: 15, fontWeight: '700', color: colors.brand.primary },
  footer: { paddingVertical: spacing[4], alignItems: 'center' },
  footerText: { fontSize: 15, color: colors.text.secondary },
})
