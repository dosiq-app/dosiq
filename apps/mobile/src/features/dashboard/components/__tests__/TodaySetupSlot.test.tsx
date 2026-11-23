import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { classifyCoherence } from '@dosiq/core'

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native')
  return { SafeAreaView: View }
})
jest.mock('@navigation/navigateCrossTab', () => ({ navigateCrossTab: jest.fn() }))
const mockFocused = { value: true }
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useIsFocused: () => mockFocused.value }))
// Mutações canônicas (cache + alarmes); `undefined` = falhou (a mutação já mostrou o toast).
const mockProtocolUpdate = jest.fn((..._a: any[]): Promise<any> => Promise.resolve({ id: 'p1' }))
const mockMedicineUpdate = jest.fn((..._a: any[]): Promise<any> => Promise.resolve({ id: 'm1' }))
jest.mock('@treatments/hooks/useProtocolMutation', () => ({ useProtocolMutation: () => ({ update: mockProtocolUpdate }) }))
jest.mock('@medications/hooks/useMedicineMutation', () => ({ useMedicineMutation: () => ({ update: mockMedicineUpdate }) }))
jest.mock('@treatments/components/WeekdaySelector', () => () => null)
jest.mock('@shared/components/form/FormTimePicker', () => () => null)
// 2a
const mockShow = jest.fn()
jest.mock('@shared/components/feedback/Toast', () => ({ useToast: () => ({ show: mockShow }) }))
const mockStockTotal = jest.fn((_id: string): Promise<any> => Promise.resolve(2960))
jest.mock('@stock/services/stockService', () => ({ stockService: { getTotalQuantity: (id: string) => mockStockTotal(id) } }))
const mockGetById = jest.fn((id: string): Promise<any> => Promise.resolve({ id, name: 'Ozempic', laboratory: 'Novo' }))
jest.mock('@medications/services/medicineService', () => ({ medicineService: { getById: (id: string) => mockGetById(id) } }))
// O sheet real tem índice/Modal: aqui só a ponte — expõe as props e devolve a escolha por um botão.
const mockSheetProps: { current: any } = { current: null }
jest.mock('@medications/components/MedicineAnvisaSheet', () => {
  const { Pressable, Text } = jest.requireActual('react-native')
  return {
    MedicineAnvisaSheet: (props: any) => {
      mockSheetProps.current = props
      return (
        <>
          <Pressable testID="sheet-pick" onPress={() => props.onSelect({ anvisaItem: {}, cmedDraft: (globalThis as any).__draft })}><Text>pick</Text></Pressable>
          <Pressable testID="sheet-close" onPress={props.onClose}><Text>close</Text></Pressable>
        </>
      )
    },
  }
})

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

describe('TodaySetupSlot — 2a', () => {
  // Hoje: o mapa de remédios não traz `id` — o hook põe `protocol.medicine_id` (S-4).
  const tz = { id: 'm7', name: 'Tizerpatida', presentation: 'comprimido', dosage_per_pill: 5, dosage_unit: 'mg' }
  const p7 = { id: 'p7', medicine_id: 'm7', medicine: tz, dosage_per_intake: 1, intake_unit: null, active: true }
  const mounjaroDraft = { name: 'Mounjaro', active_ingredient: 'Tirzepatida', therapeutic_class_code: 'A10S1', anvisa_registration: '112600202', presentation: 'injetavel', dosage_per_pill: 5, dosage_unit: 'mg/ml', concentration_volume_ml: 0.5, regulatory_category: 'Novo' }
  const linkSetup = (over: any = {}) => ({
    card: { kind: 'vincular', medicineId: 'm7', protocolId: 'p7' },
    protocol: p7, medicine: tz, scheduleConfirmed: false, entries: [],
    linkMatches: [{ name: 'Mounjaro', activeIngredient: 'Tirzepatida' }],
    confirmCoherence: jest.fn(), confirmSchedule: jest.fn(),
    dismissLink: jest.fn(() => Promise.resolve()), confirmForm: jest.fn(() => Promise.resolve()),
    ...over,
  }) as any
  const renderLink = (s: any, refresh = jest.fn()) => ({
    refresh,
    ...render(<TodaySetupSlot setup={s} protocols={[p7]} today={TODAY} nowTime="10:00" refresh={refresh} />),
  })
  afterEach(() => { (globalThis as any).__draft = undefined; mockSheetProps.current = null })

  it('"Sim, é esse" abre o sheet no item, com a conferência e o estoque (só texto)', async () => {
    const { getByTestId } = renderLink(linkSetup())
    fireEvent.press(getByTestId('setup-link'))
    await waitFor(() => expect(mockSheetProps.current).not.toBeNull())
    expect(mockStockTotal).toHaveBeenCalledWith('m7')
    expect(mockSheetProps.current.initialItem).toMatchObject({ name: 'Mounjaro' })
    expect(mockSheetProps.current.linkTarget).toEqual({ medicine: tz, stockQty: 2960 })
  })

  it('[Usar …] grava a caixa no MESMO remédio; forma mudou com tratamento ⇒ folha AC7.5 antes de recarregar', async () => {
    ;(globalThis as any).__draft = mounjaroDraft
    const { getByTestId, findByText, getByText, refresh } = renderLink(linkSetup())
    fireEvent.press(getByTestId('setup-link'))
    await waitFor(() => expect(mockSheetProps.current).not.toBeNull())
    fireEvent.press(getByTestId('sheet-pick'))
    await waitFor(() => expect(mockMedicineUpdate).toHaveBeenCalledTimes(1))
    const [id, payload] = mockMedicineUpdate.mock.calls[0]
    expect(id).toBe('m7')
    expect(payload).toMatchObject({ name: 'Mounjaro', presentation: 'injetavel', dosage_per_pill: 5, anvisa_registration: '112600202' })
    expect(payload).not.toHaveProperty('quantity')
    await findByText(/A forma passou de comprimido para injetável/)
    expect(refresh).not.toHaveBeenCalled()
    fireEvent.press(getByText('Revisar tratamento'))
    expect(navigateCrossTab).toHaveBeenCalledWith(ROUTES.TREATMENTS, ROUTES.PROTOCOL_FORM, { id: 'p7' })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('RC6 #973: fora de foco (form do tratamento aberto) a folha AC7.5 não cobre a tela', async () => {
    ;(globalThis as any).__draft = mounjaroDraft
    mockFocused.value = false
    try {
      const { getByTestId, queryByText } = renderLink(linkSetup())
      fireEvent.press(getByTestId('setup-link'))
      await waitFor(() => expect(mockSheetProps.current).not.toBeNull())
      fireEvent.press(getByTestId('sheet-pick'))
      await waitFor(() => expect(mockMedicineUpdate).toHaveBeenCalledTimes(1))
      expect(queryByText(/A forma passou de comprimido para injetável/)).toBeNull()
    } finally {
      mockFocused.value = true
    }
  })

  it('caixa da mesma forma e sem aviso ⇒ recarrega direto (a regra julga de novo — AC8.4)', async () => {
    ;(globalThis as any).__draft = { ...mounjaroDraft, presentation: 'comprimido', dosage_per_pill: 5, dosage_unit: 'mg', concentration_volume_ml: null }
    const { getByTestId, refresh, queryByText } = renderLink(linkSetup())
    fireEvent.press(getByTestId('setup-link'))
    await waitFor(() => expect(mockSheetProps.current).not.toBeNull())
    fireEvent.press(getByTestId('sheet-pick'))
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    expect(queryByText(/pode ter mudado/)).toBeNull()
  })

  it('sem caixa (sem código) ⇒ nada grava, toast, card fica', async () => {
    ;(globalThis as any).__draft = undefined
    const { getByTestId, refresh } = renderLink(linkSetup())
    fireEvent.press(getByTestId('setup-link'))
    await waitFor(() => expect(mockSheetProps.current).not.toBeNull())
    fireEvent.press(getByTestId('sheet-pick'))
    expect(mockMedicineUpdate).not.toHaveBeenCalled()
    expect(mockShow).toHaveBeenCalledWith('O remédio ficou como estava.', { variant: 'info' })
    expect(refresh).not.toHaveBeenCalled()
    expect(getByTestId('setup-card-vincular')).toBeTruthy()
  })

  it('erro ao gravar ⇒ sem recarga, card fica (D-5)', async () => {
    ;(globalThis as any).__draft = mounjaroDraft
    mockMedicineUpdate.mockResolvedValueOnce(undefined)
    const { getByTestId, refresh } = renderLink(linkSetup())
    fireEvent.press(getByTestId('setup-link'))
    await waitFor(() => expect(mockSheetProps.current).not.toBeNull())
    fireEvent.press(getByTestId('sheet-pick'))
    await waitFor(() => expect(mockMedicineUpdate).toHaveBeenCalled())
    await waitFor(() => expect(getByTestId('setup-card-vincular')).toBeTruthy())
    expect(refresh).not.toHaveBeenCalled()
  })

  it('ficha do proposto: princípio ativo, para que serve e forma (PO 22/11 — Lipoless → Lipless); "Não é" dispensa', () => {
    const s = linkSetup({
      medicine: { ...tz, name: 'Lipoless' },
      linkMatches: [{ name: 'Lipless', activeIngredient: 'Ciprofibrato', therapeuticClass: 'Fibratos', forms: ['comprimido'] }],
    })
    const { getByText } = renderLink(s)
    expect(getByText('“Lipoless” é o Lipless?')).toBeTruthy()
    expect(getByText(/Ciprofibrato/)).toBeTruthy()
    expect(getByText(/Fibratos/)).toBeTruthy()
    expect(getByText(/comprimido/)).toBeTruthy()
    fireEvent.press(getByText('Não é'))
    expect(s.dismissLink).toHaveBeenCalled()
  })

  it('Corrigir forma abre o form completo com a forma proposta; "Está certo" dispensa', async () => {
    const s = linkSetup({
      card: { kind: 'forma', medicineId: 'm7', protocolId: 'p7', mismatch: { proposed: 'injetavel', reason: 'catalog' } },
    })
    const { getByText, refresh } = renderLink(s)
    expect(getByText('Na lista oficial:')).toBeTruthy()
    expect(getByText('A forma cadastrada não bate com a lista oficial. Qual é a certa?')).toBeTruthy()
    fireEvent.press(getByText('É injetável'))
    await waitFor(() => expect(navigateCrossTab).toHaveBeenCalledWith(ROUTES.TREATMENTS, ROUTES.MEDICINE_EDIT, {
      medicine: { id: 'm7', name: 'Ozempic', laboratory: 'Novo' }, proposedPresentation: 'injetavel',
    }))
    expect(mockMedicineUpdate).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
    fireEvent.press(getByText('É comprimido'))
    expect(s.confirmForm).toHaveBeenCalled()
  })

  it('Corrigir forma sem rede ⇒ toast de erro, nada navega', async () => {
    mockGetById.mockRejectedValueOnce(new Error('offline'))
    const s = linkSetup({ card: { kind: 'forma', medicineId: 'm7', protocolId: 'p7', mismatch: { proposed: null, reason: 'catalog' } } })
    const { getByText } = renderLink(s)
    expect(getByText('Na lista oficial, Tizerpatida vem em outra forma.')).toBeTruthy()
    fireEvent.press(getByText('Corrigir forma'))
    await waitFor(() => expect(mockShow).toHaveBeenCalledWith('Não foi possível abrir o remédio. Tente de novo.', { variant: 'error' }))
    expect(navigateCrossTab).not.toHaveBeenCalled()
  })
})
