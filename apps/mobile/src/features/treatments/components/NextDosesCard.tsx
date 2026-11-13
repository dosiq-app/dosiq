// NextDosesCard — 117 Fatia A (US-1 · FR-001/FR-002): "Próximas doses" no detalhe do tratamento.
//
// Fonte única: `listUpcomingDoses` do core (mesmo walk do gerador + dose da etapa vigente na data —
// INV-1, CON-036). Nada de recorrência ou escada calculada aqui.
// Some no diário (AC-1.2), pausado e finalizado (o gerador não materializa dose: prometer data seria
// prometer lembrete que não toca), e quando não há ocorrência (PRN, sem horário, término passado).

import { useCallback, useMemo, useRef } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
// TODO(040-strict): named imports do lucide-react-native batem em TS2305 — ver TreatmentsScreen.tsx
import * as LucideIcons from 'lucide-react-native'
import { listUpcomingDoses, formatWeekdayDayMonthPtBR, formatIntakeDose, formatLocalDate, addDays } from '@dosiq/core'
import SectionCard from '@shared/components/ui/SectionCard'
import { useMinuteClock } from '@shared/hooks/useMinuteClock'
import { logEvent } from '@platform/analytics/productAnalytics'
import { EVENTS, SURFACES } from '@platform/analytics/analyticsEvents'
import { colors, spacing, typography } from '@shared/styles/tokens'

const { CalendarDays } = LucideIcons as any

const COUNT = 3

/** "hoje" / "amanhã" / "sex, 13 nov". */
function dayLabel(date: string, today: string, tomorrow: string): string {
  if (date === today) return 'hoje'
  if (date === tomorrow) return 'amanhã'
  return formatWeekdayDayMonthPtBR(date)
}

type Props = {
  protocol: any
  paused: boolean
  finished: boolean
}

export default function NextDosesCard({ protocol, paused, finished }: Props) {
  // States
  const viewedRef = useRef(false)
  // AP-366 (RC6 #947): "agora" é estado — dose que passou sai da lista e "hoje/amanhã" viram à meia-noite.
  const now = useMinuteClock()

  // Memos
  const hidden = !protocol || protocol.frequency === 'diário' || paused || finished
  const { doses, today, tomorrow } = useMemo(() => {
    return {
      doses: hidden ? [] : listUpcomingDoses(protocol, COUNT, now),
      today: formatLocalDate(now),
      tomorrow: formatLocalDate(addDays(now, 1)),
    }
  }, [protocol, hidden, now])

  // Effects — 1 exibição por foco do detalhe (FR-010).
  useFocusEffect(
    useCallback(() => {
      if (doses.length > 0 && !viewedRef.current) {
        viewedRef.current = true
        logEvent(EVENTS.NEXT_DOSES_VIEWED, {
          frequency: protocol?.frequency ?? null,
          dose_count: doses.length,
          treatment_id: protocol?.id,
          surface: SURFACES.MOBILE,
        })
      }
      return () => {
        viewedRef.current = false
      }
    }, [doses.length, protocol?.frequency, protocol?.id])
  )

  if (doses.length === 0) return null

  const medicine = protocol.medicine ?? null
  const doseText = (dose: number, stageNumber: number | null) => {
    const base = formatIntakeDose(dose, protocol.intake_unit, medicine)
    return stageNumber ? `${base} · Etapa ${stageNumber}` : base
  }
  const [first, ...rest] = doses

  return (
    <SectionCard title="PRÓXIMAS DOSES">
      <View style={styles.highlight} testID="next-doses-first">
        <CalendarDays size={20} color={colors.primary[700]} />
        <View style={styles.highlightBody}>
          <Text style={styles.highlightDate}>
            {`${dayLabel(first.date, today, tomorrow)} · ${first.time}`}
          </Text>
          <Text style={styles.highlightDose} numberOfLines={2}>
            {medicine?.name ? `${medicine.name} · ` : ''}
            {doseText(first.dose, first.stageNumber)}
          </Text>
        </View>
      </View>
      {rest.length > 0 ? <View style={styles.divider} /> : null}
      {rest.map((d) => (
        <View key={`${d.date}-${d.time}`} style={styles.row} testID="next-doses-row">
          <Text style={styles.rowDate}>{`${dayLabel(d.date, today, tomorrow)} · ${d.time}`}</Text>
          <Text style={styles.rowDose}>{doseText(d.dose, d.stageNumber)}</Text>
        </View>
      ))}
    </SectionCard>
  )
}

const styles = StyleSheet.create({
  highlight: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    paddingVertical: spacing[1],
  },
  highlightBody: { flex: 1, gap: 2 },
  highlightDate: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
    fontFamily: typography.fontFamily.bold,
  },
  highlightDose: { fontSize: 14, color: colors.text.secondary },
  divider: {
    height: 1,
    backgroundColor: colors.border.default,
    marginVertical: spacing[2],
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing[1],
    paddingLeft: spacing[8],
    gap: spacing[2],
  },
  rowDate: { fontSize: 14, color: colors.text.primary, fontWeight: '500' },
  rowDose: { fontSize: 14, color: colors.text.secondary, flexShrink: 1, textAlign: 'right' },
})
