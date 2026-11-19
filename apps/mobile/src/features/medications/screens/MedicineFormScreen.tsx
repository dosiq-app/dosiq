// MedicineFormScreen.jsx — tela unificada create + edit (Sprint M1.2)
//
// Recebe `medicine` em route.params para modo edição. Sem param = modo criação.
// ANVISA bottom sheet preenche campos automaticamente via setValues.

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { ScrollView, View, Text, Pressable, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation, useRoute } from '@react-navigation/native'
// TODO(040-strict): named imports do lucide-react-native batem em TS2305 sob
// apps/mobile/tsconfig.json — ver nota em TreatmentsScreen.tsx
import * as LucideIcons from 'lucide-react-native'
const { ChevronLeft, ScanBarcode, ChevronRight } = LucideIcons as any
import {
  medicineCreateSchema,
  MEDICINE_TYPES,
  MEDICINE_TYPE_LABELS,
  DOSAGE_UNITS,
  DOSAGE_UNIT_LABELS,
  PRESENTATIONS,
  setupDefaults,
  PRESENTATION_LABELS,
  REGULATORY_CATEGORIES,
  REGULATORY_CATEGORY_LABELS,
  normalizeRegulatoryCategory,
  labelAmount,
  type CmedStrengthChoice,
} from '@dosiq/core'
import { useFormState } from '@shared/hooks/useFormState'
import FormInput from '@shared/components/form/FormInput'
import FormSelect from '@shared/components/form/FormSelect'
import FormSection from '@shared/components/form/FormSection'
import FormActions from '@shared/components/form/FormActions'
import { useMedicineMutation } from '@medications/hooks/useMedicineMutation'
import { AnvisaBanner } from '@medications/components/AnvisaBanner'
import { MedicineAnvisaSheet } from '@medications/components/MedicineAnvisaSheet'
import { MedicineCandidatesSheet } from '@medications/scan/MedicineCandidatesSheet'
import { CatalogFieldSuggestions } from '@medications/components/CatalogSuggestionList'
import { catalogLinkPayload, keepSavedStrength } from '@medications/utils/catalogMatch'
import { useCatalogSuggestionSheet } from '@medications/hooks/useCatalogSuggestionSheet'
import { StrengthChoiceCard } from '@medications/components/StrengthChoiceCard'
import { PresentationChips, UnitChipsField, ChoiceChips } from '@medications/components/FormFirstStrength'
import { ConcentrationVolumeField } from '@medications/components/ConcentrationVolumeField'
import FormChangeSheet from '@medications/components/FormChangeSheet'
import CollapsibleSection from '@shared/components/form/CollapsibleSection'
import { useFormChangeReview } from '@medications/hooks/useFormChangeReview'
import { moreDetailsSummary } from '@medications/utils/moreDetailsSummary'
import { useLeaveMedicineForm } from '@medications/hooks/useLeaveMedicineForm'
import { missingRequired, requiredUi } from '@medications/utils/medicineRequired'
import {
  valuesFromDraft,
  draftExtras,
  baseFromScan,
  scanDoseEdited,
  normalizeConcentration,
} from '@medications/utils/medicineDraftValues'
import { ROUTES } from '@navigation/routes'
import { logEvent } from '@platform/analytics/productAnalytics'
import { EVENTS, SURFACES } from '@platform/analytics/analyticsEvents'
import { colors, spacing, borderRadius, typography } from '@shared/styles/tokens'

const TYPE_OPTIONS = MEDICINE_TYPES.map((value) => ({
  value,
  label: MEDICINE_TYPE_LABELS[value] ?? value,
}))

const REGULATORY_OPTIONS = REGULATORY_CATEGORIES.map((value) => ({
  value,
  label: REGULATORY_CATEGORY_LABELS[value] ?? value,
}))

// 125 (AC2.6): remédio novo sem unidade nem forma pré-marcadas — a pessoa escolhe as duas.
const DEFAULT_INITIAL = { type: 'medicamento' }

// 066 Slice C (T023a): "Ver todas" no fim do dropdown filtrado por `forms` (INV-3).
const PRESENTATION_SET = new Set<string>(PRESENTATIONS)

// `forms` do item da base (manifest ≥ 1.1.11); cache antigo não tem o campo.
function validForms(forms: unknown): string[] {
  if (!Array.isArray(forms)) return []
  return [...new Set(forms.filter((f): f is string => typeof f === 'string' && PRESENTATION_SET.has(f)))]
}

function formProps(form, name) {
  return {
    value: form.values[name],
    error: form.touched[name] ? form.errors[name] : undefined,
    onChange: form.handleChange,
    onBlur: form.handleBlur,
  }
}

// 119 B (D-5): cadastro novo, ou edição de medicamento SEM código, recebe sugestões do catálogo.
function suggestionsAllowed(medicine) {
  return !medicine?.therapeutic_class_code
}

// 066 D1: origem do cadastro para o `medicine_added` (TRACKING_PLAN §5.3).
function createSource(scanInfo, anvisaFilledLabel) {
  if (scanInfo) return 'scan'
  return anvisaFilledLabel ? 'anvisa_search' : 'manual'
}

// Nova leitura = novo objeto em `scanDraft` (popTo com merge); a mesma não se reaplica a cada render.
function isNewScan(isEditing, scanDraft, appliedScanDraft) {
  return !isEditing && !!scanDraft && scanDraft !== appliedScanDraft
}

// 125 1c (AC7.6): "Novo remédio"/"Editar remédio" · botão "Salvar remédio".
function formTitle(isEditing, scanInfo) {
  if (isEditing) return 'Editar remédio'
  return scanInfo ? 'Confira antes de salvar' : 'Novo remédio'
}

// AC7.4: validade depois de aberto só para injetável e líquido (R-295: 0/193 sólidos com valor, prod 17/11).
const SHELF_LIFE_FORMS = new Set(['injetavel', 'liquido'])
// Campos que o form mostra com erro no próprio campo. Erro do Zod fora deles ainda cai no alerta (anti-silent).
const INLINE_ERROR_FIELDS = new Set(['name', 'presentation', 'dosage_per_pill', 'dosage_unit', 'concentration_volume_ml', 'shelf_life_days', 'active_ingredient', 'type', 'therapeutic_class', 'regulatory_category', 'laboratory'])

// AC7.3: campos que moram em "Mais detalhes" — erro visível em qualquer um abre o bloco.
const MORE_DETAIL_FIELDS = ['active_ingredient', 'type', 'therapeutic_class', 'regulatory_category', 'laboratory']

// FR-017 / D11: o laboratório do genérico é da caixa, não do remédio — exibido, não guardado.
function ScanGenericNote({ scanInfo }) {
  if (!scanInfo?.isGeneric || !scanInfo.displayLaboratory) return null
  return (
    <View style={styles.genericBox}>
      <Text style={styles.genericTitle}>Caixa desta vez: {scanInfo.displayLaboratory}</Text>
      <Text style={styles.genericText}>
        É genérico: de qualquer laboratório, é o mesmo remédio. Por isso o laboratório não fica guardado.
      </Text>
    </View>
  )
}

// 125 1c (AC7.3): "Mais detalhes" nasce fechado — princípio ativo, tipo em 2 chips, classe, categoria,
// laboratório. Erro visível em qualquer um abre o bloco sozinho.
function MedicineMoreDetails({ form, catalog, onIdentificationChange, scanInfo }) {
  const forceOpen = MORE_DETAIL_FIELDS.some((k) => form.touched[k] && form.errors[k])
  return (
    <CollapsibleSection
      title="Mais detalhes"
      summary={moreDetailsSummary(form.values)}
      forceOpen={forceOpen}
      testID="more-details"
    >
      <View style={styles.details}>
        <FormInput
          name="active_ingredient"
          label="Princípio ativo"
          {...formProps(form, 'active_ingredient')}
          onChange={onIdentificationChange}
        />
        <CatalogFieldSuggestions catalog={catalog} field="active_ingredient" />
        <Text style={styles.fieldLabel}>Tipo</Text>
        <ChoiceChips
          options={TYPE_OPTIONS}
          value={(form.values.type as string) ?? null}
          onChange={(v) => form.handleChange('type', v)}
          accessibilityLabel="Tipo"
          testIDPrefix="medicine-type"
        />
        <FormInput
          name="therapeutic_class"
          label="Classe terapêutica"
          {...formProps(form, 'therapeutic_class')}
        />
        <FormSelect
          name="regulatory_category"
          label="Categoria regulatória"
          options={REGULATORY_OPTIONS}
          {...formProps(form, 'regulatory_category')}
        />
        <FormInput
          name="laboratory"
          label="Laboratório"
          {...formProps(form, 'laboratory')}
        />
        <ScanGenericNote scanInfo={scanInfo} />
      </View>
    </CollapsibleSection>
  )
}

// eslint-disable-next-line max-lines-per-function
export default function MedicineFormScreen() {
  // States (R-010 — States → Memos → Effects → Handlers)
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const [sheetOpen, setSheetOpen] = useState(false)
  // 066: formas do item escolhido (filtro do dropdown), "Ver todas", edição manual da forma,
  // dose ambígua (INV-2) e força completa da caixa (D9).
  const [presentationTouched, setPresentationTouched] = useState(false)
  const [doseCheckRequired, setDoseCheckRequired] = useState(false)
  const [strengthLabel, setStrengthLabel] = useState<string | null>(null)
  // C-C10: concentrações de 1 toque do composto ambíguo; erro no campo ao salvar sem escolher.
  const [strengthChoices, setStrengthChoices] = useState<CmedStrengthChoice[]>([])
  const [doseChoiceError, setDoseChoiceError] = useState(false)
  // Smoke 1c: tentou salvar ⇒ forma e dosagem vazias mostram erro no campo (como os do Zod), sem pop-up.
  const [submitAttempted, setSubmitAttempted] = useState(false)
  // C5.3: o que veio da busca (card vira selo de origem + "Trocar") e a origem do medicine_added.
  const [anvisaFilledLabel, setAnvisaFilledLabel] = useState<string | null>(null)
  // 066 D1 (RC3 A): o form é a confirmação do código de barras. `scanInfo` = caixa lida aplicada;
  // `candidatesDecided` = a pergunta "É este que você já tem?" já foi respondida (ou não tinha candidato).
  const [scanInfo, setScanInfo] = useState<any>(null)
  const [appliedScanDraft, setAppliedScanDraft] = useState<any>(null)
  const [candidatesDecided, setCandidatesDecided] = useState(false)
  // 119 B: caixa escolhida pela busca ou pela sugestão do campo — também passa pela pergunta "É este
  // que você já tem?" (decisão C, PO 2026-11-15: só a MESMA concentração é candidata).
  const [searchDraft, setSearchDraft] = useState<any>(null)
  const [searchCandidatesDecided, setSearchCandidatesDecided] = useState(false)
  // C-D1-3: posição da seção "Identificação" para a volta "manual" do scanner.
  const scrollRef = useRef<ScrollView>(null)
  const identificationY = useRef(0)
  const medicine = route.params?.medicine ?? null
  const isEditing = !!medicine

  // Memos
  // FormInput espera string. Converter dosage_per_pill (number no DB) para string
  // ao carregar para edição. Outros campos number-like seguem mesma regra.
  const initialValues = useMemo(() => {
    if (!medicine) return DEFAULT_INITIAL
    // FR-031 (ADR-066): o campo exibe o `amount` do rótulo = razão × volume; transforma só
    // quando há denominador salvo (≠ null). Senão exibe a razão crua (volume 1).
    const amountStr =
      medicine.dosage_per_pill !== null && medicine.dosage_per_pill !== undefined
        ? String(labelAmount(medicine.dosage_per_pill, medicine.concentration_volume_ml) ?? medicine.dosage_per_pill)
        : ''
    return {
      ...medicine,
      dosage_per_pill: amountStr,
      concentration_volume_ml:
        medicine.concentration_volume_ml !== null && medicine.concentration_volume_ml !== undefined
          ? String(medicine.concentration_volume_ml)
          : '',
      shelf_life_days:
        medicine.shelf_life_days !== null && medicine.shelf_life_days !== undefined
          ? String(medicine.shelf_life_days)
          : '',
    }
  }, [medicine])

  // Hooks dependentes (consomem memos acima)
  // Usa createSchema para create + edit — em edit todos obrigatórios continuam exigidos
  // (não pode apagar nome/dose/unidade ao editar).
  const form = useFormState(medicineCreateSchema, { initialValues })
  const { create, update, isLoading } = useMedicineMutation()
  // 125 1c (AC7.5/AC7.10): fila da folha de troca de forma depois de salvar a edição.
  const formChange = useFormChangeReview({ navigation, before: medicine })
  const leave = useLeaveMedicineForm(navigation, route)
  // 119 B (D-5): em edição, só medicamento SEM código recebe sugestão; salvar atualiza o mesmo id.
  const catalog = useCatalogSuggestionSheet<'name' | 'active_ingredient'>({
    values: form.values,
    allowed: suggestionsAllowed(medicine),
  })
  // Digitar no Nome/Princípio Ativo liga as sugestões daquele campo.
  const handleIdentificationChange = useMemo(() => catalog.bindChange(form.handleChange), [catalog, form.handleChange])

  // 066 D1: rascunho devolvido pelo scanner (popTo com `scanDraft`). Aplicado durante o render, uma
  // vez por leitura (nova leitura = novo objeto). Todo campo segue editável (INV-6); nada é gravado aqui.
  const scanDraft = route.params?.scanDraft ?? null
  if (isNewScan(isEditing, scanDraft, appliedScanDraft)) {
    setAppliedScanDraft(scanDraft)
    form.setValues(valuesFromDraft(baseFromScan(scanDraft, form.values), scanDraft, form.values))
    const extras = draftExtras(scanDraft)
    setDoseCheckRequired(extras.doseCheckRequired)
    setStrengthChoices(extras.strengthChoices)
    setStrengthLabel(extras.strengthLabel)
    setDoseChoiceError(false)
    setPresentationTouched(false)
    setAnvisaFilledLabel([scanDraft.name, scanDraft.strengthLabel].filter(Boolean).join(' '))
    setScanInfo(scanDraft)
    setCandidatesDecided(false)
  }

  // Effects
  // "Escanear caixa" da lista abre o form já com o scanner por cima; o form fica embaixo como o
  // caminho manual e a confirmação (RC3 A).
  const startScan = !!route.params?.startScan
  useEffect(() => {
    if (!startScan) return
    navigation.setParams({ startScan: undefined })
    navigation.navigate(ROUTES.MEDICINE_SCAN, { entryPoint: route.params?.scanEntryPoint ?? 'medicines_list' })
  }, [startScan, navigation, route.params?.scanEntryPoint])

  // C-D1-3: desistiu da caixa ("Digitar manualmente"/"Cadastrar digitando") ⇒ pula o card e vai ao form.
  const manualEntry = route.params?.manualEntry
  useEffect(() => {
    if (!manualEntry) return
    scrollRef.current?.scrollTo({ y: identificationY.current, animated: true })
  }, [manualEntry])

  // Handlers
  const { clearSheet, deactivate: closeSuggestions } = catalog
  const openSheet = useCallback(() => {
    clearSheet()
    setSheetOpen(true)
  }, [clearSheet])
  const handleIdentificationLayout = useCallback((e) => {
    identificationY.current = e.nativeEvent.layout.y
  }, [])
  const openScanner = useCallback(
    () => navigation.navigate(ROUTES.MEDICINE_SCAN, { entryPoint: 'medicine_form' }),
    [navigation]
  )

  // C-D1-2: o "Trocar" abre o sheet, que também oferece o código de barras.
  const openScannerFromSheet = useCallback(() => {
    setSheetOpen(false)
    openScanner()
  }, [openScanner])

  // D-4 "Sim, é este": nada é criado, com estoque ligado ou não (PO 2026-10-16); volta a quem abriu.
  const handleUseExisting = useCallback(
    (existing) => {
      setCandidatesDecided(true)
      setSearchCandidatesDecided(true)
      if (scanInfo) logEvent(EVENTS.SCAN_CONFIRMED, { surface: SURFACES.MOBILE, used_existing: true, dose_edited: false })
      Alert.alert('Você já tem este remédio', `Vamos usar "${existing?.name ?? 'o remédio escolhido'}". Nada novo foi criado.`, [
        { text: 'OK', onPress: () => leave(existing) },
      ])
    },
    [leave, scanInfo]
  )
  const handleCreateNew = useCallback(() => setCandidatesDecided(true), [])
  const handleNoCandidates = useCallback(() => setCandidatesDecided(true), [])
  // ✕ no sheet: sai do cadastro sem gravar nada (INV-1).
  const handleCandidatesClose = useCallback(() => leave(), [leave])
  const closeSheet = useCallback(() => {
    setSheetOpen(false)
    clearSheet()
  }, [clearSheet])
  // 119 B: a busca/sugestão não sai do cadastro — "Não" e ✕ seguem no form, sem perguntar de novo.
  const handleSearchCandidatesDone = useCallback(() => setSearchCandidatesDecided(true), [])


  // 066 Slice C: o sheet devolve { anvisaItem, cmedDraft? }. Com caixa escolhida no passo 2, o
  // rascunho da CMED prevalece (dose/unidade/forma/registro; laboratório só de não-genérico — D11).
  // Sem caixa: preenche como antes, `forms` sugere a forma e o registro é limpo (C-C4).
  const handleAnvisaSelect = useCallback(
    ({ anvisaItem: item, cmedDraft: draft }) => {
      // RC5 119 B (R-299): em edição, caixa de outra força não entra — mesmo bloqueio do vínculo.
      if (isEditing && draft && !catalogLinkPayload(medicine, draft)) {
        setSheetOpen(false)
        clearSheet()
        closeSuggestions()
        Alert.alert('Outra concentração', 'Essa caixa tem outra concentração. Escolha a caixa da mesma dose do remédio.')
        return
      }
      // Genéricos não trazem laboratório (será preenchido no estoque por compra).
      // Demais categorias: usar laboratory do registro ANVISA.
      const isGeneric = (item.regulatoryCategory ?? '')
        .toLowerCase()
        .startsWith('gener')
      const forms = validForms(item.forms)
      const base = {
        name: item.name ?? form.values.name,
        active_ingredient: item.activeIngredient ?? form.values.active_ingredient,
        therapeutic_class: item.therapeuticClass ?? form.values.therapeutic_class,
        // 100 B (C-B3): busca sem caixa não traz código; zera o de uma caixa escolhida antes (merge).
        therapeutic_class_code: null,
        // Base ANVISA traz a categoria sem acento/normalização ('Biologico'); o Picker
        // (esp. iOS, match estrito) só casa o valor canônico acentuado ('Biológico').
        // normalizeRegulatoryCategory mapeia p/ o enum canônico — mesma correção da web.
        regulatory_category:
          normalizeRegulatoryCategory(item.regulatoryCategory) ?? form.values.regulatory_category,
        laboratory: isGeneric ? '' : (item.laboratory ?? form.values.laboratory ?? ''),
        anvisa_registration: null,
      }
      setAnvisaFilledLabel(
        draft ? [draft.name, draft.strengthLabel].filter(Boolean).join(' ') : (item.name ?? null)
      )
      // Trocar pela busca descarta a caixa lida antes (o form deixa de ser "lido pelo código").
      setScanInfo(null)
      if (draft) {
        form.setValues(keepSavedStrength(isEditing ? medicine : null, valuesFromDraft(base, draft, form.values)))
        const extras = draftExtras(draft)
        setDoseCheckRequired(extras.doseCheckRequired)
        setStrengthChoices(extras.strengthChoices)
        setDoseChoiceError(false)
        setStrengthLabel(extras.strengthLabel)
        setPresentationTouched(false)
      } else {
        const presentation = forms.length === 1 && !presentationTouched ? forms[0] : undefined
        // 125 (AC2.1b): forma única marca o chip; mais de uma deixa desmarcado (a pessoa escolhe).
        form.setValues(presentation || !presentationTouched ? { ...base, presentation } : base)
        setDoseCheckRequired(false)
        setStrengthChoices([])
        setDoseChoiceError(false)
        setStrengthLabel(null)
      }
      setSheetOpen(false)
      clearSheet()
      closeSuggestions()
      // Decisão C (119 B): caixa escolhida no cadastro novo ⇒ "É este que você já tem?" (mesma concentração).
      setSearchDraft(!isEditing && draft ? draft : null)
      setSearchCandidatesDecided(false)
    },
    [form, presentationTouched, isEditing, medicine, clearSheet, closeSuggestions]
  )

  // Normaliza vírgula→ponto em tempo real (PT-BR digita 1,5; JS/Postgres esperam 1.5).
  // Aceita apenas dígitos + um separador decimal único.
  const handleDoseChange = useCallback(
    (name, value) => {
      const cleaned = String(value ?? '')
        .replace(',', '.')
        .replace(/[^\d.]/g, '')
        // colapsa múltiplos pontos no primeiro
        .replace(/^(\d*\.\d*).*$/, '$1')
      // FormInput passa o name; fallback dosage_per_pill p/ chamadas legadas.
      form.handleChange(name || 'dosage_per_pill', cleaned)
    },
    [form]
  )

  // 125 (FR-004): a forma é escolhida, nunca derivada da unidade.
  const handleUnitChange = useCallback((value: string) => form.handleChange('dosage_unit', value), [form])

  // Ao selecionar 'injetavel': prefill 28 dias (editável) apenas se shelf_life_days vazio.
  // Outras presentations: limpa apenas o prefill 28 — preserva valor digitado manualmente.
  const handlePresentationChange = useCallback(
    (_name, value) => {
      setPresentationTouched(true)
      form.handleChange('presentation', value)
      // 125 (C-3): pomada/spray sem força gravam 'un'; o Zod exige unidade.
      // Smoke 1c (PO 19/11): pomada/spray/outro só têm 'un'; voltar a uma forma com força limpa o 'un'.
      const defaults = setupDefaults(value)
      if (defaults.strengthOptional) form.handleChange('dosage_unit', defaults.fixedDosageUnit)
      else if (form.values.dosage_unit && !defaults.strengthUnits.includes(String(form.values.dosage_unit)))
        form.handleChange('dosage_unit', undefined)
      if (value === 'injetavel') {
        const current = form.values.shelf_life_days
        if (current === '' || current === null || current === undefined) {
          form.handleChange('shelf_life_days', '28')
        }
      } else if (!SHELF_LIFE_FORMS.has(value)) {
        // Campo fica oculto fora de injetável/líquido (AC7.4) — limpar evita persistir valor
        // obsoleto ao salvar (review Gemini #658, mesmo fix do web). Líquido mantém o que houver.
        form.handleChange('shelf_life_days', '')
      }
    },
    [form]
  )

  // Aceita dígitos inteiros positivos; apagar → '' (null no Zod).
  const handleShelfLifeChange = useCallback(
    (_name, value) => {
      const cleaned = String(value ?? '').replace(/[^\d]/g, '')
      form.handleChange('shelf_life_days', cleaned)
    },
    [form]
  )


  const handleSubmit = useCallback(async () => {
    // 125 (FR-004): sem forma escolhida o Zod gravaria 'comprimido' por omissão.
    // Smoke 1c (PO 19/11): obrigatórios fora do Zod (forma; dosagem nas formas com força) erram no campo,
    // junto com os do Zod — um único jeito de mostrar campo obrigatório.
    const { presentationMissing, dosageMissing } = missingRequired(form.values)
    if (presentationMissing || dosageMissing) {
      setSubmitAttempted(true)
      if (dosageMissing && doseCheckRequired) setDoseChoiceError(true)
      form.validate()
      scrollRef.current?.scrollTo({ y: identificationY.current, animated: true })
      return
    }
    // INV-2 (C-C2): o Zod aceita dose vazia; o composto ambíguo exige a escolha. O botão não muda
    // de rótulo nem trava (C-C10): o erro aparece no campo, como em qualquer obrigatório.
    if (doseCheckRequired && String(form.values.dosage_per_pill ?? '').trim() === '') {
      setDoseChoiceError(true)
      scrollRef.current?.scrollTo({ y: identificationY.current, animated: true })
      return
    }
    // FM-7: a pergunta "É este que você já tem?" ainda não teve resposta (lista chegando).
    if ((scanInfo && !candidatesDecided) || (searchDraft && !searchCandidatesDecided)) {
      Alert.alert('Um momento', 'Estamos conferindo se você já tem este remédio.')
      return
    }
    if (!form.validate()) {
      // Anti-silent-no-op (smoke iOS 022): nunca falhar sem feedback. Mostra 1º erro.
      // form.errors fica stale neste tick (setErrors async); reparse p/ msg precisa.
      const parsed = medicineCreateSchema.safeParse(form.values)
      const issues = parsed.success ? [] : parsed.error.issues
      setSubmitAttempted(true)
      const hidden = issues.find((i) => !INLINE_ERROR_FIELDS.has(String(i.path[0] ?? '')))
      if (hidden) Alert.alert('Verifique o formulário', hidden.message || 'Há campos obrigatórios não preenchidos.')
      else scrollRef.current?.scrollTo({ y: identificationY.current, animated: true })
      return
    }
    // FR-031 (ADR-066): normaliza amount→razão. Líquido c/ denominador ≠ 1 → dosage_per_pill =
    // amount ÷ denominador + grava concentration_volume_ml; senão passthrough (coluna null).
    const payload = { ...form.values, ...normalizeConcentration(form.values) }
    if (isEditing) {
      const saved = await update(medicine.id, payload)
      if (!saved) return
      await formChange.afterUpdate({ ...medicine, ...payload, ...(typeof saved === 'object' ? saved : null) })
    } else {
      if (scanInfo) {
        logEvent(EVENTS.SCAN_CONFIRMED, {
          surface: SURFACES.MOBILE,
          used_existing: false,
          dose_edited: scanDoseEdited(form.values, scanInfo),
        })
      }
      const created = await create(payload, { goBack: false, source: createSource(scanInfo, anvisaFilledLabel) })
      if (created) leave(typeof created === 'object' ? created : null)
    }
  }, [form, isEditing, medicine, create, update, anvisaFilledLabel, doseCheckRequired, scanInfo, candidatesDecided, searchDraft, searchCandidatesDecided, formChange, leave])

  const handleStrengthChoice = useCallback(
    (choice: CmedStrengthChoice) => {
      form.setValues({ ...form.values, dosage_per_pill: String(choice.dose), dosage_unit: choice.unit })
      setDoseChoiceError(false)
    },
    [form]
  )

  const required = requiredUi(form.values, submitAttempted)
  const hasDose = String(form.values.dosage_per_pill ?? '').trim() !== ''
  const askStrength = doseCheckRequired && !hasDose

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => leave()}
          style={styles.headerBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <ChevronLeft size={24} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.title}>
          {formTitle(isEditing, scanInfo)}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {!isEditing && (
          <AnvisaBanner onPress={openSheet} filledLabel={anvisaFilledLabel} filledSource={scanInfo ? 'scan' : 'search'}>
            <Pressable
              style={({ pressed }) => [styles.scanButton, pressed && styles.scanButtonPressed]}
              onPress={openScanner}
              accessibilityRole="button"
              accessibilityLabel="Ler o código de barras"
            >
              <ScanBarcode size={20} color={colors.primary[700]} strokeWidth={2.5} />
              <Text style={styles.scanButtonText}>Ler o código de barras</Text>
              <ChevronRight size={18} color={colors.primary[700]} />
            </Pressable>
          </AnvisaBanner>
        )}

        <View onLayout={handleIdentificationLayout}>
          <FormSection title="Remédio" required>
            <FormInput
              name="name"
              label="Nome"
              {...formProps(form, 'name')}
              onChange={handleIdentificationChange}
            />
            <CatalogFieldSuggestions catalog={catalog} field="name" />
          </FormSection>
        </View>

        <FormSection title="Como é" required>
          <PresentationChips
            value={form.values.presentation as string | undefined}
            onChange={(value) => handlePresentationChange('presentation', value)}
            error={required.presentationError}
          />
        </FormSection>

        <FormSection title="Dosagem" required={required.dosageRequired}>
          <FormInput
            name="dosage_per_pill"
            label="Concentração"
            keyboardType="decimal-pad"
            {...formProps(form, 'dosage_per_pill')}
            {...(required.dosageError ? { error: required.dosageError } : null)}
            {...(doseChoiceError && askStrength ? { error: 'Escolha a concentração abaixo' } : null)}
            onChange={handleDoseChange}
          />
          <UnitChipsField
            presentation={form.values.presentation as string | undefined}
            unit={form.values.dosage_unit as string | undefined}
            onChange={handleUnitChange}
            error={formProps(form, 'dosage_unit').error as string | undefined}
          />
          <StrengthChoiceCard
            askStrength={askStrength}
            strengthLabel={strengthLabel}
            strengthChoices={strengthChoices}
            onChoose={handleStrengthChoice}
          />
          {/* FR-031 (ADR-066): denominador do rótulo. Default 1 mL; muda só p/ Mounjaro etc. */}
          <ConcentrationVolumeField
            dosageUnit={form.values.dosage_unit as string | undefined}
            presentation={form.values.presentation as string | undefined}
            inputProps={{ ...formProps(form, 'concentration_volume_ml'), onChange: handleDoseChange }}
          />
          {required.dosageOptional ? (
            <Text style={styles.optionalHint}>Opcional. O número fica guardado como está na caixa; o app conta por unidade.</Text>
          ) : null}
          {/* AC7.4: validade depois da dosagem, só injetável e líquido. */}
          {SHELF_LIFE_FORMS.has(String(form.values.presentation ?? '')) && (
            <FormInput
              name="shelf_life_days"
              label="Validade depois de aberto (dias)"
              keyboardType="number-pad"
              helperText="Dias de uso depois de abrir o frasco ou a caneta. Confira a bula."
              {...formProps(form, 'shelf_life_days')}
              onChange={handleShelfLifeChange}
            />
          )}
        </FormSection>

        <MedicineMoreDetails form={form} catalog={catalog} onIdentificationChange={handleIdentificationChange} scanInfo={scanInfo} />
      </ScrollView>

      <FormActions
        primaryLabel="Salvar remédio"
        onPrimary={handleSubmit}
        primaryLoading={isLoading}
        secondaryLabel="Cancelar"
        onSecondary={() => leave()}
      />
      </KeyboardAvoidingView>

      <MedicineAnvisaSheet
        open={catalog.isOpen(sheetOpen)}
        onClose={closeSheet}
        onSelect={handleAnvisaSelect}
        onScan={openScannerFromSheet}
        initialItem={catalog.sheetItem}
        initialQuery={catalog.sheetQuery}
        initialResults={catalog.sheetResults}
        entryPoint={catalog.entryPoint('medicine_form')}
      />
      {scanInfo && !candidatesDecided ? (
        <MedicineCandidatesSheet
          draft={scanInfo}
          onUseExisting={handleUseExisting}
          onCreateNew={handleCreateNew}
          onNoCandidates={handleNoCandidates}
          onClose={handleCandidatesClose}
        />
      ) : null}
      {/* AC7.5: a folha só aparece com a tela em foco (useFormChangeReview). */}
      <FormChangeSheet item={formChange.current} onReview={formChange.review} onDismiss={formChange.skip} />
      {searchDraft && !searchCandidatesDecided && !scanInfo ? (
        <MedicineCandidatesSheet
          draft={searchDraft}
          onUseExisting={handleUseExisting}
          onCreateNew={handleSearchCandidatesDone}
          onNoCandidates={handleSearchCandidatesDone}
          onClose={handleSearchCandidatesDone}
        />
      ) : null}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
    backgroundColor: colors.bg.card,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'center',
    fontFamily: typography.fontFamily.bold,
  },
  headerSpacer: {
    width: 40,
  },
  scroll: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[12],
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  details: { gap: spacing[3], marginBottom: spacing[4] },
  optionalHint: { fontSize: 13, color: colors.text.secondary, lineHeight: 18 },
  // 066 D1 (C5.3): 2º botão do card da ANVISA, mesmo peso da busca.
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    minHeight: 48,
    paddingHorizontal: spacing[3],
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.light,
    backgroundColor: colors.neutral[100],
  },
  scanButtonPressed: {
    backgroundColor: colors.primary[50],
    borderColor: colors.primary[200],
  },
  scanButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary[700],
  },
  genericBox: {
    marginTop: spacing[2],
    padding: spacing[3],
    borderRadius: borderRadius.md,
    backgroundColor: colors.neutral[100],
    gap: spacing[1],
  },
  genericTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
  },
  genericText: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.text.secondary,
  },
})
