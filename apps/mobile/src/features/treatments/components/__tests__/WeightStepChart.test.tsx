// WeightStepChart — rótulo curto da faixa por etapa (QA 2026-11-12: Rybelsus mostrava "1 · 1 · 1" e
// "Dose em comprimido"; o que a titulação muda é a massa do ativo).
import { describe, it, expect, afterEach } from '@jest/globals'
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import WeightStepChart from '../WeightStepChart'

const step = (index: number, dose: string, start: string, end: string | null, doseShort?: { value: string; unit: string }) => ({
  index,
  dose,
  ...(doseShort ? { doseShort } : {}),
  start,
  end,
  clipped: false,
  meanKg: 81,
  count: 1,
  taken: 1,
  expected: 1,
  current: end === null,
})

const series = (withShort: boolean) => ({
  points: [
    { day: '2026-10-03', kg: 81 },
    { day: '2026-10-20', kg: 80.5 },
  ],
  steps: [
    step(1, '1 comprimido (3 mg)', '2026-10-02', '2026-10-14', withShort ? { value: '3', unit: 'mg' } : undefined),
    step(2, '1 comprimido (7 mg)', '2026-10-14', '2026-11-12', withShort ? { value: '7', unit: 'mg' } : undefined),
    step(3, '1 comprimido (14 mg)', '2026-11-12', null, withShort ? { value: '14', unit: 'mg' } : undefined),
  ],
  firstDay: '2026-10-03',
  lastDay: '2026-10-20',
})

function renderAt(width: number, withShort: boolean) {
  const view = render(<WeightStepChart series={series(withShort) as never} today="2026-11-12" showBands />)
  fireEvent(view.getByTestId('weight-plot'), 'layout', { nativeEvent: { layout: { width, height: 180 } } })
  return view
}

describe('WeightStepChart — rótulo curto da faixa', () => {
  afterEach(() => {
    jest.clearAllMocks()
    jest.clearAllTimers()
  })

  it('faixa estreita mostra a massa do ativo e a legenda "Dose em mg"', () => {
    const view = renderAt(150, true)
    expect(view.getByText('3')).toBeTruthy()
    expect(view.getByText('7')).toBeTruthy()
    expect(view.getByText('Dose em mg')).toBeTruthy()
    expect(view.queryByText('1')).toBeNull()
  })

  it('sem a forma estruturada, mantém o corte do texto (legado)', () => {
    const view = renderAt(150, false)
    expect(view.getAllByText('1').length).toBeGreaterThan(0)
    expect(view.getByText('Dose em comprimido')).toBeTruthy()
  })
})
