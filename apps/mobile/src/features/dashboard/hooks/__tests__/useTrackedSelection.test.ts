// useTrackedSelection — 124 B · PO-7 (seleção padrão + sessão) e PO-10 (payload do evento).
import { describe, it, expect, afterEach, beforeEach } from '@jest/globals'
import { act, renderHook, waitFor } from '@testing-library/react-native'

const mockList = jest.fn()
const mockLog = jest.fn()
jest.mock('@dose/services/doseService', () => ({ listRecentApplications: (...a: any[]) => mockList(...a) }))
jest.mock('@platform/analytics/productAnalytics', () => ({ logEvent: (...a: any[]) => mockLog(...a) }))

import { useTrackedSelection, __resetTrackedSession } from '../useTrackedSelection'

const TZ = 'America/Sao_Paulo'
const TODAY = '2026-11-24'
const WEDGE = 'aaaaaaaa-0000-4000-8000-000000000001'
const MENSAL = 'bbbbbbbb-0000-4000-8000-000000000002'

const protocols = [
  { id: WEDGE, medicine_id: 'm1', frequency: 'semanal', weekdays: ['friday'], start_date: '2026-01-01', time_schedule: ['08:00'], medicine: { name: 'Mounjaro', presentation: 'injetavel' } },
  { id: MENSAL, medicine_id: 'm2', frequency: 'intervalo_dias', interval_days: 30, start_date: '2026-01-01', time_schedule: ['08:00'], medicine: { name: 'Contracep', presentation: 'injetavel' } },
]
const eligible = [
  { id: WEDGE, isWedge: true, cadence: { kind: 'weekly' as const, days: 7 } },
  { id: MENSAL, isWedge: false, cadence: { kind: 'weekly' as const, days: 30 } },
]
const at = (day: string) => ({ taken_at: `${day}T15:00:00.000000+00:00`, injection_site: null })

function setup(over: Partial<Parameters<typeof useTrackedSelection>[0]> = {}) {
  return renderHook((props: any) => useTrackedSelection(props), {
    initialProps: { userId: 'u1', eligible, protocols, fallbackId: WEDGE, todayLocal: TODAY, timezone: TZ, ...over },
  })
}

beforeEach(() => {
  __resetTrackedSession()
  mockList.mockImplementation(async ({ protocolId }: any) => (protocolId === MENSAL ? [at('2026-10-01')] : [at('2026-11-20')]))
})

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('useTrackedSelection', () => {
  it('1 elegível: sem leitura extra nem evento; seleciona o único', () => {
    const { result } = setup({ eligible: [eligible[0]] })
    expect(result.current.multi).toBe(false)
    expect(result.current.selectedId).toBe(WEDGE)
    expect(mockList).not.toHaveBeenCalled()
    expect(mockLog).not.toHaveBeenCalled()
  })

  it('> 1: limit 1 por tratamento; lacuna do mensal ganha do wedge (C-1)', async () => {
    const { result } = setup()
    expect(result.current.selectedId).toBe(WEDGE) // fallback da fatia A enquanto lê
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(mockList).toHaveBeenCalledTimes(2)
    expect(mockList.mock.calls.every(([o]: any) => o.limit === 1)).toBe(true)
    expect(result.current.selectedId).toBe(MENSAL)
  })

  it('leitura com erro ⇒ tratamento sem lacuna, Hoje segue (E-11)', async () => {
    mockList.mockImplementation(async ({ protocolId }: any) => {
      if (protocolId === MENSAL) throw new Error('rede')
      return [at('2026-11-20')]
    })
    const { result } = setup()
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.candidates.find((c) => c.id === MENSAL)?.status.gapSince).toBeNull()
  })

  it('seleção automática emite 1×/sessão com auto_default:true, sem nome nem id (PO-10)', async () => {
    const first = setup()
    await waitFor(() => expect(first.result.current.ready).toBe(true))
    expect(mockLog).toHaveBeenCalledTimes(1)
    const [name, payload] = mockLog.mock.calls[0] as any[]
    expect(name).toBe('today_tracking_switched')
    expect(payload).toEqual({ from_kind: null, to_kind: 'injetavel', auto_default: true, surface: expect.any(String) })
    first.unmount()
    const again = setup()
    await waitFor(() => expect(again.result.current.ready).toBe(true))
    expect(mockLog).toHaveBeenCalledTimes(1)
  })

  it('troca manual: evento exato, vale na sessão (remount) e ignora id fora dos elegíveis', async () => {
    const first = setup()
    await waitFor(() => expect(first.result.current.ready).toBe(true))
    mockLog.mockClear()
    act(() => first.result.current.select(WEDGE))
    expect(first.result.current.selectedId).toBe(WEDGE)
    expect(mockLog).toHaveBeenCalledWith('today_tracking_switched', { from_kind: 'injetavel', to_kind: 'wedge', auto_default: false, surface: expect.any(String) })
    const payload = JSON.stringify(mockLog.mock.calls)
    expect(payload).not.toMatch(/Mounjaro|Contracep|aaaaaaaa|bbbbbbbb|m1|m2/)
    act(() => first.result.current.select(WEDGE)) // mesma ⇒ sem evento
    act(() => first.result.current.select('fora'))
    expect(mockLog).toHaveBeenCalledTimes(1)
    first.unmount()
    const again = setup()
    await waitFor(() => expect(again.result.current.ready).toBe(true))
    expect(again.result.current.selectedId).toBe(WEDGE)
  })

  it('escolha que saiu dos elegíveis cai na regra padrão; outra conta não herda', async () => {
    const a = setup()
    await waitFor(() => expect(a.result.current.ready).toBe(true))
    act(() => a.result.current.select(WEDGE))
    a.unmount()
    const other = setup({ userId: 'u2' })
    await waitFor(() => expect(other.result.current.ready).toBe(true))
    expect(other.result.current.selectedId).toBe(MENSAL)
  })

  it('RC6 #977: escolha vale quando o usuário chega depois do 1º render (remount)', async () => {
    const a = setup({ userId: null })
    a.rerender({ userId: 'u1', eligible, protocols, fallbackId: WEDGE, todayLocal: TODAY, timezone: TZ })
    await waitFor(() => expect(a.result.current.ready).toBe(true))
    act(() => a.result.current.select(WEDGE))
    a.unmount()
    const b = setup({ userId: null })
    b.rerender({ userId: 'u1', eligible, protocols, fallbackId: WEDGE, todayLocal: TODAY, timezone: TZ })
    await waitFor(() => expect(b.result.current.ready).toBe(true))
    expect(b.result.current.selectedId).toBe(WEDGE)
  })
})
