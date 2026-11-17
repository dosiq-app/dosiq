// SignupScreen.jsx — criar conta (Fase 4 S4.2). UI alinhada ao mock
// mock-onboarding-passo1 (Step1_Account): é o "passo 1 de 4" visual do
// onboarding (conta → medicamento → tratamento → estoque; o 4º passo entrou na
// spec 044). Ao continuar, valida e mostra a tela "email enviado"; após
// confirmar o email + login, o wizard retoma no passo 2 (gate em Navigation).

import { useState, useRef, useMemo, useEffect } from 'react'
import {
  View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ShieldCheck, Info } from 'lucide-react-native'
import { suggestEmailDomain } from '@dosiq/core'
import { signUpWithEmail, verifyOtpWithEmail, resendSignupConfirmation } from '../platform/auth/authService'
import { captureDeviceTimezone } from '@profile/services/profileService'
import { ROUTES } from '../navigation/routes'
import OnboardingHeader from '@features/onboarding/components/OnboardingHeader'
import SignupConfirmView from '@features/onboarding/components/SignupConfirmView'
import type { SignupConfirmNotice } from '@features/onboarding/components/SignupConfirmView'
import { OTP_LENGTH } from '@shared/components/form/OtpCodeField'
import { colors, spacing, borderRadius, typography, shadows } from '@shared/styles/tokens'

function SignupBrandmark() {
  return (
    <View style={styles.brandmark}>
      <Image
        source={require('../../assets/icon.png')}
        style={styles.brandIcon}
        resizeMode="contain"
      />
      <Text style={styles.brandText}>dosiq</Text>
    </View>
  )
}

function SignupInfoCard() {
  return (
    <View style={styles.infoCard}>
      <View style={styles.infoIcon}>
        <ShieldCheck size={18} color={colors.primary[700]} strokeWidth={2.2} />
      </View>
      <View style={styles.infoBody}>
        <Text style={styles.infoTitle}>Sua conta, suas regras</Text>
        <Text style={styles.infoText}>
          Se você autorizar, seus dados de saúde ficam guardados no Brasil, em segurança, e o app funciona mesmo sem internet.
        </Text>
      </View>
    </View>
  )
}

function SignupConfirmHint() {
  return (
    <View style={styles.confirmHint}>
      <Info size={16} color={colors.text.muted} strokeWidth={2} />
      <Text style={styles.confirmHintText}>
        Vamos te enviar um link de confirmação por e-mail.
      </Text>
    </View>
  )
}

function SignupTerms() {
  return (
    <Text style={styles.terms}>
      Ao continuar, você aceita os <Text style={styles.termsLink}>Termos de Uso</Text> e a{' '}
      <Text style={styles.termsLink}>Política de Privacidade</Text>.
    </Text>
  )
}

// Spec 123: intervalo mínimo entre envios do mesmo endereço — igual ao do servidor (60 s, §Limites).
const RESEND_COOLDOWN_SECONDS = 60

/** Monta o endereço sugerido preservando a parte antes do `@` como a pessoa digitou. */
function buildSuggestedEmail(value: string): string | null {
  const domain = suggestEmailDomain(value)
  if (!domain) return null
  const trimmed = value.trim()
  return `${trimmed.slice(0, trimmed.lastIndexOf('@'))}@${domain}`
}

function emailKey(value: string): string {
  return value.trim().toLowerCase()
}

function SignupDomainSuggestion({ suggestion, onAccept, onDismiss }) {
  return (
    <View style={styles.suggestion} accessibilityLiveRegion="polite">
      <Text style={styles.suggestionText}>
        Você quis dizer <Text style={styles.suggestionEmail}>{suggestion}</Text>?
      </Text>
      <View style={styles.suggestionActions}>
        <Pressable onPress={onAccept} hitSlop={8} accessibilityRole="button" accessibilityLabel="Usar este">
          <Text style={styles.suggestionPrimary}>Usar este</Text>
        </Pressable>
        <Pressable onPress={onDismiss} hitSlop={8} accessibilityRole="button" accessibilityLabel="Manter o meu">
          <Text style={styles.suggestionSecondary}>Manter o meu</Text>
        </Pressable>
      </View>
    </View>
  )
}

export default function SignupScreen({ navigation }) {
  // States
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [emailSent, setEmailSent] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [otpError, setOtpError] = useState(null)
  // US1: sugestão de domínio — nunca altera o campo sem toque, nunca bloqueia (INV-1).
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [dismissedFor, setDismissedFor] = useState<Set<string>>(() => new Set())
  const [correction, setCorrection] = useState<{ from: string; to: string } | null>(null)
  // US2/US3: último endereço cadastrado e instante do último envio (só memória — INV-3).
  const [lastSubmittedEmail, setLastSubmittedEmail] = useState<string | null>(null)
  const [sentAt, setSentAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [resending, setResending] = useState(false)
  const [resendError, setResendError] = useState(null)
  const [notice, setNotice] = useState<SignupConfirmNotice>(null)
  const verifyLock = useRef(false)

  // Memos
  const resendSecondsLeft = useMemo(() => {
    if (sentAt === null) return 0
    const elapsed = Math.floor((now - sentAt) / 1000)
    return Math.max(0, RESEND_COOLDOWN_SECONDS - elapsed)
  }, [now, sentAt])

  // Effects
  useEffect(() => {
    // O contador lê o relógio (sentAt), não decrementa por tick: background não o atrasa.
    if (!emailSent || resendSecondsLeft === 0) return undefined
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [emailSent, resendSecondsLeft])

  // Handlers
  function suggestionFor(value: string): string | null {
    if (dismissedFor.has(emailKey(value))) return null
    return buildSuggestedEmail(value)
  }

  function handleEmailChange(value: string) {
    setEmail(value)
    setSuggestion(null)
    if (correction && value !== correction.to) setCorrection(null)
  }

  function handleEmailBlur() {
    setSuggestion(suggestionFor(email))
  }

  function handleAcceptSuggestion() {
    if (!suggestion) return
    setCorrection({ from: email, to: suggestion })
    setEmail(suggestion)
    setSuggestion(null)
  }

  function handleDismissSuggestion() {
    setDismissedFor((prev) => new Set(prev).add(emailKey(email)))
    setSuggestion(null)
  }

  function handleUndoCorrection() {
    if (!correction) return
    // Desfazer devolve o digitado e não volta a sugerir para ele nesta tela.
    setDismissedFor((prev) => new Set(prev).add(emailKey(correction.from)))
    setEmail(correction.from)
    setCorrection(null)
  }

  // 096 B3 (S3): a autorização de dados de saúde saiu do cadastro — ela é colhida no fim do onboarding
  // (S1), antes de qualquer dado de saúde ser gravado. A conta nasce sem A (E1b).
  async function handleSignup() {
    const trimmed = email.trim()

    // US1 cen. 1: tocar "Continuar" também mostra a sugestão; com ela já à vista, segue (cen. 4).
    if (!suggestion) {
      const pending = suggestionFor(trimmed)
      if (pending) {
        setSuggestion(pending)
        return
      }
    }

    // US3 cen. 3: mesmo endereço ⇒ volta à confirmação sem novo cadastro; contador preservado.
    if (lastSubmittedEmail !== null && emailKey(trimmed) === emailKey(lastSubmittedEmail)) {
      setError(null)
      setSuggestion(null)
      setEmailSent(true)
      return
    }

    setLoading(true)
    setError(null)
    try {
      // Campo único de senha: usamos o mesmo valor como confirmação (a validação
      // canônica de signup exige confirmPassword).
      const { success, error: signupError } = await signUpWithEmail(trimmed, password, password)
      if (!success) {
        setError(signupError)
        return
      }
      const isCorrection = lastSubmittedEmail !== null
      setLastSubmittedEmail(trimmed)
      setEmail(trimmed)
      setSentAt(Date.now())
      setNow(Date.now())
      setNotice(isCorrection ? 'corrected' : null)
      setOtpCode('')
      setOtpError(null)
      setResendError(null)
      setSuggestion(null)
      setEmailSent(true)
    } catch {
      // Exceção inesperada — sem isto o botão ficaria travado em loading.
      setError('Erro inesperado ao criar conta')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp(code: string) {
    // E-8: o código vem por argumento (o disparo automático chega no mesmo tick do onChange) e a
    // trava é por ref, não por estado — segundo colar durante o verify é ignorado.
    if (verifyLock.current || code.length !== OTP_LENGTH || lastSubmittedEmail === null) return
    verifyLock.current = true
    setVerifying(true)
    setOtpError(null)
    try {
      const { success, error: verifyError } = await verifyOtpWithEmail(lastSubmittedEmail, code, 'signup')
      if (!success) {
        // Erro não apaga o que foi digitado; o reenvio segue disponível (respeitando os 60 s).
        setOtpError(verifyError)
        return
      }
      // F4.3f.0: captura o fuso do device agora (conta confirmada, sessão ativa) —
      // antes do onboarding, cobre quem pula o wizard. Best-effort (R-253).
      await captureDeviceTimezone()
    } finally {
      verifyLock.current = false
      setVerifying(false)
    }
  }

  async function handleResend() {
    if (resending || resendSecondsLeft > 0 || lastSubmittedEmail === null) return
    setResending(true)
    setResendError(null)
    try {
      const { success, error: resendFailure } = await resendSignupConfirmation(lastSubmittedEmail)
      if (!success) {
        setResendError(resendFailure)
        return
      }
      // O contador começa quando a resposta chega — sempre do lado seguro do limite do servidor.
      setSentAt(Date.now())
      setNow(Date.now())
      setNotice('resent')
    } finally {
      setResending(false)
    }
  }

  function handleCorrect() {
    // US3: volta ao formulário com e-mail e senha preenchidos (nada sai da memória da tela).
    setOtpError(null)
    setEmailSent(false)
  }

  if (emailSent && lastSubmittedEmail !== null) {
    return (
      <SignupConfirmView
        email={lastSubmittedEmail}
        otpCode={otpCode}
        onOtpChange={setOtpCode}
        onVerify={handleVerifyOtp}
        verifying={verifying}
        otpError={otpError}
        resendSecondsLeft={resendSecondsLeft}
        resending={resending}
        resendError={resendError}
        onResend={handleResend}
        notice={notice}
        onCorrect={handleCorrect}
        onGoToLogin={() => navigation.navigate(ROUTES.LOGIN)}
      />
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <OnboardingHeader step={0} totalSteps={4} onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <SignupBrandmark />

          <Text style={styles.title}>Vamos criar sua conta</Text>
          <Text style={styles.subtitle}>
            Use um e-mail que você acessa fácil. A gente envia uma confirmação rapidinha.
          </Text>

          {/* Email */}
          <View style={styles.field}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Seu e-mail</Text>
              <Text style={styles.asterisk}> *</Text>
            </View>
            <TextInput
              style={styles.input}
              placeholder="seunome@exemplo.com"
              placeholderTextColor={colors.text.muted}
              value={email}
              onChangeText={handleEmailChange}
              onBlur={handleEmailBlur}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
              accessibilityLabel="Seu e-mail"
            />
            {suggestion ? (
              <SignupDomainSuggestion
                suggestion={suggestion}
                onAccept={handleAcceptSuggestion}
                onDismiss={handleDismissSuggestion}
              />
            ) : null}
            {correction ? (
              <View style={styles.correctedRow}>
                <Text style={styles.correctedText}>
                  Corrigido para {correction.to.slice(correction.to.lastIndexOf('@') + 1)} ·{' '}
                </Text>
                <Pressable onPress={handleUndoCorrection} hitSlop={8} accessibilityRole="button" accessibilityLabel="Desfazer">
                  <Text style={styles.suggestionPrimary}>Desfazer</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          {/* Senha (campo único + Mostrar) */}
          <View style={styles.field}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Crie uma senha</Text>
              <Text style={styles.asterisk}> *</Text>
              <Text style={styles.hint}>Mínimo 8 caracteres</Text>
            </View>
            <View style={styles.passwordField}>
              <TextInput
                style={styles.passwordInput}
                placeholder="••••••••"
                placeholderTextColor={colors.text.muted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                // U-5: depois do 1º envio a senha fica travada — corrigir o e-mail recadastra com
                // a mesma senha; trocar aqui seria ignorado no "mesmo endereço" e confundiria o login.
                editable={!loading && lastSubmittedEmail === null}
              />
              <Pressable
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                <Text style={styles.showToggle}>{showPassword ? 'Ocultar' : 'Mostrar'}</Text>
              </Pressable>
            </View>
            {lastSubmittedEmail !== null ? (
              <Text style={styles.passwordLockedNote}>
                A senha é a que você já criou. Toque em Mostrar para conferir.
              </Text>
            ) : null}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}


          {/* Card: Sua conta, suas regras */}
          <SignupInfoCard />

          {/* Hint confirmação por email (borda sólida soft — AP-163, RN sem dashed) */}
          <SignupConfirmHint />
        </ScrollView>

        {/* Sticky: Continuar + termos */}
        <View style={styles.sticky}>
          <Pressable
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignup}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Continuar"
          >
            {loading ? (
              <ActivityIndicator color={colors.text.inverse} />
            ) : (
              <Text style={styles.buttonText}>Continuar</Text>
            )}
          </Pressable>
          <SignupTerms />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg.screen,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[2],
    paddingBottom: spacing[6],
    gap: spacing[4],
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: -0.5,
    fontFamily: typography.fontFamily.bold,
  },
  subtitle: {
    fontSize: 15,
    color: colors.text.secondary,
    lineHeight: 21,
    marginTop: -spacing[2],
  },
  field: {
    gap: 6,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text.secondary,
  },
  asterisk: {
    fontSize: 13,
    color: colors.status.error,
  },
  hint: {
    flex: 1,
    textAlign: 'right',
    fontSize: 12,
    color: colors.text.muted,
  },
  input: {
    height: 50,
    backgroundColor: colors.bg.card,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    borderRadius: borderRadius.md,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.text.primary,
  },
  passwordField: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    backgroundColor: colors.bg.card,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    borderRadius: borderRadius.md,
    paddingHorizontal: 14,
  },
  passwordInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text.primary,
    padding: 0,
  },
  passwordLockedNote: { fontSize: 13, color: colors.text.muted, marginTop: spacing[1], lineHeight: 18 },
  showToggle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  error: {
    color: colors.status.error,
    fontSize: 13,
    marginTop: -spacing[2],
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    padding: spacing[4],
    backgroundColor: colors.bg.card,
    borderRadius: borderRadius.md,
    ...shadows.sm,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBody: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
  },
  infoText: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 2,
    lineHeight: 18,
  },
  confirmHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    padding: spacing[3],
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border.default,
  },
  confirmHintText: {
    flex: 1,
    fontSize: 13,
    color: colors.text.muted,
    lineHeight: 18,
  },
  sticky: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[3],
    paddingBottom: spacing[4],
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
    backgroundColor: colors.bg.screen,
    gap: spacing[3],
  },
  button: {
    backgroundColor: colors.brand.primary,
    height: 54,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.text.inverse,
    fontSize: 16,
    fontWeight: '700',
    fontFamily: typography.fontFamily.bold,
  },
  terms: {
    fontSize: 12,
    color: colors.text.muted,
    textAlign: 'center',
    lineHeight: 18,
  },
  termsLink: {
    color: colors.brand.primary,
    fontWeight: '600',
  },
  suggestion: {
    padding: spacing[3],
    borderRadius: borderRadius.md,
    backgroundColor: colors.status.infoLight,
    gap: spacing[2],
  },
  suggestionText: {
    fontSize: 14,
    color: colors.text.primary,
    lineHeight: 20,
  },
  suggestionEmail: {
    fontWeight: '700',
  },
  suggestionActions: {
    flexDirection: 'row',
    gap: spacing[5],
  },
  suggestionPrimary: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.brand.primary,
  },
  suggestionSecondary: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  correctedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  correctedText: {
    fontSize: 13,
    color: colors.text.secondary,
  },
  brandmark: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[2],
    alignSelf: 'center',
  },
  brandIcon: {
    width: 28,
    height: 28,
  },
  brandText: {
    fontSize: 20,
    fontFamily: typography.fontFamily.brand || 'System',
    color: colors.text.brand || colors.brand.primary,
    marginLeft: spacing[1],
    fontWeight: '700',
  },
})
