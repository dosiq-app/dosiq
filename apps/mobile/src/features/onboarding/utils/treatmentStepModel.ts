// treatmentStepModel — regras de tela do passo "quando" do onboarding (spec 125, T014). As regras de
// domínio vêm do core (`setupDefaults`, `checkDosePlausibility`, `anchorFromApplication` — INV-6);
// aqui só a cola com os valores do form.

import { setupDefaults, INTAKE_UNIT_LABELS, MONTHLY_CHOICE } from '@dosiq/core'
import type { SetupDefaults } from '@dosiq/core'

export { doseWarnings, confirmDoseLabel } from '@treatments/utils/dosePlausibility'

// 125 (AC2.5/FR-021): chips na ordem da forma; Mensal em toda forma (emenda PO 18/11). 1c (PO 19/11): sem a
// trava 086 também no form completo — o kill switch da v0.35 tira de circulação o app que não entende a cadência.
const SEGMENT_LABEL: Record<string, string> = {
  diário: 'Todo dia',
  dias_alternados: 'Dias alternados',
  semanal: 'Semanal', // PO smoke 18/11: faz par com "Mensal" e cabe em 2 linhas no aparelho pequeno
  [MONTHLY_CHOICE]: 'Mensal', // PO smoke 18/11: "a cada 30 dias" fica subentendido
  quando_necessário: 'Quando precisar',
}

export function frequencySegments(defaults: SetupDefaults): { choice: string; label: string }[] {
  return defaults.frequencyOrder
    .filter((c) => c in SEGMENT_LABEL)
    .map((choice) => ({ choice, label: SEGMENT_LABEL[choice] }))
}

/**
 * 1c (AC7.1): chips de frequência do form completo — as escolhas de sempre (`cadenceChoicesFor`, inclui a
 * frequência legada do tratamento), na ordem da forma; o que a forma não ordena vai ao fim, nunca some.
 */
export function orderedCadenceChips(
  choices: string[],
  presentation: string | null | undefined,
  fallbackLabel: (choice: string) => string,
): { value: string; label: string }[] {
  const order = setupDefaults(presentation).frequencyOrder as string[]
  const rank = (c: string) => {
    const i = order.indexOf(c)
    return i === -1 ? order.length : i
  }
  return [...choices]
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i)
    .map(({ c }) => ({ value: c, label: SEGMENT_LABEL[c] ?? fallbackLabel(c) }))
}

export function treatmentDefaults(medicine: any): SetupDefaults {
  return setupDefaults(medicine?.presentation, medicine?.dosage_unit)
}

/** Pergunta da dose com a unidade da tomada ("Quanto aplica de cada vez? (mg)"); null = sem campo. */
export function doseLabel(defaults: SetupDefaults, intakeUnit: string | null): string | null {
  if (!defaults.doseQuestion) return null
  return intakeUnit ? `${defaults.doseQuestion} (${INTAKE_UNIT_LABELS[intakeUnit] ?? intakeUnit})` : defaults.doseQuestion
}

/** Injetável com cadência não diária pergunta o dia da aplicação (AC2.5b). */
export function asksApplicationDay(presentation: string | null | undefined, frequency: unknown): boolean {
  return presentation === 'injetavel' && (frequency === 'semanal' || frequency === 'intervalo_dias' || frequency === 'dias_alternados')
}

/**
 * FR-020: `embalagem` = dose não tocada de remédio vindo da caixa/lista; `manual` = digitada ou de
 * remédio digitado à mão. (A 1b pré-monta a dose pela caixa — aí o `embalagem` ganha peso.)
 */
export function doseSource(typed: boolean, medicineSource: string | null | undefined): 'embalagem' | 'manual' {
  return !typed && medicineSource && medicineSource !== 'manual' ? 'embalagem' : 'manual'
}
