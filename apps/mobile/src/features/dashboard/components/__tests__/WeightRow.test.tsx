// WeightRow — 121 A · PO-2 (registro inline com o Zod do core), PO-8 (INV-3: nada avalia o peso).
import { describe, it, expect, afterEach } from '@jest/globals'
import React from 'react'
import { StyleSheet } from 'react-native'
import { render, fireEvent, waitFor } from '@testing-library/react-native'

const mockCreate: jest.Mock<any> = jest.fn(async (r: any) => r)
jest.mock('@measures/services/measuresRepo', () => ({ measuresRepo: { create: (...a: any[]) => (mockCreate as any)(...a) } }))
const mockLog = jest.fn()
jest.mock('@platform/analytics/productAnalytics', () => ({ logEvent: (...a: any[]) => mockLog(...a) }))
jest.mock('@shared/utils/haptics', () => ({ selectionTap: jest.fn() }))
// Ícones: nomes visíveis na árvore para provar que não há seta.
jest.mock('lucide-react-native', () => new Proxy({}, { get: (_t, name) => () => { const { Text } = require('react-native'); return <Text testID={`icon-${String(name)}`} /> } }))

import WeightRow from '../WeightRow'
import { WEIGHT_RANGE_MSG } from '@dashboard/utils/treatmentWeek'

const base = {
  open: false, onToggle: jest.fn(), last: { kg: 80.2, measuredAt: '2026-11-14T10:00:00-03:00' }, lastDay: '2026-11-14',
  today: '2026-11-15', yesterday: '2026-11-14', windowSel: '30d' as const, onWindow: jest.fn(), windowFrom: '2026-10-17',
  loading: false, error: null, onRetry: jest.fn(), onSaved: jest.fn(),
}
const pts = (...kg: number[]) => kg.map((v, i) => ({ day: `2026-11-${String(10 + i).padStart(2, '0')}`, kg: v }))

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('WeightRow', () => {
  it('fechada: último peso, quando, variação neutra e "Registrar" visível (INV-1)', () => {
    const s = render(<WeightRow {...base} points={pts(81.5, 80.2)} />)
    expect(s.getByText('80,2 kg · ontem')).toBeTruthy()
    expect(s.getByText('−1,3 kg em 30 dias')).toBeTruthy()
    expect(s.getByTestId('weight-row-register')).toBeTruthy()
    expect(s.queryByTestId('weight-row-body')).toBeNull()
  })

  it('sem pesagem nenhuma: o campo aparece direto', () => {
    const s = render(<WeightRow {...base} last={null} lastDay={null} points={[]} />)
    expect(s.getByTestId('weight-row-field')).toBeTruthy()
  })

  it('PO-2: 72,4 grava pelo repo com entry_point today_inline e avisa o evento', async () => {
    const s = render(<WeightRow {...base} points={pts(80)} />)
    fireEvent.press(s.getByTestId('weight-row-register'))
    fireEvent.changeText(s.getByLabelText('Valor da medida em kg'), '72,4')
    fireEvent.press(s.getByTestId('weight-row-save'))
    await waitFor(() => expect(base.onSaved).toHaveBeenCalled())
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ type: 'peso', value: 72.4, unit: 'kg' }), { entry_point: 'today_inline' })
    expect(mockLog).toHaveBeenCalledWith('today_weight_logged', { source: 'today_inline', surface: 'mobile' })
  })

  it.each([['15'], ['abc'], ['250']])('PO-2: %s mostra o erro da faixa e não chama o serviço', async (v) => {
    const s = render(<WeightRow {...base} points={pts(80)} />)
    fireEvent.press(s.getByTestId('weight-row-register'))
    fireEvent.changeText(s.getByLabelText('Valor da medida em kg'), v)
    fireEvent.press(s.getByTestId('weight-row-save'))
    await waitFor(() => expect(s.getByText(WEIGHT_RANGE_MSG)).toBeTruthy())
    expect(WEIGHT_RANGE_MSG).toBe('Use um valor entre 20 e 200 kg.')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('PO-8: perda e ganho usam o MESMO estilo neutro e nenhum ícone de seta/tendência', () => {
    const down = render(<WeightRow {...base} points={pts(82, 80)} />)
    const up = render(<WeightRow {...base} points={pts(80, 82)} />)
    const sd = StyleSheet.flatten(down.getByTestId('weight-row-change').props.style)
    const su = StyleSheet.flatten(up.getByTestId('weight-row-change').props.style)
    expect(sd).toEqual(su)
    for (const v of [down, up]) {
      expect(v.queryAllByTestId(/icon-(Arrow|Trending|Triangle)/)).toHaveLength(0)
    }
  })

  it('aberta: 1 pesagem = só o número + convite; ≥ 2 = gráfico em linha', () => {
    const one = render(<WeightRow {...base} open points={pts(80)} />)
    expect(one.getByTestId('weight-row-single')).toBeTruthy()
    expect(one.queryByTestId('weight-line-chart')).toBeNull()
    const none = render(<WeightRow {...base} open points={[]} />)
    expect(none.getByTestId('weight-row-none')).toBeTruthy()
    expect(none.getByText('Nenhuma pesagem neste período. Com 2 medidas, o gráfico aparece.')).toBeTruthy()
    const two = render(<WeightRow {...base} open points={pts(80, 79)} />)
    expect(two.getByTestId('weight-line-chart')).toBeTruthy()
  })

  it('erro de carga nunca vira vazio', () => {
    const s = render(<WeightRow {...base} open points={null} error="network" />)
    expect(s.getByTestId('weight-row-error')).toBeTruthy()
  })
})
