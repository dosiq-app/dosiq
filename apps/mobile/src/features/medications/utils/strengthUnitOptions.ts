import { DOSAGE_UNIT_LABELS, setupDefaults } from '@dosiq/core'

/** Unidades da dosagem oferecidas pela forma (spec 125, FR-021); a atual entra se estiver fora (remédio antigo não perde o valor). */
export function strengthUnitOptions(presentation: string | null | undefined, current?: string | null) {
  const units = [...setupDefaults(presentation).strengthUnits]
  if (current && !units.includes(current)) units.push(current)
  return units.map((value) => ({ value, label: (DOSAGE_UNIT_LABELS as Record<string, string>)[value] ?? value }))
}
