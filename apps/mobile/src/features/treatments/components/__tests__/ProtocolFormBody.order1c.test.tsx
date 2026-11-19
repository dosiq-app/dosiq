// 125 1c (PO-125-18 · AC7.1/AC7.2) — form de tratamento na ordem do onboarding:
// Remédio › Dose › Quando › Confira o seu tratamento › Lembrete › "Mais opções" (FECHADO).
// Os campos que descem não mudam de comportamento; erro visível num deles abre o bloco sozinho.

import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import ProtocolFormBody from '../ProtocolFormBody'

function makeForm(values = {}, extra: Record<string, unknown> = {}) {
  return {
    values: { name: 'Losartana', dosage_per_intake: 1, time_schedule: ['08:00'], frequency: 'diário', ...values },
    errors: {},
    touched: {},
    setValue: jest.fn(),
    setFieldValue: jest.fn(),
    handleChange: jest.fn(),
    setValues: jest.fn(),
    handleBlur: jest.fn(),
    ...extra,
  }
}

const LOSARTANA = { id: 'm1', name: 'Losartana', dosage_unit: 'mg', dosage_per_pill: 25, presentation: 'comprimido' }

const baseProps = {
  medicine: LOSARTANA,
  onOpenMedicineSheet: jest.fn(),
  onOpenTitration: jest.fn(),
  isEditMode: true,
  plans: [],
  planField: { mode: 'select', planId: null, inline: null },
  onPlanFieldChange: jest.fn(),
  onDoseChange: jest.fn(),
  onStartDateChange: jest.fn(),
  onEndDateChange: jest.fn(),
  titrationStepCount: 0,
  titrationSteps: [],
}

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('PO-125-18 — ordem do form de tratamento', () => {
  it('seções na ordem do onboarding, com Lembrete depois do Confere', () => {
    const utils = render(<ProtocolFormBody {...baseProps} form={makeForm()} />)
    const titles = utils
      .getAllByText(/^(Remédio|Dose|Quando|Confira o seu tratamento|Lembrete)( \*)?$/)
      .map((el) => [].concat(el.props.children)[0])
    expect(titles).toEqual(['Remédio', 'Dose', 'Quando', 'Confira o seu tratamento', 'Lembrete'])
  })

  it('dose pergunta pela forma (comprimido: "Quantos comprimidos por vez?")', () => {
    const utils = render(<ProtocolFormBody {...baseProps} form={makeForm()} />)
    expect(utils.getByText(/Quantos comprimidos/)).toBeTruthy()
  })

  it('"Mais opções" nasce fechado: nome, período, plano, notas e evolução escondidos; abre ao toque', () => {
    const utils = render(<ProtocolFormBody {...baseProps} form={makeForm()} />)
    expect(utils.queryByText('Nome do tratamento')).toBeNull()
    expect(utils.queryByText('Receita médica')).toBeNull()
    expect(utils.queryByText('Notas')).toBeNull()
    expect(utils.getByText(/Acompanhar · Evolução · Receita médica · Nome · Plano · Notas/)).toBeTruthy()
    fireEvent.press(utils.getByTestId('more-options'))
    expect(utils.getByText('Receita médica')).toBeTruthy()
    expect(utils.getByText(/Nome do tratamento/)).toBeTruthy()
    expect(utils.queryByText('Prescrição')).toBeNull()
  })

  it('erro visível num campo de "Mais opções" (nome vazio) abre o bloco sozinho', () => {
    const form = makeForm({ name: '' }, { errors: { name: 'Nome do protocolo deve ter pelo menos 2 caracteres' }, touched: { name: true } })
    const utils = render(<ProtocolFormBody {...baseProps} form={form} />)
    expect(utils.getByText(/Nome do tratamento/)).toBeTruthy()
  })

  it('sem "Editar remédio" no form do tratamento (smoke 1c: remédio errado = Trocar)', () => {
    const utils = render(<ProtocolFormBody {...baseProps} form={makeForm()} />)
    expect(utils.queryByText('Editar remédio')).toBeNull()
  })

  it('edição com algo preenchido: "Mais opções" já abre; criação com o mesmo dado nasce fechada (smoke 1c)', () => {
    const edit = render(<ProtocolFormBody {...baseProps} form={makeForm({ notes: 'com água' })} />)
    expect(edit.getByTestId('more-options').props.accessibilityState.expanded).toBe(true)
    const create = render(<ProtocolFormBody {...baseProps} isEditMode={false} form={makeForm({ notes: 'com água' })} />)
    expect(create.getByTestId('more-options').props.accessibilityState.expanded).toBe(false)
    expect(create.getByText('Notas')).toBeTruthy()
  })

  it('a frase de conferência aparece na edição (AC7.1)', () => {
    const utils = render(<ProtocolFormBody {...baseProps} form={makeForm()} />)
    expect(utils.getByTestId('treatment-sentence-card')).toBeTruthy()
  })
})
