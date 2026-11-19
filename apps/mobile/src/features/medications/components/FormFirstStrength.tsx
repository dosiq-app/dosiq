// FormFirstStrength — "forma primeiro" + dosagem na língua da caixa (spec 125, FR-004/FR-005/FR-021).
// Peças usadas em telas separadas (onboarding F-2/F-4) e juntas (form completo de remédio).
// As regras (unidades por forma, sem pré-seleção) vêm de `setupDefaults` no core (INV-6).

import { View, Text, Pressable, StyleSheet } from 'react-native'
import { PRESENTATIONS, PRESENTATION_LABELS, formatConcentration } from '@dosiq/core'
import { strengthUnitOptions } from '@medications/utils/strengthUnitOptions'
import FormInput from '@shared/components/form/FormInput'
import { ConcentrationVolumeField } from '@medications/components/ConcentrationVolumeField'
import { withNormalizedConcentration } from '@medications/utils/medicineDraftValues'
import { colors, spacing, typography } from '@shared/styles/tokens'
// TODO(040-strict): named imports do lucide-react-native batem em TS2305 sob nodenext
import * as LucideIcons from 'lucide-react-native'

const { LockKeyhole, ScanText } = LucideIcons as any

/**
 * Smoke 18/11: espelho do que a pessoa digitou na LÍNGUA DA CAIXA ("5 mg / 0,6 mL") — reforça o que
 * está sendo cadastrado antes de seguir. Mesma leitura do card do passo "quando" e do consentimento.
 */
function strengthPreview(value, unit, volume): string {
  if (value === '' || value === null || value === undefined || !unit) return ''
  const saved = withNormalizedConcentration({ dosage_per_pill: value, dosage_unit: unit, concentration_volume_ml: volume ?? '' })
  return formatConcentration(saved.dosage_per_pill, saved.dosage_unit, saved.concentration_volume_ml || null)
}

interface ChoiceChipsProps {
  options: { value: string; label: string }[]
  value: string | null | undefined
  onChange: (value: string) => void
  accessibilityLabel: string
  testIDPrefix: string
}

export function ChoiceChips({ options, value, onChange, accessibilityLabel, testIDPrefix }: ChoiceChipsProps) {
  return (
    <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((o) => {
        const active = value === o.value
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.chip, active && styles.chipActive]}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            testID={`${testIDPrefix}-${o.value}`}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const PRESENTATION_OPTIONS = PRESENTATIONS.map((value) => ({
  value,
  label: (PRESENTATION_LABELS as Record<string, string>)[value] ?? value,
}))

/** Os 7 valores do CHECK, sem pré-seleção (AC2.1). */
export function PresentationChips({ value, onChange, error }: { value: string | null | undefined; onChange: (v: string) => void; error?: string | null }) {
  return (
    <View>
      <ChoiceChips
        options={PRESENTATION_OPTIONS}
        value={value}
        onChange={onChange}
        accessibilityLabel="Como é o remédio"
        testIDPrefix="presentation-chip"
      />
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
    </View>
  )
}

/** Unidade em chips filtrados pela forma, com o erro do campo (form completo). */
export function UnitChipsField({ presentation, unit, onChange, error }: { presentation: string | null | undefined; unit: string | null | undefined; onChange: (u: string) => void; error?: string | null }) {
  return (
    <View>
      <Text style={styles.label}>Unidade</Text>
      <ChoiceChips options={strengthUnitOptions(presentation, unit)} value={unit} onChange={onChange} accessibilityLabel="Unidade da dosagem" testIDPrefix="unit-chip" />
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
    </View>
  )
}

interface StrengthFieldsProps {
  presentation: string | null | undefined
  /** `formProps(form, 'dosage_per_pill')` + onChange da tela. */
  doseInputProps: Record<string, any>
  unit: string | null | undefined
  onUnitChange: (unit: string) => void
  unitError?: string | null
  /** `formProps(form, 'concentration_volume_ml')` + onChange da tela. */
  volumeInputProps: Record<string, any>
  /** Caixa ANVISA escolhida: concentração e volume vêm dela, só leitura (AC3.5). */
  lockedLabel?: string | null
}

/** Dosagem: número + unidade em chips filtrados pela forma (AC2.6), nenhuma marcada por omissão. */
export function StrengthFields({
  presentation, doseInputProps, unit, onUnitChange, unitError, volumeInputProps, lockedLabel,
}: StrengthFieldsProps) {
  if (lockedLabel) {
    return (
      <View testID="strength-locked">
        <Text style={styles.label}>Na caixa</Text>
        {/* Cadeado na ponta (hi-fi `StInput lock`): deixa explícito que o valor vem da caixa e não muda aqui. */}
        <View style={styles.locked} accessibilityLabel={`${lockedLabel}, da caixa, não editável`}>
          <Text style={styles.lockedText}>{lockedLabel}</Text>
          <LockKeyhole size={16} color={colors.text.secondary} strokeWidth={2} />
        </View>
      </View>
    )
  }
  if (strengthUnitOptions(presentation, unit).length === 0) return null
  const preview = strengthPreview(doseInputProps?.value, unit, volumeInputProps?.value)
  return (
    <View style={styles.block}>
      <FormInput name="dosage_per_pill" label="Dosagem" required keyboardType="decimal-pad" {...doseInputProps} />
      <UnitChipsField presentation={presentation} unit={unit} onChange={onUnitChange} error={unitError} />
      <ConcentrationVolumeField dosageUnit={unit} presentation={presentation} inputProps={volumeInputProps} />
      {preview ? (
        <View style={styles.preview} testID="strength-preview">
          <ScanText size={18} color={colors.brand.primary} strokeWidth={1.75} />
          <View style={styles.previewBody}>
            <Text style={styles.previewText}>Na embalagem aparece assim:</Text>
            <Text style={styles.previewValue}>{preview}</Text>
          </View>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  block: { gap: spacing[3] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  chip: {
    minHeight: 44,
    paddingHorizontal: spacing[4],
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.card,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.brand.primary, borderColor: colors.brand.primary },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.text.primary },
  chipTextActive: { color: colors.text.inverse },
  label: { fontSize: 13, fontWeight: '600', color: colors.text.secondary, marginBottom: spacing[2], fontFamily: typography.fontFamily.bold },
  locked: { minHeight: 48, borderRadius: 12, backgroundColor: colors.neutral[100], paddingHorizontal: spacing[4], flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[2] },
  lockedText: { flex: 1, fontSize: 15, color: colors.text.primary },
  preview: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], padding: spacing[3], borderRadius: 12, backgroundColor: colors.bg.card, borderWidth: 1.5, borderColor: colors.brand.light },
  previewBody: { flex: 1, gap: 2 },
  previewText: { fontSize: 14, color: colors.text.secondary },
  previewValue: { fontSize: 16, fontWeight: '700', color: colors.text.primary },
  error: { marginTop: spacing[1], fontSize: 13, color: colors.status.error },
})
