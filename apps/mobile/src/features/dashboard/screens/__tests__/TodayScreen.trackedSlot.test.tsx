// 124 A · PO-4/PO-6 (FR-005/FR-013): qual tratamento ganha o módulo da Hoje e com que título.
import { describe, it, expect, afterEach } from '@jest/globals'
import { render, fireEvent, act } from '@testing-library/react-native'
import TodayScreen from '../TodayScreen'
import { useTodayData } from '@dashboard/hooks/useTodayData'

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


// Dublê do módulo: expõe o que o slot decidiu.
jest.mock('@dashboard/components/TreatmentWeekModule', () => (props: any) => {
  const { Text } = require('react-native')
  return <Text testID="week-module">{JSON.stringify({ id: props.protocol?.id ?? null, isWedge: props.isWedge, name: props.medicineName })}</Text>
})

afterEach(() => {
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
const moduleOf = (s: any) => JSON.parse(s.getByTestId('week-module').props.children)

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

  it('wedge + mensal ⇒ módulo segue no wedge (até a B)', () => {
    setProtocols([proto('w', GLP1, 'semanal', { start_date: '2026-09-01' }), proto('a', CONTRA, 'intervalo_dias', { interval_days: 30, start_date: '2026-11-01' })])
    const s = render(<TodayScreen route={{} as any} navigation={{} as any} />)
    expect(moduleOf(s)).toEqual({ id: 'w', isWedge: true, name: 'Mounjaro' })
  })

  it('AC-8/PO-6: só wedge ⇒ módulo do wedge, como na 121', () => {
    setProtocols([proto('w', GLP1, 'semanal')])
    const s = render(<TodayScreen route={{} as any} navigation={{} as any} />)
    expect(moduleOf(s)).toEqual({ id: 'w', isWedge: true, name: 'Mounjaro' })
  })
})
