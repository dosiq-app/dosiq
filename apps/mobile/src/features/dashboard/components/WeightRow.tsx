// WeightRow.tsx — linha Peso (L2) do módulo "Semana do tratamento" (spec 121 A · FR-008..FR-012).
//
// Fechada: último peso · quando / variação no período + "Registrar" (INV-1: a ação nunca fica atrás
// do expandir). Sem pesagem nenhuma: o campo aparece direto.
// Aberta: gráfico em linha (ADR-125) com seletores 7d · 30d · Tratamento; 1 pesagem = só o número.
// Registro inline: miolo da 069 A1 (`MeasureValueFields`) + validação do Zod do core (faixa 20–200),
// gravação só por `measuresRepo.create` com entry_point (R-231). Peso é medida: azul-info (D3/FR-022).
// SaMD (ADR-062 / INV-3): variação com sinal, sem cor, sem seta, sem juízo.

import { useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
// TODO(040-strict): named imports do lucide-react-native batem em TS2305 sob nodenext
import * as LucideIcons from 'lucide-react-native'
const { Ruler, ChevronDown, ChevronUp } = LucideIcons as any
import { coerceDecimal, validateBiomarkerLog, weightChange, BIOMARKER_TYPE_UNITS } from '@dosiq/core'
import MeasureValueFields from '@measures/components/MeasureValueFields'
import WeightLineChart from '@measures/components/WeightLineChart'
import { measuresRepo } from '@measures/services/measuresRepo'
import { logEvent } from '@platform/analytics/productAnalytics'
import { EVENTS, ENTRY_POINTS, SURFACES } from '@platform/analytics/analyticsEvents'
import { clientUuid } from '@shared/utils/clientUuid'
import { isNetworkError } from '@shared/utils/networkError'
import { selectionTap } from '@shared/utils/haptics'
import { colors, spacing, borderRadius } from '@shared/styles/tokens'
import { WEIGHT_RANGE_MSG, formatKg1, whenLabel, type WeightWindow } from '@dashboard/utils/treatmentWeek'
import type { WeightLast, WeightPoint } from '@dashboard/hooks/useTodayWeightSeries'

const WINDOW_LABEL: Record<WeightWindow, string> = { '7d': '7d', '30d': '30d', treatment: 'Tratamento' }
const PERIOD_COPY: Record<WeightWindow, string> = { '7d': 'em 7 dias', '30d': 'em 30 dias', treatment: 'no tratamento' }
const WINDOWS: WeightWindow[] = ['7d', '30d', 'treatment']

type LoadError = 'network' | 'other' | null

type Props = {
  open: boolean
  onToggle: () => void
  points: WeightPoint[] | null
  last: WeightLast | null
  lastDay: string | null
  today: string
  yesterday: string
  windowSel: WeightWindow
  onWindow: (w: WeightWindow) => void
  windowFrom: string
  loading: boolean
  error: LoadError
  onRetry: () => void
  onSaved: () => void
}

function WeightRowHead({ open, onToggle, summary, changeLine, empty }: { open: boolean; onToggle: () => void; summary: string | null; changeLine: string | null; empty: boolean }) {
  return (
    <Pressable
      onPress={onToggle}
      style={styles.headMain}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel="Peso"
      testID="week-row-peso-toggle"
    >
      <View style={styles.icon}>
        <Ruler size={18} color={colors.status.info} strokeWidth={2} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.title}>Peso</Text>
        {summary ? <Text style={styles.value} testID="weight-row-summary">{summary}</Text> : null}
        {changeLine ? <Text style={styles.neutral} testID="weight-row-change">{changeLine}</Text> : null}
        {empty ? <Text style={styles.neutral}>Nenhuma pesagem ainda</Text> : null}
      </View>
      {open ? <ChevronUp size={18} color={colors.text.secondary} /> : <ChevronDown size={18} color={colors.text.secondary} />}
    </Pressable>
  )
}

/** Campo inline: valida pelo Zod do core, grava com id fixo por tentativa (idempotência, 069 A2). */
function WeightField({ caption, autoFocus, onDone }: { caption: string; autoFocus: boolean; onDone: () => void }) {
  // States
  const [value, setValue] = useState('')
  const [invalid, setInvalid] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<LoadError>(null)
  const [recordId, setRecordId] = useState(() => clientUuid())

  // Handlers
  async function handleSave() {
    if (saving) return
    const record = { type: 'peso', value: coerceDecimal(value), unit: BIOMARKER_TYPE_UNITS.peso }
    if (!validateBiomarkerLog(record).success) {
      setInvalid(WEIGHT_RANGE_MSG)
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      await measuresRepo.create({ id: recordId, ...record }, { entry_point: ENTRY_POINTS.TODAY_INLINE })
    } catch (err) {
      setSaveError(isNetworkError(err) ? 'network' : 'other')
      setSaving(false)
      return
    }
    void logEvent(EVENTS.TODAY_WEIGHT_LOGGED, { source: ENTRY_POINTS.TODAY_INLINE, surface: SURFACES.MOBILE })
    setSaving(false)
    setValue('')
    setRecordId(clientUuid())
    onDone()
  }

  const disabled = saving || value.trim() === ''
  return (
    <View style={styles.field} testID="weight-row-field">
      <Text style={styles.fieldCaption}>{caption}</Text>
      <MeasureValueFields
        unit="kg"
        isPa={false}
        value={value}
        onChangeValue={(t: string) => { setValue(t); if (invalid) setInvalid(null) }}
        valueSec=""
        onChangeValueSec={() => {}}
        errorMsg={invalid}
        autoFocus={autoFocus}
      />
      {saveError ? (
        <Text style={styles.error}>
          {saveError === 'network' ? 'Sem conexão. O peso não foi salvo.' : 'O peso não foi salvo. Tente de novo.'}
        </Text>
      ) : null}
      <Pressable
        onPress={handleSave}
        disabled={disabled}
        style={[styles.save, disabled && styles.saveDisabled]}
        accessibilityRole="button"
        testID="weight-row-save"
      >
        <Text style={styles.saveText}>{saving ? 'Salvando…' : 'Salvar'}</Text>
      </Pressable>
    </View>
  )
}

function WeightChartArea({ points, error, loading, onRetry, windowFrom, today }: { points: WeightPoint[] | null; error: LoadError; loading: boolean; onRetry: () => void; windowFrom: string; today: string }) {
  if (error) {
    return (
      <Pressable onPress={onRetry} accessibilityRole="button" testID="weight-row-error">
        <Text style={styles.error}>
          {error === 'network' ? 'Verifique a internet.' : 'Não deu para carregar.'} Os pesos continuam salvos. Tentar de novo
        </Text>
      </Pressable>
    )
  }
  if (points === null || loading) return <View style={styles.skeleton} testID="weight-row-loading" />
  if (points.length >= 2) return <WeightLineChart points={points} from={windowFrom} to={today} />
  return (
    <View style={styles.placeholder} testID={points.length === 1 ? 'weight-row-single' : 'weight-row-none'}>
      <Text style={styles.placeholderText}>
        {points.length === 1
          ? 'Só 1 pesagem neste período. Com mais uma, o gráfico aparece.'
          : 'Nenhuma pesagem neste período. Com 2 medidas, o gráfico aparece.'}
      </Text>
    </View>
  )
}

function WindowChips({ windowSel, onWindow }: { windowSel: WeightWindow; onWindow: (w: WeightWindow) => void }) {
  return (
    <View style={styles.windows} accessibilityRole="tablist">
      {WINDOWS.map((w) => {
        const on = windowSel === w
        return (
          <Pressable key={w} onPress={() => onWindow(w)} style={[styles.chip, on && styles.chipOn]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{WINDOW_LABEL[w]}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export default function WeightRow(props: Props) {
  const { open, onToggle, points, last, lastDay, today, yesterday, windowSel, onWindow, windowFrom, loading, error, onRetry, onSaved } = props
  // States
  const [editing, setEditing] = useState(false)

  const lastText = last && lastDay ? `${formatKg1(last.kg)} kg · ${whenLabel(lastDay, today, yesterday)}` : null
  const empty = points !== null && !lastText
  const change = points ? weightChange(points.map((p) => ({ value: p.kg }))) : null
  const changeLine = change ? `${change.label} kg ${PERIOD_COPY[windowSel]}` : null
  const showField = editing || empty

  return (
    <View style={styles.root} testID="week-row-peso">
      <View style={styles.head}>
        <WeightRowHead open={open} onToggle={onToggle} summary={lastText} changeLine={changeLine} empty={empty} />
        {!showField && lastText ? (
          <Pressable onPress={() => { selectionTap(); setEditing(true) }} style={styles.action} accessibilityRole="button" testID="weight-row-register">
            <Text style={styles.actionText}>Registrar</Text>
          </Pressable>
        ) : null}
      </View>
      {showField ? (
        <WeightField
          caption={lastText ? `Hoje · Último: ${lastText.replace(' · ', ' ')}` : 'Hoje'}
          autoFocus={editing}
          onDone={() => { setEditing(false); onSaved() }}
        />
      ) : null}
      {open ? (
        <View style={styles.body} testID="weight-row-body">
          <WeightChartArea points={points} error={error} loading={loading} onRetry={onRetry} windowFrom={windowFrom} today={today} />
          <WindowChips windowSel={windowSel} onWindow={onWindow} />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { paddingVertical: spacing[3] },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  headMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[3], minHeight: 48 },
  icon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.status.infoLight, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  title: { fontSize: 13, fontWeight: '700', color: colors.text.secondary },
  value: { fontSize: 16, fontWeight: '700', color: colors.text.primary, marginTop: 2 },
  // INV-3: um token neutro só, o mesmo para ganho e perda.
  neutral: { fontSize: 13, color: colors.text.secondary, marginTop: 2 },
  action: { minHeight: 40, paddingHorizontal: spacing[3], borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.status.info, justifyContent: 'center' },
  actionText: { fontSize: 14, fontWeight: '700', color: colors.status.info },
  field: { marginTop: spacing[3] },
  fieldCaption: { fontSize: 13, color: colors.text.secondary, textAlign: 'center' },
  save: { minHeight: 48, borderRadius: borderRadius.md, backgroundColor: colors.status.info, alignItems: 'center', justifyContent: 'center', marginTop: spacing[3] },
  saveDisabled: { opacity: 0.5 },
  saveText: { fontSize: 15, fontWeight: '700', color: colors.text.inverse },
  error: { fontSize: 13, color: colors.status.error, marginTop: spacing[2] },
  body: { marginTop: spacing[3] },
  placeholder: { height: 96, borderRadius: borderRadius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border.light, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing[4] },
  placeholderText: { fontSize: 14, color: colors.text.secondary, textAlign: 'center' },
  skeleton: { height: 120, borderRadius: borderRadius.md, backgroundColor: colors.bg.screen },
  windows: { flexDirection: 'row', gap: spacing[2], marginTop: spacing[3] },
  chip: { minHeight: 36, paddingHorizontal: spacing[3], borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, justifyContent: 'center' },
  chipOn: { backgroundColor: colors.status.infoLight, borderColor: colors.status.info },
  chipText: { fontSize: 13, color: colors.text.secondary },
  chipTextOn: { color: colors.status.info, fontWeight: '700' },
})
