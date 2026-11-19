// 125 1c — form de remédio na ordem do onboarding (PO-125-19) e folha de troca de forma (PO-125-20).
//
// PO-125-19: Nome › Como é › Dosagem › Validade (só injetável/líquido) › "Mais detalhes" FECHADO; título
// "Novo remédio"/"Editar remédio"; botão "Salvar remédio".
// PO-125-20: trocar a forma de remédio com tratamento abre a folha, um tratamento por vez; "Revisar" abre o
// form do tratamento; "Agora não" segue sem mudar nada; nada é gravado no tratamento daqui (INV-2).

import React from 'react'
import { render, fireEvent, act, waitFor } from '@testing-library/react-native'
import MedicineFormScreen from '../MedicineFormScreen'

const mockUpdate = jest.fn()
const mockCreate = jest.fn()
const mockNav = { goBack: jest.fn(), push: jest.fn(), popTo: jest.fn(), navigate: jest.fn(), setParams: jest.fn() }
const mockRoute: { params: any } = { params: {} }
const mockCrossTab = jest.fn()
jest.mock('@navigation/navigateCrossTab', () => ({ navigateCrossTab: (...args: any[]) => mockCrossTab(...args) }))
const mockProtocols: { rows: any[] } = { rows: [] }
const mockFocus: { cb: (() => void) | null } = { cb: null }

jest.mock('@react-navigation/native', () => ({
  // Como o real: com a tela focada, callback novo roda de novo (RC6 #968 — era assim que o último item
  // da fila fechava o form recém-aberto).
  useFocusEffect: (cb: () => void) => {
    mockFocus.cb = cb
    require('react').useEffect(() => {
      cb()
    }, [cb])
  },
  useIsFocused: () => true,
  useNavigation: () => mockNav,
  useRoute: () => mockRoute,
}))
jest.mock('@medications/hooks/useMedicineMutation', () => ({
  useMedicineMutation: () => ({ create: mockCreate, update: mockUpdate, isLoading: false }),
}))
jest.mock('@medications/hooks/useMedicines', () => ({ useMedicines: () => ({ data: [], loading: false }) }))
jest.mock('@shared/hooks/useMedicineDatabase', () => ({ useMedicineDatabase: () => ({ items: null, isLoading: false }) }))
jest.mock('@medications/components/MedicineAnvisaSheet', () => ({ MedicineAnvisaSheet: () => null }))
jest.mock('@medications/components/AnvisaBanner', () => ({ AnvisaBanner: () => null }))
jest.mock('@treatments/services/protocolService', () => ({
  protocolService: { getByMedicineId: jest.fn(async () => mockProtocols.rows) },
}))
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native')
  return { SafeAreaView: View, SafeAreaProvider: ({ children }) => children, useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }
})

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
  mockRoute.params = {}
  mockProtocols.rows = []
  mockFocus.cb = null
})

const LOSARTANA = {
  id: 'm1', name: 'Losartana', presentation: 'comprimido', dosage_per_pill: 25, dosage_unit: 'mg',
  type: 'medicamento', concentration_volume_ml: null, shelf_life_days: null,
}
const T1 = { id: 'p1', name: 'Pressão', active: true, dosage_per_intake: 1, intake_unit: null }
const T2 = { id: 'p2', name: 'Pressão noite', active: true, dosage_per_intake: 1, intake_unit: null }

function editLosartana(params: Record<string, unknown> = {}) {
  mockRoute.params = { medicine: LOSARTANA, ...params }
  mockUpdate.mockImplementation(async (_id, payload) => ({ ...LOSARTANA, ...payload }))
  return render(<MedicineFormScreen />)
}

async function switchToInjectableAndSave(utils) {
  fireEvent.press(utils.getByTestId('presentation-chip-injetavel'))
  await act(async () => fireEvent.press(utils.getByText('Salvar remédio')))
}

describe('PO-125-19 — form de remédio na ordem do onboarding', () => {
  it('comprimido sem concentração: erro no campo, sem salvar (smoke 1c)', async () => {
    const utils = render(<MedicineFormScreen />)
    fireEvent.changeText(utils.getByLabelText('Nome'), 'Losartana')
    fireEvent.press(utils.getByTestId('presentation-chip-comprimido'))
    await act(async () => fireEvent.press(utils.getByText('Salvar remédio')))
    expect(mockCreate).not.toHaveBeenCalled()
    expect(utils.getByText('Informe a concentração')).toBeTruthy()
  })

  it('"Mais detalhes" fechado resume o que está preenchido (smoke 1c)', () => {
    const { moreDetailsSummary } = jest.requireActual('@medications/utils/moreDetailsSummary')
    expect(moreDetailsSummary({ type: 'medicamento' })).toBe('Princípio ativo · Tipo · Classe · Categoria · Laboratório')
    expect(moreDetailsSummary({ type: 'suplemento', active_ingredient: 'Colecalciferol', laboratory: 'EMS' })).toBe('Colecalciferol · Suplemento · EMS')
  })

  it('novo: título "Novo remédio", botão "Salvar remédio", ordem Nome › Como é › Dosagem › Mais detalhes', () => {
    const utils = render(<MedicineFormScreen />)
    expect(utils.getByText('Novo remédio')).toBeTruthy()
    expect(utils.getByText('Salvar remédio')).toBeTruthy()
    // Smoke 1c: sem números; obrigatório no título da seção (FormSection deixa em caixa alta).
    const titles = utils.getAllByText(/^(REMÉDIO|COMO É|DOSAGEM)/).map((el) => [].concat(el.props.children)[0])
    expect(titles).toEqual(['REMÉDIO', 'COMO É', 'DOSAGEM'])
    expect(utils.queryByText(/^[123] · /)).toBeNull()
  })

  it('"Mais detalhes" nasce fechado (princípio ativo, tipo e laboratório escondidos) e abre ao toque', () => {
    const utils = render(<MedicineFormScreen />)
    expect(utils.queryByLabelText('Princípio ativo')).toBeNull()
    expect(utils.queryByLabelText('Laboratório')).toBeNull()
    fireEvent.press(utils.getByTestId('more-details'))
    expect(utils.getByLabelText('Princípio ativo')).toBeTruthy()
    expect(utils.getByTestId('medicine-type-suplemento')).toBeTruthy()
  })

  it.each([
    ['injetavel', true],
    ['liquido', true],
    ['comprimido', false],
    ['capsula', false],
  ])('validade depois de aberto com forma %s ⇒ visível=%s (AC7.4)', (form, shown) => {
    const utils = render(<MedicineFormScreen />)
    fireEvent.press(utils.getByTestId(`presentation-chip-${form}`))
    expect(!!utils.queryByLabelText('Validade depois de aberto (dias)')).toBe(shown)
  })

  it('editar: título "Editar remédio"', () => {
    const utils = editLosartana()
    expect(utils.getByText('Editar remédio')).toBeTruthy()
  })
})

describe('PO-125-20 — troca de forma com tratamento (AC7.5)', () => {
  it('2 tratamentos: folha do 1º; Revisar abre o form dele; ao voltar, folha do 2º; Agora não sai', async () => {
    mockProtocols.rows = [T1, T2]
    const utils = editLosartana()
    await switchToInjectableAndSave(utils)

    await waitFor(() => expect(utils.getByText('A dose de Pressão pode ter mudado')).toBeTruthy())
    expect(utils.getByText(/A forma passou de comprimido para injetável\./)).toBeTruthy()
    expect(mockNav.goBack).not.toHaveBeenCalled()

    fireEvent.press(utils.getByTestId('form-change-review'))
    expect(mockNav.push).toHaveBeenCalledWith('ProtocolForm', { id: 'p1' })
    act(() => mockFocus.cb?.())

    expect(utils.getByText('A dose de Pressão noite pode ter mudado')).toBeTruthy()
    fireEvent.press(utils.getByTestId('form-change-dismiss'))
    expect(utils.queryByTestId('form-change-sheet')).toBeNull()
    expect(mockNav.goBack).toHaveBeenCalledTimes(1)
  })

  it('1 tratamento: Revisar e voltar encerra a edição (goBack)', async () => {
    mockProtocols.rows = [T1]
    const utils = editLosartana()
    await switchToInjectableAndSave(utils)
    await waitFor(() => expect(utils.getByTestId('form-change-sheet')).toBeTruthy())
    fireEvent.press(utils.getByTestId('form-change-review'))
    // Ainda na ida para o form do tratamento: nada de fechar (RC6 #968).
    expect(mockNav.push).toHaveBeenCalledTimes(1)
    expect(mockNav.goBack).not.toHaveBeenCalled()
    act(() => mockFocus.cb?.())
    expect(mockNav.goBack).toHaveBeenCalledTimes(1)
  })

  it('sem tratamento: salva e volta, sem folha', async () => {
    const utils = editLosartana()
    await switchToInjectableAndSave(utils)
    await waitFor(() => expect(mockNav.goBack).toHaveBeenCalledTimes(1))
    expect(utils.queryByTestId('form-change-sheet')).toBeNull()
  })

  it('só o nome mudou: sem folha', async () => {
    mockProtocols.rows = [T1]
    const utils = editLosartana()
    fireEvent.changeText(utils.getByLabelText('Nome'), 'Losartana 25')
    await act(async () => fireEvent.press(utils.getByText('Salvar remédio')))
    await waitFor(() => expect(mockNav.goBack).toHaveBeenCalledTimes(1))
    expect(utils.queryByTestId('form-change-sheet')).toBeNull()
  })

  it('falha ao salvar: sem folha e sem sair (o toast de erro é da mutação)', async () => {
    mockProtocols.rows = [T1]
    const utils = editLosartana()
    mockUpdate.mockResolvedValue(undefined)
    await switchToInjectableAndSave(utils)
    expect(utils.queryByTestId('form-change-sheet')).toBeNull()
    expect(mockNav.goBack).not.toHaveBeenCalled()
  })
})

describe('cadastro vindo do "Cadastrar com os dados da caixa" do Estoque (smoke 1c, PO 19/11)', () => {
  it('voltar sem salvar leva ao Estoque', () => {
    mockRoute.params = { purchaseAfter: { scanEan: '789' } }
    const utils = render(<MedicineFormScreen />)
    fireEvent.press(utils.getByLabelText('Voltar'))
    expect(mockNav.goBack).toHaveBeenCalledTimes(1)
    expect(mockCrossTab).toHaveBeenCalledWith('Estoque', undefined, undefined)
  })

  it('salvar segue para a compra do remédio criado, com a caixa lida', async () => {
    mockRoute.params = { purchaseAfter: { scanEan: '789' } }
    mockCreate.mockResolvedValue({ id: 'new-1', name: 'Corus' })
    const utils = render(<MedicineFormScreen />)
    fireEvent.changeText(utils.getByLabelText('Nome'), 'Corus')
    fireEvent.press(utils.getByTestId('presentation-chip-comprimido'))
    fireEvent.changeText(utils.getByLabelText('Concentração'), '50')
    fireEvent.press(utils.getByTestId('unit-chip-mg'))
    await act(async () => fireEvent.press(utils.getByText('Salvar remédio')))
    await waitFor(() => expect(mockCrossTab).toHaveBeenCalled())
    expect(mockCrossTab).toHaveBeenCalledWith('Estoque', 'PurchaseForm', expect.objectContaining({ medicineId: 'new-1', scanEan: '789', scanConfirmed: true }))
  })
})
