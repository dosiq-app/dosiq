// TreatmentWeekModule.tsx — "Semana do tratamento" na Hoje (spec 121 A · FR-005..FR-011, FR-023).
// Um card, linhas independentes (accordion). A slice A traz só a linha Peso (FR-007: sem placeholder
// das linhas Dose e Evolução, que chegam na B). Eyebrow do tratamento wedge iniciado mais
// recentemente; o peso é do paciente (FR-023).
// Superfície de dose/medida, não alerta nem promo: não entra no árbitro da 120 C (H-1).

import { useMemo, useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { formatLocalDate, getTodayLocal, getUserTime, parseISO, shiftDay, type WedgeProfile } from '@dosiq/core'
import WeightRow from '@dashboard/components/WeightRow'
import { useTodayWeekRows } from '@dashboard/hooks/useTodayWeekRows'
import { useTodayWeightSeries } from '@dashboard/hooks/useTodayWeightSeries'
import { chartAxisFrom, defaultWeightWindow, type WeightWindow } from '@dashboard/utils/treatmentWeek'
import { colors, spacing, borderRadius } from '@shared/styles/tokens'

type Props = {
  userId: string | null
  profile: WedgeProfile
  medicineName: string | null
  treatmentStart: string | null
  timezone: string
  reloadKey?: unknown
}

export default function TreatmentWeekModule({ userId, profile, medicineName, treatmentStart, timezone, reloadKey }: Props) {
  // States
  const [windowChoice, setWindowChoice] = useState<WeightWindow | null>(null)
  const { rows, toggle } = useTodayWeekRows(userId, profile)
  const series = useTodayWeightSeries({ enabled: true, userId, timezone, treatmentStart, reloadKey })
  // Memos
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reloadKey vira o dia após recarga da Hoje
  const today = useMemo(() => getTodayLocal(timezone), [timezone, reloadKey])
  const yesterday = shiftDay(today, -1)
  const windowSel = windowChoice ?? defaultWeightWindow(series.recent, today)
  const windowFrom =
    windowSel === '7d' ? shiftDay(today, -6) : windowSel === '30d' ? shiftDay(today, -29) : (series.journeyStart ?? treatmentStart ?? series.full?.[0]?.day ?? shiftDay(today, -29))
  const points = useMemo(() => {
    if (windowSel === 'treatment') return series.full
    return series.recent ? series.recent.filter((p) => p.day >= windowFrom) : null
  }, [windowSel, windowFrom, series.full, series.recent])
  const axisFrom = useMemo(
    () => chartAxisFrom(windowFrom, points?.[0]?.day ?? null, series.journeyStart ?? treatmentStart, today),
    [points, series.journeyStart, treatmentStart, windowFrom, today]
  )
  const lastDay = series.last ? formatLocalDate(getUserTime(parseISO(series.last.measuredAt), timezone)) : null

  // Handlers
  function selectWindow(w: WeightWindow) {
    setWindowChoice(w)
    if (w === 'treatment' && series.full === null) void series.loadTreatment()
  }

  return (
    <View style={styles.card} testID="treatment-week-module">
      <Text style={styles.eyebrow} numberOfLines={1}>
        SEMANA DO TRATAMENTO{medicineName ? ` · ${medicineName.toUpperCase()}` : ''}
      </Text>
      <WeightRow
        open={rows.peso}
        onToggle={() => toggle('peso')}
        points={points}
        last={series.last}
        lastDay={lastDay}
        today={today}
        yesterday={yesterday}
        windowSel={windowSel}
        onWindow={selectWindow}
        windowFrom={axisFrom}
        loading={series.loading}
        error={series.error}
        onRetry={series.retry}
        onSaved={series.reload}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bg.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.light,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[1],
    marginBottom: spacing[4],
  },
  eyebrow: { fontSize: 11, fontWeight: '700', color: colors.text.muted, letterSpacing: 0.4 },
})
