import React from 'react'
import { render } from '@testing-library/react-native'
import DoseHistoryList from '../DoseHistoryList'

// S-09 (smoke 14/11): o rótulo de hora usa o mesmo instante da ordenação (occurred_at).
const base = { medicine: { name: 'Mounjaro' }, dosage: '2,5 mg' }

describe('DoseHistoryList — hora exibida', () => {
  afterEach(() => { jest.clearAllMocks() })

  it('dose tomada mostra a hora efetiva do registro, não a prevista', () => {
    const { getByText, queryByText } = render(
      <DoseHistoryList onItemPress={jest.fn()}
        instances={[{ ...base, id: '1', status: 'taken', scheduled_for: '2026-11-14T03:15:00Z', occurred_at: '2026-11-15T00:50:00Z' }]}
      />,
    )
    expect(getByText('21:50')).toBeTruthy()
    expect(queryByText('00:15')).toBeNull()
  })

  it('dose sem registro cai no horário previsto', () => {
    const { getByText } = render(
      <DoseHistoryList onItemPress={jest.fn()} instances={[{ ...base, id: '2', status: 'pending', scheduled_for: '2026-11-14T09:30:00Z' }]} />,
    )
    expect(getByText('06:30')).toBeTruthy()
  })
})
