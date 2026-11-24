// MeasureRow — 124 B · PO-8: a L2 segue a medida do tratamento selecionado.
import { describe, it, expect, afterEach } from '@jest/globals'
import { render } from '@testing-library/react-native'

jest.mock('@measures/services/measuresRepo', () => ({ measuresRepo: { create: jest.fn(), list: jest.fn(async () => []) } }))
jest.mock('@platform/analytics/productAnalytics', () => ({ logEvent: jest.fn() }))
jest.mock('@measures/components/WeightLineChart', () => () => null)

import MeasureRow from '../MeasureRow'

const weight: any = {
  open: false, onToggle: () => {}, points: [], last: null, lastDay: null, today: '2026-11-24', yesterday: '2026-11-23',
  windowSel: '30d', onWindow: () => {}, windowFrom: '2026-10-26', loading: false, error: null, onRetry: () => {}, onSaved: () => {},
}

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('MeasureRow', () => {
  it('peso ⇒ linha de peso da 121', () => {
    const { getByTestId } = render(<MeasureRow measure="peso" weight={weight} />)
    expect(getByTestId('week-row-peso')).toBeTruthy()
  })

  it('nenhum ⇒ L2 some (C-4)', () => {
    const { toJSON } = render(<MeasureRow measure="nenhum" weight={weight} />)
    expect(toJSON()).toBeNull()
  })
})
