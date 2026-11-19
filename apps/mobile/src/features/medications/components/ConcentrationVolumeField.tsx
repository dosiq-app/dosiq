import { useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { isLiquidDosageUnit, checkDosePlausibility } from '@dosiq/core'
import FormInput from '@shared/components/form/FormInput'
import { colors, spacing } from '@shared/styles/tokens'

// FR-031 (ADR-066) · spec 113 (FR-005) · spec 125 (FR-010, AC3.4): denominador do rótulo
// ("Mounjaro 2,5 mg / 0,5 mL" ⇒ 0,5). Campo na notação da caixa: sem 2º número por padrão (vazio = 1 mL);
// o denominador só aparece pelo atalho "depois da barra" — ou já aberto quando o remédio tem valor salvo.
// Número suspeito (≥ 10 mL líquido, > 1 mL injetável) gera aviso suave, nunca bloqueio (INV-5).

interface ConcentrationVolumeFieldProps {
  dosageUnit: string | null | undefined
  presentation?: string | null
  /** `formProps(form, 'concentration_volume_ml')` + `onChange` da tela. */
  inputProps: Record<string, any>
}

function hasValue(v: unknown): boolean {
  return v !== null && v !== undefined && String(v).trim() !== ''
}

export function ConcentrationVolumeField({ dosageUnit, presentation = null, inputProps }: ConcentrationVolumeFieldProps) {
  const [open, setOpen] = useState(false)
  if (!isLiquidDosageUnit(dosageUnit)) return null
  const shown = open || hasValue(inputProps?.value)
  if (!shown) {
    return (
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" style={styles.link} testID="volume-shortcut">
        <Text style={styles.linkText}>Na caixa tem outro número depois da barra?</Text>
      </Pressable>
    )
  }
  const warning = checkDosePlausibility({ presentation, denominatorMl: inputProps?.value }).find(
    (w) => w.kind === 'denominator_looks_like_package',
  )
  return (
    <View>
      <FormInput
        name="concentration_volume_ml"
        label="Número depois da barra (mL)"
        keyboardType="decimal-pad"
        placeholder="1"
        helperText='Ex.: "Mounjaro 2,5 mg / 0,5 mL" — preencha 0,5.' /* unit-label-gate: ok — copy estática de ajuda (053/PO-5) */
        {...inputProps}
      />
      {warning ? (
        <Text style={styles.warn} accessibilityLiveRegion="polite" testID="volume-warning">{warning.message}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: { fontSize: 14, fontWeight: '600', color: colors.brand.primary },
  warn: { marginTop: spacing[1], fontSize: 13, lineHeight: 18, color: colors.status.warning },
})
