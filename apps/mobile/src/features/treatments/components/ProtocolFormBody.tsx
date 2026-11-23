import { useMemo, useCallback, useState, useEffect } from 'react'
import DoseWarnings from '@treatments/components/DoseWarnings'
import TreatmentSentenceCard from '@treatments/components/TreatmentSentenceCard'
import { doseWarnings, confirmDoseLabel } from '@treatments/utils/dosePlausibility'
import { View, Text, StyleSheet, Pressable } from 'react-native'
// ⚠️ Namespace + cast NÃO é desleixo — é contorno de resolução de tipos quebrada, e trocar por
// import nomeado QUEBRA o gate cross-program (verificado em 2026-07-20):
//   `lucide-react-native` está hoisted em /node_modules, mas `react-native-svg` só existe em
//   apps/mobile/node_modules. O .d.ts do lucide faz `import { SvgProps } from 'react-native-svg'`
//   e resolve a partir da raiz ⇒ não acha ⇒ tsc trata o módulo como SEM exports. Até `ChevronRight`
//   passa a "não existir".
// Custo aceito: nome de ícone errado vira `undefined` e só quebra no render. Mitigação = manter a
// lista curta e conferir cada nome contra `node_modules/lucide-react-native/dist/icons.d.ts`.
import * as LucideIcons from 'lucide-react-native'

// Conferidos no d.ts do pacote (1703 ícones): `CircleQuestionMark` é o nome ATUAL — `CircleHelp` e
// `HelpCircle` NÃO existem nesta versão, apesar de serem os nomes históricos.
const { ArrowDownNarrowWide, ChevronRight, CircleQuestionMark } = LucideIcons as any
import {
  parseLocalDate,
  formatDoseHint,
  INTAKE_UNIT_LABELS,
  cadenceChoicesFor,
  cadenceChoiceLabel,
  applyCadenceChoice,
  isMonthlyCadence,
  MONTHLY_CHOICE,
  FREQUENCY_LABELS,
  frequencyRequiresWeekdays,
  INTERVAL_DAYS_MIN,
  INTERVAL_DAYS_MAX,
  resolveCurrentStep,
  defaultIntakeUnitFor,
  setupDefaults,
  isLiquidDosageUnit,
} from '@dosiq/core'
import ApplicationDayField from '@features/onboarding/components/ApplicationDayField'
import { useApplicationDay } from '@treatments/hooks/useApplicationDay'
import FormInput from '@shared/components/form/FormInput'
import FormSelect from '@shared/components/form/FormSelect'
import FormDatePicker from '@shared/components/form/FormDatePicker'
import MedicineSelectorRow from '@treatments/components/MedicineSelectorRow'
import WeekdaySelector from '@treatments/components/WeekdaySelector'
import SchedulePresetSection from '@treatments/components/SchedulePresetSection'
import NextDoseField from '@treatments/components/NextDoseField'
import PlanSelectField from '@treatments/components/PlanSelectField'
import CollapsibleSection from '@shared/components/form/CollapsibleSection'
import { ChoiceChips } from '@medications/components/FormFirstStrength'
import { orderedCadenceChips, treatmentDefaults } from '@features/onboarding/utils/treatmentStepModel'
import { colors, spacing } from '@shared/styles/tokens'
import CriticalAlarmCard from '@treatments/components/CriticalAlarmCard'
import TrackedMeasureField from '@treatments/components/TrackedMeasureField'
import { displayedTrackedMeasure } from '@treatments/utils/trackedMeasureField'
import { moreOptionsFilled, MORE_OPTIONS_EMPTY_SUMMARY } from '@treatments/utils/moreOptionsSummary'
import CriticalAlertPrimerSheet from '@treatments/components/CriticalAlertPrimerSheet'
import { useCriticalAlarmToggle } from '@treatments/hooks/useCriticalAlarmToggle'
import {
  needsFullScreenIntentAccess,
  openFullScreenIntentSettings,
} from '@platform/alarms/alarmService'
import { resolveOemFamily } from '@platform/device/oemFamily'
import { getFullScreenGuide, guideToPlainText } from '@features/oemAssistant/oemBatteryGuides'

/** Teto de bolas renderizadas — acima disso vira "+N" (escada longa não pode estourar a linha). */
const EVO_DOTS_MAX = 8

/** Campos que moram em "Mais opções" (AC7.2) — erro visível em qualquer um abre o bloco. */
const MORE_OPTION_FIELDS = ['name', 'start_date', 'end_date', 'treatment_plan_id', 'notes', 'tracked_measure']

// 085 (F-2): a lista de oferta vem do core. Depende da frequência ATUAL do form: um tratamento legado
// continua exibindo a sua própria frequência, mesmo depreciada (FR-004).
// 086: as opções são ESCOLHAS de cadência — frequências + "Mensal", que grava `intervalo_dias`/30
// (`cadenceChoicesFor`/`applyCadenceChoice` do core; FR-012…FR-014).
// 125 1c (AC7.1, PO 19/11): chips na ordem da forma, como no onboarding; sem a trava 086 — a cadência em
// dias é sempre oferecida (o kill switch da v0.35 tira de circulação o app que não a entende).
function buildFrequencyOptions(currentFrequency, presentation, monthlyAtLoad = false) {
  const choices = cadenceChoicesFor(currentFrequency, { intervalAvailable: true, monthlyAtLoad })
  return orderedCadenceChips(choices, presentation, (c) => cadenceChoiceLabel(c, FREQUENCY_LABELS))
}

// 125 1b (AC5.2b): injetável segue a regra da forma do core — mg/mL ⇒ mg ou mL; UI/mL ⇒ UI ou mL;
// nunca gotas (Ozempic pelo form completo nascia "X gotas").
// RC5 1b: o mL é só do form completo (já existia aqui); o onboarding segue só mg/UI — com o chip mL ao lado da dose
// da caixa, "2,5" viraria 2,5 mL sem aviso.
function injectableIntakeUnits(medicine): string[] {
  if (medicine?.presentation !== 'injetavel') return []
  const units = setupDefaults('injetavel', medicine?.dosage_unit).intakeUnits
  // unit-label-gate: ok — 'ml' é VALOR do enum INTAKE_UNITS (opção gravada), não rótulo; o rótulo sai de INTAKE_UNIT_LABELS
  return isLiquidDosageUnit(medicine?.dosage_unit) && units.length > 0 ? [...units, 'ml'] : units
}

// Default da unidade de tomada: gotas é a apresentação líquida mais comum; ui/ml → 'UI'.
// 066 E (C-7): a regra mora no core — o onboarding usa a mesma quando a caixa não diz a unidade.
function defaultIntakeFor(medicine): string {
  return injectableIntakeUnits(medicine)[0] ?? defaultIntakeUnitFor(medicine?.dosage_unit) ?? 'gotas'
}

// Dropdown por forma (022 + B2): injetável pela regra do core; ui/ml → {UI, gotas}; mg/ml → {gotas, ml, mg};
// resto → {gotas, ml}. Tratamento antigo com unidade fora da regra (injetável em gotas) mostra o valor salvo.
function intakeOptionsFor(medicine, currentIntake: string | null) {
  const injectable = injectableIntakeUnits(medicine)
  const byForm =
    injectable.length > 0
      ? injectable
      : medicine?.dosage_unit === 'ui/ml'
        ? ['UI', 'gotas']
        : medicine?.dosage_unit === 'mg/ml'
          ? ['gotas', 'ml', 'mg']
          : ['gotas', 'ml']
  const allowed = currentIntake && !byForm.includes(currentIntake) ? [...byForm, currentIntake] : byForm
  return allowed.map((u) => ({ value: u, label: INTAKE_UNIT_LABELS[u] ?? u }))
}

function useProtocolFormDerived(form, medicine) {
  const startDateAsDate = useMemo(
    () => (form.values.start_date ? parseLocalDate(form.values.start_date) : null),
    [form.values.start_date]
  )
  const endDateAsDate = useMemo(
    () => (form.values.end_date ? parseLocalDate(form.values.end_date) : null),
    [form.values.end_date]
  )

  // Líquido := dosage_unit do medicamento termina em '/ml' (decisão-mãe 022).
  const isLiquid = Boolean(medicine?.dosage_unit?.endsWith('/ml'))

  const helperText = useMemo(() => {
    const fallback = 'Quantas unidades do medicamento por tomada (aceita decimais, ex: 0,5)'
    if (!medicine) return fallback
    // Reusa o formatter core (R-272) — mesma equivalência do web. Líquido:
    // mg → ml via dosage_per_pill (concentração); gotas/UI → ml via units_per_ml
    // (usa o valor que o usuário está digitando no form, se houver). Sólido: massa ativa.
    const medForHint = isLiquid
      ? {
          ...medicine,
          units_per_ml:
            Number(String(form.values.units_per_ml ?? '').replace(',', '.')) ||
            medicine.units_per_ml,
        }
      : medicine
    // Smoke 2a (PO 22/11): com o aviso "Na caixa: … é bem menos" na tela, a equivalência validaria o
    // número que o aviso questiona — some até a dose mudar.
    const doubted = doseWarnings(medicine, form.values.dosage_per_intake, form.values.intake_unit ?? null).some(
      (w) => w.kind === 'looks_like_ml',
    )
    if (doubted) return undefined
    const hint = formatDoseHint(form.values.dosage_per_intake, form.values.intake_unit, medForHint)
    return hint ? `✨ ${hint}` : fallback
  }, [form.values.dosage_per_intake, form.values.intake_unit, form.values.units_per_ml, medicine, isLiquid])

  const defaultIntake = defaultIntakeFor(medicine)
  const isMg = form.values.intake_unit === 'mg'
  const currentIntake = form.values.intake_unit ?? null
  const intakeOptions = useMemo(
    () => intakeOptionsFor(medicine, currentIntake),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [medicine?.dosage_unit, medicine?.presentation, currentIntake],
  )
  // Densidade (units_per_ml) só p/ gotas/UI (razão física sub-ml). mg usa a
  // concentração do medicamento (dosage_per_pill = mg/ml) — não pede densidade.
  const needsDensity =
    isLiquid && form.values.intake_unit && form.values.intake_unit !== 'ml' && !isMg
  const densityLabel = form.values.intake_unit === 'UI' ? '💧 Densidade: UI por mL' : '💧 Densidade: Gotas por mL'
  const densityHint =
    form.values.intake_unit === 'UI' ? 'Geralmente 100 UI por mL' : 'Geralmente 20 gotas por mL'
  const defaultDensity = form.values.intake_unit === 'UI' ? 100 : 20
  // gotas/UI herdam units_per_ml do medicamento (decisão 022).
  const inheritedDensity = Number(medicine?.units_per_ml) > 0 ? medicine.units_per_ml : null
  const askDensity = needsDensity && !inheritedDensity

  // Sincroniza flag transiente p/ o refine do protocolCreateSchema + default de intake_unit.
  useEffect(() => {
    if (form.values._medicineIsLiquid !== isLiquid) {
      form.handleChange('_medicineIsLiquid', isLiquid)
    }
    if (isLiquid && !form.values.intake_unit) {
      form.handleChange('intake_unit', defaultIntake)
    }
  }, [isLiquid, defaultIntake, form])

  // Densidade do form: herda do medicamento se já cadastrada (não repergunta);
  // senão prefilla o default de gotas/UI. mg sem herança fica vazio (FR-018).
  useEffect(() => {
    if (!needsDensity || form.values.units_per_ml) return
    if (inheritedDensity) form.handleChange('units_per_ml', String(inheritedDensity))
    else if (defaultDensity) form.handleChange('units_per_ml', String(defaultDensity))
  }, [needsDensity, inheritedDensity, defaultDensity, form])

  const doseDisplay =
    form.values.dosage_per_intake === ''
      ? ''
      : String(form.values.dosage_per_intake).replace('.', ',')

  return {
    startDateAsDate,
    endDateAsDate,
    isLiquid,
    helperText,
    defaultIntake,
    intakeOptions,
    askDensity,
    densityLabel,
    densityHint,
    defaultDensity,
    doseDisplay,
  }
}

// Smoke 125 2a (PO 22/11): densidade é info avançada (quase nenhum rótulo traz) — fica atrás de um link, como o
// volume da concentração no cadastro do remédio. O default já vale (prefill do effect acima); o campo abre
// sozinho quando o valor salvo/digitado difere do default.
function DensityField({ form, label, hint, defaultDensity }) {
  const [open, setOpen] = useState(false)
  const raw = form.values.units_per_ml
  const custom = raw != null && String(raw).trim() !== '' && Number(String(raw).replace(',', '.')) !== defaultDensity
  // RC6 #973: valor salvo diferente do padrão abre o campo e TRAVA aberto — apagar para redigitar (ou passar
  // pelo padrão, "20" a caminho de "200") não pode desmontar o input sob o dedo.
  // Ajuste de estado no render (padrão React p/ estado derivado de prop), não em effect.
  if (custom && !open) setOpen(true)
  if (!open && !custom) {
    // PO: sem número aqui — um "20" logo abaixo da dose parecia a dose. "Volume da gota" é como se pensa.
    const what = form.values.intake_unit === 'UI' ? 'Concentração' : 'Volume da gota'
    return (
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" style={styles.densityLink} testID="density-shortcut">
        {/* PO: afirmação no cinza do form; só "Ajustar" na cor de link. A linha toda segue tocável (alvo 44). */}
        <Text style={styles.densityText}>
          {`${what}: padrão · `}<Text style={styles.densityLinkText}>Ajustar</Text>
        </Text>
      </Pressable>
    )
  }
  return (
    <FormInput
      name="units_per_ml"
      label={label}
      value={raw != null ? String(raw) : ''}
      onChange={form.handleChange}
      onBlur={form.handleBlur}
      placeholder={String(defaultDensity)}
      keyboardType="decimal-pad"
      maxLength={6}
      helperText={hint}
    />
  )
}

function DoseSection({
  label = 'Dose por tomada',
  isLiquid,
  doseDisplay,
  intakeOptions,
  defaultIntake,
  helperText,
  askDensity,
  densityLabel,
  densityHint,
  defaultDensity,
  onDoseChange,
  form,
}) {
  if (isLiquid) {
    return (
      <>
        <View style={styles.doseRow}>
          <View style={styles.doseField}>
            <FormInput
              name="dosage_per_intake"
              label={label}
              value={doseDisplay}
              error={form.touched.dosage_per_intake ? form.errors.dosage_per_intake : null}
              onChange={onDoseChange}
              onBlur={form.handleBlur}
              placeholder="0"
              keyboardType="decimal-pad"
              maxLength={10}
            />
          </View>
          <View style={styles.unitField}>
            <FormSelect
              name="intake_unit"
              label="💧 Unidade"
              value={form.values.intake_unit || defaultIntake}
              options={intakeOptions}
              onChange={form.handleChange}
              onBlur={form.handleBlur}
              error={form.touched.intake_unit ? form.errors.intake_unit : null}
            />
          </View>
        </View>
        {!!helperText && <Text style={styles.doseHint}>{helperText}</Text>}
        {askDensity && (
          <DensityField form={form} label={densityLabel} hint={densityHint} defaultDensity={defaultDensity} />
        )}
      </>
    )
  }

  return (
    <FormInput
      name="dosage_per_intake"
      label={label}
      value={doseDisplay}
      error={form.touched.dosage_per_intake ? form.errors.dosage_per_intake : null}
      onChange={onDoseChange}
      onBlur={form.handleBlur}
      placeholder="0"
      keyboardType="decimal-pad"
      maxLength={10}
      helperText={helperText}
    />
  )
}

/**
 * 085 C2: texto → N. Só dígitos (teclado numérico); vazio ⇒ null, e o refine do schema pede o
 * valor. A faixa 2–180 é do Zod, com mensagem em PT — nunca 23514 do banco.
 */
function toIntervalDays(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '')
  return digits === '' ? null : Number(digits)
}

const PRESET_FREQUENCIES = new Set(['diário', 'dias_alternados'])

// 125 1c (AC7.1): frequência em chips, como no onboarding (hi-fi T-1/T-2).
function FrequencyChipsField({ options, value, onChange, error }) {
  return (
    <>
      <Text style={styles.fieldLabel}>De quanto em quanto tempo?</Text>
      <ChoiceChips
        options={options}
        value={value}
        onChange={onChange}
        accessibilityLabel="De quanto em quanto tempo?"
        testIDPrefix="frequency-segment"
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </>
  )
}

// 125 1b (AC5.3): `applicationDay` (useApplicationDay) troca dias da semana/próxima dose pelo dia da aplicação.
function FrequencySection({ form, presentation, showWeekdays, isEditMode, startDateAsDate, onStartDateChange, applicationDay }) {
  const asksDay = applicationDay.asks
  // States — FR-014: até a usuária escolher uma opção, "Mensal" é DERIVADO dos valores carregados;
  // depois vale a escolha dela (digitar 30 em "A cada X dias" não troca a opção). Não derivar UMA vez
  // na montagem: na edição o prefill chega por `form.reset` num efeito DEPOIS do 1º render
  // (useProtocolFormState) — congelado ali, Mensal reabriria como "A cada X dias" (RC5).
  // Não entra em form.values (não é coluna nem grupo de change_kind).
  const [chosen, setChosen] = useState(null)
  const monthlyChosen =
    chosen === null ? isMonthlyCadence(form.values.frequency, form.values.interval_days) : chosen === MONTHLY_CHOICE
  // Memos
  // 086 FR-008: presets só onde há agenda diária (22/22 tratamentos com ≥2 horários são `diário`).
  const showPresets = PRESET_FREQUENCIES.has(form.values.frequency)
  const isDayCadence = form.values.frequency === 'intervalo_dias'
  const selectedChoice = monthlyChosen && isDayCadence ? MONTHLY_CHOICE : form.values.frequency
  // Handlers
  const handleFrequencyChange = useCallback(
    (choice) => {
      // Patch atômico {frequency, interval_days}: sair da cadência em dias leva o N junto (FM-8,
      // CHECK de coerência); Mensal grava 30; "A cada X dias" conserva o N corrente.
      const patch = applyCadenceChoice(choice, form.values.interval_days ?? null)
      if (!patch) return
      setChosen(choice)
      form.setValues(applicationDay.reanchor(patch))
    },
    [form, applicationDay]
  )
  return (
    <Section title="Quando" required>
      <FrequencyChipsField
        options={buildFrequencyOptions(form.values.frequency, presentation, monthlyChosen)}
        value={selectedChoice}
        onChange={handleFrequencyChange}
        error={form.touched.frequency ? form.errors.frequency : null}
      />
      {isDayCadence && selectedChoice !== MONTHLY_CHOICE ? (
        <FormInput
          name="interval_days"
          label="A cada quantos dias?"
          value={form.values.interval_days == null ? '' : String(form.values.interval_days)}
          onChange={(name, raw) => form.handleChange(name, toIntervalDays(raw))}
          onBlur={form.handleBlur}
          error={form.touched.interval_days ? form.errors.interval_days : null}
          helperText={`De ${INTERVAL_DAYS_MIN} a ${INTERVAL_DAYS_MAX} dias, contados a partir da data de início.`}
          placeholder="Ex.: 30"
          keyboardType="number-pad"
          maxLength={3}
          required
        />
      ) : null}
      {asksDay ? (
        <View style={styles.fieldBlock}>
          <ApplicationDayField
            value={applicationDay.date}
            today={applicationDay.today}
            onChange={applicationDay.choose}
            error={form.touched.weekdays && form.errors.weekdays ? 'Escolha o dia da aplicação.' : null}
          />
        </View>
      ) : null}
      {isDayCadence && !asksDay ? (
        <View style={styles.fieldBlock}>
          <NextDoseField
            values={form.values}
            askDate={!isEditMode}
            dateValue={startDateAsDate}
            onDateChange={onStartDateChange}
            error={form.touched.start_date ? form.errors.start_date : null}
          />
        </View>
      ) : null}
      {showWeekdays && !asksDay ? (
        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>Dias da semana</Text>
          <WeekdaySelector
            value={form.values.weekdays}
            onChange={(next) => form.handleChange('weekdays', next)}
            error={form.touched.weekdays ? form.errors.weekdays : null}
          />
        </View>
      ) : null}
      <View style={styles.fieldBlock}>
        {showPresets ? null : <Text style={styles.fieldLabel}>Horários</Text>}
        <SchedulePresetSection
          value={form.values.time_schedule}
          onChange={(next) => form.handleChange('time_schedule', next)}
          error={form.touched.time_schedule ? form.errors.time_schedule : null}
          showPresets={showPresets}
        />
      </View>
    </Section>
  )
}

// 086 FR-016: na criação com cadência em dias, o início é perguntado como "próxima dose" junto da
// cadência (NextDoseField) — um campo, um dono por vez: aqui ele some.
function PrescriptionSection({ startDateAsDate, endDateAsDate, onStartDateChange, onEndDateChange, form, hideStartDate = false }) {
  return (
    <Section title="Receita médica">
      <View style={styles.dateRow}>
        {hideStartDate ? null : (
          <View style={styles.flex}>
            <FormDatePicker
              name="start_date"
              label="Data do início"
              value={startDateAsDate}
              onChange={onStartDateChange}
              error={form.touched.start_date ? form.errors.start_date : null}
            />
          </View>
        )}
        <View style={styles.flex}>
          <FormDatePicker
            name="end_date"
            label="Data do término"
            value={endDateAsDate}
            onChange={onEndDateChange}
            error={form.touched.end_date ? form.errors.end_date : null}
            helperText="Sem prazo = uso contínuo"
            minimumDate={startDateAsDate}
          />
        </View>
      </View>
    </Section>
  )
}

/**
 * Bolas de progresso da escada — a metade de baixo do card da Evolução.
 *
 * O card era uma linha de 48px ao lado do seletor de horários, que é alto e visualmente pesado:
 * num scan da tela a entrada da titulação simplesmente não era vista (achado de smoke do PO). As
 * bolas dão altura e informação — quantas etapas existem e onde o tratamento está — em vez de só
 * ocupar espaço.
 *
 * A classificação ESPELHA a `TitrationTimeline` de propósito: mesma escada, duas telas, um só
 * significado. Em especial, a vigente vem de `resolveCurrentStep` e NUNCA de `findIndex(status
 * === 'current')` — o banco não impede um resíduo `current` numa posição anterior, e o findIndex
 * pegaria o resíduo, marcando a bola errada em silêncio (achado do RC6 na 029 F4).
 *
 * @private
 */
function EvoStepDots({ steps }) {
  const ordered = Array.isArray(steps) ? [...steps].sort((a, b) => a.position - b.position) : []

  // Empty state: nada cadastrado ainda. Duas interrogações comunicam "isto é uma pergunta que
  // você ainda não respondeu" — em vez de bolas vazias, que sugeririam etapas já existentes.
  if (ordered.length === 0) {
    return (
      <View style={styles.evoDotsRow} accessibilityLabel="Nenhuma etapa cadastrada">
        <CircleQuestionMark size={22} color={colors.neutral[400]} strokeWidth={2} />
        <CircleQuestionMark size={22} color={colors.neutral[400]} strokeWidth={2} />
      </View>
    )
  }

  const currentStep = resolveCurrentStep(ordered)
  const currentIndex = currentStep ? ordered.findIndex((s) => s.id === currentStep.id) : -1

  // A janela acompanha a etapa vigente. Cortar sempre as 8 PRIMEIRAS deixava a vigente de fora em
  // escadas longas (GLP-1 chega a 11 etapas): nenhuma bola marcada, enquanto o accessibilityLabel
  // seguia anunciando "Etapa 9 de 11" — visual e texto discordando em silêncio (RC6 #763).
  const windowStart =
    currentIndex === -1
      ? 0
      : Math.min(
          Math.max(0, currentIndex - Math.floor(EVO_DOTS_MAX / 2)),
          Math.max(0, ordered.length - EVO_DOTS_MAX)
        )
  const shown = ordered.slice(windowStart, windowStart + EVO_DOTS_MAX)
  const hiddenBefore = windowStart
  const hiddenAfter = ordered.length - (windowStart + shown.length)

  return (
    <View
      style={styles.evoDotsRow}
      accessibilityLabel={
        currentIndex !== -1
          ? `Etapa ${currentIndex + 1} de ${ordered.length}`
          : `${ordered.length} etapas cadastradas`
      }
    >
      {hiddenBefore > 0 ? <Text style={styles.evoDotsOverflow}>+{hiddenBefore}</Text> : null}
      {shown.map((s) => {
        // Comparação por `id`, não por índice: o índice é relativo à janela e a vigente é absoluta —
        // foi exatamente esse descasamento que apagou a bola atual.
        if (currentStep && s.id === currentStep.id) {
          return (
            <View key={s.id} testID={`evo-dot-current-${s.id}`} style={[styles.evoDot, styles.evoDotCurrent]}>
              <View style={styles.evoDotCurrentInner} />
            </View>
          )
        }
        if (s.status === 'completed') return <View key={s.id} style={[styles.evoDot, styles.evoDotPast]} />
        return <View key={s.id} style={[styles.evoDot, styles.evoDotFuture]} />
      })}
      {hiddenAfter > 0 ? <Text style={styles.evoDotsOverflow}>+{hiddenAfter}</Text> : null}
    </View>
  )
}

function TitrationSection({
  onOpenTitration,
  titrationStepCount,
  titrationSteps,
  isEditMode,
}: {
  onOpenTitration: () => void
  titrationStepCount: number
  titrationSteps: any[]
  isEditMode: boolean
}) {
  return (
    <Section title="Evolução do tratamento">
      <View style={styles.evoBlock}>
        <Pressable
          onPress={onOpenTitration}
          style={({ pressed }) => [styles.evoCard, pressed && styles.evoRowPressed]}
          accessibilityRole="button"
          accessibilityLabel="A dose muda ao longo do tempo? Cadastrar a evolução do tratamento"
        >
          <View style={styles.evoRow}>
            <View style={styles.evoIcon}>
              <ArrowDownNarrowWide size={22} color={colors.primary[600]} strokeWidth={2.4} />
            </View>
            <View style={styles.evoText}>
              <Text style={styles.evoTitle}>
                {titrationStepCount > 0 ? 'Evolução do tratamento' : 'A dose muda ao longo do tempo?'}
              </Text>
              <Text style={styles.evoHint}>
                {titrationStepCount > 0
                  ? `${titrationStepCount} ${titrationStepCount === 1 ? 'etapa cadastrada' : 'etapas cadastradas'} · toque para ver`
                  : 'Nenhuma etapa cadastrada · opcional'}
              </Text>
            </View>
            <ChevronRight size={18} color={colors.text.muted} />
          </View>
          <View style={styles.evoDivider} />
          <EvoStepDots steps={titrationSteps} />
        </Pressable>
        {!isEditMode ? (
          <Text style={styles.evoFootnote}>
            Você pode cadastrar as etapas agora ou depois, editando o tratamento.
          </Text>
        ) : null}
      </View>
    </Section>
  )
}

// 125 (AC3.2/AC3.3): avisos suaves da dose; "usar mesmo assim" só esconde o aviso daquela dose.
function DoseWarningsField({ medicine, dose, intakeUnit }) {
  const [confirmedDose, setConfirmedDose] = useState<string | null>(null)
  const doseValue = String(dose ?? '')
  // RC6 #966: a confirmação vale para ESTA dose, nesta unidade e neste remédio — trocar qualquer um reavalia.
  const doseKey = `${medicine?.id ?? ''}|${intakeUnit ?? ''}|${doseValue}`
  const warnings = useMemo(
    () => (confirmedDose === doseKey ? [] : doseWarnings(medicine, dose, intakeUnit)),
    [confirmedDose, doseKey, medicine, dose, intakeUnit],
  )
  return (
    <DoseWarnings
      warnings={warnings}
      confirmLabel={confirmDoseLabel(warnings, doseValue, intakeUnit)}
      onConfirm={() => setConfirmedDose(doseKey)}
    />
  )
}


// 125 1c (AC7.2): "Mais opções" nasce fechado e guarda Acompanhar, Evolução, Receita médica (ex-"Prescrição"),
// Plano, Nome e Notas — os campos descem sem mudar de comportamento. Erro visível num deles abre o bloco.
function MoreOptionsSection({
  form,
  medicine,
  onTrackedMeasureChange,
  onOpenTitration,
  titrationStepCount,
  titrationSteps,
  isEditMode,
  startDateAsDate,
  endDateAsDate,
  onStartDateChange,
  onEndDateChange,
  hideStartDate,
  plans,
  planField,
  onPlanFieldChange,
}) {
  const forceOpen = MORE_OPTION_FIELDS.some((k) => form.touched[k] && form.errors[k])
  const filled = moreOptionsFilled({ values: form.values, medicine, titrationStepCount, plans, planField })
  return (
    <CollapsibleSection
      title="Mais opções"
      summary={filled.length ? filled.join(' · ') : MORE_OPTIONS_EMPTY_SUMMARY}
      forceOpen={forceOpen}
      // Na edição, algo preenchido abre o bloco ao carregar (smoke 1c); na criação nasce fechado.
      defaultOpen={isEditMode && filled.length > 0}
      testID="more-options"
    >
      <Section title="Acompanhar medidas">
        <TrackedMeasureField value={displayedTrackedMeasure(form.values, medicine)} onChange={onTrackedMeasureChange} />
      </Section>

      {onOpenTitration ? (
        <TitrationSection
          onOpenTitration={onOpenTitration}
          titrationStepCount={titrationStepCount}
          titrationSteps={titrationSteps}
          isEditMode={isEditMode}
        />
      ) : null}

      <PrescriptionSection
        startDateAsDate={startDateAsDate}
        endDateAsDate={endDateAsDate}
        onStartDateChange={onStartDateChange}
        onEndDateChange={onEndDateChange}
        form={form}
        hideStartDate={hideStartDate}
      />

      <Section title="Organização">
        {/* AC7.2: default = nome do remédio (useProtocolFormState.selectMedicine). */}
        <FormInput
          name="name"
          label="Nome do tratamento"
          value={form.values.name}
          error={form.touched.name ? form.errors.name : null}
          onChange={form.handleChange}
          onBlur={form.handleBlur}
          placeholder="Ex: Hipertensão"
          maxLength={200}
          required
        />
        <PlanSelectField
          plans={plans}
          value={planField}
          onChange={onPlanFieldChange}
          error={form.touched.treatment_plan_id ? form.errors.treatment_plan_id : null}
        />
        <FormInput
          name="notes"
          label="Notas"
          value={form.values.notes}
          error={form.touched.notes ? form.errors.notes : null}
          onChange={form.handleChange}
          onBlur={form.handleBlur}
          placeholder="Notas sobre este tratamento…"
          multiline
          numberOfLines={4}
          maxLength={1000}
          helperText="Opcional"
        />
      </Section>
    </CollapsibleSection>
  )
}

export default function ProtocolFormBody({
  form,
  medicine,
  onOpenMedicineSheet,
  onOpenTitration,
  isEditMode,
  titrationStepCount = 0,
  titrationSteps = [],
  plans,
  planField,
  onPlanFieldChange,
  onDoseChange,
  onStartDateChange,
  onEndDateChange,
}) {
  const [guideVisible, setGuideVisible] = useState(false)
  const [guideMsg, setGuideMsg] = useState('')
  // 125 1b (AC5.3): dia da aplicação do injetável não diário, só na criação.
  const applicationDay = useApplicationDay({ form, presentation: medicine?.presentation, disabled: isEditMode })
  const {
    startDateAsDate,
    endDateAsDate,
    isLiquid,
    helperText,
    defaultIntake,
    intakeOptions,
    askDensity,
    densityLabel,
    densityHint,
    defaultDensity,
    doseDisplay,
  } = useProtocolFormDerived(form, medicine)
  const setCritical = useCallback((value: boolean) => form.handleChange('critical_alarm', value), [form])
  const setTrackedMeasure = useCallback((value) => form.handleChange('tracked_measure', value), [form])
  const showFullScreenGuide = useCallback(() => {
    // Checar se precisa de acesso especial de alarme em tela cheia (Android 14+ / Xiaomi)
    if (!needsFullScreenIntentAccess()) return
    // 068 E-4/D-1: copy vem do dono único, sem marcação crua.
    setGuideMsg(guideToPlainText(getFullScreenGuide(resolveOemFamily())))
    setGuideVisible(true)
  }, [])
  // 054 FR-008b: fluxo do toggle por plataforma/estado de permissão vive no hook.
  const criticalToggle = useCriticalAlarmToggle({ setCritical, onEnabledAndroid: showFullScreenGuide })
  const showWeekdays = frequencyRequiresWeekdays(form.values.frequency)
  // 125 1c (AC7.1): a pergunta da dose é a da forma, como no onboarding (FR-021).
  const doseQuestion = medicine ? treatmentDefaults(medicine).doseQuestion : null
  return (
    <>
      <Section title="Remédio">
        <MedicineSelectorRow
          medicine={medicine}
          onPress={onOpenMedicineSheet}
          error={form.touched.medicine_id ? form.errors.medicine_id : null}
        />
      </Section>

      <Section title="Dose" required>
        <DoseSection
          label={doseQuestion ?? undefined}
          isLiquid={isLiquid}
          doseDisplay={doseDisplay}
          intakeOptions={intakeOptions}
          defaultIntake={defaultIntake}
          helperText={helperText}
          askDensity={askDensity}
          densityLabel={densityLabel}
          densityHint={densityHint}
          defaultDensity={defaultDensity}
          onDoseChange={onDoseChange}
          form={form}
        />
        <DoseWarningsField medicine={medicine} dose={form.values.dosage_per_intake} intakeUnit={form.values.intake_unit ?? null} />
      </Section>

      <FrequencySection
        form={form}
        presentation={medicine?.presentation ?? null}
        showWeekdays={showWeekdays}
        isEditMode={isEditMode}
        startDateAsDate={startDateAsDate}
        onStartDateChange={onStartDateChange} applicationDay={applicationDay}
      />

      {/* 125 1c (AC7.1): a frase de conferência ao vivo, ao criar E ao editar. */}
      <Section title="Confira o seu tratamento" spaced>
        <TreatmentSentenceCard medicine={medicine} values={form.values} />
      </Section>

      <Section title="Lembrete">
        <CriticalAlarmCard
          criticalAlarm={!!form.values.critical_alarm}
          onToggle={criticalToggle.onToggle}
          onRequestPermission={criticalToggle.requestCritical}
        />
      </Section>
      <CriticalAlertPrimerSheet
        visible={criticalToggle.primerVisible}
        pushDenied={criticalToggle.pushDenied}
        onContinue={criticalToggle.onPrimerContinue}
        onDismiss={criticalToggle.onPrimerDismiss}
      />

      <MoreOptionsSection
        form={form}
        medicine={medicine}
        onTrackedMeasureChange={setTrackedMeasure}
        onOpenTitration={onOpenTitration}
        titrationStepCount={titrationStepCount}
        titrationSteps={titrationSteps}
        isEditMode={isEditMode}
        startDateAsDate={startDateAsDate}
        endDateAsDate={endDateAsDate}
        onStartDateChange={onStartDateChange}
        onEndDateChange={onEndDateChange}
        hideStartDate={!isEditMode && (form.values.frequency === 'intervalo_dias' || applicationDay.asks)}
        plans={plans}
        planField={planField}
        onPlanFieldChange={onPlanFieldChange}
      />

      {/* 054 (emenda FR-008): o guia de tela cheia do Android é a variante do mesmo sheet. */}
      <CriticalAlertPrimerSheet
        variant="android"
        visible={guideVisible}
        androidMessage={guideMsg}
        pushDenied={false}
        onContinue={() => openFullScreenIntentSettings()}
        onDismiss={() => setGuideVisible(false)}
      />
    </>
  )
}

// `required`: asterisco vermelho no título — a seção inteira é obrigatória (ex.: horários), mesmo
// quando o campo dentro dela não tem rótulo próprio (086, smoke).
function Section({ title, children, required = false, spaced = false }) {
  return (
    <View style={[styles.section, spaced && styles.sectionSpaced]}>
      <Text style={styles.sectionTitle}>
        {title}
        {required ? <Text style={styles.sectionAsterisk}> *</Text> : null}
      </Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  densityLink: { minHeight: 44, justifyContent: 'center' },
  densityText: { fontSize: 14, color: colors.text.secondary },
  densityLinkText: { fontWeight: '600', color: colors.brand.primary },
  flex: { flex: 1 },
  section: {
    gap: spacing[2],
  },
  // Respiro antes da conferência: os blocos acima (chips, dose) pesam visualmente.
  sectionSpaced: { marginTop: spacing[4] },
  sectionAsterisk: {
    color: colors.status.error,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sectionBody: {
    gap: spacing[3],
  },
  doseRow: {
    flexDirection: 'row',
    gap: spacing[3],
    alignItems: 'flex-start',
  },
  doseField: {
    flex: 2,
  },
  unitField: {
    flex: 1,
  },
  doseHint: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: -spacing[1],
  },
  fieldBlock: {
    gap: spacing[2],
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
  },
  fieldError: { fontSize: 12, color: colors.status.error },
  dateRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  // Card com duas metades (topo = chamada, base = progresso da escada). O peso visual é
  // deliberado: ao lado do seletor de horários — alto e denso — a versão de uma linha só
  // desaparecia num scan da tela, e ninguém descobria a titulação (smoke do PO, 2026-07-20).
  evoCard: {
    gap: spacing[3],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary[200],
    backgroundColor: colors.bg.card,
  },
  evoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 48,
  },
  evoDivider: { height: 1, backgroundColor: colors.border.default, opacity: 0.6 },
  evoDotsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], minHeight: 26 },
  // Espelham a rail da TitrationTimeline (mesma escada, mesmo significado) em escala menor.
  evoDot: { width: 22, height: 22, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  evoDotPast: { backgroundColor: colors.primary[100] }, // teal soft — concluída
  evoDotCurrent: { backgroundColor: colors.primary[600] }, // vigente
  evoDotCurrentInner: { width: 7, height: 7, borderRadius: 999, backgroundColor: colors.bg.card },
  evoDotFuture: { backgroundColor: colors.bg.card, borderWidth: 2, borderColor: colors.neutral[300] },
  evoDotsOverflow: { fontSize: 12, fontWeight: '600', color: colors.text.muted, marginLeft: 2 },
  evoBlock: { gap: spacing[2] },
  evoRowPressed: { opacity: 0.85 },
  evoIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  evoText: { flex: 1, gap: 2 },
  evoTitle: { fontSize: 15, fontWeight: '600', color: colors.text.primary },
  evoHint: { fontSize: 12, color: colors.text.muted },
  evoFootnote: { fontSize: 12, color: colors.text.muted, paddingHorizontal: spacing[1], lineHeight: 17 },
})
