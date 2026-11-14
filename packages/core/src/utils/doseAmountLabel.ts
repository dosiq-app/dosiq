/**
 * doseAmountLabel — quantidade da dose para texto de aviso (spec 120, D-9).
 *
 * Fonte única do "50 mg" · "2 × 25 mcg" · "20 gotas" para o push do servidor (fatia B), o alarme
 * local e a prévia do push no app (fatia A). Antes vivia só no servidor; uma cópia no app faria o
 * push e o alarme da MESMA dose escreverem a dose de jeitos diferentes.
 *
 * @module doseAmountLabel
 */

import { DOSAGE_UNIT_LABELS } from '../schemas/medicineSchema'
import { INTAKE_UNIT_LABELS } from '../schemas/protocolSchema'

/** Separador entre partes do corpo do aviso ("50 mg · 08:00"). */
export const DOSE_DETAIL_SEP = ' · '

// 120 B (smoke C-B1): espaço inquebrável DENTRO da dose — a quebra de linha só cai entre itens,
// nunca em "Selozok 2 / × 25 mg".
const NBSP = ' '

const formatNumber = (n: number): string => String(n).replace('.', ',')

const isPositive = (n: number | undefined | null): n is number => n !== undefined && n !== null && n > 0

const unitLabelOf = (labels: Record<string, string>, unit: string): string => labels?.[unit] || unit

/**
 * Quantidade da dose, sem o nome do remédio. Sem nenhuma informação de dose ⇒ null (o corpo fica
 * só com a hora).
 */
export function formatDoseAmount(
  qty: number | undefined | null,
  dosagePerPill: number | undefined | null,
  unit: string | undefined | null,
  intakeUnit: string | undefined | null,
  dosage?: string | null
): string | null {
  // Líquidos (022): unidade de tomada real (gotas/ml/UI), sem a concentração.
  if (intakeUnit && isPositive(qty)) {
    return `${formatNumber(qty)}${NBSP}${unitLabelOf(INTAKE_UNIT_LABELS as Record<string, string>, intakeUnit)}`
  }
  if (isPositive(dosagePerPill) && unit) {
    // 012 Fase D (FR-015b c): case canônico do acrônimo ('ui' → 'UI'); sem label → unit cru.
    const strength = `${formatNumber(dosagePerPill)}${NBSP}${unitLabelOf(DOSAGE_UNIT_LABELS as Record<string, string>, unit)}`
    return isPositive(qty) && qty !== 1 ? `${formatNumber(qty)}${NBSP}×${NBSP}${strength}` : strength
  }
  if (dosage) return dosage
  return isPositive(qty) ? `${formatNumber(qty)}${NBSP}un.` : null
}

export type DoseAmountItem = {
  medicineName: string
  dosagePerIntake?: number | null
  dosagePerPill?: number | null
  dosageUnit?: string | null
  intakeUnit?: string | null
}

/** "Losartana 50 mg" — item de lista de doses simultâneas. */
export function formatDoseListItem(d: DoseAmountItem): string {
  const amount = formatDoseAmount(d.dosagePerIntake, d.dosagePerPill, d.dosageUnit, d.intakeUnit)
  return amount ? `${d.medicineName} ${amount}` : d.medicineName
}
