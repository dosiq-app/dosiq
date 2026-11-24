// TreatmentWeekModule — 124 A · PO-4/PO-6: título por tipo, L2/L3 só wedge, L1 por cadência, sheet pela L1.
import { describe, it, expect, afterEach } from '@jest/globals'
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }))
const mockDose = jest.fn()
jest.mock('@dashboard/hooks/useTreatmentWeekDose', () => ({ useTreatmentWeekDose: (a: any) => mockDose(a) }))
jest.mock('@dashboard/hooks/useTodayWeekRows', () => ({ useTodayWeekRows: () => ({ rows: { dose: true, peso: false, evolucao: false }, biomarkerOpen: { glicemia: true, pressao_arterial: true }, toggle: jest.fn() }) }))
const mockSeries = jest.fn()
jest.mock('@dashboard/hooks/useTodayWeightSeries', () => ({ useTodayWeightSeries: (a: any) => mockSeries(a) }))
jest.mock('@dashboard/components/WeightRow', () => () => { const { Text } = require('react-native'); return <Text testID="weight-row" /> })
jest.mock('@dashboard/components/EvolutionRow', () => () => { const { Text } = require('react-native'); return <Text testID="evolution-row" /> })
jest.mock('@dashboard/components/DoseRow', () => (p: any) => {
  const { Pressable, Text } = require('react-native')
  return <Pressable testID="dose-row" onPress={() => p.onOpenHistory?.()}><Text>{p.daily ? 'daily' : 'weekly'}</Text></Pressable>
})
jest.mock('@dashboard/components/BiomarkerRow', () => (p: any) => { const { Text } = require('react-native'); return <Text testID="biomarker-row">{p.measure}</Text> })
jest.mock('@dose/components/DoseNavSheet', () => (p: any) => {
  const { Text } = require('react-native')
  return <Text testID="dose-nav">{JSON.stringify({ visible: p.visible, initial: p.initial?.id ?? null, protocolId: p.protocolId })}</Text>
})

import TreatmentWeekModule from '../TreatmentWeekModule'

const recent = [{ id: 'l1', taken_at: '2026-11-01T12:00:00+00:00', injection_site: 'gluteo_d', medicine_id: 'm', protocol_id: 'p' }]
const ladder = [{ id: 's1', position: 0, status: 'current', started_at: '2026-10-01T12:00:00Z', duration_days: null, dose: 5, medicine: {} }]
mockDose.mockReturnValue({ loading: false, error: null, recent, truncated: false, ladder, upcoming: [], pastInstances: null, retry: jest.fn() })
mockSeries.mockReturnValue({ recent: [], full: null, last: null, journeyStart: null, loading: false, error: null, retry: jest.fn(), reload: jest.fn(), loadTreatment: jest.fn() })

const monthly = { id: 'p', medicine_id: 'm', frequency: 'intervalo_dias', interval_days: 30, start_date: '2026-10-01', time_schedule: ['09:00'], tracked_measure: null, medicine: { name: 'Contracep', presentation: 'injetavel' } }
const base = { userId: 'u1', profile: 'nenhum' as const, medicineName: 'Contracep', treatmentStart: null, timezone: 'America/Sao_Paulo' }

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('TreatmentWeekModule — 124 A', () => {
  it('não wedge mensal: "ACOMPANHAMENTO", só L1 semanal, sem peso nem evolução nem leitura de peso', () => {
    const s = render(<TreatmentWeekModule {...base} protocol={monthly} isWedge={false} />)
    expect(s.getByText('ACOMPANHAMENTO')).toBeTruthy()
    expect(s.getByTestId('dose-row')).toBeTruthy()
    expect(s.getByText('weekly')).toBeTruthy()
    expect(s.queryByTestId('weight-row')).toBeNull()
    expect(s.queryByTestId('evolution-row')).toBeNull()
    expect(mockSeries).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }))
    expect(mockDose).toHaveBeenCalledWith(expect.objectContaining({ doseEnabled: true, cadenceDays: 30, cadenceKind: 'weekly' }))
  })

  it('link da L1 abre o sheet na última dose, chave do tratamento', () => {
    const s = render(<TreatmentWeekModule {...base} protocol={monthly} isWedge={false} />)
    expect(JSON.parse(s.getByTestId('dose-nav').props.children)).toEqual({ visible: false, initial: 'l1', protocolId: 'p' })
    fireEvent.press(s.getByTestId('dose-row'))
    expect(JSON.parse(s.getByTestId('dose-nav').props.children).visible).toBe(true)
  })

  it('não wedge diário (se chegar aqui) não ganha L1 — FR-013', () => {
    const s = render(<TreatmentWeekModule {...base} protocol={{ ...monthly, frequency: 'diário', interval_days: null }} isWedge={false} />)
    expect(s.queryByTestId('dose-row')).toBeNull()
    expect(mockDose).toHaveBeenCalledWith(expect.objectContaining({ doseEnabled: false }))
  })

  it('PO-6: wedge (padrão) mantém "SEMANA DO TRATAMENTO", peso e evolução', () => {
    const s = render(<TreatmentWeekModule {...base} profile="wedge" protocol={{ ...monthly, frequency: 'semanal' }} />)
    expect(s.getByText('SEMANA DO TRATAMENTO')).toBeTruthy()
    expect(s.getByTestId('weight-row')).toBeTruthy()
    expect(s.getByTestId('evolution-row')).toBeTruthy()
    expect(mockSeries).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }))
  })

  it('wedge diário: L1 diária, sem sheet (link é só ≥ 7 d)', () => {
    const s = render(<TreatmentWeekModule {...base} profile="wedge" protocol={{ ...monthly, frequency: 'diário', interval_days: null }} />)
    expect(s.getByText('daily')).toBeTruthy()
    expect(s.queryByTestId('dose-nav')).toBeNull()
  })
})

// 124 B · PO-7/PO-8: seletor só com > 1; título fixo; L2 por medida.
describe('TreatmentWeekModule — 124 B', () => {
  const items = [
    { id: 'p', name: 'Contracep', concentration: '150 mg/ml', statusLine: 'Última aplicação registrada · qua, 01/10', injectable: true },
    { id: 'w', name: 'Mounjaro', concentration: '5 mg', statusLine: 'Próxima em 5 dias · ter, 18/11', injectable: true },
  ]

  it('> 1: "ACOMPANHAMENTO" mesmo com wedge selecionado; gatilho com rótulo de a11y; sheet lista o estado', () => {
    const onSelect = jest.fn()
    const s = render(<TreatmentWeekModule {...base} profile="misto" medicineName="Mounjaro" protocol={{ ...monthly, id: 'w', frequency: 'semanal' }} pickerItems={items} onSelectTracked={onSelect} />)
    expect(s.getByText('ACOMPANHAMENTO')).toBeTruthy()
    expect(s.queryByText('SEMANA DO TRATAMENTO')).toBeNull()
    const trigger = s.getByTestId('treatment-week-picker')
    expect(trigger.props.accessibilityLabel).toBe('Tratamento acompanhado: Mounjaro. Toque para trocar.')
    expect(trigger.props.accessibilityRole).toBe('button')
    fireEvent.press(trigger)
    expect(s.getByTestId('track-picker-status-p').props.children).toBe('Última aplicação registrada · qua, 01/10')
    expect(s.getByTestId('track-picker-row-w').props.accessibilityState).toEqual({ selected: true })
    fireEvent.press(s.getByTestId('track-picker-row-p'))
    expect(onSelect).toHaveBeenCalledWith('p')
  })

  it('1 tratamento: sem gatilho; cabeçalho da 121 (C-6 / INV-4)', () => {
    const s = render(<TreatmentWeekModule {...base} profile="wedge" protocol={{ ...monthly, frequency: 'semanal' }} pickerItems={[items[1]]} onSelectTracked={jest.fn()} />)
    expect(s.queryByTestId('treatment-week-picker')).toBeNull()
    expect(s.getByText('SEMANA DO TRATAMENTO')).toBeTruthy()
  })

  it('não wedge com glicemia ⇒ L2 de glicemia, sem ler peso (C-5)', () => {
    const s = render(<TreatmentWeekModule {...base} protocol={{ ...monthly, frequency: 'semanal', tracked_measure: 'glicemia' }} isWedge={false} />)
    expect(s.getByTestId('biomarker-row').props.children).toBe('glicemia')
    expect(s.queryByTestId('weight-row')).toBeNull()
    expect(mockSeries).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }))
  })

  it('wedge com PA explícita ⇒ PA no lugar do peso', () => {
    const s = render(<TreatmentWeekModule {...base} profile="wedge" protocol={{ ...monthly, frequency: 'semanal', tracked_measure: 'pressao_arterial' }} />)
    expect(s.getByTestId('biomarker-row').props.children).toBe('pressao_arterial')
    expect(s.queryByTestId('weight-row')).toBeNull()
  })

  it('mensal nenhum ⇒ L2 some (C-4)', () => {
    const s = render(<TreatmentWeekModule {...base} protocol={monthly} isWedge={false} />)
    expect(s.queryByTestId('weight-row')).toBeNull()
    expect(s.queryByTestId('biomarker-row')).toBeNull()
  })
})
