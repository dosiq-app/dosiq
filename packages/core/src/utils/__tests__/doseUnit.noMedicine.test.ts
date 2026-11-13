// Fallback de formatIntakeDose SEM cadastro de medicamento — comportamento DOCUMENTADO, não bug a corrigir.
//
// Decisão PO 2026-11-12 (triagem do RC6 do #943): sem `medicine` (ou com cadastro não líquido sem
// concentração), a dose sai como "<qty> un." mesmo com unidade de tomada explícita (mg/UI/gotas/mL).
// NÃO alterar sem caso real:
//   - Em prod (2026-11-12) há ZERO tratamentos/etapas com unidade explícita em medicamento não líquido,
//     e zero etapas sem medicamento — unidade explícita só existe em líquido, onde o helper a respeita.
//   - `medicine` nulo aqui é defeito do CHAMADOR (select/join sem o cadastro); o conserto é trazer o dado,
//     não o helper adivinhar a unidade.
//   - O helper alimenta ~30 superfícies (push, Live Activity, alarme, chatbot, PDF); mudar o fallback sem
//     ocorrência real é risco sem retorno.
// A forma curta da faixa (formatStepDoseShort) espelha este fallback de propósito: rótulo e faixa não divergem.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatIntakeDose } from '../doseUnit'
import { formatStepDose, formatStepDoseShort } from '../../services/report/reportFormat'

describe('formatIntakeDose sem cadastro de medicamento (fallback documentado)', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.clearAllTimers()
  })

  it.each([
    [2.5, 'mg', '2,5 un.'],
    [10, 'UI', '10 un.'],
    [20, 'gotas', '20 un.'],
  ])('%s %s sem medicine ⇒ "%s"', (qty, unit, expected) => {
    expect(formatIntakeDose(qty, unit, null)).toBe(expected)
  })

  it('com cadastro líquido a unidade explícita é respeitada (o caso que existe em prod)', () => {
    expect(formatIntakeDose(10, 'UI', { dosage_unit: 'ui/ml', dosage_per_pill: 100, units_per_ml: 100 })).toBe(
      '10 UI (≈ 0,1 mL)'
    )
  })

  it('a forma curta da etapa espelha o rótulo longo no mesmo fallback', () => {
    const step = { dose: 2.5, intake_unit: 'mg' } as never
    expect(formatStepDose(step, null, null)).toBe('2,5 un.')
    expect(formatStepDoseShort(step, null, null)).toEqual({ value: '2,5', unit: 'un.' })
  })
})
