// EvolutionRow — 121 B · PO-14: estado da 029 em linha neutra, sem botão de etapa.
import { describe, it, expect, afterEach } from '@jest/globals'
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'

jest.mock('lucide-react-native', () => new Proxy({}, { get: (_t, name) => () => { const { Text } = require('react-native'); return <Text testID={`icon-${String(name)}`} /> } }))

import EvolutionRow from '../EvolutionRow'
import type { EvolutionDetail } from '@dashboard/utils/treatmentWeek'

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

const detail: EvolutionDetail = {
  bar: { done: 4, total: 5 },
  stageDoses: { total: 4, done: 2, nextOrdinal: 3, nextDay: '2026-11-18', nextText: 'próxima: 3ª de 4\nqua, 18/11' },
  currentDose: null,
  stageCalendar: null,
  steps: [
    { position: 0, label: 'Etapa 1 · 2,5 mg', note: 'concluída', state: 'done' },
    { position: 3, label: 'Etapa 4 · 10 mg', note: 'até 02/12', state: 'now' },
    { position: 4, label: 'Etapa 5 · 12,5 mg', note: 'prevista 02/12', state: 'next' },
  ],
}
const base = { detail, open: false, onToggle: jest.fn(), onOpen: jest.fn() }

describe('EvolutionRow', () => {
  it('em evolução fechada: barra de etapas; toque ABRE no lugar (B-2)', () => {
    const onToggle = jest.fn()
    const s = render(<EvolutionRow {...base} onToggle={onToggle} copy={{ key: 'em_evolucao', primary: 'Etapa 4 de 5 · 10 mg', secondary: 'Em evolução' }} />)
    expect(s.getByTestId('evolution-row-bar')).toBeTruthy()
    fireEvent.press(s.getByTestId('week-row-evolucao'))
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(base.onOpen).not.toHaveBeenCalled()
  })

  it('em evolução aberta: doses da etapa (próxima tracejada) + escada + "Ver tratamento"; sem "Iniciar etapa"', () => {
    const onOpen = jest.fn()
    const s = render(<EvolutionRow {...base} open onOpen={onOpen} copy={{ key: 'em_evolucao', primary: 'Etapa 4 de 5 · 10 mg', secondary: 'Em evolução' }} />)
    expect(s.getByTestId('evolution-dose-2-done')).toBeTruthy()
    expect(s.getByTestId('evolution-dose-3-next')).toBeTruthy()
    expect(s.getByText('próxima: 3ª de 4\nqua, 18/11')).toBeTruthy()
    expect(s.getByText('prevista 02/12')).toBeTruthy()
    expect(s.queryByText(/Iniciar etapa/i)).toBeNull()
    fireEvent.press(s.getByTestId('evolution-row-open-treatment'))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('estável aberta: "Dose atual" + tempo + próxima, escada completa, sem bloco de doses', () => {
    const s = render(<EvolutionRow {...base} detail={{ ...detail, stageDoses: null, currentDose: { dose: '15 mg', since: 'há 6 semanas', nextText: 'próxima:\nqua, 25/11' } }} open copy={{ key: 'estavel', primary: 'Etapa 6 de 6 · 15 mg', secondary: 'Estável · desde 29/10' }} />)
    expect(s.getByTestId('evolution-row-ladder')).toBeTruthy()
    expect(s.queryByTestId('evolution-row-stage-doses')).toBeNull()
    expect(s.getByText('Estável · desde 29/10')).toBeTruthy()
    expect(s.getByText('Dose atual')).toBeTruthy()
    expect(s.getByText('15 mg · há 6 semanas')).toBeTruthy()
    expect(s.queryByText(/manutenção/i)).toBeNull()
  })

  it('aguardando: não abre — chevron leva ao detalhe do tratamento (explicação + "Iniciar etapa" moram lá)', () => {
    const onOpen = jest.fn()
    const onToggle = jest.fn()
    const s = render(<EvolutionRow {...base} open onOpen={onOpen} onToggle={onToggle} copy={{ key: 'aguardando', primary: 'Etapa 5 aguardando · 12,5 mg', secondary: 'Desde 11/11 · lembretes seguem em 10 mg' }} />)
    expect(s.queryByTestId('evolution-row-body')).toBeNull()
    fireEvent.press(s.getByTestId('week-row-evolucao'))
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onToggle).not.toHaveBeenCalled()
    expect(s.queryByText(/Iniciar etapa/i)).toBeNull()
  })

  it('121 C (PO-19): escada diária aberta mostra "Dia N de M desta etapa", nunca bolinhas', () => {
    const daily = { ...detail, stageDoses: null, stageCalendar: { day: 3, total: 7, nextText: 'Etapa 3 prevista · seg, 23/11' } }
    const s = render(<EvolutionRow {...base} detail={daily} open copy={{ key: 'em_evolucao', primary: 'Etapa 2 de 3 · 2 mg', secondary: 'Em evolução' }} />)
    expect(s.getByText('Dia 3 de 7 desta etapa')).toBeTruthy()
    expect(s.getByText('Etapa 3 prevista · seg, 23/11')).toBeTruthy()
    expect(s.queryByTestId('evolution-row-stage-doses')).toBeNull()
    expect(s.queryAllByTestId(/^evolution-dose-/)).toHaveLength(0)
  })
})
