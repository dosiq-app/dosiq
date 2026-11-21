import { describe, it, expect } from '@jest/globals'
import { treatmentSetupRows } from '@dashboard/utils/setupCopy'

const ozempic = { presentation: 'injetavel', dosage_per_pill: 1.34, dosage_unit: 'mg/ml', concentration_volume_ml: null }
const weekly = { dosage_per_intake: 0.5, intake_unit: 'mg', frequency: 'semanal', weekdays: ['segunda'], time_schedule: ['15:00'], start_date: '2026-11-20' }

describe('treatmentSetupRows (miolo da L1, 125 fatia 2)', () => {
  it('injetável: forma como rótulo, dose, quando e 1ª aplicação', () => {
    const rows = treatmentSetupRows(weekly, ozempic, '2026-11-20')
    expect(rows.map((r) => r.label)).toEqual(['Injetável', 'Dose', 'Quando', '1ª aplicação'])
    expect(rows[2].value).toContain('segunda')
    expect(rows[3].value).toMatch(/^segunda, 23\/11/)
  })

  it('comprimido: "1ª dose"; linha sem dado não entra', () => {
    const pill = { presentation: 'comprimido', dosage_per_pill: null, dosage_unit: 'mg' }
    const rows = treatmentSetupRows({ ...weekly, frequency: 'diário', dosage_per_intake: 1, intake_unit: null }, pill, '2026-11-20', '07:00')
    expect(rows.map((r) => r.label)).toEqual(['Dose', 'Quando', '1ª dose'])
  })
})
