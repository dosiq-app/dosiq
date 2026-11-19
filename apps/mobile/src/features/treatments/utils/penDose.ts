// penDose — dose pela embalagem no onboarding (spec 125 1b, FR-013 — simplificada pelo PO no smoke de
// 2026-11-19). A dose por aplicação é da RECEITA: só nasce preenchida quando a caixa escolhida tem rótulo curado
// de dose única (`lv`, hoje o Mounjaro). A regra é do core (`derivePenDose` — INV-6); aqui só a cola.

import { derivePenDose, cleanFloat } from '@dosiq/core'
import type { PenDose } from '@dosiq/core'

/** O que a caixa escolhida traz para a tela da dose. Não é coluna de `medicines` (decisão A, PO 19/11). */
export interface MedicineBox {
  dosageUnit: string | null
  /** Doses que as canetas da concentração marcam ("DOSES 0,25MG E 0,5 MG"); só atalhos de digitação. */
  dialDoses: number[]
}

export function boxFromDraft(draft: any): MedicineBox | null {
  if (!draft) return null
  return {
    dosageUnit: draft.dosage_unit ?? null,
    dialDoses: Array.isArray(draft.dialDoses) ? draft.dialDoses : [],
  }
}

/** A caixa só vale para remédio vindo dela (busca/leitor); o cadastro manual não tem caixa. */
export function boxForSource(source: string | null | undefined, box: MedicineBox | null | undefined): MedicineBox | null {
  return source && source !== 'manual' ? box ?? null : null
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * Concentração por mL e volume do rótulo do remédio do form. O rascunho do onboarding (sem `id`) guarda
 * o valor da CAIXA ("2,5 mg / 0,5 mL" ⇒ 2,5); o remédio salvo guarda POR mL (5 mg/mL + volume 0,5).
 * Volume 1 (ou vazio) = rótulo já por mL.
 */
export function medicineAmounts(medicine: any): { perMl: number | null; volumeMl: number | null; labelAmount: number | null } {
  const volume = num(medicine?.concentration_volume_ml)
  const pill = num(medicine?.dosage_per_pill)
  const saved = Boolean(medicine?.id)
  const hasVolume = volume !== null && volume > 0 && volume !== 1
  if (pill === null) return { perMl: null, volumeMl: hasVolume ? volume : null, labelAmount: null }
  if (!hasVolume) return { perMl: pill, volumeMl: null, labelAmount: null }
  // R-277 (AP-226): multiplicar/dividir concentração vaza dízima (8,333333333333 × 0,6) — limpa na origem.
  return saved
    ? { perMl: pill, volumeMl: volume, labelAmount: cleanFloat(pill * volume) }
    : { perMl: cleanFloat(pill / volume), volumeMl: volume, labelAmount: pill }
}

export interface PenDoseModel {
  /** Dose da caixa de dose única (rótulo curado), ou null — a pessoa digita a da receita. */
  derived: PenDose | null
  /** Atalhos de dose escritos na caixa (só da caixa escolhida). */
  dialDoses: number[]
}

const NONE: PenDoseModel = { derived: null, dialDoses: [] }

/**
 * Com a caixa (busca/leitor) e a mesma concentração: o volume do rótulo no rascunho vem SÓ do `lv` curado
 * (`medicineDraftFromRow`; travado no "Confira") ⇒ dose única = concentração × volume. Sem caixa ⇒ nada.
 */
export function penDoseModel(medicine: any, box: MedicineBox | null): PenDoseModel {
  if (medicine?.presentation !== 'injetavel' || !box) return NONE
  const dosageUnit = medicine?.dosage_unit ?? null
  if (box.dosageUnit !== dosageUnit) return NONE
  const { perMl, volumeMl } = medicineAmounts(medicine)
  return {
    derived: derivePenDose({ presentation: 'injetavel', dosageUnit, perMl, volumeMl }),
    dialDoses: box.dialDoses,
  }
}

/**
 * `dose_source` (FR-020) pelo VALOR final: dose da caixa ou atalho da caixa ⇒ `embalagem`, mesmo que a pessoa
 * tenha digitado e voltado ao número da caixa (smoke 1b C-1b-S2).
 */
export function isPackageDose(model: PenDoseModel, dose: unknown, intakeUnit: string | null): boolean {
  const d = num(dose)
  if (d === null) return false
  if (model.derived && model.derived.dose === d && model.derived.intakeUnit === intakeUnit) return true
  return intakeUnit === 'mg' && model.dialDoses.includes(d)
}
