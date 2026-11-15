// ScatterTrend — peso em linha, glicemia/PA em dispersão (121 PO-7 · ADR-125).
import { describe, it, expect, afterEach } from '@jest/globals'
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { addDays, mondayOf, getRawNow } from '@dosiq/core'
import ScatterTrend from '../ScatterTrend'

// Duas pesagens nesta semana (seg e ter, 8h locais): sempre dentro da janela atual.
function itemsThisWeek() {
  const mon = mondayOf(getRawNow())
  const at = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 8).toISOString()
  return [
    { id: 'a', value: 80, value_secondary: null, measured_at: at(mon) },
    { id: 'b', value: 79.5, value_secondary: null, measured_at: at(addDays(mon, 1)) },
  ]
}

function layout(view: ReturnType<typeof render>) {
  fireEvent(view.getByTestId('scatter-plot'), 'layout', { nativeEvent: { layout: { width: 280, height: 132 } } })
}

describe('ScatterTrend', () => {
  afterEach(() => {
    jest.clearAllMocks()
    jest.clearAllTimers()
  })

  it('peso ⇒ linha entre os dias', () => {
    const view = render(<ScatterTrend items={itemsThisWeek()} unit="kg" typeLabel="Peso" isWeight />)
    layout(view)
    expect(view.getAllByTestId('weight-line')).toHaveLength(1)
  })

  it('glicemia ⇒ sem linha (dispersão)', () => {
    const view = render(<ScatterTrend items={itemsThisWeek()} unit="mg/dL" typeLabel="Glicemia" />)
    layout(view)
    expect(view.queryByTestId('weight-line')).toBeNull()
  })
})
