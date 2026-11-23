// setupCopy — textos e navegação da superfície SETUP da Hoje (spec 125 fatia 2). Puro/testável; os
// componentes (SetupCard, ConfiraSheet, SetupScheduleSheet, TodaySetupSlot) só importam daqui.

import { formatNumberPtBR, describeTreatment, formatConcentration, formatDose, toSetupPresentation } from '@dosiq/core'
import type { StrengthEntry } from '@dosiq/core'
import { navigateCrossTab } from '@navigation/navigateCrossTab'
import { ROUTES } from '@navigation/routes'
import { medicineService } from '@medications/services/medicineService'

const FORM_LABEL: Record<string, string> = {
  comprimido: 'comprimido', capsula: 'cápsula', liquido: 'líquido', injetavel: 'injetável',
  pomada: 'pomada', spray: 'spray', outro: 'outro',
}

export function formLabel(presentation: string | null | undefined): string {
  return FORM_LABEL[toSetupPresentation(presentation)] ?? ''
}

function describeFor(protocol: any, medicine: any, today: string, nowTime?: string) {
  return describeTreatment({
    medicineName: null,
    presentation: medicine?.presentation,
    dosagePerPill: medicine?.dosage_per_pill,
    dosageUnit: medicine?.dosage_unit,
    dose: protocol?.dosage_per_intake,
    intakeUnit: protocol?.intake_unit,
    frequency: protocol?.frequency,
    weekdays: protocol?.weekdays,
    timeSchedule: protocol?.time_schedule,
    intervalDays: protocol?.interval_days,
    startDate: protocol?.start_date,
    today,
    nowTime,
  })
}

function concentrationText(medicine: any): string {
  if (!medicine?.dosage_per_pill) return ''
  return formatConcentration(medicine.dosage_per_pill, medicine.dosage_unit, medicine.concentration_volume_ml ?? null)
}

/**
 * Frase de conferência do tratamento SEM o nome e sem a forma (o nome/forma já estão no título):
 * "0,5 mg · toda segunda às 15:00". Usada pelo card "Tratamento cadastrado" e pelo miolo da L1.
 */
export function treatmentSetupLine(protocol: any, medicine: any, today: string, nowTime?: string) {
  const desc = describeFor(protocol, medicine, today, nowTime)
  const form = formLabel(medicine?.presentation)
  return { line: desc.sentence.split(' · ').filter((part) => part !== form).join(' · '), next: desc.next }
}

export interface SetupRow {
  label: string
  value: string
}

/**
 * Miolo da L1 antes da 1ª dose (PO smoke 20/11): o tratamento em linhas rótulo · valor, para conferir com a
 * receita. 1ª linha = a forma como rótulo e a concentração como valor ("Injetável · 1,34 mg/mL"); depois dose,
 * quando e a 1ª dose. Linha sem dado não entra.
 */
export function treatmentSetupRows(protocol: any, medicine: any, today: string, nowTime?: string): SetupRow[] {
  const desc = describeFor(protocol, medicine, today, nowTime)
  const form = formLabel(medicine?.presentation)
  const conc = concentrationText(medicine)
  const injectable = toSetupPresentation(medicine?.presentation) === 'injetavel'
  const first = desc.next ? desc.next.replace(/^Próxima: /, '') : null
  const rows: Array<SetupRow | null> = [
    form && conc ? { label: form.charAt(0).toUpperCase() + form.slice(1), value: conc } : null,
    desc.dose ? { label: 'Dose', value: desc.dose } : null,
    desc.frequency ? { label: 'Quando', value: desc.frequency } : null,
    first ? { label: injectable ? '1ª aplicação' : '1ª dose', value: first } : null,
  ]
  return rows.filter((r): r is SetupRow => r !== null)
}

const INTAKE_LABEL: Record<string, string> = { mg: 'mg', UI: 'UI', gotas: 'gotas', ml: 'mL' }
const MASCULINE_DAYS = new Set(['sábado', 'domingo'])

function unitLabel(u: string | null): string {
  return u === 'ui/ml' ? 'UI/mL' : u === 'mg/ml' ? 'mg/mL' : u ?? ''
}

/** "2,5 mg" · "Doses da caneta: 0,25 · 0,5 · 1 mg" (DS-5). */
export function boxText(box: any): string {
  if (!box) return ''
  if (box.dose !== null && box.dose !== undefined) return `${formatNumberPtBR(box.dose)} ${box.unit}`
  return `${box.dialDoses.map((d: number) => formatNumberPtBR(d)).join(' · ')} ${box.unit}`
}

export function treatmentDoseText(protocol: any): string {
  const n = Number(protocol?.dosage_per_intake)
  const unit = protocol?.intake_unit ? INTAKE_LABEL[protocol.intake_unit] ?? protocol.intake_unit : null
  return unit ? `${formatNumberPtBR(n)} ${unit}` : formatNumberPtBR(n)
}

/** AC6.2: "A aplicação é toda terça às 08:00?" — semanal com 1 dia; demais cadências pela próxima data. */
export function scheduleQuestion(protocol: any, next: string | null): string | null {
  const noun = protocol?.medicine?.presentation === 'injetavel' ? 'A aplicação' : 'A dose'
  const time = Array.isArray(protocol?.time_schedule) && protocol.time_schedule.length ? [...protocol.time_schedule].sort()[0] : null
  if (protocol?.frequency === 'semanal' && Array.isArray(protocol.weekdays) && protocol.weekdays.length === 1) {
    const day = protocol.weekdays[0]
    return `${noun} é ${MASCULINE_DAYS.has(day) ? 'todo' : 'toda'} ${day}${time ? ` às ${time}` : ''}?`
  }
  if (!next) return null
  return `${next.replace(/^Próxima: /, 'A próxima é ')}?`
}

/** "2,5 mg em 0,5 mL · uma aplicação" (AC6.4). */
export function boxLabel(box: any): string {
  if (!box) return ''
  if (box.dose === null) return `Doses da caneta: ${boxText(box)}`
  return `${formatDose(box.dose, box.unit)} em ${formatDose(box.volumeMl, 'ml')} · uma aplicação`
}

/** Opção da caixa: "5 mg/mL · 2,5 mg em 0,5 mL" (dose única) ou "1,34 mg/mL". */
export function entryLabel(e: StrengthEntry): string {
  const conc = `${formatNumberPtBR(e.d as number)} ${unitLabel(e.u)}`
  if (!e.lv) return conc
  return `${conc} · ${formatConcentration(e.d as number, e.u, e.lv)}`
}

/** Concentração cadastrada: "15 mg/mL" · com volume de dose única: "2,5 mg/0,5 mL" (como no rótulo). */
export function concentrationLabel(medicine: any): string {
  const n = Number(medicine?.dosage_per_pill)
  if (!n) return ''
  return labelText({ d: n, u: medicine?.dosage_unit ?? 'mg/ml', lv: Number(medicine?.concentration_volume_ml) || null } as any)
}

/**
 * Opção como vem escrita no RÓTULO (PO smoke 20/11): dose única ⇒ "2,5 mg/0,5 mL" (conteúdo de uma
 * aplicação — o "5 mg/mL" é conta nossa e não está na caixa); multidose ⇒ "1,34 mg/mL".
 */
export function labelText(e: StrengthEntry): string {
  // Formatador do core (gate 053): o mesmo texto do selo da lista de remédios — "2,5 mg / 0,5 mL".
  return formatConcentration(e.d as number, e.u, e.lv ?? null)
}

/** A opção é a do cadastro atual (concentração ±1% e, na dose única, o mesmo volume). */
export function isCurrentBox(e: StrengthEntry, medicine: any): boolean {
  const cur = Number(medicine?.dosage_per_pill)
  if (!cur || typeof e.d !== 'number') return false
  if (Math.abs(e.d - cur) > cur * 0.01) return false
  if (!e.lv) return true
  return Number(medicine?.concentration_volume_ml) === e.lv
}

/** Troca o 1º horário (o do lembrete perguntado) e mantém os demais, ordenados. */
export function replaceFirstTime(times: string[] | null | undefined, next: string): string[] {
  const sorted = Array.isArray(times) ? [...times].sort() : []
  if (!sorted.length) return [next]
  return [next, ...sorted.slice(1)].filter((t, i, a) => a.indexOf(t) === i).sort()
}

/** "Ajustar" do card e "Editar o tratamento" da folha: um ponto só (matriz de caminhos, analysis-2). */
export function openTreatmentEdit(protocolId: string) {
  navigateCrossTab(ROUTES.TREATMENTS, ROUTES.PROTOCOL_FORM, { id: protocolId })
}

/**
 * "Corrigir forma" (125 2a, AC8.8): a edição do remédio mora na aba Tratamentos. Abre com o remédio
 * COMPLETO (o mapa da Hoje é parcial — laboratório, validade… se perderiam ao salvar, RC3 E-R5-9) e a
 * forma proposta marcada. Falha ao carregar ⇒ false (o card fica; a mutação não roda).
 */
export async function openMedicineEdit(medicineId: string, proposedPresentation: string | null): Promise<boolean> {
  try {
    const medicine = await medicineService.getById(medicineId)
    if (!medicine) return false
    navigateCrossTab(ROUTES.TREATMENTS, ROUTES.MEDICINE_EDIT, { medicine, proposedPresentation })
    return true
  } catch {
    return false
  }
}

/** "Definir agora": criação do tratamento já com o remédio (AC6.3 — nunca o seletor vazio). */
export function openTreatmentCreate(medicineId: string) {
  navigateCrossTab(ROUTES.TREATMENTS, ROUTES.PROTOCOL_FORM, { medicine_id: medicineId })
}
