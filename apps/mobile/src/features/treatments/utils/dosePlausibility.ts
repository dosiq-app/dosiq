// dosePlausibility — avisos suaves da dose para o onboarding e o form completo (spec 125, AC3.2/AC3.3,
// INV-5: aviso, nunca bloqueio). A regra é do core (`checkDosePlausibility`); aqui só a cola com o remédio.

import { checkDosePlausibility } from '@dosiq/core'
import type { DosePlausibilityWarning } from '@dosiq/core'
import { medicineAmounts } from '@treatments/utils/penDose'

/**
 * Avisos da dose (AC3.2/AC3.3). Conteúdo da caneta = número antes da barra quando o rótulo é de dose
 * única (com volume). O aviso do volume já saiu na dosagem (F-4) — não repete aqui.
 */
export function doseWarnings(medicine: any, dose: unknown, intakeUnit: string | null): DosePlausibilityWarning[] {
  // Smoke 18/11: rascunho (valor da CAIXA) × remédio salvo (POR mL) — normalização única em `penDose`.
  const { perMl, volumeMl, labelAmount: penContent } = medicineAmounts(medicine)
  const hasVolume = volumeMl !== null
  const volume = volumeMl
  const unit = String(medicine?.dosage_unit ?? '')
  // Concentração por 1 mL só quando a dose está na MESMA unidade de massa (mg↔mg/mL, UI↔UI/mL).
  const sameUnit =
    (unit === 'mg/ml' && intakeUnit === 'mg') || (unit === 'ui/ml' && intakeUnit === 'UI') || (unit === 'mg/ml' && intakeUnit === 'ml')
  return checkDosePlausibility({
    dose: dose as any,
    doseUnit: intakeUnit,
    presentation: medicine?.presentation,
    penContent,
    denominatorMl: hasVolume ? volume : null,
    concentrationMgPerMl: sameUnit ? perMl : null,
  }).filter((w) => w.kind !== 'denominator_looks_like_package')
}

export function confirmDoseLabel(warnings: DosePlausibilityWarning[], dose: unknown, intakeUnit: string | null): string {
  const n = String(dose ?? '').replace('.', ',')
  return warnings.some((w) => w.kind === 'looks_like_ml' || w.kind === 'ml_looks_like_drops' || w.kind === 'exceeds_injection_volume') ? `Usar ${n} ${intakeUnit ?? ''} mesmo assim`.replace(/\s+mesmo/, ' mesmo') : 'Sim, confirmo'
}
