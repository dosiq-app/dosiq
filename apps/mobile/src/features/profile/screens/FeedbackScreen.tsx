// Tela "Problema ou sugestão": formulário que grava em feedbacks e, no topo, o atalho para
// avaliar na loja (quem veio só elogiar vai direto à loja).

import React, { useMemo, useCallback } from 'react'
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, Platform, KeyboardAvoidingView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
// TODO(040-strict): named imports do lucide-react-native batem em TS2305 sob nodenext
import * as LucideIcons from 'lucide-react-native'
const { ChevronLeft, Star } = LucideIcons as any
import Constants from 'expo-constants'
import * as Device from 'expo-device'
import { feedbackSchema, createFeedbackRepository } from '@dosiq/core'
import { useFormState } from '@shared/hooks/useFormState'
import { supabase } from '@platform/supabase/nativeSupabaseClient'
import FormInput from '@shared/components/form/FormInput'
import FormActions from '@shared/components/form/FormActions'
import { useToast } from '@shared/components/feedback/Toast'
import { useStoreReviewLink } from '@profile/hooks/useStoreReviewLink'
import { STORE_REVIEW_PLACEMENTS } from '@platform/analytics/analyticsEvents'
import { colors, spacing, borderRadius, typography } from '@shared/styles/tokens'

function formProps(form, name) {
  return {
    value: form.values[name] ?? '',
    error: form.touched[name] ? form.errors[name] : undefined,
    onChange: form.handleChange,
    onBlur: form.handleBlur,
  }
}

function FeedbackHeader({ onGoBack }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={onGoBack}
        style={styles.headerBtn}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Voltar"
      >
        <ChevronLeft size={24} color={colors.text.primary} />
      </TouchableOpacity>
      <Text style={styles.title}>Problema ou sugestão</Text>
      <View style={styles.headerSpacer} />
    </View>
  )
}

function StoreReviewCard() {
  const { openStoreReview, storeName } = useStoreReviewLink(STORE_REVIEW_PLACEMENTS.FEEDBACK_SCREEN_TOP)
  return (
    <View style={styles.storeCard}>
      <View style={styles.storeCardTitleRow}>
        <Star
          size={16}
          color={colors.text.secondary}
          strokeWidth={1.75}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <Text style={styles.storeCardTitle}>{`Quer elogiar? Avalie na ${storeName}`}</Text>
      </View>
      <Text style={styles.storeCardBody}>Leva 10 segundos e ajuda outras pessoas a encontrarem o dosiq.</Text>
      <TouchableOpacity
        style={styles.storeCardCta}
        onPress={openStoreReview}
        activeOpacity={0.7}
        accessibilityRole="link"
        accessibilityLabel={`Avaliar na ${storeName}`}
        accessibilityHint={`Abre a ${storeName}`}
      >
        <Text style={styles.storeCardCtaLabel}>{`Avaliar na ${storeName}`}</Text>
      </TouchableOpacity>
    </View>
  )
}

export default function FeedbackScreen() {
  // 1. States
  const navigation = useNavigation()
  const { show } = useToast()
  const [loading, setLoading] = React.useState(false)

  // 2. Memos
  const initialValues = useMemo(() => {
    const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'other'
    const device = Device.deviceName || Platform.select({ ios: 'iPhone', android: 'Android', default: 'Nativo' })
    const app_version = Constants.expoConfig?.version || '3.3.0'

    return {
      subject: '',
      comment: '',
      rating: null,
      platform,
      device,
      app_version
    }
  }, [])

  const form = useFormState(feedbackSchema, { initialValues })

  // 3. Handlers
  const handleSubmit = useCallback(async () => {
    if (!form.validate()) return

    setLoading(true)
    try {
      const getUserId = async () => {
        const { data, error } = await supabase.auth.getUser()
        if (error || !data?.user) throw new Error('Usuário não autenticado')
        return data.user.id
      }

      const repo = createFeedbackRepository({ client: supabase, getUserId })

      const payload = {
        subject: (form.values.subject as string)?.trim() ?? '',
        comment: (form.values.comment as string)?.trim() ?? '',
        rating: null,
        platform: form.values.platform,
        device: form.values.device,
        app_version: form.values.app_version
      }

      await repo.submitFeedback(payload)

      show('Recebemos. Obrigado por avisar!', { variant: 'success' })
      navigation.goBack()
    } catch (err) {
      console.error('[FeedbackScreen] Erro ao enviar feedback:', err)
      show(err.message || 'Erro ao enviar feedback. Tente novamente.', { variant: 'error' })
    } finally {
      setLoading(false)
    }
  }, [form, show, navigation])

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FeedbackHeader onGoBack={() => navigation.goBack()} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <StoreReviewCard />

        <View style={styles.formHeader}>
          <Text style={styles.formTitle} accessibilityRole="header">Relatar problema ou sugestão</Text>
          <Text style={styles.formSubtitle}>Conte o que deu errado ou o que podemos melhorar.</Text>
        </View>

        <FormInput
          name="subject"
          label="Assunto"
          required
          showCharacterCount
          placeholder="Ex: Erro ao cadastrar remédio, Sugestão de cor..."
          maxLength={100}
          autoCapitalize="sentences"
          {...formProps(form, 'subject')}
        />

        <FormInput
          name="comment"
          label="Comentário / Detalhes"
          required
          showCharacterCount
          placeholder="Escreva aqui suas sugestões, críticas ou relate um erro com o máximo de detalhes possível..."
          multiline
          numberOfLines={10}
          multilineMinHeight={200}
          maxLength={2000}
          autoCapitalize="sentences"
          {...formProps(form, 'comment')}
        />

      </ScrollView>

      <FormActions
        primaryLabel="Enviar"
        onPrimary={handleSubmit}
        primaryLoading={loading}
      />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
    backgroundColor: colors.bg.card,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'center',
    fontFamily: typography.fontFamily.bold,
  },
  headerSpacer: {
    width: 40,
  },
  scroll: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[12],
    gap: spacing[4],
  },
  formHeader: {
    gap: 4,
    marginTop: spacing[2],
  },
  formTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text.primary,
    fontFamily: typography.fontFamily.bold,
  },
  formSubtitle: {
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  storeCard: {
    backgroundColor: colors.bg.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: spacing[4],
    gap: spacing[2],
    marginBottom: spacing[2],
  },
  storeCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  storeCardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
  },
  storeCardBody: {
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  storeCardCta: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.brand.primary,
    marginTop: spacing[1],
  },
  storeCardCtaLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.brand.primary,
  },
})
