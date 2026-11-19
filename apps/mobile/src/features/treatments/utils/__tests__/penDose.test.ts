// penDose — cola mobile da dose pela embalagem (spec 125 1b simplificada no smoke 19/11, PO-125-9/10/11).
import { boxFromDraft, boxForSource, medicineAmounts, penDoseModel, isPackageDose } from '../penDose'

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

// Rascunho do onboarding: valor da CAIXA (2,5) + volume do rótulo curado (`lv` 0,5).
const MOUNJARO = { presentation: 'injetavel', dosage_per_pill: '2.5', dosage_unit: 'mg/ml', concentration_volume_ml: '0.5' }
const OZEMPIC = { presentation: 'injetavel', dosage_per_pill: '1.34', dosage_unit: 'mg/ml', concentration_volume_ml: '' }
const BOX_MG = { dosageUnit: 'mg/ml', dialDoses: [] as number[] }
const BOX_OZ = { dosageUnit: 'mg/ml', dialDoses: [0.25, 0.5, 1] }

describe('medicineAmounts — rascunho (valor da caixa) × salvo (por mL)', () => {
  it('rascunho 2,5 mg / 0,5 mL ⇒ 5 por mL; salvo 5 mg/mL + 0,5 ⇒ rótulo 2,5', () => {
    expect(medicineAmounts(MOUNJARO)).toEqual({ perMl: 5, volumeMl: 0.5, labelAmount: 2.5 })
    expect(medicineAmounts({ ...MOUNJARO, id: 'm1', dosage_per_pill: 5 })).toEqual({ perMl: 5, volumeMl: 0.5, labelAmount: 2.5 })
  })
  it('sem volume ou volume 1 ⇒ rótulo já por mL; sem dose ⇒ perMl null', () => {
    expect(medicineAmounts(OZEMPIC)).toEqual({ perMl: 1.34, volumeMl: null, labelAmount: null })
    expect(medicineAmounts({ dosage_per_pill: '1.34', concentration_volume_ml: 1 })).toEqual({ perMl: 1.34, volumeMl: null, labelAmount: null })
    expect(medicineAmounts({ dosage_per_pill: '', concentration_volume_ml: '0.5' })).toEqual({ perMl: null, volumeMl: 0.5, labelAmount: null })
  })
})

describe('penDoseModel', () => {
  it('Mounjaro pela caixa (lv) ⇒ 2,5 mg, sem pergunta (PO-125-9)', () => {
    expect(penDoseModel(MOUNJARO, BOX_MG)).toEqual({ derived: { dose: 2.5, intakeUnit: 'mg' }, dialDoses: [] })
  })
  it('Ozempic pela caixa ⇒ sem dose; atalhos da caixa (PO-125-10)', () => {
    expect(penDoseModel(OZEMPIC, BOX_OZ)).toEqual({ derived: null, dialDoses: [0.25, 0.5, 1] })
  })
  it('PO-125-11: sem caixa (manual, ex.: Lipoless 2,5 mg / 0,6 mL) ⇒ nada', () => {
    const lipoless = { ...MOUNJARO, concentration_volume_ml: '0.6' }
    expect(penDoseModel(lipoless, null)).toEqual({ derived: null, dialDoses: [] })
    expect(penDoseModel(lipoless, boxForSource('manual', BOX_MG))).toEqual({ derived: null, dialDoses: [] })
  })
  it('concentração trocada (unidade ≠ da caixa) ou não injetável ⇒ nada', () => {
    expect(penDoseModel({ ...MOUNJARO, dosage_unit: 'ui/ml' }, BOX_MG).derived).toBeNull()
    expect(penDoseModel({ ...MOUNJARO, presentation: 'comprimido' }, BOX_MG).derived).toBeNull()
  })
})

describe('boxFromDraft / boxForSource', () => {
  it('rascunho CMED ⇒ unidade + atalhos; nulo ⇒ null', () => {
    expect(boxFromDraft({ dosage_unit: 'mg/ml', dialDoses: [1] })).toEqual({ dosageUnit: 'mg/ml', dialDoses: [1] })
    expect(boxFromDraft({ dosage_unit: 'mg/ml' })).toEqual({ dosageUnit: 'mg/ml', dialDoses: [] })
    expect(boxFromDraft(null)).toBeNull()
  })
  it('só vale para origem da caixa', () => {
    expect(boxForSource('anvisa_search', BOX_MG)).toBe(BOX_MG)
    expect(boxForSource('scan', BOX_MG)).toBe(BOX_MG)
    expect(boxForSource('manual', BOX_MG)).toBeNull()
    expect(boxForSource(null, BOX_MG)).toBeNull()
  })
})

describe('isPackageDose — dose_source pelo valor final (smoke 1b C-1b-S2)', () => {
  it('dose final = da caixa ⇒ embalagem, mesmo depois de digitar e voltar', () => {
    const m = penDoseModel(MOUNJARO, BOX_MG)
    expect(isPackageDose(m, 2.5, 'mg')).toBe(true)
    expect(isPackageDose(m, '2,5', 'mg')).toBe(true)
    expect(isPackageDose(m, 5, 'mg')).toBe(false)
    expect(isPackageDose(m, 2.5, 'ml')).toBe(false)
    expect(isPackageDose(m, '', 'mg')).toBe(false)
  })
  it('atalho da caixa ⇒ embalagem; outra dose ⇒ não', () => {
    const m = penDoseModel(OZEMPIC, BOX_OZ)
    expect(isPackageDose(m, 0.5, 'mg')).toBe(true)
    expect(isPackageDose(m, 0.75, 'mg')).toBe(false)
  })
})
