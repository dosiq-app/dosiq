// Linha do índice CMED → rascunho do cadastro de medicamento (spec 066 Slice A · CON-038).
//
// Só transcreve a caixa: nada aqui grava (INV-1). Regras clínicas:
//   D1  dose = `d` (1º número da APRESENTAÇÃO, já resolvido pelo pipeline)
//   D6  `amb` ⇒ dose em branco, mesmo se o arquivo trouxer `d` (defesa em profundidade, INV-2)
//   D9  força completa para exibição (`strengthLabel`), nunca o escalar truncado
//   D11 genérico: sem registro e sem laboratório no cadastro; laboratório só para exibir
//   C-C10 `amb` ⇒ os valores distintos da força viram escolhas de 1 toque (dose + unidade de cada)

import { DOSAGE_UNITS, normalizeRegulatoryCategory } from '../../schemas/medicineSchema'
import { formatStrength, isLiquidDosageUnit } from '../../utils/doseUnit'
import { normalizeClassCode } from '../trackedMeasure'
import type { CmedRow } from './cmedIndex'
import { packageFromText, presentationFromRow, type InjectionContainer } from './cmedPackage'
import { intakeUnitFromPresentation } from './cmedIntakeUnit'
import { dialDosesFromText } from '../treatmentSetup'

export interface CmedMedicineDraft {
  name: string
  active_ingredient: string
  dosage_per_pill: number | null
  dosage_unit: string | null
  /** Spec 113: volume do rótulo (`lv`) com a dose em razão — mesmo formato de um `medicine` salvo (ADR-066). */
  concentration_volume_ml: number | null
  presentation: string
  laboratory: string | null
  anvisa_registration: string | null
  regulatory_category: string | null
  therapeutic_class: string | null
  /** Spec 100: código CMED normalizado; `null` se ausente ou fora do formato (nunca quebra o cadastro). */
  therapeutic_class_code: string | null
  /** Exibição: força completa ("500 mg + 125 mg"). */
  strengthLabel: string | null
  /** Exibição: laboratório da caixa, inclusive de genérico. */
  displayLaboratory: string | null
  /** Quantidade da caixa (`X <n>`); em líquido é volume, não contagem. */
  boxQuantity: number | null
  /** 066 D2: remédio `/ml` (líquido/injetável) — volume de UMA unidade em mL, lido do texto (C-10). */
  boxVolumeMl: number | null
  /** 066 D2: quantas unidades (frascos, canetas, ampolas…) vêm na caixa. */
  boxUnits: number | null
  /** 066 D2: só injetável — embalagem no vocabulário da compra (caneta, refil, ampola…). */
  boxContainer: InjectionContainer | null
  /** Ordem de dose indecidível: a dose fica em branco e a UI pergunta qual concentração usar. */
  doseAmbiguous: boolean
  /** Só com `doseAmbiguous`: valores distintos da força, na ordem da caixa (C-C10). */
  strengthChoices: CmedStrengthChoice[]
  isGeneric: boolean
  /** 066 E (C-7): unidade da tomada deduzida do texto da caixa (gotas/ml/UI/mg); null em não líquido. */
  intake_unit: string | null
  /** 125 1b (AC5.2): doses do mostrador escritas na caixa ("DOSES 0,25MG E 0,5 MG"); [] sem o trecho. */
  dialDoses: number[]
}


export interface CmedStrengthChoice {
  dose: number
  unit: string
}

const UNIT_SET = new Set<string>(DOSAGE_UNITS)

/** Partes da força com número e unidade do cadastro; repetidas e não reconhecidas ficam de fora. */
export function strengthChoicesFromDs(ds: string | null): CmedStrengthChoice[] {
  if (!ds) return []
  const seen = new Set<string>()
  const choices: CmedStrengthChoice[] = []
  for (const part of ds.split('+')) {
    // O pipeline entrega ponto decimal; a vírgula é defesa contra regressão dele (RC6 #886).
    const match = /^(\d+(?:\.\d+)?) ([^\s]+)$/.exec(part.trim().replace(/^(\d+),(\d)/, '$1.$2'))
    if (!match || !UNIT_SET.has(match[2])) continue
    const dose = Number(match[1])
    const key = `${dose}|${match[2]}`
    if (!Number.isFinite(dose) || seen.has(key)) continue
    seen.add(key)
    choices.push({ dose, unit: match[2] })
  }
  return choices
}

export function medicineDraftFromRow(row: CmedRow): CmedMedicineDraft {
  const isGeneric = row.k === 'generico'
  const unit = row.u !== null && UNIT_SET.has(row.u) ? row.u : null
  const dose = row.amb || unit === null ? null : row.d
  // INV-2: sem dose (amb/unidade estranha) o volume do rótulo não tem o que acompanhar; e só unidade
  // `/ml` tem denominador — o pipeline garante (G30), o app não confia (RC6 #924).
  const volume = dose !== null && isLiquidDosageUnit(unit) ? row.lv : null
  const presentation = presentationFromRow(row.f, row.a)
  const pack = packageFromText(row.a, presentation)
  return {
    name: row.p,
    active_ingredient: row.s,
    dosage_per_pill: dose,
    dosage_unit: unit,
    concentration_volume_ml: volume,
    // C-11: o pipeline marca líquido oral com seringa dosadora como `injetavel`; o texto separa a via.
    presentation,
    laboratory: isGeneric ? null : row.l,
    anvisa_registration: !isGeneric && /^[0-9]{9}$/.test(row.r) ? row.r : null,
    regulatory_category: normalizeRegulatoryCategory(row.k),
    therapeutic_class: row.cn,
    therapeutic_class_code: normalizeClassCode(row.c),
    strengthLabel: formatStrength(row.ds, dose, unit, volume),
    displayLaboratory: row.l,
    boxQuantity: row.q,
    boxVolumeMl: pack.volumeMl,
    boxUnits: pack.units,
    boxContainer: pack.container,
    doseAmbiguous: row.amb,
    strengthChoices: row.amb ? strengthChoicesFromDs(row.ds) : [],
    isGeneric,
    intake_unit: intakeUnitFromPresentation(row.a, unit, presentation),
    dialDoses: presentation === 'injetavel' ? dialDosesFromText(row.a) : [],
  }
}

function sameKey(a: CmedRow, b: CmedRow): boolean {
  return a.ds === b.ds && a.d === b.d && a.u === b.u && a.f === b.f && a.lv === b.lv
}

/**
 * 125 1b (smoke 19/11): pela BUSCA a escolha é da concentração, que junta canetas diferentes (Ozempic 1,5 mL marca
 * 0,25/0,5 mg; 3 mL marca 1 mg). Os atalhos são a UNIÃO das doses escritas nas embalagens dessa concentração —
 * dado da caixa, só para digitar; a dose é da receita.
 */
export function dialDosesForChoice(rows: CmedRow[], chosen: CmedRow): number[] {
  const doses = new Set<number>()
  for (const r of rows.filter((row) => sameKey(row, chosen)).concat(chosen)) {
    if (presentationFromRow(r.f, r.a) !== 'injetavel') continue
    for (const d of dialDosesFromText(r.a)) doses.add(d)
  }
  return [...doses].sort((a, b) => a - b)
}
