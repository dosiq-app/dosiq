// ApplicationDayField — "Quando foi (ou será) a aplicação?" (spec 125, AC2.5b, hi-fi O-4). Injetável não
// diário: o dia ancora a cadência (semanal ⇒ dia da semana; mensal ⇒ série de 30 dias). Ontem · Hoje ·
// Escolher dia, NADA marcado por omissão — o default de hoje erraria o dia de quem aplicou ontem.
// Chips = os mesmos do F-2 (`ChoiceChips`).

import { useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { addDays, formatLocalDate, parseLocalDate } from '@dosiq/core'
import { FormDatePicker } from '@shared/components/form'
import { ChoiceChips } from '@medications/components/FormFirstStrength'
import { colors, spacing } from '@shared/styles/tokens'

type Choice = 'ontem' | 'hoje' | 'outro'

interface Props {
  value: string | null
  today: string
  onChange: (date: string) => void
  error?: string | null
}

const OPTIONS: { value: Choice; label: string }[] = [
  { value: 'ontem', label: 'Ontem' },
  { value: 'hoje', label: 'Hoje' },
  { value: 'outro', label: 'Escolher dia' },
]

function yesterdayOf(today: string): string {
  return formatLocalDate(addDays(parseLocalDate(today), -1))
}

function choiceOf(value: string | null, today: string): Choice | null {
  if (!value) return null
  if (value === today) return 'hoje'
  return value === yesterdayOf(today) ? 'ontem' : 'outro'
}

export default function ApplicationDayField({ value, today, onChange, error = null }: Props) {
  const [picking, setPicking] = useState(false)
  const choice = picking ? 'outro' : choiceOf(value, today)
  const handleChoice = (next: string) => {
    setPicking(next === 'outro')
    if (next === 'ontem') onChange(yesterdayOf(today))
    if (next === 'hoje') onChange(today)
  }
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Quando foi (ou será) a aplicação?</Text>
      <ChoiceChips options={OPTIONS} value={choice} onChange={handleChoice} accessibilityLabel="Quando foi (ou será) a aplicação?" testIDPrefix="application-day" />
      {choice === 'outro' ? (
        <FormDatePicker
          name="application_date"
          label="Dia da aplicação"
          value={value ? parseLocalDate(value) : null}
          onChange={(_n, date) => date && onChange(formatLocalDate(date))}
        />
      ) : null}
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: spacing[2] },
  label: { fontSize: 14, fontWeight: '600', color: colors.text.secondary },
  error: { fontSize: 14, color: colors.status.error },
})
