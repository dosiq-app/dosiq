import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { classifyCoherence } from '@dosiq/core'

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native')
  return { SafeAreaView: View }
})
jest.mock('@navigation/navigateCrossTab', () => ({ navigateCrossTab: jest.fn() }))
// Mutações canônicas (cache + alarmes); `undefined` = falhou (a mutação já mostrou o toast).
const mockProtocolUpdate = jest.fn((..._a: any[]): Promise<any> => Promise.resolve({ id: 'p1' }))
const mockMedicineUpdate = jest.fn((..._a: any[]): Promise<any> => Promise.resolve({ id: 'm1' }))
jest.mock('@treatments/hooks/useProtocolMutation', () => ({ useProtocolMutation: () => ({ update: mockProtocolUpdate }) }))
jest.mock('@medications/hooks/useMedicineMutation', () => ({ useMedicineMutation: () => ({ update: mockMedicineUpdate }) }))
jest.mock('@treatments/components/WeekdaySelector', () => () => null)
jest.mock('@shared/components/form/FormTimePicker', () => () => null)

import TodaySetupSlot from '../TodaySetupSlot'
import { navigateCrossTab } from '@navigation/navigateCrossTab'
import { ROUTES } from '@navigation/routes'

const TODAY = '2026-11-19'
const MOUNJARO = [5, 10].map((d) => ({ d, u: 'mg/ml', lv: 0.5, dd: [] as number[] })) as any
const mj = { id: 'm1', name: 'Mounjaro', presentation: 'injetavel', dosage_per_pill: 5, dosage_unit: 'mg/ml', concentration_volume_ml: 0.5 }
const p = { id: 'p1', medicine_id: 'm1', medicine: mj, frequency: 'semanal', weekdays: ['terça'], time_schedule: ['08:00'], dosage_per_intake: 1, intake_unit: 'mg', start_date: TODAY }

function setup(over: any = {}) {
  return {
    card: { kind: 'confira', protocolId: 'p1', verdict: classifyCoherence(p, mj, MOUNJARO) },
    protocol: p, medicine: mj, scheduleConfirmed: false, entries: MOUNJARO,
    confirmCoherence: jest.fn(() => Promise.resolve()), confirmSchedule: jest.fn(() => Promise.resolve()),
    ...over,
  } as any
}
const renderSlot = (s: any, refresh = jest.fn()) => ({
  refresh,
  ...render(<TodaySetupSlot setup={s} protocols={[p, { id: 'p2', medicine_id: 'm1' }]} today={TODAY} nowTime="10:00" refresh={refresh} />),
})

afterEach(() => jest.clearAllMocks())

describe('TodaySetupSlot', () => {
  it('sem card ⇒ nada', () => {
    expect(renderSlot(setup({ card: null })).toJSON()).toBeNull()
  })

  it('"Aplico 2,5 mg" grava dose e unidade da caixa, recarrega (INV-2: só após Confirmar)', async () => {
    const r = renderSlot(setup())
    fireEvent.press(r.getByTestId('setup-check'))
    fireEvent.press(r.getByTestId('confira-row-dose'))
    fireEvent.press(r.getByTestId('confira-dose-confirm'))
    await waitFor(() => expect(r.refresh).toHaveBeenCalled())
    expect(mockProtocolUpdate).toHaveBeenCalledWith('p1', { dosage_per_intake: 2.5, intake_unit: 'mg' }, { previous: p })
  })

  it('"A caixa" grava concentração do registro no remédio e avisa o outro tratamento', async () => {
    const r = renderSlot(setup())
    fireEvent.press(r.getByTestId('setup-check'))
    fireEvent.press(r.getByTestId('confira-row-box'))
    expect(r.getByText('Vale para todos os tratamentos deste remédio.')).toBeTruthy()
    fireEvent.press(r.getByTestId('confira-box-1'))
    fireEvent.press(r.getByTestId('confira-box-confirm'))
    await waitFor(() => expect(mockMedicineUpdate).toHaveBeenCalledWith('m1', { dosage_per_pill: 10, dosage_unit: 'mg/ml', concentration_volume_ml: 0.5 }))
  })

  it('"Aplico 1 mg mesmo" só grava a confirmação local', async () => {
    const s = setup()
    const r = renderSlot(s)
    fireEvent.press(r.getByTestId('setup-check'))
    fireEvent.press(r.getByTestId('confira-row-keep'))
    await waitFor(() => expect(s.confirmCoherence).toHaveBeenCalled())
    expect(mockProtocolUpdate).not.toHaveBeenCalled()
    expect(mockMedicineUpdate).not.toHaveBeenCalled()
  })

  it('RC6 #971: toque duplo grava uma vez só', async () => {
    let release: (v: any) => void = () => {}
    mockProtocolUpdate.mockImplementationOnce(() => new Promise((res) => { release = res }))
    const r = renderSlot(setup())
    fireEvent.press(r.getByTestId('setup-check'))
    fireEvent.press(r.getByTestId('confira-row-dose'))
    fireEvent.press(r.getByTestId('confira-dose-confirm'))
    fireEvent.press(r.getByTestId('confira-dose-confirm'))
    release({ id: 'p1' })
    await waitFor(() => expect(r.refresh).toHaveBeenCalledTimes(1))
    expect(mockProtocolUpdate).toHaveBeenCalledTimes(1)
  })

  it('RC6 #971: caixa sem volume (multidose) limpa o volume anterior', async () => {
    const pen = [{ d: 5, u: 'mg/ml', lv: 0.5, dd: [] }, { d: 1.34, u: 'mg/ml', lv: null, dd: [0.25, 0.5, 1] }] as any
    const r = renderSlot(setup({ entries: pen }))
    fireEvent.press(r.getByTestId('setup-check'))
    fireEvent.press(r.getByTestId('confira-row-box'))
    fireEvent.press(r.getByTestId('confira-box-1'))
    fireEvent.press(r.getByTestId('confira-box-confirm'))
    await waitFor(() => expect(mockMedicineUpdate).toHaveBeenCalledWith('m1', { dosage_per_pill: 1.34, dosage_unit: 'mg/ml', concentration_volume_ml: null }))
  })

  it('mutação falhou (undefined) ⇒ não recarrega, folha e card ficam', async () => {
    mockProtocolUpdate.mockResolvedValueOnce(undefined)
    const r = renderSlot(setup())
    fireEvent.press(r.getByTestId('setup-check'))
    fireEvent.press(r.getByTestId('confira-row-dose'))
    fireEvent.press(r.getByTestId('confira-dose-confirm'))
    await waitFor(() => expect(mockProtocolUpdate).toHaveBeenCalled())
    expect(r.refresh).not.toHaveBeenCalled()
    expect(r.getByTestId('confira-sheet')).toBeTruthy()
    expect(r.getByTestId('setup-card-confira')).toBeTruthy()
  })

  it('"Editar o tratamento" e "Ajustar" abrem o form em edição; "Definir agora" a criação com o remédio (PO-125-21/14)', () => {
    const r = renderSlot(setup())
    fireEvent.press(r.getByTestId('setup-check'))
    fireEvent.press(r.getByTestId('confira-edit'))
    expect(navigateCrossTab).toHaveBeenLastCalledWith(ROUTES.TREATMENTS, ROUTES.PROTOCOL_FORM, { id: 'p1' })
    const c = renderSlot(setup({ card: { kind: 'cadastrado', protocolId: 'p1' }, scheduleConfirmed: true }))
    fireEvent.press(c.getByTestId('setup-adjust'))
    expect(navigateCrossTab).toHaveBeenLastCalledWith(ROUTES.TREATMENTS, ROUTES.PROTOCOL_FORM, { id: 'p1' })
    const f = renderSlot(setup({ card: { kind: 'falta', medicineId: 'm9' }, protocol: null, medicine: { id: 'm9', name: 'Losartana' } }))
    fireEvent.press(f.getByTestId('setup-define'))
    expect(navigateCrossTab).toHaveBeenLastCalledWith(ROUTES.TREATMENTS, ROUTES.PROTOCOL_FORM, { medicine_id: 'm9' })
  })

  it('unidade: [Usar 2,5 mg] troca só a unidade', async () => {
    const pg = { ...p, dosage_per_intake: 2.5, intake_unit: 'gotas' }
    const r = renderSlot(setup({ protocol: pg, card: { kind: 'confira', protocolId: 'p1', verdict: classifyCoherence(pg, mj, MOUNJARO) } }))
    fireEvent.press(r.getByTestId('setup-use-unit'))
    await waitFor(() => expect(mockProtocolUpdate).toHaveBeenCalledWith('p1', { intake_unit: 'mg' }, { previous: pg }))
  })

  it('"Mudar" que falha não marca a agenda como confirmada', async () => {
    mockProtocolUpdate.mockResolvedValueOnce(undefined)
    const s = setup({ card: { kind: 'cadastrado', protocolId: 'p1' } })
    const r = renderSlot(s)
    fireEvent.press(r.getByTestId('setup-schedule-change'))
    fireEvent.press(r.getByTestId('setup-schedule-save'))
    await waitFor(() => expect(mockProtocolUpdate).toHaveBeenCalled())
    expect(s.confirmSchedule).not.toHaveBeenCalled()
  })

  it('"Mudar" salva a agenda e confirma a agenda nova', async () => {
    const s = setup({ card: { kind: 'cadastrado', protocolId: 'p1' } })
    const r = renderSlot(s)
    fireEvent.press(r.getByTestId('setup-schedule-change'))
    fireEvent.press(r.getByTestId('setup-schedule-save'))
    await waitFor(() => expect(s.confirmSchedule).toHaveBeenCalledWith({ time_schedule: ['08:00'], weekdays: ['terça'] }))
    expect(mockProtocolUpdate).toHaveBeenCalledWith('p1', { time_schedule: ['08:00'], weekdays: ['terça'] }, { previous: expect.objectContaining({ id: 'p1' }) })
  })
})
