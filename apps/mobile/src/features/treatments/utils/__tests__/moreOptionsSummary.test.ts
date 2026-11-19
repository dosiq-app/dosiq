// smoke 1c (PO 19/11): resumo de "Mais opções" fechado mostra o que está preenchido; nome não conta.
jest.mock('@dosiq/core', () => ({ inferMeasure: () => 'nenhum' }))

import { moreOptionsFilled } from '@treatments/utils/moreOptionsSummary'

const base = { values: { tracked_measure: null, frequency: 'diário', end_date: null, notes: '' }, medicine: null }

describe('moreOptionsFilled', () => {
  it('nada preenchido ⇒ vazio (nome e início não contam)', () => {
    expect(moreOptionsFilled(base)).toEqual([])
  })
  it('medida igual à inferida não conta', () => {
    expect(moreOptionsFilled({ ...base, values: { ...base.values, tracked_measure: 'nenhum' } })).toEqual([])
  })
  it('lista na ordem do bloco', () => {
    const items = moreOptionsFilled({
      values: { tracked_measure: 'peso', frequency: 'semanal', end_date: '2026-12-30', notes: ' tomar com água ' },
      medicine: null,
      titrationStepCount: 3,
      plans: [{ id: 'pl1', name: 'Diabetes' }],
      planField: { mode: 'select', planId: 'pl1' },
    })
    expect(items).toEqual(['Acompanhar peso', 'Evolução: 3 etapas', 'Receita até 30/12', 'Plano Diabetes', 'Notas'])
  })
  it('plano novo (inline) usa o nome digitado', () => {
    expect(moreOptionsFilled({ ...base, planField: { mode: 'inline', inline: { name: 'Coração' } } })).toEqual(['Plano Coração'])
  })
})
