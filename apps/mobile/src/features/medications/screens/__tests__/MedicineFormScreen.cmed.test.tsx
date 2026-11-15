// 066 Slice C (T023/T023a · PO-1) — o form aplica o rascunho da caixa escolhida no passo 2,
// exige a escolha da concentração no composto ambíguo (INV-2 — o Zod aceita dose vazia, C-C2; C-C10), limpa o registro ao
// trocar de item (C-C4) e usa `forms` para pré-preencher/filtrar a apresentação.

import React from 'react'
import { render, fireEvent, act } from '@testing-library/react-native'
import { Alert } from 'react-native'
import MedicineFormScreen from '../MedicineFormScreen'

const mockCreate = jest.fn()
const mockUpdate = jest.fn()
const mockSheet: { onSelect: ((sel: any) => void) | null; props: any } = { onSelect: null, props: null }
const mockMedicines: { current: { data: any[] | null; loading: boolean } } = { current: { data: [], loading: false } }
const mockRoute: { params: any } = { params: {} }
const mockDb: { items: any[] | null } = { items: null }

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn() }),
  useRoute: () => mockRoute,
}))
jest.mock('@medications/hooks/useMedicineMutation', () => ({
  useMedicineMutation: () => ({ create: mockCreate, update: mockUpdate, isLoading: false }),
}))
jest.mock('@medications/hooks/useMedicines', () => ({
  useMedicines: () => mockMedicines.current,
}))
jest.mock('@shared/hooks/useMedicineDatabase', () => ({
  useMedicineDatabase: () => ({ items: mockDb.items, isLoading: false }),
}))
jest.mock('@medications/components/MedicineAnvisaSheet', () => ({
  MedicineAnvisaSheet: (props: any) => {
    mockSheet.onSelect = props.onSelect
    mockSheet.props = props
    return null
  },
}))
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native')
  return {
    SafeAreaView: View,
    SafeAreaProvider: ({ children }) => children,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  }
})
jest.mock('@medications/components/AnvisaBanner', () => ({ AnvisaBanner: () => null }))

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
  mockMedicines.current = { data: [], loading: false }
  mockRoute.params = {}
  mockDb.items = null
})

const ITEM = { name: 'Concor Anlo', activeIngredient: 'Besilato de Anlodipino; Fumarato de Bisoprolol', laboratory: 'Merck', regulatoryCategory: 'Novo', forms: ['comprimido'] }

function draft(over: Record<string, unknown> = {}) {
  return {
    name: 'Concor Anlo', active_ingredient: 'Besilato de Anlodipino; Fumarato de Bisoprolol',
    dosage_per_pill: 5, dosage_unit: 'mg', presentation: 'comprimido', laboratory: 'Merck',
    anvisa_registration: '100890321', regulatory_category: 'Novo', therapeutic_class: null,
    strengthLabel: '5 mg + 10 mg', displayLaboratory: 'Merck', boxQuantity: 30,
    doseAmbiguous: false, strengthChoices: [], isGeneric: false, ...over,
  }
}

function select(sel: any) {
  act(() => mockSheet.onSelect?.(sel))
}

describe('MedicineFormScreen — rascunho da CMED (066 Slice C)', () => {
  it('caixa escolhida preenche dose/unidade/forma/registro e mostra a força completa (D9)', async () => {
    const { getByText, getByDisplayValue } = render(<MedicineFormScreen />)
    select({ anvisaItem: ITEM, cmedDraft: draft() })
    expect(getByDisplayValue('5')).toBeTruthy()
    expect(getByText('Na embalagem: 5 mg + 10 mg')).toBeTruthy()
    await act(async () => fireEvent.press(getByText('Criar medicamento')))
    const payload = mockCreate.mock.calls[0][0]
    expect(payload.anvisa_registration).toBe('100890321')
    expect(payload.dosage_per_pill).toBe(5)
    expect(payload.presentation).toBe('comprimido')
    expect(payload.laboratory).toBe('Merck')
    expect(mockCreate.mock.calls[0][1]).toMatchObject({ source: 'anvisa_search' })
  })

  it('cadastro sem a busca registra source manual no medicine_added', async () => {
    const { getByText, getByLabelText } = render(<MedicineFormScreen />)
    fireEvent.changeText(getByLabelText('Nome'), 'Remédio X')
    fireEvent.changeText(getByLabelText('Concentração'), '5')
    await act(async () => fireEvent.press(getByText('Criar medicamento')))
    expect(mockCreate.mock.calls[0][1]).toMatchObject({ source: 'manual' })
  })

  it('composto ambíguo: pergunta a concentração com botões; um toque preenche dose e unidade (C-C10)', async () => {
    const { getByText, queryByText, getByLabelText, getByDisplayValue } = render(<MedicineFormScreen />)
    select({
      anvisaItem: ITEM,
      cmedDraft: draft({
        dosage_per_pill: null, doseAmbiguous: true, strengthLabel: '5000 mcg + 100 mg + 100 mg',
        strengthChoices: [{ dose: 5000, unit: 'mcg' }, { dose: 100, unit: 'mg' }],
      }),
    })
    expect(getByText('Este remédio junta mais de uma substância')).toBeTruthy()
    expect(getByText('Na embalagem: 5000 mcg + 100 mg + 100 mg')).toBeTruthy()
    expect(queryByText(/dose/i)).toBeNull()
    fireEvent.press(getByLabelText('Usar 5.000 mcg'))
    expect(getByDisplayValue('5000')).toBeTruthy()
    expect(queryByText('Este remédio junta mais de uma substância')).toBeNull()
    expect(getByText('Na embalagem: 5000 mcg + 100 mg + 100 mg')).toBeTruthy()
    await act(async () => fireEvent.press(getByText('Criar medicamento')))
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ dosage_per_pill: 5000, dosage_unit: 'mcg' })
  })

  it('composto ambíguo sem escolha: botão não muda nem trava; salvar mostra o erro no campo (C-C10)', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    const { getByText, queryByText, getByLabelText } = render(<MedicineFormScreen />)
    select({ anvisaItem: ITEM, cmedDraft: draft({ dosage_per_pill: null, doseAmbiguous: true, strengthChoices: [{ dose: 5, unit: 'mg' }, { dose: 10, unit: 'mg' }] }) })
    expect(queryByText('Preencha a dose para salvar')).toBeNull()
    await act(async () => fireEvent.press(getByText('Criar medicamento')))
    expect(mockCreate).not.toHaveBeenCalled()
    expect(alert).toHaveBeenCalled()
    expect(getByText('Escolha a concentração abaixo')).toBeTruthy()

    fireEvent.changeText(getByLabelText('Concentração'), '10')
    expect(queryByText('Escolha a concentração abaixo')).toBeNull()
    await act(async () => fireEvent.press(getByText('Criar medicamento')))
    expect(mockCreate).toHaveBeenCalledTimes(1)
    alert.mockRestore()
  })

  it('força que o app não converte (B8 "500 mg/"): campos vazios e a referência da embalagem (C-C10)', () => {
    const { getByText, queryByText, queryByDisplayValue } = render(<MedicineFormScreen />)
    select({ anvisaItem: ITEM, cmedDraft: draft({ dosage_per_pill: null, dosage_unit: null, strengthLabel: '500 mg/', presentation: 'injetavel' }) })
    expect(getByText('Na embalagem: 500 mg/')).toBeTruthy()
    expect(queryByDisplayValue('500')).toBeNull()
    expect(queryByText('mg', { exact: true })).toBeNull()
  })

  it('genérico: sem laboratório e sem registro (D11)', async () => {
    const { getByText } = render(<MedicineFormScreen />)
    select({
      anvisaItem: { ...ITEM, laboratory: null, regulatoryCategory: 'Genérico' },
      cmedDraft: draft({ laboratory: null, anvisa_registration: null, isGeneric: true, regulatory_category: 'Genérico' }),
    })
    await act(async () => fireEvent.press(getByText('Criar medicamento')))
    const payload = mockCreate.mock.calls[0][0]
    expect(payload.laboratory).toBeFalsy()
    expect(payload.anvisa_registration).toBeNull()
  })

  it('trocar para um item sem caixa limpa o registro anterior (C-C4)', async () => {
    const { getByText } = render(<MedicineFormScreen />)
    select({ anvisaItem: ITEM, cmedDraft: draft() })
    select({ anvisaItem: { ...ITEM, name: 'Outro' } })
    await act(async () => fireEvent.press(getByText('Criar medicamento')))
    expect(mockCreate.mock.calls[0][0].anvisa_registration).toBeNull()
  })

  it('forms com valor único pré-preenche a apresentação', async () => {
    const { getByText, getByLabelText } = render(<MedicineFormScreen />)
    select({ anvisaItem: { ...ITEM, forms: ['injetavel'] } })
    fireEvent.changeText(getByLabelText('Concentração'), '5')
    await act(async () => fireEvent.press(getByText('Criar medicamento')))
    expect(mockCreate.mock.calls[0][0].presentation).toBe('injetavel')
  })

  it('forms com vários valores filtra o dropdown e mantém "Ver todas" (INV-3)', () => {
    const { getByLabelText, getByText, queryByText } = render(<MedicineFormScreen />)
    select({ anvisaItem: { ...ITEM, forms: ['comprimido', 'liquido'] } })
    fireEvent.press(getByLabelText('Apresentação'))
    expect(getByText('Ver todas')).toBeTruthy()
    expect(queryByText('Pomada')).toBeNull()
    fireEvent.press(getByText('Ver todas'))
    fireEvent.press(getByLabelText('Apresentação'))
    expect(getByText('Pomada')).toBeTruthy()
  })

  it('forma escolhida à mão não é sobrescrita por forms do próximo item', async () => {
    const { getByLabelText, getByText } = render(<MedicineFormScreen />)
    fireEvent.press(getByLabelText('Apresentação'))
    fireEvent.press(getByText('Pomada'))
    select({ anvisaItem: { ...ITEM, forms: ['comprimido'] } })
    fireEvent.changeText(getByLabelText('Concentração'), '5')
    await act(async () => fireEvent.press(getByText('Criar medicamento')))
    expect(mockCreate.mock.calls[0][0].presentation).toBe('pomada')
  })
})

// 119 B — sugestões nos campos (FR-007/008, PO-119-6/7/12) e a pergunta "já tem" na busca (decisão C).
describe('MedicineFormScreen — sugestões do catálogo (119 B)', () => {
  const MOUNJARO = { name: 'Mounjaro', activeIngredient: 'Tirzepatida', laboratory: 'Lilly', regulatoryCategory: 'Novo', forms: ['injetavel'] }
  const OZEMPIC = { name: 'Ozempic', activeIngredient: 'Semaglutida', laboratory: 'Novo', regulatoryCategory: 'Novo', forms: ['injetavel'] }
  const mounjaroDraft = (dose: number) =>
    draft({
      name: 'Mounjaro', active_ingredient: 'Tirzepatida', dosage_per_pill: dose, dosage_unit: 'mg/ml',
      presentation: 'injetavel', laboratory: 'Lilly', anvisa_registration: '112600202',
      therapeutic_class_code: 'A10S', strengthLabel: `${dose} mg/ml`,
    })
  const etapa = (id: string, dose: number) => ({ id, name: 'Mounjaro', active_ingredient: 'Tirzepatida', dosage_per_pill: dose, dosage_unit: 'mg/ml', presentation: 'injetavel', anvisa_registration: '112600202' })

  beforeEach(() => {
    jest.useFakeTimers()
    mockDb.items = [MOUNJARO, OZEMPIC]
  })
  afterEach(() => jest.useRealTimers())

  function typeAndSettle(utils: any, label: string, text: string) {
    fireEvent.changeText(utils.getByLabelText(label), text)
    act(() => {
      jest.advanceTimersByTime(200)
    })
  }

  it('Nome: erro de digitação sugere sob "Você quis dizer"; tocar abre a escolha da caixa daquele item', () => {
    const utils = render(<MedicineFormScreen />)
    typeAndSettle(utils, 'Nome', 'tizerpatida')
    expect(utils.getByText('Você quis dizer…')).toBeTruthy()
    fireEvent.press(utils.getByRole('button', { name: 'Mounjaro, Tirzepatida, Lilly' }))
    expect(mockSheet.props).toMatchObject({ open: true, initialItem: MOUNJARO, entryPoint: 'catalog_suggestion' })
    expect(utils.queryByTestId('catalog-suggestions')).toBeNull()
  })

  it('Princípio Ativo também sugere; "Ver todos" abre a busca com o texto', () => {
    const utils = render(<MedicineFormScreen />)
    typeAndSettle(utils, 'Princípio Ativo', 'semaglu')
    expect(utils.getByRole('button', { name: 'Ozempic, Semaglutida, Novo' })).toBeTruthy()
    fireEvent.press(utils.getByRole('button', { name: 'Ver todos na lista ANVISA' }))
    expect(mockSheet.props).toMatchObject({ open: true, initialItem: null, initialQuery: 'semaglu' })
  })

  it('aceitar a caixa ⇒ código de classe e registro gravados (PO-119-6)', async () => {
    const utils = render(<MedicineFormScreen />)
    select({ anvisaItem: MOUNJARO, cmedDraft: mounjaroDraft(5) })
    await act(async () => fireEvent.press(utils.getByText('Criar medicamento')))
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ therapeutic_class_code: 'A10S', anvisa_registration: '112600202' })
  })

  it('ignorar as sugestões ⇒ cadastro manual, sem código nem registro (FR-009)', async () => {
    const utils = render(<MedicineFormScreen />)
    typeAndSettle(utils, 'Nome', 'tizerpatida')
    fireEvent.changeText(utils.getByLabelText('Concentração'), '5')
    await act(async () => fireEvent.press(utils.getByText('Criar medicamento')))
    const payload = mockCreate.mock.calls[0][0]
    expect(payload.name).toBe('tizerpatida')
    expect(payload.therapeutic_class_code ?? null).toBeNull()
    expect(payload.anvisa_registration ?? null).toBeNull()
    expect(mockCreate.mock.calls[0][1]).toMatchObject({ source: 'manual' })
  })

  it('base indisponível ⇒ campo aceita texto e o salvar segue habilitado, sem lista nem erro (PO-119-7)', async () => {
    mockDb.items = null
    const utils = render(<MedicineFormScreen />)
    typeAndSettle(utils, 'Nome', 'mounjaro')
    expect(utils.queryByTestId('catalog-suggestions')).toBeNull()
    fireEvent.changeText(utils.getByLabelText('Concentração'), '5')
    await act(async () => fireEvent.press(utils.getByText('Criar medicamento')))
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('decisão C: mesma concentração já cadastrada ⇒ pergunta "É este que você já tem?"', () => {
    mockMedicines.current = { data: [etapa('e5', 5)], loading: false }
    const utils = render(<MedicineFormScreen />)
    select({ anvisaItem: MOUNJARO, cmedDraft: mounjaroDraft(5) })
    expect(utils.getByText('É este que você já tem?')).toBeTruthy()
  })

  it('decisão C: só outra concentração (etapa da escada) ⇒ sem pergunta, cria direto', async () => {
    mockMedicines.current = { data: [etapa('e25', 2.5)], loading: false }
    const utils = render(<MedicineFormScreen />)
    select({ anvisaItem: MOUNJARO, cmedDraft: mounjaroDraft(5) })
    expect(utils.queryByText('É este que você já tem?')).toBeNull()
    await act(async () => fireEvent.press(utils.getByText('Criar medicamento')))
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('decisão C: lista ainda carregando ⇒ salvar espera a pergunta (FM-7)', async () => {
    mockMedicines.current = { data: null, loading: true }
    const alert = jest.spyOn(Alert, 'alert')
    const utils = render(<MedicineFormScreen />)
    select({ anvisaItem: MOUNJARO, cmedDraft: mounjaroDraft(5) })
    await act(async () => fireEvent.press(utils.getByText('Criar medicamento')))
    expect(mockCreate).not.toHaveBeenCalled()
    expect(alert).toHaveBeenCalledWith('Um momento', expect.any(String))
  })

  it('edição de medicamento COM código ⇒ nenhuma sugestão (D-5)', () => {
    mockRoute.params = { medicine: { id: 'm1', name: 'Mounjaro', dosage_per_pill: 5, dosage_unit: 'mg/ml', therapeutic_class_code: 'A10S' } }
    const utils = render(<MedicineFormScreen />)
    typeAndSettle(utils, 'Nome', 'tizerpatida')
    expect(utils.queryByTestId('catalog-suggestions')).toBeNull()
  })

  it('edição SEM código ⇒ sugere; a caixa escolhida salva no MESMO id, sem pergunta de candidatos (D-5/C-B6)', async () => {
    mockRoute.params = { medicine: { id: 'm1', name: 'tizerpatida', dosage_per_pill: 5, dosage_unit: 'mg/ml', type: 'medicamento', presentation: 'injetavel' } }
    mockMedicines.current = { data: [etapa('m1', 5)], loading: false }
    const utils = render(<MedicineFormScreen />)
    typeAndSettle(utils, 'Nome', 'tizerpatida ')
    expect(utils.getByTestId('catalog-suggestions')).toBeTruthy()
    select({ anvisaItem: MOUNJARO, cmedDraft: mounjaroDraft(5) })
    expect(utils.queryByText('É este que você já tem?')).toBeNull()
    await act(async () => fireEvent.press(utils.getByText('Salvar')))
    expect(mockUpdate).toHaveBeenCalledWith('m1', expect.objectContaining({ therapeutic_class_code: 'A10S' }), expect.anything())
    expect(mockCreate).not.toHaveBeenCalled()
  })
})
