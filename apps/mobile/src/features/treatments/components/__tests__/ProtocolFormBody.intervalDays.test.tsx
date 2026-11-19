// 085 C2 — campo N da cadência "a cada N dias" no formulário mobile.
//
// Trava: o campo só existe com `intervalo_dias`; o texto vira NÚMERO antes de ir ao form (o Zod
// valida número — string faria o erro chegar em inglês, ou 23514 do banco); vazio vira null, e o
// refine do schema pede o valor em PT.

import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import ProtocolFormBody from '../ProtocolFormBody'

function makeForm(values = {}) {
  return {
    values: { name: '', dosage_per_intake: 1, time_schedule: ['08:00'], frequency: 'diário', ...values },
    errors: {},
    touched: {},
    setValue: jest.fn(),
    setFieldValue: jest.fn(),
    handleChange: jest.fn(),
    setValues: jest.fn(),
    handleBlur: jest.fn(),
  }
}

// 125 1c (AC7.2): Evolução/Receita médica moram em "Mais opções", fechado por padrão — abre antes de afirmar.
function renderOpen(ui) {
  const utils = render(ui)
  fireEvent.press(utils.getByTestId('more-options'))
  return utils
}

const baseProps = {
  medicine: { id: 'm1', name: 'Depo', dosage_unit: 'mg', presentation: 'injetavel' },
  onOpenMedicineSheet: jest.fn(),
  onOpenTitration: jest.fn(),
  isEditMode: false,
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

describe('ProtocolFormBody — N da cadência por intervalo (085 C2)', () => {
  it('sem intervalo_dias não há campo N', () => {
    const { queryByPlaceholderText } = render(<ProtocolFormBody {...baseProps} form={makeForm()} />)
    expect(queryByPlaceholderText('Ex.: 30')).toBeNull()
  })

  it('com intervalo_dias exibe o N salvo e converte a digitação em número', () => {
    const form = makeForm({ frequency: 'intervalo_dias', interval_days: 90 })
    const { getByPlaceholderText, getByText } = render(<ProtocolFormBody {...baseProps} form={form} />)
    const input = getByPlaceholderText('Ex.: 30')
    expect(input.props.value).toBe('90')
    expect(getByText(/De 2 a 180 dias/)).toBeTruthy()

    fireEvent.changeText(input, '30')
    expect(form.handleChange).toHaveBeenCalledWith('interval_days', 30)
    fireEvent.changeText(input, '3a')
    expect(form.handleChange).toHaveBeenLastCalledWith('interval_days', 3)
    fireEvent.changeText(input, '')
    expect(form.handleChange).toHaveBeenLastCalledWith('interval_days', null)
  })
})

describe('ProtocolFormBody — "Mensal" e próxima dose (086 T026 · chips 125 1c)', () => {
  const chip = (utils, value) => utils.getByTestId(`frequency-segment-${value}`)
  const checked = (el) => el.props.accessibilityState?.checked === true

  it('seção "Quando" obrigatória; frequência em chips, sem folha "Selecionar Frequência" (AC7.1)', () => {
    const utils = render(<ProtocolFormBody {...baseProps} form={makeForm()} />)
    const title = utils.getAllByText(/^Quando/)[0]
    expect(utils.getAllByText(' *').some((el) => el.parent?.parent === title || el.parent === title)).toBe(true)
    expect(utils.getByLabelText('De quanto em quanto tempo?')).toBeTruthy()
    expect(utils.queryByText('Selecionar Frequência')).toBeNull()
  })

  it('chips na ordem da forma: injetável começa por Semanal (como no onboarding)', () => {
    const utils = render(<ProtocolFormBody {...baseProps} form={makeForm()} />)
    const ids = utils.getAllByRole('radio').map((el) => el.props.testID).filter((id) => id?.startsWith('frequency-segment-'))
    expect(ids[0]).toBe('frequency-segment-semanal')
  })

  it('sem a trava 086 (PO 19/11): Mensal e "A cada X dias" sempre oferecidos; Mensal grava intervalo_dias/30 num patch só (PO-5)', () => {
    const form = makeForm()
    const utils = render(<ProtocolFormBody {...baseProps} form={form} />)
    expect(chip(utils, 'intervalo_dias')).toBeTruthy()
    fireEvent.press(chip(utils, 'mensal_30'))
    expect(form.setValues).toHaveBeenCalledWith({ frequency: 'intervalo_dias', interval_days: 30 })
  })

  it('sair de Mensal para Todo dia limpa interval_days no mesmo patch (FM-8 / E-4)', () => {
    const form = makeForm({ frequency: 'intervalo_dias', interval_days: 30 })
    const utils = render(<ProtocolFormBody {...baseProps} isEditMode form={form} />)
    fireEvent.press(chip(utils, 'diário'))
    expect(form.setValues).toHaveBeenCalledWith({ frequency: 'diário', interval_days: null })
  })

  it('edição de intervalo_dias/30 abre como Mensal marcado, sem o campo N (FR-014)', () => {
    const utils = render(
      <ProtocolFormBody {...baseProps} isEditMode form={makeForm({ frequency: 'intervalo_dias', interval_days: 30 })} />
    )
    expect(checked(chip(utils, 'mensal_30'))).toBe(true)
    expect(utils.queryByPlaceholderText('Ex.: 30')).toBeNull()
  })

  it('edição: prefill que chega DEPOIS do 1º render (form.reset em efeito) ainda abre como Mensal (RC5)', () => {
    const utils = render(<ProtocolFormBody {...baseProps} isEditMode form={makeForm()} />)
    utils.rerender(
      <ProtocolFormBody {...baseProps} isEditMode form={makeForm({ frequency: 'intervalo_dias', interval_days: 30 })} />
    )
    expect(checked(chip(utils, 'mensal_30'))).toBe(true)
    expect(utils.queryByPlaceholderText('Ex.: 30')).toBeNull()
  })

  it('"A cada X dias" escolhido e 30 digitado NÃO vira Mensal (FR-014)', () => {
    const form = makeForm({ frequency: 'intervalo_dias', interval_days: 45 })
    const utils = render(<ProtocolFormBody {...baseProps} isEditMode form={form} />)
    fireEvent.press(chip(utils, 'intervalo_dias'))
    utils.rerender(
      <ProtocolFormBody {...baseProps} isEditMode form={makeForm({ frequency: 'intervalo_dias', interval_days: 30 })} />
    )
    expect(utils.getByPlaceholderText('Ex.: 30').props.value).toBe('30')
  })

  it('frequência legada fora da ordem da forma segue oferecida, no fim (085 FR-004)', () => {
    const utils = render(
      <ProtocolFormBody {...baseProps} isEditMode form={makeForm({ frequency: 'personalizado', weekdays: ['seg'] })} />
    )
    expect(checked(chip(utils, 'personalizado'))).toBe(true)
  })

  it('edição de N=45 abre em "A cada X dias" com 45', () => {
    const utils = render(
      <ProtocolFormBody {...baseProps} isEditMode form={makeForm({ frequency: 'intervalo_dias', interval_days: 45 })} />
    )
    expect(utils.getByPlaceholderText('Ex.: 30').props.value).toBe('45')
  })

  it('criação em dias: pergunta "Quando é a próxima dose?" e NÃO há "Data do início" duplicado (PO-7)', () => {
    // 125 1b: injetável não diário pergunta o dia da aplicação (AC5.3) — o PO-7 vale para as demais formas.
    const utils = renderOpen(
      <ProtocolFormBody
        {...baseProps}
        medicine={{ id: 'm2', name: 'Vitamina D', dosage_unit: 'ui', presentation: 'comprimido' }}
        form={makeForm({ frequency: 'intervalo_dias', interval_days: 30, start_date: '2026-10-10' })}
      />
    )
    expect(utils.getByLabelText('Quando é a próxima dose?')).toBeTruthy()
    expect(utils.queryByLabelText('Data do início')).toBeNull()
  })

  it('125 1b (AC5.3): injetável em dias, na criação, pergunta o dia da aplicação — sem "Data do início" duplicado', () => {
    const utils = renderOpen(
      <ProtocolFormBody
        {...baseProps}
        form={makeForm({ frequency: 'intervalo_dias', interval_days: 30, start_date: '2026-10-10' })}
      />
    )
    expect(utils.getByLabelText('Quando foi (ou será) a aplicação?')).toBeTruthy()
    expect(utils.queryByLabelText('Quando é a próxima dose?')).toBeNull()
    expect(utils.queryByLabelText('Data do início')).toBeNull()
  })

  it('edição em dias: "Data do início", sem a pergunta de próxima dose (FR-017)', () => {
    const utils = renderOpen(
      <ProtocolFormBody
        {...baseProps}
        isEditMode
        form={makeForm({ frequency: 'intervalo_dias', interval_days: 30, start_date: '2026-05-01' })}
      />
    )
    expect(utils.getByLabelText('Data do início')).toBeTruthy()
    expect(utils.queryByLabelText('Quando é a próxima dose?')).toBeNull()
  })

  it('criação diária mantém "Data do início" como hoje (guard PO-7)', () => {
    const utils = renderOpen(<ProtocolFormBody {...baseProps} form={makeForm({ start_date: '2026-10-10' })} />)
    expect(utils.getByLabelText('Data do início')).toBeTruthy()
    expect(utils.queryByLabelText('Quando é a próxima dose?')).toBeNull()
  })
})
