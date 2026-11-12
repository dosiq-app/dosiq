// formatStepDoseShort — rótulo curto da faixa do gráfico de peso por etapa (o que a titulação muda).
// Casos das escadas reais usadas na decisão de 2026-11-12 (Rybelsus, Selozok, Ozempic, Mounjaro, Lantus).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatStepDose, formatStepDoseShort } from '../reportFormat'
import { activeIngredientParts, formatActiveIngredientShort } from '../../../utils/doseUnit'

const med = (dosage_per_pill: number | null, dosage_unit: string, units_per_ml: number | null = null) => ({
  dosage_per_pill,
  dosage_unit,
  units_per_ml,
})

describe('formatStepDoseShort', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.clearAllTimers()
  })

  it.each([
    // [nome, dose, intake_unit, medicine, esperado]
    ['Rybelsus 3 mg', 1, 'cp', med(3, 'mg'), { value: '3', unit: 'mg' }],
    ['Rybelsus 14 mg', 1, 'cp', med(14, 'mg'), { value: '14', unit: 'mg' }],
    ['Selozok 2 cp de 25 mg', 2, 'cp', med(25, 'mg'), { value: '50', unit: 'mg' }],
    ['Ozempic 0,25 mg (caneta mg/ml)', 0.25, 'mg', med(1.34, 'mg/ml', 20), { value: '0,25', unit: 'mg' }],
    ['Mounjaro 12,5 mg', 12.5, 'mg', med(25, 'mg/ml'), { value: '12,5', unit: 'mg' }],
    ['Lantus 10 UI', 10, 'UI', med(100, 'ui/ml', 100), { value: '10', unit: 'UI' }],
    ['líquido em gotas fica na contagem', 20, 'gotas', med(2.5, 'mg/ml'), { value: '20', unit: 'gotas' }],
  ])('%s', (_n, dose, intake_unit, medicine, expected) => {
    expect(formatStepDoseShort({ dose, intake_unit } as never, null, medicine as never)).toEqual(expected)
  })

  it('comprimido sem concentração cadastrada cai na contagem', () => {
    expect(formatStepDoseShort({ dose: 2, intake_unit: 'cp' } as never, null, med(null, 'mg') as never)).toEqual({
      value: '2',
      unit: 'comprimidos',
    })
  })

  it('dose nula ou inválida ⇒ null', () => {
    expect(formatStepDoseShort({ dose: null, intake_unit: 'cp' } as never, null, med(14, 'mg') as never)).toBeNull()
    expect(formatStepDoseShort({ dose: 'abc', intake_unit: 'cp' } as never, null, med(14, 'mg') as never)).toBeNull()
  })

  it('a massa curta é a mesma do rótulo longo (núcleo único)', () => {
    const step = { dose: 2, intake_unit: 'cp' } as never
    const m = med(25, 'mg') as never
    const short = formatStepDoseShort(step, null, m)
    expect(formatStepDose(step, null, m)).toContain(`(${short?.value} ${short?.unit})`)
  })
})

describe('activeIngredientParts × formatActiveIngredientShort', () => {
  it.each([
    [2, 600, 'mg'],
    [1.5, 100, 'ui'],
    [3, 1, 'gotas'],
    [1, null, 'mg'],
    [0.5, '0,1', 'mg'],
  ])('Short(%s, %s, %s) é exatamente Parts unido', (qty, dpp, unit) => {
    const parts = activeIngredientParts(qty, dpp as never, unit)
    expect(formatActiveIngredientShort(qty, dpp as never, unit)).toBe(parts ? `${parts.value} ${parts.unit}`.trim() : '')
  })
})
