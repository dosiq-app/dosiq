// OnboardingStrengthStep — F-4 "Qual é a dosagem?" (spec 125, AC2.3/AC2.6, AC3.4, FR-005/FR-010).
// Número + unidade em chips filtrados pela forma (nenhuma marcada); com /mL, campo único na notação da
// caixa e o número depois da barra só pelo atalho. Injetável passa aqui; a dose por aplicação é no
// passo do tratamento. Nada é gravado (INV-1): o remédio vai para o contexto do wizard.

import { useCallback, useMemo } from 'react'
import { Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation, useRoute } from '@react-navigation/native'
import { medicineCreateSchema } from '@dosiq/core'
import { useFormState } from '@shared/hooks/useFormState'
import FormActions from '@shared/components/form/FormActions'
import { useToast } from '@shared/components/feedback/Toast'
import { StrengthFields } from '@medications/components/FormFirstStrength'
import { ROUTES } from '@navigation/routes'
import { useKeyboardVisible } from '@shared/hooks/useKeyboardVisible'
import { useOnboarding } from '../OnboardingContext'
import OnboardingHeader from '@features/onboarding/components/OnboardingHeader'
import FinishLaterButton from '@features/onboarding/components/FinishLaterButton'
import { buildManualMedicine, manualIntakeUnit } from '@features/onboarding/utils/manualMedicine'
import { colors, spacing, typography } from '@shared/styles/tokens'

// Vírgula vira ponto; só dígitos e um ponto (mesma limpeza do "Confira").
function cleanDecimal(value: unknown): string {
  return String(value ?? '')
    .replace(',', '.')
    .replace(/[^\d.]/g, '')
    .replace(/^(\d*\.\d*).*$/, '$1')
}

function formProps(form, name) {
  return {
    value: form.values[name],
    error: form.touched[name] ? form.errors[name] : undefined,
    onChange: form.handleChange,
    onBlur: form.handleBlur,
  }
}

export default function OnboardingStrengthStep() {
  // States (R-010)
  const navigation = useNavigation<any>()
  // 125 smoke: KAV 'height' (R-303) não devolve a altura ao fechar o teclado no Android edge-to-edge —
  // sobra faixa e o rodapé sobe. Ligado só com teclado aberto: fechado, vira View e a altura reseta.
  const keyboardVisible = useKeyboardVisible()
  const route = useRoute<any>()
  const { medicine, setMedicine, setMedicineSource, setMedicineIntakeUnit, finishLater } = useOnboarding()
  const { show } = useToast()
  const presentation: string = route.params?.presentation
  const name: string = route.params?.name ?? ''

  // Memos
  // Voltar do tratamento reabre com o que já estava no contexto (mesmo remédio).
  const initialValues = useMemo(() => {
    const same = medicine && medicine.name === name && medicine.presentation === presentation
    return {
      ...buildManualMedicine({ name, presentation }),
      dosage_unit: same ? medicine.dosage_unit : null,
      dosage_per_pill: same ? medicine.dosage_per_pill : '',
      concentration_volume_ml: same ? medicine.concentration_volume_ml : '',
    }
  }, [medicine, name, presentation])
  const form = useFormState(medicineCreateSchema, { initialValues })
  const headerProps = useMemo(() => ({ step: 1, totalSteps: 4, onBack: () => navigation.goBack() }), [navigation])

  // Handlers
  const handleDecimal = useCallback((field, value) => form.handleChange(field, cleanDecimal(value)), [form])
  const handleUnit = useCallback((unit: string) => form.handleChange('dosage_unit', unit), [form])

  // Valida e põe o remédio no contexto; `false` = faltou algo (toast já mostrado).
  const commitMedicine = useCallback((): boolean => {
    const unit = form.values.dosage_unit as string | null
    const dose = String(form.values.dosage_per_pill ?? '').trim()
    if (!unit || !dose) {
      show(!dose ? 'Digite o número escrito na caixa.' : 'Escolha a unidade.', { variant: 'error' })
      return false
    }
    if (!form.validate()) {
      show('Verifique os campos destacados', { variant: 'error' })
      return false
    }
    setMedicine(form.values)
    setMedicineSource('manual')
    setMedicineIntakeUnit(manualIntakeUnit(presentation, unit))
    return true
  }, [form, show, setMedicine, setMedicineSource, setMedicineIntakeUnit, presentation])

  const handleContinue = useCallback(() => {
    if (commitMedicine()) navigation.navigate(ROUTES.ONBOARDING_TREATMENT)
  }, [commitMedicine, navigation])

  // 125 (C-1): "Terminar depois" só com a dosagem completa — o Zod do core exige a unidade.
  const handleFinishLater = useCallback(() => {
    if (commitMedicine()) finishLater(1, 'medicine_only')
  }, [commitMedicine, finishLater])

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <OnboardingHeader {...(headerProps as any)} />
      <KeyboardAvoidingView enabled={keyboardVisible} style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.title} accessibilityRole="header">Qual é a dosagem?</Text>
          <Text style={styles.subtitle}>O número escrito no rótulo da embalagem.</Text>
          <StrengthFields
            presentation={presentation}
            doseInputProps={{ ...formProps(form, 'dosage_per_pill'), onChange: handleDecimal }}
            unit={form.values.dosage_unit as string | null}
            onUnitChange={handleUnit}
            volumeInputProps={{ ...formProps(form, 'concentration_volume_ml'), onChange: handleDecimal }}
          />
        </ScrollView>
        <FormActions primaryLabel="Continuar" onPrimary={handleContinue} primaryLoading={false} footer={<FinishLaterButton onPress={handleFinishLater} />} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.screen },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: spacing[5], paddingTop: spacing[2], paddingBottom: spacing[8], gap: spacing[4] },
  title: { fontSize: 26, fontWeight: '800', color: colors.text.primary, letterSpacing: -0.5, fontFamily: typography.fontFamily.bold },
  subtitle: { fontSize: 15, color: colors.text.secondary, lineHeight: 21, marginTop: -spacing[2] },
})
