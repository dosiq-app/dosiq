// OnboardingPresentationStep — F-2 "Como é o remédio?" (spec 125, AC2.0/AC2.1, FR-004).
// Caminho manual: busca sem resultado ⇒ forma › nome › dosagem, cada uma em tela própria.
// Os 7 chips do CHECK, sem pré-seleção; "Continuar" só liga após a escolha. Nada é gravado (INV-1).
// Ainda não há remédio ⇒ "Pular" do topo continua valendo (AC1.3).

import { useCallback, useMemo, useState } from 'react'
import { Text, ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation, useRoute } from '@react-navigation/native'
import FormActions from '@shared/components/form/FormActions'
import { PresentationChips } from '@medications/components/FormFirstStrength'
import { ROUTES } from '@navigation/routes'
import { useOnboarding } from '../OnboardingContext'
import OnboardingHeader from '@features/onboarding/components/OnboardingHeader'
import { colors, spacing, typography } from '@shared/styles/tokens'

export default function OnboardingPresentationStep() {
  // States (R-010)
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const { skip } = useOnboarding()
  const [presentation, setPresentation] = useState<string | null>(route.params?.presentation ?? null)

  // Memos
  const headerProps = useMemo(
    () => ({ step: 1, totalSteps: 4, onBack: () => navigation.goBack(), onSkip: () => skip(1) }),
    [navigation, skip],
  )

  // Handlers
  const handleContinue = useCallback(() => {
    if (!presentation) return
    navigation.navigate(ROUTES.ONBOARDING_MEDICINE_NAME, { presentation, query: route.params?.query ?? '' })
  }, [navigation, presentation, route.params?.query])

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <OnboardingHeader {...(headerProps as any)} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
        <Text style={styles.title} accessibilityRole="header">Como é o remédio?</Text>
        <PresentationChips value={presentation} onChange={setPresentation} />
      </ScrollView>
      <FormActions primaryLabel="Continuar" onPrimary={handleContinue} primaryDisabled={!presentation} primaryLoading={false} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.screen },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: spacing[5], paddingTop: spacing[2], paddingBottom: spacing[8], gap: spacing[4] },
  title: { fontSize: 26, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5, fontFamily: typography.fontFamily.bold },
})
