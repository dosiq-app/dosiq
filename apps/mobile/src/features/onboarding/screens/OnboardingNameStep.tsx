// OnboardingNameStep — F-3 "Qual é o nome?" (spec 125, AC2.0/AC2.1b, FR-012).
// Vem com o texto da busca e roda a sugestão da 119 B de novo ("Você quis dizer…"). Tocar a sugestão
// segue o mesmo caminho de quem achou na busca ("Confira o remédio"); "Continuar com "{texto}"" segue à mão.
// Com nome digitado já há remédio ⇒ sem "Pular" no topo (AC1.0). "Terminar depois" só após a dosagem
// (PO 2026-11-17, C-1: o Zod exige unidade). Pomada não tem dosagem: o nome completa o remédio.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation, useRoute } from '@react-navigation/native'
import FormInput from '@shared/components/form/FormInput'
import FormActions from '@shared/components/form/FormActions'
import { CatalogFieldSuggestions } from '@medications/components/CatalogSuggestionList'
import { useCatalogSuggestionSheet } from '@medications/hooks/useCatalogSuggestionSheet'
import { ROUTES } from '@navigation/routes'
import { useKeyboardVisible } from '@shared/hooks/useKeyboardVisible'
import { useOnboarding } from '../OnboardingContext'
import OnboardingHeader from '@features/onboarding/components/OnboardingHeader'
import { buildManualMedicine, manualIntakeUnit, skipsStrength } from '@features/onboarding/utils/manualMedicine'
import { colors, spacing, typography } from '@shared/styles/tokens'

export default function OnboardingNameStep() {
  // States (R-010)
  const navigation = useNavigation<any>()
  // 125 smoke: KAV 'height' (R-303) não devolve a altura ao fechar o teclado no Android edge-to-edge —
  // sobra faixa e o rodapé sobe. Ligado só com teclado aberto: fechado, vira View e a altura reseta.
  const keyboardVisible = useKeyboardVisible()
  const route = useRoute<any>()
  const { setMedicine, setMedicineSource, setMedicineIntakeUnit } = useOnboarding()
  const presentation: string = route.params?.presentation
  const [name, setName] = useState<string>(route.params?.query ?? '')

  // Memos
  const values = useMemo(() => ({ name }), [name])
  const catalog = useCatalogSuggestionSheet<'name'>({ values })
  const trimmed = name.trim()
  const headerProps = useMemo(() => ({ step: 1, totalSteps: 4, onBack: () => navigation.goBack() }), [navigation])

  const handleChange = useMemo(() => catalog.bindChange((_field: string, value: string) => setName(value ?? '')), [catalog])
  const { activate } = catalog

  // Effects
  // AC2.1b: a sugestão roda de novo com o texto vindo da busca, sem esperar digitar.
  useEffect(() => {
    if (route.params?.query) activate('name')
  }, [activate, route.params?.query])

  // Handlers

  // Sugestão escolhida = "achou na busca": o "Confira" aplica a caixa e marca a forma única.
  const handleSuggestion = useCallback(
    (selection) => navigation.navigate(ROUTES.ONBOARDING_MEDICINE_FORM, { searchSelection: selection }),
    [navigation],
  )

  const handleContinue = useCallback(() => {
    if (!trimmed) return
    if (skipsStrength(presentation)) {
      setMedicine(buildManualMedicine({ name: trimmed, presentation }))
      setMedicineSource('manual')
      setMedicineIntakeUnit(manualIntakeUnit(presentation, null))
      navigation.navigate(ROUTES.ONBOARDING_TREATMENT)
      return
    }
    navigation.navigate(ROUTES.ONBOARDING_MEDICINE_STRENGTH, { presentation, name: trimmed })
  }, [trimmed, presentation, setMedicine, setMedicineSource, setMedicineIntakeUnit, navigation])

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <OnboardingHeader {...(headerProps as any)} />
      <KeyboardAvoidingView enabled={keyboardVisible} style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.title} accessibilityRole="header">Qual é o nome?</Text>
          <FormInput name="name" label="Nome do remédio" required value={name} onChange={handleChange} />
          <CatalogFieldSuggestions catalog={catalog} field="name" onSheetSelect={handleSuggestion} />
        </ScrollView>
        <FormActions
          primaryLabel={trimmed ? `Continuar com "${trimmed}"` : 'Continuar'}
          onPrimary={handleContinue}
          primaryDisabled={!trimmed}
          primaryLoading={false}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.screen },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: spacing[5], paddingTop: spacing[2], paddingBottom: spacing[8], gap: spacing[4] },
  title: { fontSize: 26, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5, fontFamily: typography.fontFamily.bold },
})
