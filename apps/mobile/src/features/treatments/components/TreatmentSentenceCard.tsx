// TreatmentSentenceCard — "Confere" (hi-fi T-1/T-2 `StSum`) antes de salvar no form completo (spec 125, AC4.1, PO-125-8).
// A frase vem do core (`describeTreatment`), a mesma do onboarding — nunca montada na tela.

import { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { describeTreatment, getRawNow, getTodayLocal } from '@dosiq/core'
import { colors, spacing, borderRadius } from '@shared/styles/tokens'

export default function TreatmentSentenceCard({ medicine, values }: { medicine: any; values: any }) {
  const description = useMemo(
    () =>
      describeTreatment({
        medicineName: medicine?.name,
        presentation: medicine?.presentation,
        dosagePerPill: medicine?.dosage_per_pill,
        dosageUnit: medicine?.dosage_unit,
        dose: values.dosage_per_intake,
        intakeUnit: values.intake_unit ?? null,
        frequency: values.frequency,
        weekdays: values.weekdays,
        timeSchedule: values.time_schedule,
        intervalDays: values.interval_days,
        startDate: values.start_date,
        today: getTodayLocal(),
        // Horário de hoje que já passou não é "próxima" (mesma regra da conferência do onboarding).
        nowTime: `${String(getRawNow().getHours()).padStart(2, '0')}:${String(getRawNow().getMinutes()).padStart(2, '0')}`,
      }),
    [medicine, values],
  )
  if (!medicine?.name || !values.frequency) return null
  return (
    <View style={styles.card} testID="treatment-sentence-card">
      <Text style={styles.sentence} testID="treatment-sentence">{description.sentence}</Text>
      {description.next ? <Text style={styles.next}>{description.next}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { padding: spacing[4], borderRadius: borderRadius.lg, backgroundColor: colors.brand.mint, borderWidth: 1, borderColor: colors.border.default, gap: spacing[1] },
  sentence: { fontSize: 16, fontWeight: '600', color: colors.text.primary, lineHeight: 22 },
  next: { fontSize: 14, color: colors.text.secondary },
})
