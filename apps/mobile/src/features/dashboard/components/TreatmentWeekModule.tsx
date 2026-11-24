// TreatmentWeekModule.tsx — "Semana do tratamento" na Hoje (spec 121 A · FR-005..FR-011, FR-023; B · FR-030..FR-034).
// Um card, linhas independentes, na ordem Dose · Peso · Evolução (T025). Eyebrow, L1 e L3 = tratamento
// wedge iniciado mais recentemente (herança 1); o peso (L2) é do paciente (FR-023).
// L1 para wedge com cadência conhecida — diária ou ≥ 7 d; a forma muda só o verbo (121 C · FR-040, substitui
// G-B5). L3 só com escada COMPLETA (AP-311) — sem ela, some.
// Superfície de dose/medida, não alerta nem promo: não entra no árbitro da 120 C (H-1).
// 124 A: tratamento NÃO wedge com cadência ≥ 7 d também ganha o módulo ("ACOMPANHAMENTO"), só com a L1
// (L3 é do wedge). L1 aberta → "Ver todas as aplicações" (só injetável) (sheet da dose).
// 124 B: com > 1 elegível o cabeçalho vira seletor (sheet "Acompanhar", FR-012) e o título fica
// "ACOMPANHAMENTO" (FR-015); a L2 segue a medida do tratamento selecionado (FR-016, `widgetMeasure`).

import { useMemo, useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
// TODO(040-strict): named imports do lucide-react-native batem em TS2305 sob nodenext
import * as LucideIcons from 'lucide-react-native'
const { ChevronsUpDown } = LucideIcons as any
import {
  formatIntakeDose,
  formatLocalDate,
  getRawNow,
  parseTimestamp,
  getTodayLocal,
  getUserTime,
  isInjectable,
  isProtocolActiveOnDate,
  listUpcomingDoseDates,
  listUpcomingOccurrences,
  parseISO,
  resolveEarlyAnchorInstance,
  resolveNextOpenDay,
  shiftDay,
  summarizeDailyWindow,
  summarizeWeeklyDose,
  trackableCadence,
  type WedgeProfile,
} from '@dosiq/core'
import MeasureRow from '@dashboard/components/MeasureRow'
import TrackPickerSheet, { type TrackPickerItem } from '@dashboard/components/TrackPickerSheet'
import DoseRow from '@dashboard/components/DoseRow'
import DoseNavSheet from '@dose/components/DoseNavSheet'
import EvolutionRow from '@dashboard/components/EvolutionRow'
import { useTreatmentWeekDose } from '@dashboard/hooks/useTreatmentWeekDose'
import { useTodayWeekRows } from '@dashboard/hooks/useTodayWeekRows'
import { useTodayWeightSeries } from '@dashboard/hooks/useTodayWeightSeries'
import {
  chartAxisFrom,
  dailyRowCopy,
  defaultWeightWindow,
  effectiveDailySchedule,
  instanceDailySchedule,
  todayOccurrenceOpen,
  localNowTime,
  evolutionDetail,
  evolutionRowCopy,
  firstScheduledTime,
  type WeightWindow,
} from '@dashboard/utils/treatmentWeek'
import { treatmentSetupRows } from '@dashboard/utils/setupCopy'
import { moduleConcentration, widgetMeasure } from '@dashboard/utils/trackedSelection'
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
  /** 125 fatia 2: "Ajustar" do miolo da L1 antes da 1ª dose → edição do tratamento. */
  onAdjustTreatment?: (protocolId: string) => void
  /** RC6 #976 (AP-366): tick de minuto da Hoje (`useTodayData.now`) — reavalia "agora" sem relógio próprio. */
  nowKey?: number
  /** 124 A: tratamento do módulo é wedge? Não wedge ⇒ "ACOMPANHAMENTO", só L1 (cadência ≥ 7 d). */
  isWedge?: boolean
  /** 124 B (FR-012): > 1 elegível ⇒ linhas do sheet "Acompanhar"; vazio/1 ⇒ cabeçalho da 121. */
  pickerItems?: readonly TrackPickerItem[]
  onSelectTracked?: (protocolId: string) => void
}

/** Instante do tick da Hoje (`useTodayData.now`); sem ele, o instante real. */
function instantOf(nowKey: number): Date {
  return nowKey ? parseTimestamp(nowKey) : getRawNow()
}

/** `nowTime` do setup pela MESMA regra do título: aberta ⇒ hoje vale; fechada ⇒ hoje não; sem leitura ⇒ relógio. */
function setupNowTime(todayOpen: boolean | null, timezone: string): string | undefined {
  if (todayOpen === true) return undefined
  if (todayOpen === false) return '24:00'
  return localNowTime(timezone)
}

/**
 * L1 diária (121 C · AC-16/17): janela móvel de 7 d; dose de hoje só conta depois da janela.
 * Smoke 124 A: horário que nunca virou ocorrência não é dose (nem "hoje", nem devida). Fonte = ocorrências
 * gravadas (PO 23/11: cobre pausa/reativação); leitura indisponível ⇒ fallback pelo `created_at`.
 */
function buildDailyView({ protocol, recent, truncated, pastInstances, injectable, today, timezone }: {
  protocol: any
  recent: any[]
  truncated: boolean
  pastInstances: any[] | null
  injectable: boolean
  today: string
  timezone: string
}) {
  const eff = effectiveDailySchedule(protocol, today, timezone)
  const inst = instanceDailySchedule(pastInstances, today, timezone)
  const todayTimes = inst ? inst.todayTimes : eff.todayTimes
  // Início efetivo = hoje ⇒ a janela é só hoje: os horários contados são os que existiram.
  const planned = Array.isArray(protocol?.time_schedule) ? protocol.time_schedule : []
  const week = summarizeDailyWindow({
    applications: recent,
    isScheduled: (day) => (inst ? inst.days.has(day) : isProtocolActiveOnDate(protocol, day)),
    timesOfDay: inst || eff.startDay === today ? todayTimes : planned,
    startDay: eff.startDay,
    truncated,
    pastInstances,
    todayLocal: today,
    now: getRawNow(),
    tz: timezone,
  })
  const todayScheduled = isProtocolActiveOnDate(protocol, today) && todayTimes.length > 0
  const upcoming = listUpcomingOccurrences(protocol, 1).occurrences[0] ?? null
  // Hoje: próximo horário ainda por vir; todos passados ⇒ o 1º do dia que EXISTIU (fato neutro, sem "atrasado").
  const todayTime = todayScheduled ? (upcoming?.date === today ? upcoming.time : firstScheduledTime({ time_schedule: todayTimes })) : null
  const copy = dailyRowCopy(week, { injectable, todayTime, next: todayScheduled ? null : upcoming, today })
  return { week, copy }
}

/**
 * L1/L3 do módulo (121 B/C): elegibilidade por cadência (FR-040), leituras e derivações puras do core.
 * Separado do componente para manter a ordem States → Memos legível (e a complexidade baixa).
 */
function useWeekDoseView({ protocol, isWedge, userId, timezone, today, reloadKey, nowKey }: {
  protocol: any
  isWedge: boolean
  userId: string | null
  timezone: string
  today: string
  reloadKey?: unknown
  /** RC6 #976 (AP-366): minuto corrente — reavalia "agora" com a Hoje aberta. */
  nowKey: number
}) {
  // 124 A (FR-013): wedge = qualquer cadência conhecida; não wedge = só ≥ 7 d (nunca diário).
  const cadenceOf = trackableCadence(protocol, isWedge)
  const isDaily = cadenceOf?.kind === 'daily'
  const cadence = cadenceOf && !isDaily ? cadenceOf.days : null
  const doseEligible = cadenceOf !== null
  const injectable = isInjectable(protocol?.medicine)
  const dose = useTreatmentWeekDose({
    enabled: !!protocol,
    doseEnabled: doseEligible,
    cadenceDays: cadence,
    cadenceKind: isDaily ? 'daily' : 'weekly',
    userId,
    protocolId: protocol?.id ?? null,
    medicineId: protocol?.medicine_id ?? protocol?.medicine?.id ?? null,
    reloadKey,
  })
  // Próxima = 1º dia do calendário ainda em aberto: "Já apliquei" adiantado resolve a ocorrência
  // futura e o calendário puro não sabe disso (achado do smoke 121 B, ADR-130).
  // Smoke 124 A (PO 23/11): dose de hoje ainda vale? Regra do hero — título e miolo leem daqui.
  const todayOpen = useMemo(
    () => todayOccurrenceOpen(isDaily ? dose.pastInstances : dose.upcoming, today, timezone, instantOf(nowKey)),
    [isDaily, dose.pastInstances, dose.upcoming, today, timezone, nowKey]
  )
  const nextDay = useMemo(() => {
    if (!protocol) return null
    const dates = listUpcomingDoseDates(protocol, 3).dates
    // Hoje fechou (janela passou/resolvida) ou leitura ok sem ocorrência de hoje ⇒ hoje não é a próxima.
    const dropToday = todayOpen === false || (todayOpen === null && !isDaily && dose.upcoming.length > 0)
    // Aberta ⇒ hoje entra mesmo com o horário passado (o calendário puro já o descartou pelo relógio).
    const base = todayOpen === true && !dates.includes(today) ? [today, ...dates] : dates
    return resolveNextOpenDay(dropToday ? base.filter((d) => d !== today) : base, dose.upcoming, timezone)
  }, [protocol, dose.upcoming, timezone, todayOpen, isDaily, today])
  const doseSummary = useMemo(() => {
    if (!doseEligible || isDaily || dose.loading || dose.error) return null
    return summarizeWeeklyDose({ applications: dose.recent, nextDay, intervalDays: cadence, todayLocal: today, tz: timezone })
  }, [doseEligible, isDaily, dose.loading, dose.error, dose.recent, nextDay, cadence, today, timezone])
  // 121 C (AC-16/17): janela móvel de 7 d pelo calendário do gerador (C-A1); dose de hoje só conta
  // depois da janela (decisão PO 17/11). Próxima só se hoje não é dia previsto.
  const daily = useMemo(() => {
    if (!isDaily || dose.loading || dose.error) return null
    return buildDailyView({ protocol, recent: dose.recent, truncated: dose.truncated, pastInstances: dose.pastInstances, injectable, today, timezone })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reloadKey reavalia o "agora"
  }, [isDaily, dose.loading, dose.error, dose.recent, dose.truncated, dose.pastInstances, protocol, injectable, today, timezone, reloadKey, nowKey])
  // ADR-130: só ocorrência FUTURA dentro da tolerância; atrasada fica no hero.
  // RC6: instante REAL (`getRawNow`) contra `scheduled_for` absoluto — `getNow` é relógio de parede do fuso.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reloadKey reavalia o "agora"
  const earlyAnchor = useMemo(() => (doseEligible && !isDaily ? resolveEarlyAnchorInstance(dose.upcoming, getRawNow()) : null), [doseEligible, isDaily, dose.upcoming, reloadKey, nowKey])
  const evolution = useMemo(() => evolutionRowCopy(dose.ladder, today, timezone), [dose.ladder, today, timezone])
  const evolutionOpen = useMemo(
    () => evolutionDetail(dose.ladder, nextDay, cadence, timezone, today, isDaily ? 'daily' : 'weekly'),
    [dose.ladder, nextDay, cadence, timezone, today, isDaily]
  )
  const nextDoseLabel = protocol ? formatIntakeDose(protocol.dosage_per_intake, protocol.intake_unit, protocol.medicine) || null : null
  return { doseEligible, injectable, daily, dose, doseSummary, earlyAnchor, evolution, evolutionOpen, nextDoseLabel, todayOpen }
}

/**
 * D13: sobrelinha + nome (19/800) + chip de concentração, sem ícone. 124 B (FR-012/015/018): com
 * seletor, a linha do nome vira gatilho (≥ 44 pt) com `ChevronsUpDown` — distinto do chevron do
 * accordion — e o título fica "ACOMPANHAMENTO" fixo (a troca muda só o nome).
 */
function ModuleHeader({ medicineName, medicine, isWedge, onPick }: { medicineName: string | null; medicine?: any; isWedge: boolean; onPick?: (() => void) | null }) {
  const conc = moduleConcentration(medicine)
  const row = medicineName ? (
    <>
      <Text style={styles.medName} numberOfLines={1}>{medicineName}</Text>
      {conc ? (
        <View style={styles.concPill} testID="treatment-week-conc">
          <Text style={styles.concText}>{conc}</Text>
        </View>
      ) : null}
    </>
  ) : null
  return (
    <View style={styles.header} testID="treatment-week-header">
      <Text style={styles.eyebrow}>{onPick || !isWedge ? 'ACOMPANHAMENTO' : 'SEMANA DO TRATAMENTO'}</Text>
      {onPick ? (
        <Pressable
          onPress={onPick}
          style={[styles.titleRow, styles.pickRow]}
          accessibilityRole="button"
          accessibilityLabel={`Tratamento acompanhado: ${medicineName ?? 'tratamento'}. Toque para trocar.`}
          testID="treatment-week-picker"
        >
          {row}
          <View style={styles.pickIcon}>
            <ChevronsUpDown size={20} color={colors.brand.primary} strokeWidth={2.4} />
          </View>
        </Pressable>
      ) : medicineName ? (
        <View style={styles.titleRow}>{row}</View>
      ) : null}
    </View>
  )
}

export default function TreatmentWeekModule({
  userId, profile, medicineName, treatmentStart, timezone, reloadKey, protocol = null, onRegisterEarly, onOpenTreatment,
  onAdjustTreatment, isWedge = true, nowKey = 0, pickerItems = [], onSelectTracked,
}: Props) {
  // States
  const [windowChoice, setWindowChoice] = useState<WeightWindow | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const { rows, biomarkerOpen, toggle } = useTodayWeekRows(userId, profile)
  // 124 B (FR-016): L2 = medida do tratamento selecionado; peso só lê quando é a medida.
  const measure = widgetMeasure(protocol, isWedge)
  const series = useTodayWeightSeries({ enabled: measure === 'peso', userId, timezone, treatmentStart, reloadKey })
  // Memos
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reloadKey/nowKey viram o dia com a Hoje aberta
  const today = useMemo(() => getTodayLocal(timezone), [timezone, reloadKey, nowKey])
  const yesterday = shiftDay(today, -1)
  const { doseEligible, injectable, daily, dose, doseSummary, earlyAnchor, evolution, evolutionOpen, nextDoseLabel, todayOpen } = useWeekDoseView({
    protocol, isWedge, userId, timezone, today, reloadKey, nowKey,
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
  // 125 fatia 2 (PO smoke 20/11): antes da 1ª dose, o miolo da L1 é o setup do tratamento (só "Ajustar").
  // Smoke 124 A: com `nowTime` — horário de hoje já passado não é a "1ª dose" (o card da 125 já passava).
  const setupRows = useMemo(
    () => (protocol && onAdjustTreatment ? treatmentSetupRows(protocol, protocol.medicine, today, setupNowTime(todayOpen, timezone)) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reloadKey reavalia o "agora"
    [protocol, onAdjustTreatment, today, timezone, reloadKey, nowKey, todayOpen],
  )
  const lastDay = series.last ? formatLocalDate(getUserTime(parseISO(series.last.measuredAt), timezone)) : null

  // Handlers
  function selectWindow(w: WeightWindow) {
    setWindowChoice(w)
    if (w === 'treatment' && series.full === null) void series.loadTreatment()
  }

  return (
    <View style={styles.card} testID="treatment-week-module">
      <ModuleHeader
        medicineName={medicineName}
        medicine={protocol?.medicine}
        isWedge={isWedge}
        onPick={pickerItems.length > 1 && onSelectTracked ? () => setPickerOpen(true) : null}
      />
      {pickerItems.length > 1 && onSelectTracked ? (
        <TrackPickerSheet
          visible={pickerOpen}
          items={pickerItems}
          selectedId={protocol?.id ?? null}
          onSelect={onSelectTracked}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
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
          injectable={injectable}
          daily={daily}
          setup={setupRows?.length ? { rows: setupRows, onAdjust: () => onAdjustTreatment?.(protocol.id) } : null}
          // Smoke 124 B (PO 24/11): sheet só para injetável — no oral repete a lista das últimas doses.
          onOpenHistory={daily || !injectable ? null : () => setHistoryOpen(true)}
        />
      ) : null}
      {doseEligible && !daily && injectable ? (
        <DoseNavSheet
          visible={historyOpen}
          onClose={() => setHistoryOpen(false)}
          initial={dose.recent[0] ?? null}
          protocolId={protocol?.id ?? null}
          medicineId={protocol?.medicine_id ?? protocol?.medicine?.id ?? null}
          medicineName={medicineName}
          injectable={injectable}
          timezone={timezone}
        />
      ) : null}
      <MeasureRow
        measure={measure}
        open={measure === 'glicemia' || measure === 'pressao_arterial' ? biomarkerOpen[measure] : false}
        onToggle={() => { if (measure !== 'nenhum') toggle(measure) }}
        timezone={timezone}
        today={today}
        reloadKey={reloadKey}
        weight={{
          open: rows.peso,
          onToggle: () => toggle('peso'),
          points,
          last: series.last,
          lastDay,
          today,
          yesterday,
          windowSel,
          onWindow: selectWindow,
          windowFrom: axisFrom,
          loading: series.loading,
          error: series.error,
          onRetry: series.retry,
          onSaved: series.reload,
        }}
      />
      {isWedge && evolution && protocol?.id ? (
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
  pickRow: { minHeight: 44 },
  pickIcon: { marginLeft: 'auto', width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brand.mint, alignItems: 'center', justifyContent: 'center', marginRight: -spacing[2] },
})
