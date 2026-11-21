// treatmentSetup.ts — regras puras do cadastro de remédio + tratamento (spec 125, INV-6).
// Fonte única para onboarding, form completo e Hoje: defaults por forma (FR-021), avisos de
// plausibilidade (FR-009, nunca bloqueiam — INV-5) e a frase de conferência (FR-011).
// O app não propõe posologia (INV-3): a dose que nasce preenchida é a contagem de unidades (1 comprimido,
// 1 aplicação de caneta em mg/UI) ou, na 1b, a TRANSCRIÇÃO da embalagem de dose única (concentração ×
// volume da unidade — dado da caixa, não sugestão clínica; PO 2026-11-17/19).

import { formatNumberPtBR } from '../utils/doseUnit'
import { cleanFloat } from '../utils/formUtils'
import { parseLocalDate, formatLocalDate, addDays, parseISO } from '../utils/dateUtils'

export type SetupPresentation = 'comprimido' | 'capsula' | 'liquido' | 'injetavel' | 'pomada' | 'spray' | 'outro'

/** Escolha de frequência oferecida no setup. `mensal_30` = `intervalo_dias`/30 (trava da 086). */
export type SetupFrequencyChoice = 'diário' | 'dias_alternados' | 'semanal' | 'mensal_30' | 'quando_necessário'

export interface SetupDefaults {
  presentation: SetupPresentation
  /** Unidades da dosagem oferecidas, na ordem (subconjunto de DOSAGE_UNITS). Vazio = sem dosagem. */
  strengthUnits: string[]
  /** Unidade gravada quando a forma não tem dosagem (pomada/spray sem força ⇒ 'un', PO 2026-11-17 C-3). */
  fixedDosageUnit: string | null
  /**
   * Dosagem opcional (pomada/spray/outro): só 'un', número livre que o app NÃO usa em conta (smoke 1c,
   * PO 19/11 — as unidades dérmicas ainda não foram desenhadas). O onboarding pula a pergunta.
   */
  strengthOptional: boolean
  /** Pergunta da dose; null = a forma resolve a dose (sem campo). */
  doseQuestion: string | null
  /** Dose inicial: '1' só onde a dose é contagem de unidades; '' (vazia) senão (FR-008). */
  defaultDose: string
  /** Unidades da tomada (INTAKE_UNITS) oferecidas; [] = tomada em unidades (intake_unit NULL). */
  intakeUnits: string[]
  /** Dose obrigatória sem default (gotas, mg/UI). */
  doseRequired: boolean
  frequencyOrder: SetupFrequencyChoice[]
  /** Pré-seleção da frequência: só comprimido/cápsula ("Todo dia"). */
  preselectedFrequency: SetupFrequencyChoice | null
}

const PRESENTATION_SET = new Set<string>(['comprimido', 'capsula', 'liquido', 'injetavel', 'pomada', 'spray', 'outro'])

// A ordem é DESTAQUE, não oferta: toda forma tem "Mensal" (sob a trava da 086) — comprimido/cápsula
// mensal é real (vitamina D, ibandronato). Emenda à FR-021, PO 2026-11-18 (analysis-1a).
const ORDER_SOLID: SetupFrequencyChoice[] = ['diário', 'dias_alternados', 'semanal', 'mensal_30', 'quando_necessário']
const ORDER_LIQUID: SetupFrequencyChoice[] = ['diário', 'quando_necessário', 'dias_alternados', 'semanal', 'mensal_30']
const ORDER_INJECTABLE: SetupFrequencyChoice[] = ['semanal', 'diário', 'mensal_30', 'dias_alternados', 'quando_necessário']
const ORDER_TOPICAL: SetupFrequencyChoice[] = ['quando_necessário', 'diário', 'dias_alternados', 'semanal', 'mensal_30']
const ORDER_OTHER: SetupFrequencyChoice[] = ['diário', 'dias_alternados', 'semanal', 'mensal_30', 'quando_necessário']

/** Normaliza a forma; desconhecida/NULL ⇒ 'outro' (perfil mais aberto, sem pré-seleção). */
export function toSetupPresentation(value: string | null | undefined): SetupPresentation {
  return value && PRESENTATION_SET.has(value) ? (value as SetupPresentation) : 'outro'
}

function injectableDefaults(dosageUnit: string | null | undefined): SetupDefaults {
  const perPen = dosageUnit === 'mg' || dosageUnit === 'ui'
  const byUnit: Record<string, string[]> = { 'mg/ml': ['mg'], 'ui/ml': ['UI'] }
  const intakeUnits = perPen ? [] : (byUnit[dosageUnit ?? ''] ?? ['mg', 'UI'])
  return {
    presentation: 'injetavel',
    strengthUnits: ['mg/ml', 'ui/ml', 'mg', 'ui'],
    fixedDosageUnit: null,
    strengthOptional: false,
    doseQuestion: perPen ? null : 'Quanto aplica de cada vez?',
    defaultDose: perPen ? '1' : '',
    intakeUnits,
    doseRequired: !perPen,
    frequencyOrder: ORDER_INJECTABLE,
    preselectedFrequency: null,
  }
}

/**
 * Defaults do cadastro pela forma (tabela FR-021). `dosageUnit` (opcional) afina a tomada:
 * injetável em mg/mL ⇒ dose em mg; UI/mL ⇒ UI; mg/UI por caneta ⇒ 1 aplicação, sem pergunta
 * (PO 2026-11-17 C-2: o estoque de caneta conta aplicações, não mg).
 */
export function setupDefaults(presentationInput: string | null | undefined, dosageUnit?: string | null): SetupDefaults {
  const presentation = toSetupPresentation(presentationInput)
  switch (presentation) {
    case 'comprimido':
    case 'capsula':
      return {
        presentation,
        strengthUnits: ['mg', 'mcg', 'g', 'ui'],
        fixedDosageUnit: null,
        strengthOptional: false,
        doseQuestion: presentation === 'comprimido' ? 'Quantos comprimidos por vez?' : 'Quantas cápsulas por vez?',
        defaultDose: '1',
        intakeUnits: [],
        doseRequired: false,
        frequencyOrder: ORDER_SOLID,
        preselectedFrequency: 'diário',
      }
    case 'liquido':
      return {
        presentation,
        strengthUnits: ['mg/ml', 'ui/ml'],
        fixedDosageUnit: null,
        strengthOptional: false,
        doseQuestion: 'Quanto toma de cada vez?',
        defaultDose: '',
        intakeUnits: dosageUnit === 'ui/ml' ? ['UI', 'gotas'] : ['gotas', 'ml'],
        doseRequired: true,
        frequencyOrder: ORDER_LIQUID,
        preselectedFrequency: null,
      }
    case 'injetavel':
      return injectableDefaults(dosageUnit)
    case 'pomada':
      return {
        presentation,
        strengthUnits: ['un'],
        fixedDosageUnit: 'un',
        strengthOptional: true,
        doseQuestion: null,
        defaultDose: '1',
        intakeUnits: [],
        doseRequired: false,
        frequencyOrder: ORDER_TOPICAL,
        preselectedFrequency: null,
      }
    case 'spray':
      return {
        presentation,
        strengthUnits: ['un'],
        // Spray sem força digitada também precisa de unidade no Zod (C-3).
        fixedDosageUnit: 'un',
        strengthOptional: true,
        doseQuestion: null,
        defaultDose: '1',
        intakeUnits: [],
        doseRequired: false,
        frequencyOrder: ORDER_TOPICAL,
        preselectedFrequency: null,
      }
    default:
      return {
        presentation: 'outro',
        strengthUnits: ['un'],
        fixedDosageUnit: 'un',
        strengthOptional: true,
        doseQuestion: 'Quanto usa de cada vez?',
        defaultDose: '1',
        intakeUnits: [],
        doseRequired: false,
        frequencyOrder: ORDER_OTHER,
        preselectedFrequency: null,
      }
  }
}

// ── Plausibilidade (FR-009 · INV-5: aviso, nunca bloqueio) ─────────────────────────────────

export type DosePlausibilityKind =
  | 'exceeds_pen'
  | 'looks_like_ml'
  | 'denominator_looks_like_package'
  | 'ml_looks_like_drops'
  | 'exceeds_injection_volume'
  | 'count_looks_high'

export interface DosePlausibilityWarning {
  kind: DosePlausibilityKind
  message: string
}

export interface DosePlausibilityInput {
  /** Dose digitada (número ou texto com vírgula). Vazia ⇒ sem aviso (a obrigatoriedade é outra regra). */
  dose?: number | string | null
  /** Unidade da dose ('mg' | 'UI' | 'gotas' | 'ml'). */
  doseUnit?: string | null
  presentation?: string | null
  /** Conteúdo da caneta de dose única (número do rótulo antes da barra), quando conhecido. */
  penContent?: number | string | null
  /** Número depois da barra no rótulo ("2,5 mg / 0,5 mL" ⇒ 0,5). */
  denominatorMl?: number | string | null
  /** Concentração por 1 mL (já normalizada), na mesma unidade de massa da dose (mg/mL p/ mg, UI/mL p/ UI). */
  concentrationMgPerMl?: number | string | null
}

/**
 * Smoke 18/11 (PO, dipirona): líquido concentrado (≥ 100 mg/mL — faixa de "gotas") com dose em mL acima de 5 mL é
 * quase sempre leitura trocada: a dose era em gotas, ou a concentração é a da solução (ex.: 50 mg/mL). Regra de
 * COERÊNCIA de leitura (unidade × concentração), sem teto clínico por remédio (fronteira SaMD) — mesmo princípio
 * do "parece mL" do injetável.
 */
export const DROPS_CONCENTRATION_MG_PER_ML = 100
export const DROPS_MAX_ML_PER_INTAKE = 5

/**
 * Smoke 18/11 (PO, Ozempic/Wegovy — canetas multidose): dose ÷ concentração = mL numa aplicação. Caneta
 * aplica no máximo ~0,8 mL por vez (U-100 = 80 UI; GLP-1 0,5–0,75 mL) ⇒ acima de 1 mL é leitura trocada.
 * Coerência de leitura, sem escada de bula (SaMD). Ex.: 5 mg em 1,34 mg/mL = 3,7 mL ⇒ avisa.
 */
export const INJECTION_MAX_ML_PER_APPLICATION = 1

/**
 * Smoke 1c (PO 19/11): contagem por tomada acima do comum é quase sempre outro número no lugar —
 * mg digitado como comprimidos/gotas, 3 mg como 3 canetas. Não há teto oficial por tomada (ANVISA/CFM/ISMP:
 * só por fármaco, na bula); estes são tetos de LEITURA, acima dos maiores usos legítimos comuns
 * (prednisona 5 mg em dose alta ~12 cp · dipirona adulto 40 gotas · lactulose ~45 mL · caneta de dose
 * única = 1 por aplicação). Aviso, nunca bloqueio (INV-5); o Zod segue com o teto de 1000.
 */
export const COUNT_MAX_PER_INTAKE = { units: 10, drops: 60, ml: 50, penApplications: 1 } as const

function countWarning(dose: number, unit: string, presentation?: string | null): DosePlausibilityWarning | null {
  const count = countKindFor(unit, presentation)
  if (!count || dose <= count.max) return null
  return { kind: 'count_looks_high', message: `São ${formatNumberPtBR(dose)} ${count.noun} por vez. ${count.hint}` }
}

type CountKind = { max: number; noun: string; hint: string }

function countKindFor(unit: string, presentation?: string | null): CountKind | null {
  const u = unit.toLowerCase()
  if (u === 'gotas') return { max: COUNT_MAX_PER_INTAKE.drops, noun: 'gotas', hint: 'Confira se o número não é a dose em mg ou mL.' }
  if (u === 'ml' && presentation === 'liquido') return { max: COUNT_MAX_PER_INTAKE.ml, noun: 'mL', hint: 'Confira se o número não é a dose em mg ou gotas.' }
  if (u !== '') return null
  if (presentation === 'comprimido') return { max: COUNT_MAX_PER_INTAKE.units, noun: 'comprimidos', hint: 'Confira se o número não é a dosagem em mg.' }
  if (presentation === 'capsula') return { max: COUNT_MAX_PER_INTAKE.units, noun: 'cápsulas', hint: 'Confira se o número não é a dosagem em mg.' }
  // Injetável sem unidade na tomada = dose por caneta: a dose conta aplicações (setupDefaults, C-2).
  if (presentation === 'injetavel')
    return { max: COUNT_MAX_PER_INTAKE.penApplications, noun: 'aplicações', hint: 'A dose em mg já vem na caneta: cada aplicação costuma ser 1 caneta.' }
  return null
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const n = typeof value === 'string' ? Number(value.trim().replace(',', '.')) : value
  if (typeof value === 'string' && value.trim() === '') return null
  return Number.isFinite(n) ? n : null
}

/** Volume depois da barra que parece o tamanho do frasco/caneta: líquido ≥ 10 mL; injetável > 1 mL. */
export function denominatorLooksLikePackage(denominatorMl: number | string | null | undefined, presentation?: string | null): boolean {
  const d = toNumber(denominatorMl)
  if (d === null || d <= 0) return false
  return presentation === 'injetavel' ? d > 1 : d >= 10
}

/** Caneta de dose única (rótulo "X mg / ≤1 mL") com dose ≤ 1 abaixo do conteúdo: o número é o volume. */
function packageWarning(denominator: number, presentation?: string | null): DosePlausibilityWarning {
  const what = presentation === 'injetavel' ? 'da embalagem' : 'do frasco'
  return {
    kind: 'denominator_looks_like_package',
    message: `${formatNumberPtBR(denominator)} mL parece o tamanho ${what}. Na caixa, o número depois da barra costuma ser menor.`,
  }
}

function looksLikeMl(dose: number, unit: string, pen: number | null, denominator: number | null, presentation?: string | null): boolean {
  if (presentation !== 'injetavel' || unit !== 'mg') return false
  if (denominator === null || denominator <= 0 || denominator > 1) return false
  return pen !== null && dose < pen && dose <= 1
}

export function checkDosePlausibility(input: DosePlausibilityInput): DosePlausibilityWarning[] {
  const warnings: DosePlausibilityWarning[] = []
  const dose = toNumber(input.dose)
  // Smoke 1b C-1b-S6 (AP-226/R-277): o conteúdo é reconstruído do salvo POR mL (8,333333333333 × 0,6 =
  // 4,9999999999998) — `cleanFloat` antes de comparar e de mostrar, senão a dose igual ao rótulo vira "maior".
  const rawPen = toNumber(input.penContent)
  const pen = rawPen === null ? null : cleanFloat(rawPen)
  const denominator = toNumber(input.denominatorMl)
  const unit = input.doseUnit ?? ''

  if (denominatorLooksLikePackage(denominator, input.presentation)) warnings.push(packageWarning(denominator as number, input.presentation))

  if (dose === null || dose <= 0) return warnings

  if (pen !== null && pen > 0 && dose > pen) {
    warnings.push({
      kind: 'exceeds_pen',
      message: `O rótulo diz ${formatNumberPtBR(pen)} ${unit}. Confirma ${formatNumberPtBR(dose)} ${unit}?`,
    })
  }

  if (looksLikeMl(dose, unit, pen, denominator, input.presentation)) {
    warnings.push({
      kind: 'looks_like_ml',
      message: `${formatNumberPtBR(dose)} parece mL. A dose é em mg? Confira o número com "mg" ao lado.`,
    })
  }

  const conc = toNumber(input.concentrationMgPerMl)
  const doseUnitLower = unit.toLowerCase()
  if (
    input.presentation === 'injetavel' &&
    (doseUnitLower === 'mg' || doseUnitLower === 'ui') &&
    conc !== null &&
    conc > 0 &&
    !warnings.some((w) => w.kind === 'exceeds_pen')
  ) {
    const ml = dose / conc
    if (ml > INJECTION_MAX_ML_PER_APPLICATION) {
      warnings.push({
        kind: 'exceeds_injection_volume',
        message: `${formatNumberPtBR(dose)} ${unit} daria ${formatNumberPtBR(Math.round(ml * 10) / 10)} mL numa aplicação — mais do que uma caneta aplica de uma vez. Confira a dose ou a concentração.`,
      })
    }
  }
  if (
    unit.toLowerCase() === 'ml' &&
    input.presentation === 'liquido' &&
    conc !== null &&
    conc >= DROPS_CONCENTRATION_MG_PER_ML &&
    dose > DROPS_MAX_ML_PER_INTAKE
  ) {
    warnings.push({
      kind: 'ml_looks_like_drops',
      message: `${formatNumberPtBR(conc)} mg/mL costuma ser em gotas. Confira: a dose é ${formatNumberPtBR(dose)} gotas, ou a concentração é outra?`,
    })
  }
  const count = countWarning(dose, unit, input.presentation)
  if (count) warnings.push(count)
  return warnings
}

// ── Frase de conferência (FR-011, AC4.1) ─────────────────────────────────────────────────

export interface DescribeTreatmentInput {
  medicineName: string | null | undefined
  presentation: string | null | undefined
  dosagePerPill?: number | string | null
  dosageUnit?: string | null
  /** Dose por tomada (contagem de unidades, ou na `intakeUnit` quando ela existe). */
  dose: number | string | null | undefined
  intakeUnit?: string | null
  frequency: string | null | undefined
  weekdays?: string[] | null
  timeSchedule?: string[] | null
  intervalDays?: number | null
  /** YYYY-MM-DD local. */
  startDate?: string | null
  /** YYYY-MM-DD local (R-020). */
  today: string
  /** HH:MM local; com ele, o horário de hoje que já passou não conta como próximo. */
  nowTime?: string | null
}

export interface TreatmentDescription {
  sentence: string
  /** "Próxima: hoje às 18:00" / "amanhã às 08:00" / "terça, 24/11 às 08:00"; null em quando_necessário ou sem data. */
  next: string | null
  /** Partes da frase, para quem mostra em linhas (miolo da L1, 125 fatia 2): "0,5 mg por aplicação". */
  dose: string | null
  /** "toda segunda às 15:00" · "todo dia às 08:00". */
  frequency: string | null
}

const UNIT_TEXT: Record<string, string> = { mg: 'mg', mcg: 'mcg', g: 'g', ui: 'UI', un: 'un.', 'mg/ml': 'mg/mL', 'ui/ml': 'UI/mL' }
const INTAKE_TEXT: Record<string, string> = { mg: 'mg', UI: 'UI', gotas: 'gotas', ml: 'mL' }
const FORM_TEXT: Record<SetupPresentation, string> = {
  comprimido: 'comprimido', capsula: 'cápsula', liquido: 'líquido', injetavel: 'injetável',
  pomada: 'pomada', spray: 'spray', outro: 'outro',
}
// getDay(): 0 = domingo.
const WEEKDAY_BY_INDEX = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const MASCULINE_DAYS = new Set(['sábado', 'domingo'])

function strengthText(value: number | string | null | undefined, unit: string | null | undefined): string | null {
  const n = toNumber(value as any)
  if (n === null || n <= 0 || !unit) return null
  return `${formatNumberPtBR(n)} ${UNIT_TEXT[unit] ?? unit}`
}

function countNoun(n: number, singular: string, plural: string): string {
  return `${formatNumberPtBR(n)} ${n === 1 ? singular : plural}`
}

function doseText(p: SetupPresentation, i: DescribeTreatmentInput): string | null {
  const dose = toNumber(i.dose as any)
  if (dose === null || dose <= 0) return null
  const strength = strengthText(i.dosagePerPill, i.dosageUnit)
  if (i.intakeUnit) {
    const u = INTAKE_TEXT[i.intakeUnit] ?? i.intakeUnit
    const tail = p === 'injetavel' ? 'por aplicação' : 'por vez'
    return `${formatNumberPtBR(dose)} ${u} ${tail}`
  }
  const of = strength ? ` de ${strength}` : ''
  switch (p) {
    case 'comprimido': return `${countNoun(dose, 'comprimido', 'comprimidos')}${of}`
    case 'capsula': return `${countNoun(dose, 'cápsula', 'cápsulas')}${of}`
    case 'injetavel': return `${countNoun(dose, 'aplicação', 'aplicações')}${of}`
    case 'pomada':
    case 'spray': return `${countNoun(dose, 'aplicação', 'aplicações')}`
    default: return `${countNoun(dose, 'unidade', 'unidades')}${of}`
  }
}

function joinPt(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`
}

function timesText(times: string[]): string {
  return times.length ? ` às ${joinPt(times)}` : ''
}

function sortedTimes(times: string[] | null | undefined): string[] {
  return Array.isArray(times) ? [...times].filter(Boolean).sort() : []
}

function frequencyText(i: DescribeTreatmentInput): string | null {
  const times = timesText(sortedTimes(i.timeSchedule))
  switch (i.frequency) {
    case 'diário': return `todo dia${times}`
    case 'dias_alternados': return `dia sim, dia não${times}`
    case 'semanal': {
      const days = (i.weekdays ?? []).filter((d) => WEEKDAY_BY_INDEX.includes(d))
      if (!days.length) return `toda semana${times}`
      const ordered = WEEKDAY_BY_INDEX.slice(1).concat('domingo').filter((d) => days.includes(d))
      const first = ordered[0]
      return `${MASCULINE_DAYS.has(first) ? 'todo' : 'toda'} ${joinPt(ordered)}${times}`
    }
    case 'intervalo_dias': {
      const n = i.intervalDays
      return n && n > 0 ? `a cada ${n} dias${times}` : `a cada X dias${times}`
    }
    case 'quando_necessário': return 'quando precisar'
    default: return null
  }
}

/** Primeira data ≥ hoje (e ≥ início) em que há dose; null se não calculável. Pura (R-020). */
export function nextDoseDate(i: Pick<DescribeTreatmentInput, 'frequency' | 'weekdays' | 'timeSchedule' | 'intervalDays' | 'startDate' | 'today' | 'nowTime'>): string | null {
  if (!i.today || i.frequency === 'quando_necessário') return null
  const today = parseLocalDate(i.today)
  const start = i.startDate ? parseLocalDate(i.startDate) : today
  const times = sortedTimes(i.timeSchedule)
  const todayStillHasDose = !i.nowTime || times.length === 0 || times.some((t) => t > (i.nowTime as string))
  const firstCandidate = start > today ? start : todayStillHasDose ? today : addDays(today, 1)

  const step = cadenceStep(i.frequency, i.intervalDays)
  for (let k = 0; k < 400; k++) {
    const d = addDays(firstCandidate, k)
    const hit = isDoseDay(d, start, i.frequency, i.weekdays ?? [], step)
    if (hit === null) return null
    if (hit) return formatLocalDate(d)
  }
  return null
}

function cadenceStep(frequency: string | null | undefined, intervalDays: number | null | undefined): number | null {
  if (frequency === 'dias_alternados') return 2
  return frequency === 'intervalo_dias' && intervalDays && intervalDays > 0 ? intervalDays : null
}

/** true = há dose em `d`; false = não; null = cadência sem data calculável. */
function isDoseDay(d: Date, start: Date, frequency: string | null | undefined, weekdays: string[], step: number | null): boolean | null {
  if (frequency === 'diário') return true
  if (frequency === 'semanal') return weekdays.length ? weekdays.includes(WEEKDAY_BY_INDEX[d.getDay()]) : null
  if (!step) return null
  const diff = Math.round((d.getTime() - start.getTime()) / 86_400_000)
  return diff >= 0 && diff % step === 0
}

// Horário da próxima dose: hoje ⇒ o 1º ainda por vir (depois de `nowTime`); outro dia ⇒ o 1º do dia.
function nextTime(date: string, i: Pick<DescribeTreatmentInput, 'timeSchedule' | 'today' | 'nowTime'>): string | null {
  const times = sortedTimes(i.timeSchedule)
  if (!times.length) return null
  if (date === i.today && i.nowTime) return times.find((t) => t > (i.nowTime as string)) ?? times[0]
  return times[0]
}

/**
 * "Próxima: hoje às 18:00" · "amanhã às 08:00" · "terça, 24/11 às 08:00" (PO smoke 125, 18/11 — emenda
 * AC4.1: relativo quando é hoje/amanhã, e sempre com o horário). Sem horário, só o dia.
 */
function nextText(date: string | null, i: Pick<DescribeTreatmentInput, 'timeSchedule' | 'today' | 'nowTime'>): string | null {
  if (!date) return null
  const d = parseLocalDate(date)
  const tomorrow = formatLocalDate(addDays(parseLocalDate(i.today), 1))
  let day: string
  if (date === i.today) day = 'hoje'
  else if (date === tomorrow) day = 'amanhã'
  else day = `${WEEKDAY_BY_INDEX[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
  const time = nextTime(date, i)
  return `Próxima: ${day}${time ? ` às ${time}` : ''}`
}

/**
 * Frase única de conferência: "Mounjaro · injetável · 2,5 mg por aplicação · toda terça às 08:00".
 * Comprimido/cápsula omitem a forma (já está no substantivo da dose).
 */
export function describeTreatment(i: DescribeTreatmentInput): TreatmentDescription {
  const p = toSetupPresentation(i.presentation)
  const parts: string[] = []
  const name = (i.medicineName ?? '').trim()
  if (name) parts.push(name)
  if (p !== 'comprimido' && p !== 'capsula') parts.push(FORM_TEXT[p])
  const dose = doseText(p, i)
  if (dose) parts.push(dose)
  const freq = frequencyText(i)
  if (freq) parts.push(freq)
  return { sentence: parts.join(' · '), next: nextText(nextDoseDate(i), i), dose: dose || null, frequency: freq || null }
}

// ── Dia da aplicação (AC2.5b) ──────────────────────────────────────────────────────────────
export interface ApplicationAnchorInput {
  /** YYYY-MM-DD local: "Quando foi (ou será) a aplicação?" */
  applicationDate: string
  frequency: string
  intervalDays?: number | null
  /** YYYY-MM-DD local (R-020). */
  today: string
}

/**
 * Converte o dia da aplicação na âncora do tratamento: semanal ⇒ o dia da semana daquela data;
 * dias alternados (N=2) / a cada N dias ⇒ a 1ª data ≥ hoje na série que passa pela aplicação. `start_date` nunca fica no
 * passado (o gerador criaria dose perdida retroativa). Pura (R-020).
 */
export function anchorFromApplication(i: ApplicationAnchorInput): { start_date: string; weekdays: string[] } {
  const applied = parseLocalDate(i.applicationDate)
  const today = parseLocalDate(i.today)
  if (i.frequency === 'semanal') {
    // Smoke 18/11: semanal começa HOJE — o dia da semana já posiciona a dose (sem dose perdida até lá)
    // e o tratamento fica "em uso" (alerta de estoque vale). Início futuro deixava "Programado" e mudo.
    return { start_date: formatLocalDate(today), weekdays: [WEEKDAY_BY_INDEX[applied.getDay()]] }
  }
  const n = i.frequency === 'dias_alternados' ? 2 : i.intervalDays && i.intervalDays > 0 ? i.intervalDays : 1
  let next = applied
  while (next < today) next = addDays(next, n)
  return { start_date: formatLocalDate(next), weekdays: [] }
}

// ── Dose pela embalagem (1b, FR-013 — simplificada pelo PO no smoke de 2026-11-19) ─────────────
// A dose por aplicação é da RECEITA. Só nasce preenchida onde a embalagem diz o conteúdo de UMA aplicação:
// rótulo curado com volume (`lv`, spec 113 — hoje o Mounjaro, "2,5 mg / 0,5 mL"). Recipiente, volume da caneta
// multidose e "≈ N aplicações" não mudam a dose — ficam fora desta tela (C-1b-S3/S4).

export interface PenDoseInput {
  presentation: string | null | undefined
  /** `mg/ml` ou `ui/ml`; outra unidade ⇒ sem derivação (mg por caneta já é "1 aplicação"). */
  dosageUnit: string | null | undefined
  /** Concentração por 1 mL. */
  perMl: number | string | null | undefined
  /** Volume do rótulo curado (`lv`) de UMA unidade, em mL. Quem chama garante a origem curada. */
  volumeMl: number | string | null | undefined
}

export interface PenDose {
  dose: number
  intakeUnit: 'mg' | 'UI'
}

/** Mesmo teto do `protocolSchema.dosage_per_intake`: nunca pré-preencher o que o schema recusa. */
const MAX_DERIVED_DOSE = 1000

function massUnitOf(dosageUnit: string | null | undefined): 'mg' | 'UI' | null {
  if (dosageUnit === 'mg/ml') return 'mg'
  if (dosageUnit === 'ui/ml') return 'UI'
  return null
}

/**
 * Dose de injetável de dose única = concentração × volume do rótulo curado (AC5.1). Unidade com mais de
 * 1 mL não é dose única de injeção. Qualquer dado faltando ⇒ null (campo vazio, a pessoa digita a receita).
 */
export function derivePenDose(i: PenDoseInput): PenDose | null {
  if (i.presentation !== 'injetavel') return null
  const intakeUnit = massUnitOf(i.dosageUnit)
  if (!intakeUnit) return null
  const perMl = toNumber(i.perMl)
  const volume = toNumber(i.volumeMl)
  if (perMl === null || perMl <= 0 || volume === null || volume <= 0) return null
  if (volume > INJECTION_MAX_ML_PER_APPLICATION) return null
  const dose = cleanFloat(perMl * volume) // R-277
  if (dose <= 0 || dose > MAX_DERIVED_DOSE) return null
  return { dose, intakeUnit }
}

const DIAL_DOSES = /\(DOSES?\s+([^)]*)\)/i
const DIAL_NUMBER = /(\d+(?:[.,]\d+)?)\s*MG\b/gi

/** Doses do mostrador escritas na apresentação CMED ("(DOSES 0,25MG E 0,5 MG)") — nunca lista nome→dose. */
export function dialDosesFromText(text: string | null | undefined): number[] {
  if (!text) return []
  const block = DIAL_DOSES.exec(text)
  if (!block) return []
  const doses: number[] = []
  for (const m of block[1].matchAll(DIAL_NUMBER)) {
    const n = Number(m[1].replace(',', '.'))
    if (Number.isFinite(n) && n > 0 && !doses.includes(n)) doses.push(n)
  }
  return doses
}

// ── Coerência tratamento × caixa (fatia 2, FR-019 · AC6.4 · INV-6) ─────────────────────────────
// Referência = entradas do sidecar 127 do MESMO registro (lidas ao vivo, nunca gravadas no remédio —
// T200 A recusada). Falha fechada: qualquer dado faltando ⇒ `indeterminado` (AC6.4c), nunca `coerente`.
// O resultado só ORDENA as perguntas do card (probableSide); o app não propõe dose (INV-3).

export type CoherenceReason = 'dose' | 'unidade' | 'conc_fora'

export interface CoherenceBox {
  /** Concentração do registro, por 1 mL. */
  perMl: number
  /** `mg/ml` ou `ui/ml`. */
  dosageUnit: string
  /** Unidade de massa da aplicação. */
  unit: 'mg' | 'UI'
  /** Volume de UMA aplicação (`lv`); null na multidose. */
  volumeMl: number | null
  /** Dose de uma aplicação (dose única); null na multidose. */
  dose: number | null
  /** Doses do mostrador (multidose); vazio na dose única. */
  dialDoses: number[]
}

export type CoherenceVerdict =
  | { status: 'coerente' }
  | { status: 'indeterminado' }
  | {
      status: 'incoerente'
      reason: CoherenceReason
      /** null em `conc_fora` (a caixa salva não existe no registro). */
      box: CoherenceBox | null
      /** Dose do tratamento na unidade de massa da caixa (null quando não convertível). */
      doseMass: number | null
      /** Lado provavelmente errado: só ordena as linhas da folha (DS-3). */
      probableSide: 'caixa' | 'dose'
      /** `unidade`: trocar só a unidade deixa coerente (AC6.4b). */
      fixAvailable: boolean
      multidose: boolean
    }

export interface CoherenceTreatmentInput {
  dosage_per_intake: number | string | null | undefined
  intake_unit?: string | null
}

export interface CoherenceMedicineInput {
  presentation: string | null | undefined
  dosage_per_pill: number | string | null | undefined
  dosage_unit: string | null | undefined
  concentration_volume_ml?: number | string | null
  anvisa_registration?: string | null
}

/** Tolerância relativa da comparação de números da caixa (float do cadastro, 0,4466… vs 1,34). */
const COHERENCE_TOLERANCE = 0.01

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= COHERENCE_TOLERANCE * Math.max(Math.abs(a), Math.abs(b))
}

interface StrengthLike {
  d: number | null
  u: string | null
  lv: number | null
  dd: number[]
}

/**
 * `entries` = forças do registro do remédio no sidecar (`strengthEntriesFor`); `null` = sidecar não pronto
 * ou desalinhado ⇒ indeterminado.
 */
export function classifyCoherence(
  t: CoherenceTreatmentInput,
  med: CoherenceMedicineInput,
  entries: StrengthLike[] | null | undefined,
): CoherenceVerdict {
  const INDET: CoherenceVerdict = { status: 'indeterminado' }
  if (!entries || entries.length === 0) return INDET
  if (med.presentation !== 'injetavel') return INDET
  const perMl = toNumber(med.dosage_per_pill)
  if (perMl === null || perMl <= 0 || !med.dosage_unit) return INDET
  const valid = entries.filter((e) => typeof e.d === 'number' && e.d > 0 && !!e.u)
  if (!valid.length) return INDET
  const dose = toNumber(t.dosage_per_intake)
  if (dose === null || dose <= 0) return INDET

  // AC6.4d / RC3 E-5: concentração (valor E unidade) fora do registro ⇒ a caixa está errada; dose não é julgada.
  const match = valid.find((e) => e.u === med.dosage_unit && near(e.d as number, perMl))
  if (!match) {
    return { status: 'incoerente', reason: 'conc_fora', box: null, doseMass: null, probableSide: 'caixa', fixAvailable: false, multidose: false }
  }
  const unit = massUnitOf(med.dosage_unit)
  if (!unit) return INDET

  let box: CoherenceBox
  if (match.lv) {
    const pen = derivePenDose({ presentation: 'injetavel', dosageUnit: med.dosage_unit, perMl: match.d, volumeMl: match.lv })
    if (!pen) return INDET
    box = { perMl: match.d as number, dosageUnit: med.dosage_unit, unit, volumeMl: match.lv, dose: pen.dose, dialDoses: [] }
  } else if (match.dd.length) {
    box = { perMl: match.d as number, dosageUnit: med.dosage_unit, unit, volumeMl: null, dose: null, dialDoses: match.dd }
  } else {
    return INDET // AC6.4c: sem volume de uma aplicação nem mostrador (Ozivy)
  }
  const multidose = box.dose === null
  const fits = (mass: number) => (multidose ? box.dialDoses.some((d) => near(d, mass)) : near(box.dose as number, mass))

  const intake = t.intake_unit ?? null
  // Contagem (sem unidade): 1 aplicação da dose única = a caixa toda.
  if (!intake) {
    if (multidose) return INDET
    return dose === 1 ? { status: 'coerente' } : INDET
  }
  const otherMass = unit === 'mg' ? 'UI' : 'mg'
  if (intake === 'gotas' || intake === otherMass) {
    // AC6.4b: a unidade está errada; [Usar X] só quando, trocada a unidade, fica coerente.
    return { status: 'incoerente', reason: 'unidade', box, doseMass: null, probableSide: 'dose', fixAvailable: fits(dose), multidose }
  }
  const doseMass = intake === 'ml' ? cleanFloat(dose * box.perMl) : intake === unit ? dose : null
  if (doseMass === null) return INDET
  if (fits(doseMass)) return { status: 'coerente' }
  const probableSide = !multidose && (box.dose as number) > doseMass ? 'caixa' : 'dose'
  return { status: 'incoerente', reason: 'dose', box, doseMass, probableSide, fixAvailable: false, multidose }
}

function keyNumber(v: number | string | null | undefined): string {
  const n = toNumber(v)
  return n === null ? '' : String(cleanFloat(n))
}

/** AC6.4a: a confirmação vale para a combinação (registro, concentração, volume, dose, unidades). */
export function coherenceKey(t: CoherenceTreatmentInput, med: CoherenceMedicineInput): string {
  return [
    (med.anvisa_registration ?? '').trim(),
    keyNumber(med.dosage_per_pill),
    med.dosage_unit ?? '',
    keyNumber(med.concentration_volume_ml),
    keyNumber(t.dosage_per_intake),
    t.intake_unit ?? '',
  ].join('|')
}

// ── Fila de setup da Hoje (AC6.1 · AC6.3 · AC6.6 · FR-024) ─────────────────────────────────────

/** Janela do "1º uso": tratamento/remédio criado há até 14 dias (= janela de logs da Hoje). */
export const SETUP_WINDOW_DAYS = 14

export type SetupCardPick =
  | { kind: 'confira'; protocolId: string; verdict: Extract<CoherenceVerdict, { status: 'incoerente' }> }
  | { kind: 'falta'; medicineId: string }
  | { kind: 'cadastrado'; protocolId: string }

export interface PickSetupCardInput {
  /** Tratamentos ativos (em uso e agendados), na ordem de exibição. */
  protocols: Array<{ id: string; created_at?: string | null }>
  /** Tratamentos com algum registro na janela carregada. */
  loggedProtocolIds: Iterable<string>
  /** Veredito por tratamento já SEM os confirmados neste aparelho. */
  verdicts: Record<string, CoherenceVerdict | undefined>
  /** Remédios do dono sem tratamento ativo. */
  orphanMedicines: Array<{ id: string; created_at?: string | null }>
  /** YYYY-MM-DD local (R-020). */
  today: string
}

/** Dias desde a criação (dia local do instante); null quando ausente/inválido ⇒ não elegível (cache antigo). */
function daysSinceCreated(createdAt: string | null | undefined, today: string): number | null {
  if (!createdAt) return null
  const instant = parseISO(createdAt) // instante absoluto (timestamptz); o dia civil vem de formatLocalDate
  if (Number.isNaN(instant.getTime())) return null
  const day = parseLocalDate(formatLocalDate(instant))
  return Math.round((parseLocalDate(today).getTime() - day.getTime()) / 86_400_000)
}

function isRecent(createdAt: string | null | undefined, today: string): boolean {
  const days = daysSinceCreated(createdAt, today)
  return days !== null && days >= 0 && days <= SETUP_WINDOW_DAYS
}

/** Um card por vez: Confira > Falta 1 passo > Tratamento cadastrado (AC6.6). Confira não tem limite de idade. */
export function pickSetupCard(i: PickSetupCardInput): SetupCardPick | null {
  for (const p of i.protocols) {
    const v = i.verdicts[p.id]
    if (v && v.status === 'incoerente') return { kind: 'confira', protocolId: p.id, verdict: v }
  }
  const orphan = i.orphanMedicines.find((m) => isRecent(m.created_at, i.today))
  if (orphan) return { kind: 'falta', medicineId: orphan.id }
  const logged = new Set(i.loggedProtocolIds)
  const fresh = i.protocols.find((p) => !logged.has(p.id) && isRecent(p.created_at, i.today))
  return fresh ? { kind: 'cadastrado', protocolId: fresh.id } : null
}
