// 124 A · PO-4/PO-6 (FR-005/FR-013): qual tratamento ganha o módulo da Hoje e com que título.
// 124 B · PO-7 (seleção padrão) e PO-9 (todo elegível conta como "na tela" para a 125).
import { describe, it, expect, afterEach } from '@jest/globals'
import { render, fireEvent, act, waitFor } from '@testing-library/react-native'
import TodayScreen from '../TodayScreen'
import { useTodayData } from '@dashboard/hooks/useTodayData'
import { __resetTrackedSession } from '@dashboard/hooks/useTrackedSelection'

jest.mock('@dashboard/hooks/useTodayData')
jest.mock('@measures/hooks/useTodayMeasures', () => ({ useTodayMeasures: () => ({ items: [], refresh: jest.fn() }) }))
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
  useFocusEffect: () => {},
  useScrollToTop: () => {},
  createNavigationContainerRef: () => ({ isReady: () => false, navigate: jest.fn() }),
}))
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }))

const MockView = require('react-native').View

jest.mock('../../../../shared/components/ui/ScreenContainer', () => (props: any) => <MockView {...props} />)
jest.mock('../../../dose/components/DoseRegisterModal', () => (props: any) => <MockView testID="dose-modal" {...props} />)
jest.mock('@dose/components/BulkDoseRegisterModal', () => (props: any) => <MockView testID="bulk-dose-modal" {...props} />)
jest.mock('../../components/AdherenceDayCard', () => (props: any) => <MockView testID="adherence-card" {...props} />)
jest.mock('../../components/HeroDoseCard', () => (props: any) => <MockView testID="hero-card" {...props} />)
jest.mock('../../components/TodayAlertCard', () => (props: any) => <MockView testID="today-alert" {...props} />)
jest.mock('../../../../shared/components/feedback/StaleBanner', () => (props: any) => <MockView testID="stale-banner" {...props} />)
jest.mock('@navigation/navigateToDose', () => ({ subscribePendingDose: () => () => {} }))
jest.mock('@stock/hooks/useStock', () => ({ useStock: () => ({ data: { active: [] }, refresh: jest.fn() }) }))
jest.mock('@shared/hooks/useStockTracking', () => ({ useStockTracking: () => ({ enabled: false }) }))
jest.mock('@shared/components/feedback/Toast', () => ({ useToast: () => ({ show: jest.fn() }) }))
const mockRecent = jest.fn(async (_o: any) => [] as any[])
jest.mock('@dose/services/doseService', () => ({
  ...(jest.requireActual('@dose/services/doseService') as object),
  listRecentApplications: (o: any) => mockRecent(o),
}))
jest.mock('@platform/analytics/productAnalytics', () => ({ logEvent: jest.fn(), setAnalyticsConsent: jest.fn(), resetUser: jest.fn() }))
const mockSetup = jest.fn((_a: any) => ({ cards: [], dismiss: jest.fn() }))
jest.mock('@dashboard/hooks/useTodaySetup', () => ({ useTodaySetup: (a: any) => mockSetup(a) }))


// Dublê do módulo: expõe o que o slot decidiu.
jest.mock('@dashboard/components/TreatmentWeekModule', () => (props: any) => {
  const { Text } = require('react-native')
  return <Text testID="week-module" onPress={() => props.onSelectTracked?.('w')}>{JSON.stringify({ id: props.protocol?.id ?? null, isWedge: props.isWedge, name: props.medicineName, picker: (props.pickerItems ?? []).map((i: any) => `${i.id}:${i.statusLine}`) })}</Text>
})

afterEach(() => {
  __resetTrackedSession() // 124 B: a escolha manual é da sessão do processo
  jest.clearAllMocks()
  jest.clearAllTimers()
})

const GLP1 = { name: 'Mounjaro', therapeutic_class_code: 'A10S1', presentation: 'injetavel' }
const CONTRA = { name: 'Contracep', therapeutic_class_code: 'G03A', presentation: 'injetavel' }
const LOSAR = { name: 'Losartana', therapeutic_class_code: 'C09C', presentation: 'comprimido' }

function setProtocols(protocols: any[]) {
  jest.mocked(useTodayData).mockReturnValue({
    data: {
      protocols, medicines: {}, stats: { expected: 0, taken: 0, score: 0 }, timeline: [], stockAlerts: [],
      user: { id: 'u1', name: 'T' }, timezone: 'America/Sao_Paulo',
    },
    loading: false, error: null, refresh: jest.fn(),
  } as any)
}
const proto = (id: string, medicine: any, frequency: string, extra: any = {}) =>
  ({ id, name: id, medicine_id: `m-${id}`, start_date: '2026-10-01', frequency, medicine, ...extra })
const moduleOf = (s: any) => { const { picker, ...rest } = JSON.parse(s.getByTestId('week-module').props.children); return rest }
const pickerOf = (s: any) => JSON.parse(s.getByTestId('week-module').props.children).picker

describe('TodayScreen — slot do módulo (124 A)', () => {
  it('AC-9: só diário não wedge ⇒ sem módulo (Hoje de sempre)', () => {
    setProtocols([proto('d', LOSAR, 'diário')])
    const s = render(<TodayScreen route={{} as any} navigation={{} as any} />)
    expect(s.queryByTestId('week-module')).toBeNull()
  })

  it('FR-005: injetável mensal não wedge ⇒ módulo dele, não wedge', () => {
    setProtocols([proto('d', LOSAR, 'diário'), proto('a', CONTRA, 'intervalo_dias', { interval_days: 30 })])
    const s = render(<TodayScreen route={{} as any} navigation={{} as any} />)
    expect(moduleOf(s)).toEqual({ id: 'a', isWedge: false, name: 'Contracep' })
  })

  it('AC-10: oral semanal não wedge ⇒ módulo dele', () => {
    setProtocols([proto('v', { ...LOSAR, name: 'Vitamina D' }, 'semanal')])
    const s = render(<TodayScreen route={{} as any} navigation={{} as any} />)
    expect(moduleOf(s)).toEqual({ id: 'v', isWedge: false, name: 'Vitamina D' })
  })


  it('AC-8/PO-6: só wedge ⇒ módulo do wedge, como na 121', () => {
    setProtocols([proto('w', GLP1, 'semanal')])
    const s = render(<TodayScreen route={{} as any} navigation={{} as any} />)
    expect(moduleOf(s)).toEqual({ id: 'w', isWedge: true, name: 'Mounjaro' })
  })
})

// 124 B: com > 1 elegível o módulo segue a seleção (lacuna > hoje > próxima > wedge).
describe('TodayScreen — seletor (124 B)', () => {
  const day = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(12, 0, 0, 0); return d.toISOString() }
  const both = () => [
    proto('w', GLP1, 'semanal', { start_date: '2026-09-01', weekdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].slice(0, 1) }),
    proto('a', CONTRA, 'intervalo_dias', { interval_days: 30, start_date: '2026-01-01' }),
  ]

  it('PO-7: mensal em lacuna abre primeiro; sheet lista o estado de cada um', async () => {
    mockRecent.mockImplementation(async (o: any) => (o.protocolId === 'a' ? [{ taken_at: day(45), injection_site: null }] : [{ taken_at: day(2), injection_site: null }]))
    setProtocols(both())
    const s = render(<TodayScreen route={{} as any} navigation={{} as any} />)
    await waitFor(() => expect(moduleOf(s).id).toBe('a'))
    expect(moduleOf(s).isWedge).toBe(false)
    const lines = pickerOf(s)
    expect(lines).toHaveLength(2)
    expect(lines.find((l: string) => l.startsWith('a:'))).toMatch(/^a:Última aplicação registrada · /)
    expect(mockRecent.mock.calls.every(([o]: any) => o.limit === 1)).toBe(true)
  })

  it('troca manual pelo módulo leva o módulo ao wedge', async () => {
    mockRecent.mockImplementation(async (o: any) => (o.protocolId === 'a' ? [{ taken_at: day(45), injection_site: null }] : [{ taken_at: day(2), injection_site: null }]))
    setProtocols(both())
    const s = render(<TodayScreen route={{} as any} navigation={{} as any} />)
    await waitFor(() => expect(moduleOf(s).id).toBe('a'))
    act(() => { fireEvent.press(s.getByTestId('week-module')) })
    expect(moduleOf(s)).toEqual({ id: 'w', isWedge: true, name: 'Mounjaro' })
  })

  it('PO-9: o elegível NÃO selecionado (sem dose) conta como na tela para o card da 125', async () => {
    mockRecent.mockImplementation(async (o: any) => (o.protocolId === 'a' ? [{ taken_at: day(45), injection_site: null }] : []))
    setProtocols([...both(), proto('d', LOSAR, 'diário')])
    const s = render(<TodayScreen route={{} as any} navigation={{} as any} />)
    await waitFor(() => expect(moduleOf(s).id).toBe('a'))
    const ids = (mockSetup.mock.calls.at(-1) as any[])[0].onScreenProtocolIds
    expect(ids).toEqual(expect.arrayContaining(['a', 'w']))
    expect(ids).not.toContain('d')
  })

  it('1 elegível: sem leitura extra, sem itens no seletor', () => {
    setProtocols([proto('w', GLP1, 'semanal')])
    const s = render(<TodayScreen route={{} as any} navigation={{} as any} />)
    expect(pickerOf(s)).toEqual([])
    expect(mockRecent).not.toHaveBeenCalled()
  })
})
