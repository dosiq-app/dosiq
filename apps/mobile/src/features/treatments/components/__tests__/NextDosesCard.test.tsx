// 117 PO-2 — "Próximas doses" no detalhe: some no diário/pausado/finalizado; ocorrência em etapa nova
// mostra a dose da etapa. Datas e doses vêm do core real (`listUpcomingDoses`, paridade com o gerador
// em upcomingDoseParity.test.ts — PO-1); aqui só a forma. Relógio: sex, 13 nov 2026, 14:00 (SP).
import React from 'react'
import { render, act } from '@testing-library/react-native'
import { AppState } from 'react-native'
import NextDosesCard from '../NextDosesCard'

const mockLogEvent = jest.fn()
jest.mock('@platform/analytics/productAnalytics', () => ({ logEvent: (...a: unknown[]) => mockLogEvent(...a) }))
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => jest.requireActual('react').useEffect(cb, [cb]),
}))
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }))

beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(new Date('2026-11-13T14:00:00-03:00'))
})
afterEach(() => {
  jest.useRealTimers()
  jest.clearAllMocks()
  jest.clearAllTimers()
})

const MEDICINE = { id: 'm-1', name: 'Ozempic', dosage_unit: 'mg', dosage_per_pill: 1.34, concentration_volume_ml: 1 }
const weekly = (over = {}) => ({
  id: 'p-1',
  frequency: 'semanal',
  weekdays: ['sexta'],
  time_schedule: ['20:00'],
  dosage_per_intake: 0.25,
  intake_unit: 'mg',
  start_date: '2026-10-01',
  end_date: null,
  active: true,
  medicine: MEDICINE,
  ...over,
})

describe('117 PO-2 — bloco Próximas doses', () => {
  it('semanal: 3 ocorrências, 1ª em destaque como "hoje"', () => {
    const { getByTestId, getAllByTestId } = render(<NextDosesCard protocol={weekly()} paused={false} finished={false} />)
    expect(getByTestId('next-doses-first')).toHaveTextContent(/hoje · 20:00/)
    expect(getAllByTestId('next-doses-row')).toHaveLength(2)
    expect(getAllByTestId('next-doses-row')[0]).toHaveTextContent(/sex, 20 nov · 20:00/)
    expect(mockLogEvent).toHaveBeenCalledWith('next_doses_viewed', {
      frequency: 'semanal',
      dose_count: 3,
      treatment_id: 'p-1',
      surface: 'mobile',
    })
  })

  it.each([
    ['diário', { frequency: 'diário', weekdays: [] }, false, false],
    ['pausado', {}, true, false],
    ['finalizado', {}, false, true],
    ['quando necessário', { frequency: 'quando_necessário' }, false, false],
  ])('%s → não renderiza', (_l, over, paused, finished) => {
    const tree = render(<NextDosesCard protocol={weekly(over)} paused={paused} finished={finished} />)
    expect(tree.toJSON()).toBeNull()
    expect(mockLogEvent).not.toHaveBeenCalled()
  })

  it('escada: etapa 2 começa antes da 2ª ocorrência → dose e número da etapa 2 (AC-1.3)', () => {
    const steps = [
      { position: 1, dose: 0.25, duration_days: 28, status: 'current', started_at: '2026-10-23T03:00:00.000Z', medicine_id: 'm-1' },
      { position: 2, dose: 0.5, duration_days: 28, status: 'upcoming', started_at: null, medicine_id: 'm-1' },
    ]
    const { getByTestId, getAllByTestId } = render(
      <NextDosesCard protocol={weekly({ titration_steps: steps })} paused={false} finished={false} />
    )
    expect(getByTestId('next-doses-first')).toHaveTextContent(/Etapa 1/)
    expect(getAllByTestId('next-doses-row')[0]).toHaveTextContent(/0,5 .* · Etapa 2/)
  })

  it('escada não esconde o bloco (boundary da PO-2)', () => {
    const steps = [{ position: 1, dose: 1, duration_days: null, status: 'current', started_at: '2026-10-01T03:00:00.000Z', medicine_id: 'm-1' }]
    const { getByTestId } = render(<NextDosesCard protocol={weekly({ titration_steps: steps })} paused={false} finished={false} />)
    expect(getByTestId('next-doses-first')).toBeTruthy()
  })
})

describe('117 RC6 #947 (AP-366) — o relógio avança com a tela aberta', () => {
  it('dose de hoje 20:00 sai da lista depois que o horário passa', () => {
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true })
    const { getByTestId } = render(<NextDosesCard protocol={weekly()} paused={false} finished={false} />)
    expect(getByTestId('next-doses-first')).toHaveTextContent(/hoje · 20:00/)
    act(() => {
      jest.setSystemTime(new Date('2026-11-13T20:01:30-03:00'))
      jest.advanceTimersByTime(6 * 60 * 60 * 1000 + 2 * 60 * 1000)
    })
    expect(getByTestId('next-doses-first')).toHaveTextContent(/sex, 20 nov · 20:00/)
  })
})
