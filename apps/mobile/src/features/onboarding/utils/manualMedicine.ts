// Remédio do caminho manual do onboarding (spec 125, FR-004/FR-005): forma explícita, nunca derivada
// da unidade. Pomada/spray sem força gravam `dosage_unit='un'` e força vazia (PO 2026-11-17, C-3).
import { setupDefaults } from '@dosiq/core'

export interface ManualMedicineInput {
  name: string
  presentation: string
  dosage_per_pill?: string | null
  dosage_unit?: string | null
  concentration_volume_ml?: string | null
}

export function buildManualMedicine(input: ManualMedicineInput): Record<string, unknown> {
  const defaults = setupDefaults(input.presentation)
  const unit = input.dosage_unit || defaults.fixedDosageUnit
  return {
    type: 'medicamento',
    name: input.name.trim(),
    presentation: input.presentation,
    dosage_unit: unit,
    dosage_per_pill: input.dosage_per_pill ?? null,
    concentration_volume_ml: input.concentration_volume_ml ?? null,
  }
}

/** Unidade da tomada pela forma × unidade (C-2): injetável mg/mL ⇒ mg; caneta mg/UI ⇒ null (aplicações). */
export function manualIntakeUnit(presentation: string | null | undefined, dosageUnit: string | null | undefined): string | null {
  return setupDefaults(presentation, dosageUnit).intakeUnits[0] ?? null
}

/** Forma sem pergunta de dosagem (pomada): o nome já completa o remédio. */
export function skipsStrength(presentation: string | null | undefined): boolean {
  return setupDefaults(presentation).strengthUnits.length === 0
}
