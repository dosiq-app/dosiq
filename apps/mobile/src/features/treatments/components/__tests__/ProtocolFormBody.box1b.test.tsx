// 125 1b — form completo: unidade da dose pela forma (AC5.2b), dia da aplicação (AC5.3) e
// sem pré-montagem da dose (smoke 19/11: a dose é da receita).

import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import ProtocolFormBody from '../ProtocolFormBody'

jest.mock('@treatments/hooks/useIntervalCadenceAvailability', () => ({
  useIntervalCadenceAvailability: () => ({ available: true, settled: true }),
}))
// Seletor: o dublê lista as opções (o sheet nativo está fora do escopo).
jest.mock('@shared/components/form/FormSelect', () => {
  const { View, Text } = jest.requireActual('react-native')
  return {
    __esModule: true,
    default: ({ name, options }) => (
      <View>{(options ?? []).map((o) => <Text key={o.value} testID={`select-${name}-${o.value}`}>{o.label}</Text>)}</View>
    ),
  }
})

function makeForm(values = {}) {
  const form: any = {
    values: { name: '', dosage_per_intake: '', time_schedule: ['08:00'], frequency: 'semanal', weekdays: [], start_date: '2026-11-18', ...values },
    errors: {},
    touched: {},
    setValues: jest.fn(),
    handleChange: jest.fn(),
    handleBlur: jest.fn(),
  }
  return form
}

const MOUNJARO = { id: 'm1', name: 'Mounjaro', presentation: 'injetavel', dosage_per_pill: 5, dosage_unit: 'mg/ml', concentration_volume_ml: 0.5 }
const OZEMPIC = { id: 'm2', name: 'Ozempic', presentation: 'injetavel', dosage_per_pill: 1.34, dosage_unit: 'mg/ml', concentration_volume_ml: null }

const baseProps = {
  medicine: MOUNJARO,
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

describe('AC5.2b — unidade da dose pela forma', () => {
  it('injetável mg/mL: só mg e mL, nunca gotas; padrão mg', () => {
    const form = makeForm({ intake_unit: null })
    const { getByTestId, queryByTestId } = render(<ProtocolFormBody {...baseProps} medicine={OZEMPIC} form={form} />)
    expect(getByTestId('select-intake_unit-mg')).toBeTruthy()
    expect(getByTestId('select-intake_unit-ml')).toBeTruthy()
    expect(queryByTestId('select-intake_unit-gotas')).toBeNull()
    expect(form.handleChange).toHaveBeenCalledWith('intake_unit', 'mg')
  })
  it('edição de tratamento antigo em gotas: mostra o valor salvo junto', () => {
    const { getByTestId } = render(<ProtocolFormBody {...baseProps} isEditMode medicine={OZEMPIC} form={makeForm({ intake_unit: 'gotas' })} />)
    expect(getByTestId('select-intake_unit-gotas')).toBeTruthy()
  })
  it('líquido oral segue como antes (gotas disponível)', () => {
    const med = { id: 'm3', name: 'Dipirona', presentation: 'liquido', dosage_per_pill: 500, dosage_unit: 'mg/ml' }
    const { getByTestId } = render(<ProtocolFormBody {...baseProps} medicine={med} form={makeForm({ frequency: 'diário', intake_unit: 'gotas' })} />)
    expect(getByTestId('select-intake_unit-gotas')).toBeTruthy()
  })
})

describe('AC5.3 — dia da aplicação na criação', () => {
  it('injetável semanal: pergunta o dia (nada marcado) no lugar dos dias da semana; escolher ancora', () => {
    const form = makeForm()
    const { getByTestId, queryByText } = render(<ProtocolFormBody {...baseProps} form={form} />)
    expect(getByTestId('application-day-hoje').props.accessibilityState.checked).toBe(false)
    expect(queryByText('Dias da semana')).toBeNull()
    fireEvent.press(getByTestId('application-day-hoje'))
    const patch = form.setValues.mock.calls.at(-1)[0]
    expect(patch.weekdays).toHaveLength(1)
  })
  it('edição: sem a pergunta (dias da semana como antes)', () => {
    const { queryByTestId, getByText } = render(<ProtocolFormBody {...baseProps} isEditMode form={makeForm({ weekdays: ['tuesday'] })} />)
    expect(queryByTestId('application-day-hoje')).toBeNull()
    expect(getByText('Dias da semana')).toBeTruthy()
  })
})

describe('smoke 19/11 — form completo sem pré-montagem nem pergunta de embalagem', () => {
  it('Mounjaro salvo: sem "é uma aplicação?" e dose fica como está', () => {
    const form = makeForm()
    const { queryByText, queryByTestId } = render(<ProtocolFormBody {...baseProps} form={form} />)
    expect(queryByText(/é uma aplicação\?/)).toBeNull()
    expect(queryByTestId('dose-origin')).toBeNull()
    expect(form.setValues).not.toHaveBeenCalledWith(expect.objectContaining({ dosage_per_intake: 2.5 }))
  })
})
