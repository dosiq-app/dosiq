// dosePlausibility — avisos suaves da dose para o onboarding e o form completo (spec 125, AC3.2/AC3.3,
// INV-5: aviso, nunca bloqueio). A regra é do core (`checkDosePlausibility`); aqui só a cola com o remédio.

import { checkDosePlausibility } from '@dosiq/core'
import type { DosePlausibilityWarning } from '@dosiq/core'

/**
 * Avisos da dose (AC3.2/AC3.3). Conteúdo da caneta = número antes da barra quando o rótulo é de dose
 * única (com volume). O aviso do volume já saiu na dosagem (F-4) — não repete aqui.
 */
export function doseWarnings(medicine: any, dose: unknown, intakeUnit: string | null): DosePlausibilityWarning[] {
  const volume = num(medicine?.concentration_volume_ml)
  const pill = num(medicine?.dosage_per_pill)
  // Smoke 18/11: rascunho do onboarding (sem `id`) guarda o valor da CAIXA ("2,5 mg / 0,5 mL" ⇒ 2,5); o
  // remédio salvo guarda POR mL (5 mg/mL + volume 0,5). Normaliza os dois para conteúdo e concentração.
  const saved = Boolean(medicine?.id)
  const hasVolume = volume !== null && volume > 0 && volume !== 1
  const penContent = pill !== null && hasVolume ? (saved ? pill * volume : pill) : null
  const perMl = pill !== null ? (hasVolume && !saved ? pill / volume : pill) : null
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

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function confirmDoseLabel(warnings: DosePlausibilityWarning[], dose: unknown, intakeUnit: string | null): string {
  const n = String(dose ?? '').replace('.', ',')
  return warnings.some((w) => w.kind === 'looks_like_ml' || w.kind === 'ml_looks_like_drops' || w.kind === 'exceeds_injection_volume') ? `Usar ${n} ${intakeUnit ?? ''} mesmo assim`.replace(/\s+mesmo/, ' mesmo') : 'Sim, confirmo'
}
