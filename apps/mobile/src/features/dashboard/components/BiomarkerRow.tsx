// BiomarkerRow.tsx — L2 de glicemia ou pressão no módulo da Hoje (spec 124 B · FR-016 · mock C-5).
//
// Mesma forma da linha de peso (121): fechada = última medida · quando + "Registrar" (a ação nunca
// fica atrás do expandir); sem medida = campo direto. Aberta = gráfico da área de Medidas
// (`ScatterTrend`, dispersão; PA = 2 séries) com o mínimo de dias do card do tratamento
// (`missingDaysForChart`, 100 B). Medida é do paciente: lê os últimos 90 dias do tipo.
// Registro: `MeasureValueFields` + Zod do core; grava só por `measuresRepo.create` (R-231), entry
// `today_inline`. SaMD (ADR-062): sem faixa, meta, cor de juízo ou texto interpretativo.

import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
// TODO(040-strict): named imports do lucide-react-native batem em TS2305 sob nodenext
import * as LucideIcons from 'lucide-react-native'
const { Ruler, ChevronDown, ChevronUp } = LucideIcons as any
import { addDays, coerceDecimal, formatLocalDate, getNow, getRawNow, getUserTime, parseISO, shiftDay, validateBiomarkerLog, BIOMARKER_TYPE_UNITS } from '@dosiq/core'
import MeasureValueFields from '@measures/components/MeasureValueFields'
import ScatterTrend from '@measures/components/ScatterTrend'
import { measuresRepo } from '@measures/services/measuresRepo'
import { ENTRY_POINTS } from '@platform/analytics/analyticsEvents'
import { clientUuid } from '@shared/utils/clientUuid'
import { isNetworkError } from '@shared/utils/networkError'
import { selectionTap } from '@shared/utils/haptics'
import LoadingDots from '@shared/components/feedback/LoadingDots'
import { colors, spacing, borderRadius } from '@shared/styles/tokens'
import { whenLabel } from '@dashboard/utils/treatmentWeek'
import { missingDaysForChart, type CardMeasure } from '@treatments/utils/measureCardGate'

const FETCH_DAYS = 90

const COPY: Record<CardMeasure, { title: string; noun: string; typeLabel: string; empty: string; unsaved: string }> = {
  glicemia: { title: 'Glicemia', noun: 'glicemias', typeLabel: 'Glicemia', empty: 'Nenhuma glicemia ainda', unsaved: 'A glicemia não foi salva.' },
  pressao_arterial: { title: 'Pressão', noun: 'pressões', typeLabel: 'Pressão', empty: 'Nenhuma pressão ainda', unsaved: 'A pressão não foi salva.' },
}

type LoadError = 'network' | 'other' | null
type Item = { id?: string; value: number; value_secondary?: number | null; measured_at: string }

const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')

/** "112 mg/dL · hoje" · "120/80 mmHg · ontem" — dia LOCAL (R-020). */
export function biomarkerLastText(measure: CardMeasure, last: Item | null, timezone: string, today: string): string | null {
  if (!last?.measured_at) return null
  const day = formatLocalDate(getUserTime(parseISO(last.measured_at), timezone))
  const value = measure === 'pressao_arterial' && last.value_secondary != null ? `${fmt(last.value)}/${fmt(last.value_secondary)}` : fmt(last.value)
  return `${value} ${BIOMARKER_TYPE_UNITS[measure]} · ${whenLabel(day, today, shiftDay(today, -1))}`
}

function newest(items: Item[]): Item | null {
  let best: Item | null = null
  for (const it of items) if (!best || parseISO(it.measured_at).getTime() > parseISO(best.measured_at).getTime()) best = it
  return best
}

function useBiomarkerSeries(measure: CardMeasure, reloadKey: unknown) {
  // States
  const [state, setState] = useState<{ loading: boolean; error: LoadError; items: Item[] | null }>({ loading: true, error: null, items: null })
  // RC6 #977: geração — só a carga mais recente aplica (salvar durante uma leitura lenta não volta atrás).
  const genRef = useRef(0)
  // Handlers
  const load = useCallback(async () => {
    const gen = ++genRef.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      // RC6 #977: instante real (getRawNow) — `getNow` é relógio de parede do fuso, deslocado em `toISOString`.
      const items = await measuresRepo.list({ type: measure, fromTs: addDays(getRawNow(), -FETCH_DAYS).toISOString() })
      if (gen === genRef.current) setState({ loading: false, error: null, items: items ?? [] })
    } catch (err) {
      if (gen === genRef.current) setState((s) => ({ loading: false, error: isNetworkError(err) ? 'network' : 'other', items: s.items }))
    }
  }, [measure])
  // Effects — troca de medida/recarga; desmontar invalida a geração em voo.
  useEffect(() => {
    void load()
    return () => { genRef.current++ }
  }, [load, reloadKey])
  return { ...state, reload: () => void load() }
}

function BiomarkerField({ measure, caption, autoFocus, onDone }: { measure: CardMeasure; caption: string; autoFocus: boolean; onDone: () => void }) {
  const isPa = measure === 'pressao_arterial'
  // States
  const [value, setValue] = useState('')
  const [valueSec, setValueSec] = useState('')
  const [invalid, setInvalid] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<LoadError>(null)
  const [recordId, setRecordId] = useState(() => clientUuid())

  // Handlers
  async function handleSave() {
    if (saving) return
    const num = coerceDecimal(value)
    const sec = isPa ? coerceDecimal(valueSec) : null
    if (Number.isNaN(num) || num <= 0) return setInvalid(isPa ? 'Digite a sistólica (maior que zero).' : 'Digite um valor válido maior que zero.')
    if (isPa && (sec === null || Number.isNaN(sec) || sec <= 0)) return setInvalid('Digite a diastólica (maior que zero).')
    const record = { type: measure, value: num, value_secondary: sec, unit: BIOMARKER_TYPE_UNITS[measure] }
    const check = validateBiomarkerLog(record) as { success: boolean; errors?: { message: string }[] }
    if (!check.success) return setInvalid(check.errors?.[0]?.message ?? 'Valor inválido.')
    setSaving(true)
    setSaveError(null)
    try {
      await measuresRepo.create({ id: recordId, ...record }, { entry_point: ENTRY_POINTS.TODAY_INLINE })
    } catch (err) {
      setSaveError(isNetworkError(err) ? 'network' : 'other')
      setSaving(false)
      return
    }
    setSaving(false)
    setValue('')
    setValueSec('')
    setRecordId(clientUuid())
    onDone()
  }

  const disabled = saving || value.trim() === '' || (isPa && valueSec.trim() === '')
  return (
    <View style={styles.field} testID="biomarker-row-field">
      <Text style={styles.fieldCaption}>{caption}</Text>
      <MeasureValueFields
        unit={BIOMARKER_TYPE_UNITS[measure]}
        isPa={isPa}
        value={value}
        onChangeValue={(t: string) => { setValue(t); if (invalid) setInvalid(null) }}
        valueSec={valueSec}
        onChangeValueSec={(t: string) => { setValueSec(t); if (invalid) setInvalid(null) }}
        errorMsg={invalid}
        autoFocus={autoFocus}
      />
      {saveError ? (
        <Text style={styles.error}>{saveError === 'network' ? `Sem conexão. ${COPY[measure].unsaved}` : `${COPY[measure].unsaved} Tente de novo.`}</Text>
      ) : null}
      <Pressable onPress={handleSave} disabled={disabled} style={[styles.save, disabled && styles.saveDisabled]} accessibilityRole="button" testID="biomarker-row-save">
        <Text style={styles.saveText}>{saving ? 'Salvando…' : 'Salvar'}</Text>
      </Pressable>
    </View>
  )
}

function ChartArea({ measure, items, error, onRetry }: { measure: CardMeasure; items: Item[] | null; error: LoadError; onRetry: () => void }) {
  if (error) {
    return (
      <Pressable onPress={onRetry} accessibilityRole="button" testID="biomarker-row-error">
        <Text style={styles.error}>{error === 'network' ? 'Verifique a internet.' : 'Não deu para carregar.'} As medidas continuam salvas. Tentar de novo</Text>
      </Pressable>
    )
  }
  if (items === null) return <View style={styles.skeleton} testID="biomarker-row-loading" />
  const missing = missingDaysForChart(measure, items, getNow())
  if (missing > 0) {
    return (
      <View style={styles.placeholder} testID="biomarker-row-missing">
        <Text style={styles.placeholderText}>
          {missing === 1 ? 'Falta 1 dia com medida' : `Faltam ${missing} dias com medida`}. O gráfico aparece com {COPY[measure].noun} em dias diferentes da última semana.
        </Text>
      </View>
    )
  }
  return (
    <View testID="biomarker-row-chart">
      <ScatterTrend items={items} unit={BIOMARKER_TYPE_UNITS[measure]} typeLabel={COPY[measure].typeLabel} isPa={measure === 'pressao_arterial'} />
    </View>
  )
}

export default function BiomarkerRow({ measure, open, onToggle, timezone, today, reloadKey }: {
  measure: CardMeasure
  open: boolean
  onToggle: () => void
  timezone: string
  today: string
  reloadKey?: unknown
}) {
  // States
  const [editing, setEditing] = useState(false)
  const series = useBiomarkerSeries(measure, reloadKey)
  const copy = COPY[measure]
  const lastText = series.items ? biomarkerLastText(measure, newest(series.items), timezone, today) : null
  const empty = series.items !== null && !lastText
  const showField = editing || empty

  return (
    <View style={styles.root} testID={`week-row-${measure}`}>
      <View style={styles.head}>
        <Pressable onPress={onToggle} style={styles.headMain} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={copy.title} testID="week-row-medida-toggle">
          <View style={styles.icon}><Ruler size={18} color={colors.status.info} strokeWidth={2} /></View>
          <View style={styles.flex}>
            <Text style={styles.title}>{copy.title}</Text>
            {series.items === null && !series.error ? <LoadingDots testID="biomarker-row-pending" /> : null}
            {lastText ? <Text style={styles.value} testID="biomarker-row-summary">{lastText}</Text> : null}
            {empty ? <Text style={styles.neutral}>{copy.empty}</Text> : null}
          </View>
          {open ? <ChevronUp size={18} color={colors.text.secondary} /> : <ChevronDown size={18} color={colors.text.secondary} />}
        </Pressable>
        {!showField && lastText ? (
          <Pressable onPress={() => { selectionTap(); setEditing(true) }} style={styles.action} accessibilityRole="button" testID="biomarker-row-register">
            <Text style={styles.actionText}>Registrar</Text>
          </Pressable>
        ) : null}
      </View>
      {showField ? (
        <BiomarkerField
          measure={measure}
          caption={lastText ? `Agora · Última: ${lastText}` : 'Agora'}
          autoFocus={editing}
          onDone={() => { setEditing(false); series.reload() }}
        />
      ) : null}
      {open ? (
        <View style={styles.body} testID="biomarker-row-body">
          <ChartArea measure={measure} items={series.items} error={series.error} onRetry={series.reload} />
        </View>
      ) : null}
    </View>
  )
}

// Mesmos tokens da linha de peso (121): as linhas do módulo se parecem.
const styles = StyleSheet.create({
  root: { paddingVertical: spacing[3] },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  headMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[3], minHeight: 48 },
  icon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.status.infoLight, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  title: { fontSize: 13, fontWeight: '700', color: colors.text.secondary },
  value: { fontSize: 16, fontWeight: '700', color: colors.text.primary, marginTop: 2 },
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
  placeholder: { minHeight: 96, borderRadius: borderRadius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border.light, alignItems: 'center', justifyContent: 'center', padding: spacing[4] },
  placeholderText: { fontSize: 14, color: colors.text.secondary, textAlign: 'center' },
  skeleton: { height: 120, borderRadius: borderRadius.md, backgroundColor: colors.bg.screen },
})
