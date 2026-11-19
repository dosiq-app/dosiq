// OnboardingTreatmentReviewStep — "Está certo?" (spec 125, AC4.1/AC4.2, FR-011). Uma frase só, gerada
// pelo core (`describeTreatment`, reusada pela Hoje — PO-125-8), e "Próxima: {dia}, {dd/mm}". "Ajustar"
// volta ao passo "quando". Sem "Pular" (há remédio, AC1.0).
// Depois dela vem o estoque. Nada é gravado aqui (INV-1). "Terminar depois" (emenda PO 18/11) leva ao
// consentimento `full` — o estoque fica no padrão dose-only.

import { useCallback, useMemo, useState } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { describeTreatment, doseVerb, getRawNow, getTodayLocal } from '@dosiq/core'
import FormActions from '@shared/components/form/FormActions'
import { ROUTES } from '@navigation/routes'
import { useOnboarding } from '../OnboardingContext'
import FinishLaterButton from '@features/onboarding/components/FinishLaterButton'
import OnboardingReminderCard from '@features/onboarding/components/OnboardingReminderCard'
import OnboardingHeader from '@features/onboarding/components/OnboardingHeader'
import { colors, spacing, borderRadius, typography } from '@shared/styles/tokens'

// Instante atual: o horário de hoje que já passou não é "próxima".
function nowHHMM(): string {
  const d = getRawNow()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function OnboardingTreatmentReviewStep() {
  // States (R-010)
  const navigation = useNavigation<any>()
  const { medicine, medicineIntakeUnit, treatment, setTreatment, finishLater } = useOnboarding()
  // 125 (PO smoke 18/11): o lembrete mora aqui — fecha a frase "o quê e quando". Padrão ligado.
  const [remind, setRemindState] = useState<boolean>(treatment?._remind ?? true)

  // Memos
  const description = useMemo(
    () =>
      describeTreatment({
        medicineName: medicine?.name,
        presentation: medicine?.presentation,
        dosagePerPill: medicine?.dosage_per_pill,
        dosageUnit: medicine?.dosage_unit,
        dose: treatment?.dosage_per_intake,
        intakeUnit: treatment?.intake_unit ?? medicineIntakeUnit ?? null,
        frequency: treatment?.frequency,
        weekdays: treatment?.weekdays,
        timeSchedule: treatment?.time_schedule,
        intervalDays: treatment?.interval_days,
        startDate: treatment?.start_date,
        today: getTodayLocal(),
        nowTime: nowHHMM(),
      }),
    [medicine, medicineIntakeUnit, treatment],
  )
  const headerProps = useMemo(() => ({ step: 2, totalSteps: 4, onBack: () => navigation.goBack() }), [navigation])

  // Handlers
  const handleConfirm = useCallback(() => navigation.navigate(ROUTES.ONBOARDING_STOCK), [navigation])
  const handleAdjust = useCallback(() => navigation.goBack(), [navigation])
  const handleRemind = useCallback(
    (next: boolean) => {
      setRemindState(next)
      setTreatment({ ...treatment, _remind: next })
    },
    [treatment, setTreatment],
  )

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <OnboardingHeader {...(headerProps as any)} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title} accessibilityRole="header">Está certo?</Text>
        {/* hi-fi O-5: "Ajustar" é link dentro do card; o CTA segue o padrão do wizard ("Continuar"). */}
        <View style={styles.card}>
          <Text style={styles.sentence} testID="treatment-sentence">{description.sentence}</Text>
          {/* PO smoke 18/11: "Ajustar" em linha própria, alinhado à direita — respiro sem altura extra. */}
          <Text style={styles.next} testID="treatment-next">{description.next ?? ''}</Text>
          <View style={styles.footerRow}>
            <Pressable onPress={handleAdjust} accessibilityRole="button" accessibilityLabel="Ajustar" hitSlop={12}>
              <Text style={styles.adjustText}>Ajustar</Text>
            </Pressable>
          </View>
        </View>
        <OnboardingReminderCard remind={remind} setRemind={handleRemind} verb={doseVerb(medicine?.presentation)} />
      </ScrollView>
      {/* PO smoke 18/11 (emenda AC4.1/AC1.1b): o tratamento já está completo — "Terminar depois" grava
          remédio + tratamento em dose-only, igual ao estoque; passo 2 no evento separa conferência × estoque. */}
      <FormActions
        primaryLabel="Continuar"
        onPrimary={handleConfirm}
        primaryLoading={false}
        footer={<FinishLaterButton onPress={() => finishLater(2, 'full')} />}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.screen },
  scroll: { flexGrow: 1, paddingHorizontal: spacing[5], paddingTop: spacing[2], paddingBottom: spacing[8], gap: spacing[4] },
  title: { fontSize: 26, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5, fontFamily: typography.fontFamily.bold },
  card: { padding: spacing[4] + 2, borderRadius: borderRadius.lg, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.default, gap: spacing[2] },
  sentence: { fontSize: 18, fontWeight: '700', color: colors.text.primary, lineHeight: 24 },
  next: { fontSize: 15, color: colors.text.secondary },
  footerRow: { alignItems: 'flex-end', marginTop: spacing[3] },
  adjustText: { fontSize: 15, fontWeight: '600', color: colors.brand.primary },
})
