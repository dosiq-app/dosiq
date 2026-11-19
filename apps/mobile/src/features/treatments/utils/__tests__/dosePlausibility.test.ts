// dosePlausibility — cola remédio → regra do core (spec 125, AC3.2/AC3.3 + emendas do smoke 18/11).
// O rascunho do onboarding (sem `id`) guarda o valor da CAIXA; o remédio salvo guarda POR mL.
import { doseWarnings, confirmDoseLabel } from '../dosePlausibility'

const kinds = (ws: { kind: string }[]) => ws.map((w) => w.kind)

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('doseWarnings — normalização rascunho × salvo', () => {
  it('caneta 2,5 mg / 0,5 mL: rascunho e salvo dão o mesmo aviso para 5 mg (passa da caneta)', () => {
    const draft = { presentation: 'injetavel', dosage_per_pill: '2.5', dosage_unit: 'mg/ml', concentration_volume_ml: '0.5' }
    const saved = { id: 'm-1', presentation: 'injetavel', dosage_per_pill: '5', dosage_unit: 'mg/ml', concentration_volume_ml: '0.5' }
    expect(kinds(doseWarnings(draft, 5, 'mg'))).toContain('exceeds_pen')
    expect(kinds(doseWarnings(saved, 5, 'mg'))).toContain('exceeds_pen')
  })

  it('Ozempic salvo (1,34 mg/mL) com 5 mg ⇒ volume de aplicação > 1 mL; 0,5 mg sem aviso', () => {
    const med = { id: 'm-2', presentation: 'injetavel', dosage_per_pill: '1.34', dosage_unit: 'mg/ml', concentration_volume_ml: null }
    expect(kinds(doseWarnings(med, 5, 'mg'))).toContain('exceeds_injection_volume')
    expect(doseWarnings(med, 0.5, 'mg')).toEqual([])
  })

  it('líquido 500 mg/mL com 15 mL ⇒ parece gotas; 50 mg/mL × 15 mL sem aviso', () => {
    const conc = { presentation: 'liquido', dosage_per_pill: '500', dosage_unit: 'mg/ml' }
    const dil = { presentation: 'liquido', dosage_per_pill: '50', dosage_unit: 'mg/ml' }
    expect(kinds(doseWarnings(conc, 15, 'ml'))).toContain('ml_looks_like_drops')
    expect(doseWarnings(dil, 15, 'ml')).toEqual([])
  })

  it('volume que parece embalagem não repete aqui (já saiu na dosagem)', () => {
    const med = { presentation: 'liquido', dosage_per_pill: '40', dosage_unit: 'mg/ml', concentration_volume_ml: '20' }
    expect(kinds(doseWarnings(med, 20, 'gotas'))).not.toContain('denominator_looks_like_package')
  })
})

describe('confirmDoseLabel', () => {
  it('avisos de unidade/volume ⇒ "Usar X mesmo assim"; outros ⇒ "Sim, confirmo"', () => {
    expect(confirmDoseLabel([{ kind: 'ml_looks_like_drops' } as any], 15, 'ml')).toBe('Usar 15 ml mesmo assim')
    expect(confirmDoseLabel([{ kind: 'exceeds_injection_volume' } as any], 5, 'mg')).toBe('Usar 5 mg mesmo assim')
    expect(confirmDoseLabel([{ kind: 'exceeds_pen' } as any], 5, 'mg')).toBe('Sim, confirmo')
  })
})
