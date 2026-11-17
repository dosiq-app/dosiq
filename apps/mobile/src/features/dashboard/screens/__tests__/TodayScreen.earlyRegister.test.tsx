// 121 B · PO-15 (ADR-130): ligação na Hoje — "Já apliquei" abre o registro ancorado na ocorrência
// futura e, ao concluir, o `onSuccess` desarma o alarme local dela (`cancelAlarm(instanceId)`).
// As peças têm teste próprio (`earlyRegister.test`); aqui o que se prova é a costura da TodayScreen,
// que uma refatoração poderia desligar sem quebrar nenhum teste unitário.
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

// Dublê do módulo: expõe só o gatilho do "Já apliquei" com uma ocorrência futura.
const mockInstance = { id: 'inst-futura', scheduled_for: '2026-11-18T11:00:00.000Z' }
jest.mock('@dashboard/components/TreatmentWeekModule', () => (props: any) => {
  const { Pressable } = require('react-native')
  return <Pressable testID="early-trigger" onPress={() => props.onRegisterEarly?.(mockInstance)} />
})

const mockCancelAlarm = jest.fn(async () => {})
jest.mock('@platform/alarms/alarmService', () => {
  const actual = jest.requireActual('@platform/alarms/alarmService') as any
  return { ...actual, cancelAlarm: (...args: any[]) => (mockCancelAlarm as any)(...args) }
})

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

function setWedge() {
  const protocols = [{ id: 'p1', name: 'p1', medicine_id: 'm1', start_date: '2026-10-01', frequency: 'semanal', medicine: { name: 'Mounjaro', therapeutic_class_code: 'A10S1', presentation: 'injetavel' } }]
  jest.mocked(useTodayData).mockReturnValue({
    data: {
      protocols, medicines: {}, stats: { expected: 0, taken: 0, score: 0 }, timeline: [], stockAlerts: [],
      user: { id: 'u1', name: 'T' }, timezone: 'America/Sao_Paulo',
    },
    loading: false, error: null, refresh: jest.fn(),
  } as any)
}

describe('TodayScreen — "Já apliquei" desarma o alarme da ocorrência (PO-15)', () => {
  it('registro adiantado concluído ⇒ cancelAlarm(id da ocorrência futura)', async () => {
    setWedge()
    const s = render(<TodayScreen route={{} as any} navigation={{} as any} />)

    fireEvent.press(s.getByTestId('early-trigger'))
    const modal = s.getByTestId('bulk-dose-modal')
    expect(modal.props.visible).toBe(true)
    expect(mockCancelAlarm).not.toHaveBeenCalled() // só desarma DEPOIS de registrar

    await act(async () => { modal.props.onSuccess() })
    expect(mockCancelAlarm).toHaveBeenCalledWith('inst-futura')
  })

  it('registro que não veio do "Já apliquei" não cancela alarme', async () => {
    setWedge()
    const s = render(<TodayScreen route={{} as any} navigation={{} as any} />)
    const modal = s.getByTestId('bulk-dose-modal')
    await act(async () => { modal.props.onSuccess() })
    expect(mockCancelAlarm).not.toHaveBeenCalled()
  })
})
