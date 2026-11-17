// TreatmentWeekModule.tsx — "Semana do tratamento" na Hoje (spec 121 A · FR-005..FR-011, FR-023; B · FR-030..FR-034).
// Um card, linhas independentes, na ordem Dose · Peso · Evolução (T025). Eyebrow, L1 e L3 = tratamento
// wedge iniciado mais recentemente (herança 1); o peso (L2) é do paciente (FR-023).
// L1 só para injetável de cadência ≥ 7 d (G-B5); L3 só com escada COMPLETA (AP-311) — sem ela, some.
// Superfície de dose/medida, não alerta nem promo: não entra no árbitro da 120 C (H-1).

import { useMemo, useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import {
  formatConcentration,
  formatIntakeDose,
  formatLocalDate,
  getRawNow,
  getTodayLocal,
  getUserTime,
  isInjectable,
  listUpcomingDoseDates,
  parseISO,
  resolveEarlyAnchorInstance,
  resolveNextOpenDay,
  shiftDay,
  summarizeWeeklyDose,
  type WedgeProfile,
} from '@dosiq/core'
import WeightRow from '@dashboard/components/WeightRow'
import DoseRow from '@dashboard/components/DoseRow'
import EvolutionRow from '@dashboard/components/EvolutionRow'
import { useTreatmentWeekDose } from '@dashboard/hooks/useTreatmentWeekDose'
import { useTodayWeekRows } from '@dashboard/hooks/useTodayWeekRows'
import { useTodayWeightSeries } from '@dashboard/hooks/useTodayWeightSeries'
import { chartAxisFrom, defaultWeightWindow, evolutionDetail, evolutionRowCopy, weeklyCadenceDays, type WeightWindow } from '@dashboard/utils/treatmentWeek'
import { colors, spacing, borderRadius } from '@shared/styles/tokens'

type Props = {
  userId: string | null
  profile: WedgeProfile
  medicineName: string | null
  treatmentStart: string | null
  timezone: string
  reloadKey?: unknown
  /** Protocolo do eyebrow (com `medicine` embutido) — fonte da L1/L3. */
  protocol?: any
  /** ADR-130: abre o registro ancorado na ocorrência futura (sheet existente). */
  onRegisterEarly?: (instance: any) => void
  /** Chevron da L3 → detalhe do tratamento. */
  onOpenTreatment?: (protocolId: string) => void
}

/**
 * L1/L3 do módulo (121 B): elegibilidade (G-B5), leituras e derivações puras do core.
 * Separado do componente para manter a ordem States → Memos legível (e a complexidade baixa).
 */
function useWeekDoseView({ protocol, userId, timezone, today, reloadKey }: {
  protocol: any
  userId: string | null
  timezone: string
  today: string
  reloadKey?: unknown
}) {
  const cadence = weeklyCadenceDays(protocol)
  const doseEligible = cadence !== null && isInjectable(protocol?.medicine)
  const dose = useTreatmentWeekDose({
    enabled: !!protocol,
    doseEnabled: doseEligible,
    cadenceDays: cadence,
    userId,
    protocolId: protocol?.id ?? null,
    medicineId: protocol?.medicine_id ?? protocol?.medicine?.id ?? null,
    reloadKey,
  })
  // Próxima = 1º dia do calendário ainda em aberto: "Já apliquei" adiantado resolve a ocorrência
  // futura e o calendário puro não sabe disso (achado do smoke 121 B, ADR-130).
  const nextDay = useMemo(
    () => (protocol ? resolveNextOpenDay(listUpcomingDoseDates(protocol, 3).dates, dose.upcoming, timezone) : null),
    [protocol, dose.upcoming, timezone]
  )
  const doseSummary = useMemo(() => {
    if (!doseEligible || dose.loading || dose.error) return null
    return summarizeWeeklyDose({ applications: dose.recent, nextDay, intervalDays: cadence, todayLocal: today, tz: timezone })
  }, [doseEligible, dose.loading, dose.error, dose.recent, nextDay, cadence, today, timezone])
  // ADR-130: só ocorrência FUTURA dentro da tolerância; atrasada fica no hero.
  // RC6: instante REAL (`getRawNow`) contra `scheduled_for` absoluto — `getNow` é relógio de parede do fuso.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reloadKey reavalia o "agora"
  const earlyAnchor = useMemo(() => (doseEligible ? resolveEarlyAnchorInstance(dose.upcoming, getRawNow()) : null), [doseEligible, dose.upcoming, reloadKey])
  const evolution = useMemo(() => evolutionRowCopy(dose.ladder, today, timezone), [dose.ladder, today, timezone])
  const evolutionOpen = useMemo(
    () => evolutionDetail(dose.ladder, nextDay, cadence, timezone, today),
    [dose.ladder, nextDay, cadence, timezone, today]
  )
  const nextDoseLabel = protocol ? formatIntakeDose(protocol.dosage_per_intake, protocol.intake_unit, protocol.medicine) || null : null
  return { doseEligible, dose, doseSummary, earlyAnchor, evolution, evolutionOpen, nextDoseLabel }
}

/** D13: sobrelinha + nome (19/800) + chip de concentração (mesmo pill do card do remédio), sem ícone. */
function ModuleHeader({ medicineName, medicine }: { medicineName: string | null; medicine?: any }) {
  const conc = medicine?.dosage_per_pill
    ? formatConcentration(medicine.dosage_per_pill, medicine.dosage_unit, medicine.concentration_volume_ml)
    : null
  return (
    <View style={styles.header} testID="treatment-week-header">
      <Text style={styles.eyebrow}>SEMANA DO TRATAMENTO</Text>
      {medicineName ? (
        <View style={styles.titleRow}>
          <Text style={styles.medName} numberOfLines={1}>{medicineName}</Text>
          {conc ? (
            <View style={styles.concPill} testID="treatment-week-conc">
              <Text style={styles.concText}>{conc}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

export default function TreatmentWeekModule({
  userId, profile, medicineName, treatmentStart, timezone, reloadKey, protocol = null, onRegisterEarly, onOpenTreatment,
}: Props) {
  // States
  const [windowChoice, setWindowChoice] = useState<WeightWindow | null>(null)
  const { rows, toggle } = useTodayWeekRows(userId, profile)
  const series = useTodayWeightSeries({ enabled: true, userId, timezone, treatmentStart, reloadKey })
  // Memos
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reloadKey vira o dia após recarga da Hoje
  const today = useMemo(() => getTodayLocal(timezone), [timezone, reloadKey])
  const yesterday = shiftDay(today, -1)
  const { doseEligible, dose, doseSummary, earlyAnchor, evolution, evolutionOpen, nextDoseLabel } = useWeekDoseView({
    protocol, userId, timezone, today, reloadKey,
  })
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
      <ModuleHeader medicineName={medicineName} medicine={protocol?.medicine} />
      {doseEligible ? (
        <DoseRow
          open={rows.dose}
          onToggle={() => toggle('dose')}
          summary={doseSummary}
          recent={dose.recent}
          nextDoseLabel={nextDoseLabel}
          timezone={timezone}
          loading={dose.loading}
          error={dose.error}
          onRetry={dose.retry}
          canRegisterEarly={!!earlyAnchor && !!onRegisterEarly}
          onRegisterEarly={() => earlyAnchor && onRegisterEarly?.(earlyAnchor)}
        />
      ) : null}
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
      {evolution && protocol?.id ? (
        <EvolutionRow
          copy={evolution}
          detail={evolutionOpen}
          open={rows.evolucao}
          onToggle={() => toggle('evolucao')}
          onOpen={() => onOpenTreatment?.(protocol.id)}
        />
      ) : null}
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
  header: { paddingBottom: spacing[3], borderBottomWidth: 1, borderBottomColor: colors.border.light },
  eyebrow: { fontSize: 11, fontWeight: '700', color: colors.text.muted, letterSpacing: 0.4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: 2 },
  medName: { flexShrink: 1, fontSize: 19, lineHeight: 24, fontWeight: '800', color: colors.text.primary },
  concPill: { backgroundColor: colors.neutral[100], paddingHorizontal: spacing[2], paddingVertical: 2, borderRadius: 4, borderWidth: 0.5, borderColor: colors.neutral[300] },
  concText: { fontSize: 12, fontWeight: '600', color: colors.neutral[700] },
})
