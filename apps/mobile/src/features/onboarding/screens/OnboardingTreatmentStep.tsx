// OnboardingTreatmentStep — passo 3 do wizard: primeiro tratamento (Fase 4 S4.2).
// REUSA o fluxo da Fase 2: WeekdaySelector + SchedulePresetSection (086) + protocolCreateSchema
// (PO-8). Mock: mock-onboarding-passo3.
//
// Spec 044: NÃO persiste — só valida e guarda no contexto. Medicamento, tratamento e push
// são gravados no passo 4 (escolha do modo), para que voltar não duplique dado.

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  View, Text, ScrollView, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { ROUTES } from '@navigation/routes'
import {
  protocolCreateSchema,
  getTodayLocal,
  parseLocalDate,
  formatLocalDate,
  applyCadenceChoice,
  MONTHLY_CHOICE,
  MONTHLY_INTERVAL_DAYS,
  anchorFromApplication,
  INTAKE_UNIT_LABELS,
} from '@dosiq/core'
import { useFormState } from '@shared/hooks/useFormState'
import FormInput from '@shared/components/form/FormInput'
import FormActions from '@shared/components/form/FormActions'
import WeekdaySelector from '@treatments/components/WeekdaySelector'
import SchedulePresetSection from '@treatments/components/SchedulePresetSection'
import NextDoseField from '@treatments/components/NextDoseField'
import { useToast } from '@shared/components/feedback/Toast'
import FinishLaterButton from '@features/onboarding/components/FinishLaterButton'
import { ChoiceChips } from '@medications/components/FormFirstStrength'
import ApplicationDayField from '@features/onboarding/components/ApplicationDayField'
import OnboardingMedicineCard from '@features/onboarding/components/OnboardingMedicineCard'
import DoseWarnings from '@treatments/components/DoseWarnings'
import {
  asksApplicationDay, confirmDoseLabel, doseLabel, doseSource, doseWarnings, frequencySegments, treatmentDefaults,
} from '@features/onboarding/utils/treatmentStepModel'
import { useKeyboardVisible } from '@shared/hooks/useKeyboardVisible'
import { useOnboarding } from '../OnboardingContext'
import OnboardingHeader from '@features/onboarding/components/OnboardingHeader'
import { colors, spacing, borderRadius, typography } from '@shared/styles/tokens'

// Segmentos do passo 3 (086 FR-022): "Todo dia" · "Semanal" · "Mensal" (este só sob a trava da 085).
// "Mensal" é a escolha `mensal_30` → `intervalo_dias`/30; o patch atômico vem do core
// (`applyCadenceChoice`), que limpa `interval_days` ao voltar para "Todo dia" (RC3 E-4 — antes o
// passo 4 bateria no CHECK de coerência, 23514).
const FREQ_WEEKLY = 'semanal'

const FAKE_UUID = '00000000-0000-0000-0000-000000000000'


// Frequência em chips (hi-fi O-4: os mesmos do F-2), na ordem da forma. D-8: espera a trava da 086
// (teto 1,5 s) para "Mensal" não surgir depois e deslocar o toque.
function FrequencyChips({ segments, selected, monthlyAvailable, settled, onSelect }) {
  if (!settled) {
    return <View style={styles.segmentSkeleton} accessibilityLabel="Carregando opções de frequência" testID="frequency-skeleton" />
  }
  const options = segments
    .filter((s) => monthlyAvailable || s.choice !== MONTHLY_CHOICE)
    .map((s) => ({ value: s.choice, label: s.label }))
  return (
    <ChoiceChips
      options={options}
      value={selected || null}
      onChange={onSelect}
      accessibilityLabel="De quanto em quanto tempo?"
      testIDPrefix="frequency-segment"
    />
  )
}

// Detalhe da cadência: dia da aplicação (injetável não diário, AC2.5b) · próxima dose (mensal) · dias da semana.
function CadenceDetails({ form, asksDay, isWeekly, isMonthly, applicationDate, today, dayError, startDateAsDate, onApplicationDate, onNextDoseChange }) {
  if (asksDay) {
    return <ApplicationDayField value={applicationDate} today={today} onChange={onApplicationDate} error={dayError ? 'Escolha o dia da aplicação.' : null} />
  }
  if (isMonthly) {
    return (
      <NextDoseField
        values={form.values}
        askDate
        dateValue={startDateAsDate}
        onDateChange={onNextDoseChange}
        error={form.touched.start_date ? (form.errors.start_date as any) : null}
      />
    )
  }
  if (!isWeekly) return null
  return (
    <WeekdaySelector
      value={form.values.weekdays as any}
      onChange={(next) => form.handleChange('weekdays', next)}
      error={form.touched.weekdays ? form.errors.weekdays : null}
    />
  )
}

// Dose pela pergunta da forma (FR-021) + unidade (mg/UI, hi-fi O-3) + avisos suaves (AC3.2/AC3.3).
// Sem pergunta ⇒ a forma resolve (caneta por aplicação).
function DoseSection({ form, label, value, warnings, intakeUnits, onChange, onConfirm, hint = undefined }) {
  if (!label) return null
  const intakeUnit = form.values.intake_unit ?? null
  return (
    <View style={styles.doseBlock}>
      <FormInput
        name="dosage_per_intake"
        label={label}
        keyboardType="decimal-pad"
        value={value}
        placeholder={hint}
        error={form.touched.dosage_per_intake ? form.errors.dosage_per_intake : undefined}
        onChange={onChange}
        onBlur={form.handleBlur}
      />
      {intakeUnits.length > 0 ? (
        <ChoiceChips
          options={intakeUnits.map((u) => ({ value: u, label: INTAKE_UNIT_LABELS[u] ?? u }))}
          value={intakeUnit}
          onChange={(u) => form.handleChange('intake_unit', u)}
          accessibilityLabel="Unidade da dose"
          testIDPrefix="intake-unit"
        />
      ) : null}
      <DoseWarnings warnings={warnings} confirmLabel={confirmDoseLabel(warnings, value, intakeUnit)} onConfirm={onConfirm} />
    </View>
  )
}

// Horários — injetável não diário = "Horário do lembrete".
function ScheduleBlock({ form, asksDay }) {
  // 125 (PO smoke 18/11, emenda AC2.3): atalhos 1x–4x da 086 por FREQUÊNCIA (diário/dias alternados), qualquer
  // forma — injetável diário existe (insulina 3x, liraglutida, enoxaparina 12/12h).
  const showPresets = form.values.frequency === 'diário' || form.values.frequency === 'dias_alternados'
  const timeCount = Array.isArray(form.values.time_schedule) ? form.values.time_schedule.length : 0
  return (
    <View>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{asksDay ? 'Horário do lembrete' : 'Horários'}</Text>
        {asksDay ? null : <Text style={styles.labelHint}>{timeCount} {timeCount === 1 ? 'horário' : 'horários'}</Text>}
      </View>
      <SchedulePresetSection
        value={form.values.time_schedule as any}
        onChange={(next) => form.handleChange('time_schedule', next)}
        error={form.touched.time_schedule ? (form.errors.time_schedule as any) : null}
        showPresets={showPresets}
      />
    </View>
  )
}

// Valores iniciais (fora do componente: só lê argumentos). 125 FR-008/FR-021: dose e pré-seleção pela
// forma — '1' só onde a dose é contagem; "Todo dia" pré-marcado só p/ comprimido/cápsula.
function buildInitialValues(treatment, medicine, medicineIntakeUnit, defaults) {
  const base = {
    medicine_id: medicine?.id ?? FAKE_UUID,
    // O remédio pode ter mudado no "Confira": a unidade da tomada segue o remédio atual.
    intake_unit: defaults.intakeUnits.includes(treatment?.intake_unit) ? treatment.intake_unit : (medicineIntakeUnit ?? null),
    // 066 E (C-7): o flag liga o refine do schema que exige a unidade em líquido.
    _medicineIsLiquid: !!medicineIntakeUnit,
  }
  if (treatment) {
    // Se o nome do medicamento mudou no Passo 2, sincroniza o nome padrão do tratamento
    const name =
      treatment.name === 'Meu tratamento' || (medicine && treatment.name !== medicine.name)
        ? (medicine?.name ?? 'Meu tratamento')
        : treatment.name
    return { ...treatment, ...base, name }
  }
  return {
    ...base,
    name: medicine?.name ?? 'Meu tratamento',
    dosage_per_intake: defaults.defaultDose,
    frequency: defaults.preselectedFrequency ?? '',
    weekdays: [],
    time_schedule: ['08:00'],
    start_date: getTodayLocal(),
  }
}

// Checagens além do Zod, na ordem da tela; devolve a mensagem do 1º problema (ou null).
function missingStep({ frequency, asksDay, applicationDate, dose, defaults }): string | null {
  if (!frequency) return 'Escolha de quanto em quanto tempo.'
  if (asksDay && !applicationDate) return 'Escolha o dia da aplicação.'
  if (defaults.doseRequired && String(dose ?? '').trim() === '') return 'Digite quanto usa de cada vez.'
  return null
}

export default function OnboardingTreatmentStep() {
  // States (R-010)
  const navigation = useNavigation()
  // 125 smoke: KAV 'height' (R-303) não devolve a altura ao fechar o teclado no Android edge-to-edge —
  // sobra faixa e o rodapé sobe. Ligado só com teclado aberto: fechado, vira View e a altura reseta.
  const keyboardVisible = useKeyboardVisible()
  const { medicine, medicineSource, medicineIntakeUnit, treatment, setTreatment, finishLater } = useOnboarding()
  const { show } = useToast()
  // 125 (AC2.5b): dia da aplicação do injetável não diário — nada marcado por omissão.
  const [applicationDate, setApplicationDate] = useState<string | null>(treatment?._application_date ?? null)
  const [dayError, setDayError] = useState(false)
  // 125 (hi-fi O-3): injetável com pergunta de dose tem tela própria antes do "quando". Voltar da
  // conferência ("Ajustar", AC4.2) cai no "quando" — o tratamento já está no contexto.
  // "Alterar" sai de propósito para o remédio — o interceptador do voltar não pode segurá-lo.
  const leavingToMedicine = useRef(false)
  // Smoke 18/11: injetável SEMPRE abre na dose ao (re)entrar vindo do remédio — com rascunho já salvo
  // pulava a dose. O "Ajustar" da conferência não remonta a tela (fase preservada).
  const [phase, setPhase] = useState<'dose' | 'when'>(() =>
    medicine?.presentation === 'injetavel' && treatmentDefaults(medicine).doseQuestion ? 'dose' : 'when',
  )
  // 125 (AC3.3/T017): dose confirmada apesar do aviso; dose digitada × default da forma.
  const [confirmedDose, setConfirmedDose] = useState<string | null>(null)
  const [doseTyped, setDoseTyped] = useState<boolean>(treatment?._dose_typed === true)

  // Memos (R-010)
  const defaults = useMemo(() => treatmentDefaults(medicine), [medicine])
  const segments = useMemo(() => frequencySegments(defaults), [defaults])
  const initialValues = useMemo(
    () => buildInitialValues(treatment, medicine, medicineIntakeUnit, defaults),
    [treatment, medicine, medicineIntakeUnit, defaults],
  )
  const form = useFormState(protocolCreateSchema, { initialValues })
  const today = useMemo(() => getTodayLocal(), [])
  const isWeekly = form.values.frequency === FREQ_WEEKLY
  // No onboarding a única cadência em dias oferecida é "Mensal" (FR-022: "A cada X dias" fica fora).
  const isMonthly = form.values.frequency === 'intervalo_dias'
  const selectedChoice = isMonthly ? MONTHLY_CHOICE : form.values.frequency
  const asksDay = asksApplicationDay(medicine?.presentation, form.values.frequency)
  const startDateAsDate = useMemo(
    () => (form.values.start_date ? parseLocalDate(form.values.start_date as string) : null),
    [form.values.start_date],
  )
  const label = doseLabel(defaults, (form.values.intake_unit as string) ?? null)
  const doseValue = String(form.values.dosage_per_intake ?? '')
  const warnings = useMemo(
    () => doseWarnings(medicine, form.values.dosage_per_intake, (form.values.intake_unit as string) ?? null),
    [medicine, form.values.dosage_per_intake, form.values.intake_unit],
  )
  const shownWarnings = confirmedDose === doseValue ? [] : warnings
  const doseFirst = medicine?.presentation === 'injetavel' && !!label
  // Smoke 18/11: sugestão em cinza = o número da caneta (valor da CAIXA, mesma unidade da dose). Só
  // placeholder — não preenche; os avisos (AC3.2/3.3) seguem pegando o valor digitado fora do esperado.
  const doseHint = useMemo(() => {
    if (!doseFirst || !medicine?.dosage_per_pill) return undefined
    const base = String(medicine.dosage_unit ?? '').replace('/ml', '')
    const unit = base === 'ui' ? 'UI' : base
    if (unit !== (form.values.intake_unit ?? null)) return undefined
    return String(medicine.dosage_per_pill).replace('.', ',')
  }, [doseFirst, medicine?.dosage_per_pill, medicine?.dosage_unit, form.values.intake_unit])
  const keptRemind = treatment?._remind ?? true
  // 125 (AC2.7): traço 3 = tratamento (índice 2 — o header conta do 0; traço 1 = cadastro). Remédio já existe ⇒ sem "Pular" (AC1.0). "‹" no "quando" do
  // injetável volta à dose (O-3), não ao remédio.
  const headerProps = useMemo(
    () => ({ step: 2, totalSteps: 4, onBack: () => (phase === 'when' && doseFirst ? setPhase('dose') : navigation.goBack()) }),
    [navigation, phase, doseFirst],
  )

  // Effects (R-010)
  useEffect(() => {
    setTreatment(form.values)
  }, [form.values, setTreatment])
  // Smoke 18/11: voltar do SISTEMA (botão/gesto Android) no "quando" do injetável também volta à dose —
  // antes só a seta do header voltava; o sistema saía da tela e a dose ficava inalcançável.
  useEffect(() => {
    if (!(phase === 'when' && doseFirst)) return undefined
    return navigation.addListener('beforeRemove', (e: any) => {
      if (leavingToMedicine.current) return
      if (e.data?.action?.type !== 'GO_BACK' && e.data?.action?.type !== 'POP') return
      e.preventDefault()
      setPhase('dose')
    })
  }, [navigation, phase, doseFirst])

  // Handlers
  // Dia da aplicação ⇒ âncora (dia da semana / série de 30 dias), start_date nunca no passado.
  const anchorPatch = useCallback(
    (date: string | null, frequency, intervalDays) =>
      date && asksApplicationDay(medicine?.presentation, frequency)
        ? anchorFromApplication({ applicationDate: date, frequency, intervalDays, today })
        : {},
    [medicine?.presentation, today],
  )
  const setCadenceChoice = useCallback(
    (choice) => {
      const patch = applyCadenceChoice(choice, null)
      if (patch) form.setValues({ ...patch, ...anchorPatch(applicationDate, patch.frequency, patch.interval_days) })
    },
    [form, anchorPatch, applicationDate],
  )
  const handleApplicationDate = useCallback(
    (date: string) => {
      setApplicationDate(date)
      setDayError(false)
      form.setValues({ ...form.values, ...anchorPatch(date, form.values.frequency, form.values.interval_days) })
    },
    [form, anchorPatch],
  )
  const handleNextDoseChange = useCallback(
    (_name, date) => {
      if (date) form.handleChange('start_date', formatLocalDate(date))
    },
    [form],
  )

  // Dose: converte para número já no onChange (paridade com ProtocolFormScreen).
  // Sem isto a string "1" valida contra z.number() no blur → "Use apenas números".
  // Intermediários ("0,", ".") ficam como string (converter agora apagaria a vírgula).
  const handleDoseChange = useCallback(
    (name, raw) => {
      setDoseTyped(true)
      const str = String(raw ?? '')
      if (str === '') {
        form.handleChange(name, '')
        return
      }
      const normalized = str.replace(',', '.')
      // Mantém string em intermediários: termina em "." OU é decimal com zero à
      // direita ("1,50"/"1,0") — converter agora engoliria o zero digitado.
      if (normalized === '.' || normalized.endsWith('.') || (normalized.includes('.') && normalized.endsWith('0'))) {
        form.handleChange(name, str)
        return
      }
      const num = Number(normalized)
      form.handleChange(name, Number.isFinite(num) ? num : str)
    },
    [form],
  )

  // O-3 › O-4: a dose (obrigatória, sem default) antes do "quando".
  const handleDoseNext = useCallback(() => {
    if (String(form.values.dosage_per_intake ?? '').trim() === '') {
      show('Digite quanto usa de cada vez.', { variant: 'error' })
      return
    }
    setPhase('when')
  }, [form.values.dosage_per_intake, show])

  // Este passo NÃO persiste nada: valida e guarda no contexto. A gravação acontece no consentimento,
  // depois da conferência ("Está certo?") e do estoque — voltar não duplica dado.
  const handleContinuar = useCallback(() => {
    const missing = missingStep({ frequency: form.values.frequency, asksDay, applicationDate, dose: form.values.dosage_per_intake, defaults })
    if (missing) {
      if (asksDay && !applicationDate) setDayError(true)
      show(missing, { variant: 'error' })
      return
    }
    // Coerce dose string ("1" / "0,5") → number antes do validate (AP-167).
    const dose = Number(String(form.values.dosage_per_intake ?? '').replace(',', '.'))
    if (!form.validate({ dosage_per_intake: dose })) {
      show('Verifique os campos destacados', { variant: 'error' })
      return
    }
    if (!medicine) {
      show('Dados do medicamento não encontrados.', { variant: 'error' })
      return
    }
    setTreatment({
      ...form.values,
      dosage_per_intake: dose,
      treatment_plan_id: null,
      // Intenção de lembrete: o pedido de permissão de push vive no consentimento, junto da gravação.
      // 125: o lembrete mudou para a conferência; aqui só preserva a escolha já feita (padrão ligado).
      _remind: keptRemind,
      _application_date: applicationDate,
      // 125 T017: medição (enums, sem dado de saúde novo).
      _dose_source: doseSource(doseTyped, medicineSource),
      _dose_typed: doseTyped,
      _dose_plausible: warnings.length === 0,
    })
    ;(navigation.navigate as any)(ROUTES.ONBOARDING_TREATMENT_REVIEW)
  }, [form, asksDay, applicationDate, defaults, medicine, medicineSource, keptRemind, doseTyped, warnings, show, setTreatment, navigation])

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <OnboardingHeader {...headerProps} />

      <KeyboardAvoidingView
        enabled={keyboardVisible}
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {phase === 'dose' ? (
            <>
              {/* hi-fi O-3: dose por aplicação, tela própria. */}
              <Text style={styles.title}>{defaults.doseQuestion}</Text>
              <Text style={styles.subtitle}>O número escrito no rótulo da embalagem.</Text>
              <DoseSection
              form={form}
              label={'Dose por aplicação'}
              value={doseValue}
              hint={doseHint}
              warnings={shownWarnings}
              intakeUnits={defaults.intakeUnits}
              onChange={handleDoseChange}
              onConfirm={() => setConfirmedDose(doseValue)}
            />
            </>
          ) : (
            <>
              {/* 125 (AC4.2): o remédio escolhido no topo, com "Alterar" (volta aos dados do remédio). */}
              <OnboardingMedicineCard medicine={medicine} source={medicineSource} onChange={() => { leavingToMedicine.current = true; navigation.goBack() }} />
              <Text style={styles.title}>De quanto em quanto tempo?</Text>
              <FrequencyChips
                segments={segments}
                selected={selectedChoice}
                // PO smoke 18/11: sem trava 085/086 no onboarding — conta nova não tem aparelho antigo
                // (o risco que a trava cobre); a consulta lenta no 1º acesso escondia o Mensal.
                monthlyAvailable
                settled
                onSelect={setCadenceChoice}
              />
              <CadenceDetails
                form={form}
                asksDay={asksDay}
                isWeekly={isWeekly}
                isMonthly={isMonthly}
                applicationDate={applicationDate}
                today={today}
                dayError={dayError}
                startDateAsDate={startDateAsDate}
                onApplicationDate={handleApplicationDate}
                onNextDoseChange={handleNextDoseChange}
              />
              {/* hi-fi O-4b: a dose vem antes dos horários (comprimido, líquido). */}
              {doseFirst ? null : <DoseSection
              form={form}
              label={label}
              value={doseValue}
              warnings={shownWarnings}
              intakeUnits={defaults.intakeUnits}
              onChange={handleDoseChange}
              onConfirm={() => setConfirmedDose(doseValue)}
            />}
              <ScheduleBlock form={form} asksDay={asksDay} />
            </>
          )}
        </ScrollView>

        <FormActions
          primaryLabel="Continuar"
          onPrimary={phase === 'dose' ? handleDoseNext : handleContinuar}
          primaryLoading={false}
          footer={<FinishLaterButton onPress={() => finishLater(2, 'medicine_only')} />}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg.screen,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[2],
    paddingBottom: spacing[8],
    gap: spacing[5],
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: -0.5,
    fontFamily: typography.fontFamily.bold,
  },
  doseBlock: { gap: spacing[2] },
  subtitle: {
    fontSize: 15,
    color: colors.text.secondary,
    lineHeight: 21,
    marginTop: -spacing[3],
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text.secondary,
    marginBottom: 8,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  labelHint: {
    fontSize: 12,
    color: colors.text.muted,
  },
  // 125 (AC2.5): até 5 cadências na ordem da forma ⇒ chips que quebram linha.
  segment: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  // FR-022/PO-10: altura MÍNIMA — com fonte grande o rótulo quebra em 2 linhas, nunca é cortado.
  segmentBtn: {
    flexGrow: 1,
    minHeight: 48,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    backgroundColor: colors.bg.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: colors.brand.primary,
    borderColor: colors.brand.primary,
  },
  segmentText: {
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
  },
  segmentTextActive: {
    color: colors.text.inverse,
  },
  segmentSkeleton: {
    minHeight: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.neutral[100],
  },
  segmentHint: {
    marginTop: spacing[2],
    fontSize: 13,
    color: colors.text.secondary,
  },
})
