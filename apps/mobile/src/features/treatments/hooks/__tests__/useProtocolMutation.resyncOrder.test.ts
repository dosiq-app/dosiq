// 128 C-8 (smoke g06/POCO 2026-11-26): o toast de sucesso só sai DEPOIS do reagendamento dos alarmes.
// Com o toast antes, a pessoa minimizava e travava o celular, o Android parava o JS e a dose
// recém-editada ficava sem alarme.
import { describe, it, expect, afterEach } from '@jest/globals'

const order: string[] = []
const mockShow = jest.fn((msg: string) => order.push(`toast:${msg}`))
jest.mock('@shared/components/feedback/Toast', () => ({ useToast: () => ({ show: mockShow }) }))
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: jest.fn() }) }))
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { multiRemove: jest.fn(async () => {}) },
}))
let mockResyncOk = true
jest.mock('@platform/alarms/alarmResyncBus', () => ({
  resyncAlarmsAndWait: jest.fn(async () => {
    order.push('resync')
    return mockResyncOk
  }),
}))
jest.mock('../../services/protocolService', () => ({
  protocolService: {
    update: jest.fn(async () => {
      order.push('save')
      return { id: 'p1', active: true }
    }),
    create: jest.fn(async () => {
      order.push('save')
      return { id: 'p1' }
    }),
  },
}))
jest.mock('@dosiq/core', () => ({ getNextOccurrence: () => null, describeNextOccurrence: () => '' }))

import { renderHook, act } from '@testing-library/react-native'
import { useProtocolMutation } from '../useProtocolMutation'

afterEach(() => {
  order.length = 0
  mockResyncOk = true
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('useProtocolMutation — reagenda antes do toast (128 C-8)', () => {
  it('🔴 update: salvar → reagendar → toast', async () => {
    const { result } = renderHook(() => useProtocolMutation())
    await act(async () => {
      await result.current.update('p1', { time_schedule: ['11:13'] })
    })
    expect(order).toEqual(['save', 'resync', 'toast:Tratamento atualizado'])
  })

  it('create: salvar → reagendar → toast', async () => {
    const { result } = renderHook(() => useProtocolMutation())
    await act(async () => {
      await result.current.create({ name: 'x' })
    })
    expect(order).toEqual(['save', 'resync', 'toast:Tratamento criado'])
  })

  it('pausar/retomar: reagenda antes do toast', async () => {
    const { result } = renderHook(() => useProtocolMutation())
    await act(async () => {
      await result.current.toggleActive('p1', false)
    })
    expect(order.indexOf('resync')).toBeLessThan(order.findIndex((o) => o.startsWith('toast:')))
  })

  it('reagendamento que estoura o teto não derruba o salvamento (toast de sucesso sai)', async () => {
    mockResyncOk = false
    const { result } = renderHook(() => useProtocolMutation())
    let row: unknown
    await act(async () => {
      row = await result.current.update('p1', { time_schedule: ['11:13'] })
    })
    expect(row).toEqual({ id: 'p1', active: true })
    expect(order).toEqual(['save', 'resync', 'toast:Tratamento atualizado'])
  })
})
