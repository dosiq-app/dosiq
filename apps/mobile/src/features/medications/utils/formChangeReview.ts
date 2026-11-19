// formChangeReview — fila da folha "A dose de {tratamento} pode ter mudado" (spec 125, AC7.5 · AC7.10).
//
// Depois de salvar a edição de um remédio, cada tratamento ATIVO dele entra na fila quando:
//   - a forma mudou (comprimido → injetável: a dose salva muda de sentido), ou
//   - a dose salva passou a ter um aviso que não tinha antes (ex.: a concentração caiu e a dose agora
//     passa da caneta). Aviso que já existia não reabre nada — editar só o nome não incomoda.
// Nada muda na dose daqui (INV-2): a fila só aponta o que revisar. Avisos pela regra única do core
// (`doseWarnings` → `checkDosePlausibility`), nunca cópia (AC7.10).

import { PRESENTATION_LABELS } from '@dosiq/core'
import type { DosePlausibilityWarning } from '@dosiq/core'
import { doseWarnings } from '@treatments/utils/dosePlausibility'

export interface FormChangeReviewItem {
  protocol: any
  formChanged: boolean
  fromLabel: string
  toLabel: string
  warnings: DosePlausibilityWarning[]
}

const NO_FORM = 'sem forma informada'

/** Rótulo da forma em minúsculas para a frase da folha ("de comprimido para injetável"). */
export function presentationLabel(presentation: unknown): string {
  const label = (PRESENTATION_LABELS as Record<string, string>)[String(presentation ?? '')]
  return label ? label.toLowerCase() : NO_FORM
}

function warningsFor(medicine: any, protocol: any): DosePlausibilityWarning[] {
  const dose = protocol?.dosage_per_intake
  if (dose === null || dose === undefined || String(dose).trim() === '' || Number(dose) <= 0) return []
  return doseWarnings(medicine, dose, protocol?.intake_unit ?? null)
}

/**
 * @param before remédio como estava salvo (route param do form)
 * @param after  remédio como foi salvo (payload normalizado — mesma forma do banco)
 * @param protocols tratamentos do remédio (`protocolService.getByMedicineId`); inativos ficam fora
 */
export function reviewQueue({ before, after, protocols }: { before: any; after: any; protocols: any[] | null | undefined }): FormChangeReviewItem[] {
  if (!Array.isArray(protocols) || protocols.length === 0) return []
  const formChanged = (before?.presentation ?? null) !== (after?.presentation ?? null)
  const fromLabel = presentationLabel(before?.presentation)
  const toLabel = presentationLabel(after?.presentation)
  const items: FormChangeReviewItem[] = []
  for (const protocol of protocols) {
    if (!protocol || protocol.active === false) continue
    const previous = new Set(warningsFor(before, protocol).map((w) => w.kind))
    const warnings = warningsFor(after, protocol)
    const newWarning = warnings.some((w) => !previous.has(w.kind))
    if (formChanged || newWarning) items.push({ protocol, formChanged, fromLabel, toLabel, warnings })
  }
  return items
}

/** Texto da folha (hi-fi R-4 · AC7.5). */
export function formChangeBody(item: FormChangeReviewItem): string {
  const lead = item.formChanged
    ? `A forma passou de ${item.fromLabel} para ${item.toLabel}.`
    : 'A dosagem do remédio mudou.'
  return `${lead} Revise a dose do tratamento antes do próximo lembrete.`
}
