// OnboardingMedicineCard — card do remédio no topo do passo "quando" (spec 125, AC4.2, hi-fi `StMedCard`):
// selo de origem (só quando veio da lista/caixa) · "Nome força · forma" · "Alterar" (volta ao remédio).

import { View, Text, Pressable, StyleSheet } from 'react-native'
import { formatConcentration, PRESENTATION_LABELS } from '@dosiq/core'
import { withNormalizedConcentration } from '@medications/utils/medicineDraftValues'
import { colors, spacing, borderRadius } from '@shared/styles/tokens'

const SOURCE_LABEL: Record<string, string> = {
  anvisa_search: 'Da lista da ANVISA',
  scan: 'Lido pelo código de barras',
}

export default function OnboardingMedicineCard({ medicine, source = null, onChange }: { medicine: any; source?: string | null; onChange: () => void }) {
  if (!medicine?.name) return null
  // Smoke 18/11: o rascunho guarda o valor da CAIXA ("5 mg / 0,6 mL"); formatConcentration espera mg/mL.
  // Normaliza antes (mesma leitura da tela de consentimento) — senão mostrava 5 × 0,6 = "3 mg / 0,6 mL".
  const saved = withNormalizedConcentration(medicine)
  const strength = medicine.dosage_per_pill
    ? ` ${formatConcentration(saved.dosage_per_pill, saved.dosage_unit, saved.concentration_volume_ml || null)}`
    : ''
  const form = (PRESENTATION_LABELS as Record<string, string>)[medicine.presentation]?.toLowerCase()
  const eyebrow = source ? SOURCE_LABEL[source] : null
  return (
    <View style={styles.card} testID="onboarding-medicine-card">
      <View style={styles.text}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.name}>
          {`${medicine.name}${strength}`}
          {form ? <Text style={styles.meta}>{` · ${form}`}</Text> : null}
        </Text>
      </View>
      <Pressable onPress={onChange} accessibilityRole="button" accessibilityLabel="Alterar remédio" hitSlop={8}>
        <Text style={styles.change}>Alterar</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingVertical: spacing[3], paddingHorizontal: spacing[4],
    borderRadius: borderRadius.lg, backgroundColor: colors.bg.card, borderWidth: 1.5, borderColor: colors.brand.light,
  },
  text: { flex: 1 },
  eyebrow: { fontSize: 12, fontWeight: '700', color: colors.brand.primary, marginBottom: 2 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text.primary },
  meta: { fontWeight: '500', color: colors.text.secondary },
  change: { fontSize: 14, fontWeight: '600', color: colors.brand.primary },
})
