// 125 T015 — form completo: avisos suaves da dose e frase "Está certo?" antes de salvar (AC3.2/AC3.3/AC4.1).

import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import ProtocolFormBody from '../ProtocolFormBody'


function makeForm(values = {}) {
  return {
    values: { name: '', dosage_per_intake: 1, time_schedule: ['08:00'], frequency: 'diário', weekdays: [], start_date: '2026-11-18', ...values },
    errors: {},
    touched: {},
    setValue: jest.fn(),
    setFieldValue: jest.fn(),
    handleChange: jest.fn(),
    handleBlur: jest.fn(),
  }
}

const baseProps = {
  medicine: { id: 'm1', name: 'Losartana', dosage_per_pill: '50', dosage_unit: 'mg', presentation: 'comprimido' },
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

describe('ProtocolFormBody — 125 T015', () => {
  it('criação: frase do core antes de salvar', () => {
    const { getByTestId } = render(<ProtocolFormBody {...baseProps} form={makeForm()} />)
    expect(getByTestId('treatment-sentence').props.children).toBe('Losartana · 1 comprimido de 50 mg · todo dia às 08:00')
  })

  // 125 1c (AC7.1): o "4 · Confere" vale ao criar E ao editar (antes, 1a: só na criação).
  it('edição: com a frase (1c)', () => {
    const { getByTestId } = render(<ProtocolFormBody {...baseProps} isEditMode form={makeForm()} />)
    expect(getByTestId('treatment-sentence-card')).toBeTruthy()
  })

  it('caneta de dose única em mg/mL: 0,6 mg avisa "parece mL" e "usar mesmo assim" esconde (não bloqueia)', () => {
    const medicine = { id: 'm2', name: 'Ozempic', presentation: 'injetavel', dosage_per_pill: '2.5', dosage_unit: 'mg/ml', concentration_volume_ml: '0.5' }
    const { getByText, queryByTestId } = render(
      <ProtocolFormBody {...baseProps} medicine={medicine} form={makeForm({ dosage_per_intake: 0.6, intake_unit: 'mg' })} />,
    )
    expect(getByText(/0,6 mg é bem menos que isso\. Confira na receita quanto você aplica, em mg\./)).toBeTruthy()
    fireEvent.press(getByText('Usar 0,6 mg mesmo assim'))
    expect(queryByTestId('dose-warnings')).toBeNull()
  })
})
