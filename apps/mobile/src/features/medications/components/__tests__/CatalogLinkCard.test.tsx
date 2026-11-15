// Spec 119 US4 · PO-119-8 / PO-119-9: vínculo no MESMO medicamento assume a identidade da lista oficial
// (remédio = lista formal, PO 2026-11-15); dose/forma só preenchem vazio; dispensa por id.
import { render, fireEvent, act, waitFor } from '@testing-library/react-native'
import { CatalogLinkCard } from '../CatalogLinkCard'
import { catalogMatchesFor } from '@medications/utils/catalogMatch'

const mockUpdate = jest.fn()
const mockShow = jest.fn()
const mockSheet: { props: any } = { props: null }
const mockDismissed: Record<string, boolean> = {}
const MOUNJARO = { name: 'Mounjaro', activeIngredient: 'Tirzepatida', laboratory: 'Lilly' }
const TIRZ = { name: 'Tirzepatida', activeIngredient: 'Tirzepatida', laboratory: null }
const OZEMPIC = { name: 'Ozempic', activeIngredient: 'Semaglutida', laboratory: 'Novo' }
const OZIVY = { name: 'Ozivy', activeIngredient: 'Tirzepatida', laboratory: 'X' }
const mockDb: { items: any[] | null } = { items: [MOUNJARO] }

jest.mock('@shared/hooks/useMedicineDatabase', () => ({ useMedicineDatabase: () => ({ items: mockDb.items }) }))
jest.mock('@medications/hooks/useMedicineMutation', () => ({ useMedicineMutation: () => ({ update: mockUpdate }) }))
jest.mock('@shared/components/feedback/Toast', () => ({ useToast: () => ({ show: mockShow }) }))
jest.mock('@medications/components/MedicineAnvisaSheet', () => ({
  MedicineAnvisaSheet: (props: any) => {
    mockSheet.props = props
    return null
  },
}))
jest.mock('@medications/services/catalogLinkStore', () => ({
  isCatalogLinkDismissed: async (id: string) => !!mockDismissed[id],
  dismissCatalogLink: async (id: string) => {
    mockDismissed[id] = true
  },
}))

const MED = { id: 'med-1', name: 'tizerpatida', active_ingredient: null, therapeutic_class_code: null }
const draft = (over = {}) => ({
  name: 'Mounjaro',
  active_ingredient: 'Tirzepatida',
  laboratory: 'Lilly',
  therapeutic_class: 'Antidiabéticos',
  therapeutic_class_code: 'A10S',
  regulatory_category: 'novo',
  anvisa_registration: '112600202',
  dosage_per_pill: 5,
  dosage_unit: 'mg',
  presentation: 'injetavel',
  ...over,
})
const IDENTITY = {
  name: 'Mounjaro',
  active_ingredient: 'Tirzepatida',
  laboratory: 'Lilly',
  therapeutic_class: 'Antidiabéticos',
  therapeutic_class_code: 'A10S',
  regulatory_category: 'novo',
  anvisa_registration: '112600202',
}

async function renderCard(medicine: any = MED) {
  const onLinked = jest.fn()
  const utils = render(<CatalogLinkCard medicine={medicine} onLinked={onLinked} />)
  await act(async () => {})
  return { ...utils, onLinked }
}

beforeEach(() => {
  mockDb.items = [MOUNJARO]
  mockUpdate.mockResolvedValue({ id: 'med-1' })
  for (const k of Object.keys(mockDismissed)) delete mockDismissed[k]
})
afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('CatalogLinkCard (119 US4)', () => {
  it('um item casa ⇒ pergunta "Seu remédio é o Mounjaro?" com assinatura da base oficial; "Sim" abre a caixa', async () => {
    const { getByText, getByRole } = await renderCard()
    expect(getByRole('header', { name: 'Seu remédio é o Mounjaro?' })).toBeTruthy()
    expect(getByText('(tirzepatida)')).toBeTruthy()
    expect(getByText('Base oficial da ANVISA')).toBeTruthy()
    fireEvent.press(getByRole('button', { name: 'Sim, é esse' }))
    expect(mockSheet.props).toMatchObject({ open: true, initialItem: MOUNJARO, initialQuery: null, entryPoint: 'catalog_link' })
  })

  it('marca + genérico com o mesmo princípio ativo ⇒ um remédio só, pela marca (smoke 2026-11-15)', async () => {
    mockDb.items = [TIRZ, MOUNJARO]
    const { getByRole } = await renderCard()
    expect(getByRole('header', { name: 'Seu remédio é o Mounjaro?' })).toBeTruthy()
  })

  it('princípios ativos diferentes ⇒ "Achamos remédios com nome parecido", "Escolher o meu" abre a busca', async () => {
    mockDb.items = [MOUNJARO, OZEMPIC]
    const { getByRole } = await renderCard({ ...MED, name: 'ozempik mounjara' })
    expect(getByRole('header', { name: 'Achamos remédios com nome parecido com “ozempik mounjara”' })).toBeTruthy()
    fireEvent.press(getByRole('button', { name: 'Escolher o meu' }))
    expect(mockSheet.props).toMatchObject({ initialItem: null, initialQuery: 'ozempik mounjara' })
    expect(getByRole('button', { name: 'Nenhum desses' })).toBeTruthy()
  })

  it('duas marcas do mesmo princípio ativo ⇒ fica a primeira marca', () => {
    expect(catalogMatchesFor([MOUNJARO, OZIVY], 'tirzepatida').map((i) => i.name)).toHaveLength(1)
  })

  it('PO-119-8: vincular atualiza o MESMO id com a identidade oficial + dose/forma vazias; dispensa e recarrega', async () => {
    const { queryByTestId, onLinked } = await renderCard()
    await act(async () => mockSheet.props.onSelect({ anvisaItem: MOUNJARO, cmedDraft: draft() }))
    expect(mockUpdate).toHaveBeenCalledWith('med-1', { ...IDENTITY, dosage_per_pill: 5, dosage_unit: 'mg', presentation: 'injetavel' })
    expect(onLinked).toHaveBeenCalledTimes(1)
    expect(mockDismissed['med-1']).toBe(true)
    expect(queryByTestId('catalog-link-card')).toBeNull()
  })

  it('genérico ⇒ laboratório e registro da lista oficial (null) também sobrescrevem', async () => {
    await renderCard()
    await act(async () =>
      mockSheet.props.onSelect({ anvisaItem: MOUNJARO, cmedDraft: draft({ anvisa_registration: null, laboratory: null }) })
    )
    expect(mockUpdate).toHaveBeenCalledWith('med-1', expect.objectContaining({ anvisa_registration: null, laboratory: null }))
  })

  it('R-299: dose/forma já cadastradas e iguais não são regravadas', async () => {
    await renderCard({ ...MED, dosage_per_pill: '5', dosage_unit: 'mg', presentation: 'comprimido' })
    await act(async () => mockSheet.props.onSelect({ anvisaItem: MOUNJARO, cmedDraft: draft() }))
    expect(mockUpdate).toHaveBeenCalledWith('med-1', IDENTITY)
  })

  it('caixa de outra concentração ⇒ nada gravado, aviso e reabre nas caixas do mesmo remédio', async () => {
    jest.useFakeTimers()
    await renderCard({ ...MED, dosage_per_pill: 2.5, dosage_unit: 'mg' })
    await act(async () => mockSheet.props.onSelect({ anvisaItem: MOUNJARO, cmedDraft: draft() }))
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockShow).toHaveBeenCalledWith(expect.stringContaining('outra concentração'), expect.anything())
    expect(mockSheet.props.open).toBe(false)
    await act(async () => {
      jest.advanceTimersByTime(400)
    })
    expect(mockSheet.props).toMatchObject({ open: true, initialItem: MOUNJARO, initialQuery: null })
    jest.useRealTimers()
  })

  it('reaberto no item e outra força de novo ⇒ para (sem loop), avisa e não reabre', async () => {
    jest.useFakeTimers()
    await renderCard({ ...MED, dosage_per_pill: 25, dosage_unit: 'mg' })
    await act(async () => mockSheet.props.onSelect({ anvisaItem: MOUNJARO, cmedDraft: draft() }))
    await act(async () => {
      jest.advanceTimersByTime(400)
    })
    expect(mockSheet.props.initialItem).toBe(MOUNJARO)
    await act(async () => mockSheet.props.onSelect({ anvisaItem: MOUNJARO, cmedDraft: draft() }))
    await act(async () => {
      jest.advanceTimersByTime(400)
    })
    expect(mockSheet.props.open).toBe(false)
    expect(mockShow).toHaveBeenLastCalledWith(expect.stringContaining('não tem caixa com a mesma dose'), expect.anything())
    expect(mockUpdate).not.toHaveBeenCalled()
    jest.useRealTimers()
  })

  it('vários remédios + outra força ⇒ reabre na LISTA, nunca direto no item', async () => {
    jest.useFakeTimers()
    mockDb.items = [MOUNJARO, OZEMPIC]
    await renderCard({ ...MED, name: 'ozempik mounjara', dosage_per_pill: 25, dosage_unit: 'mg' })
    await act(async () => mockSheet.props.onSelect({ anvisaItem: MOUNJARO, cmedDraft: draft() }))
    await act(async () => {
      jest.advanceTimersByTime(400)
    })
    expect(mockSheet.props).toMatchObject({ open: true, initialItem: null, initialQuery: 'ozempik mounjara' })
    expect(mockSheet.props.initialResults.length).toBeGreaterThan(1)
    jest.useRealTimers()
  })

  it('unidade diferente ⇒ também é outra concentração', async () => {
    await renderCard({ ...MED, dosage_unit: 'mcg' })
    await act(async () => mockSheet.props.onSelect({ anvisaItem: MOUNJARO, cmedDraft: draft() }))
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('caixa sem código (não listada/offline) ⇒ nada gravado, convite fica (INV-1)', async () => {
    const { getByTestId } = await renderCard()
    await act(async () => mockSheet.props.onSelect({ anvisaItem: MOUNJARO }))
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockShow).toHaveBeenCalled()
    expect(getByTestId('catalog-link-card')).toBeTruthy()
  })

  it('update falha ⇒ convite fica, não dispensa', async () => {
    mockUpdate.mockResolvedValueOnce(undefined)
    const { getByTestId } = await renderCard()
    await act(async () => mockSheet.props.onSelect({ anvisaItem: MOUNJARO, cmedDraft: draft() }))
    expect(mockDismissed['med-1']).toBeUndefined()
    expect(getByTestId('catalog-link-card')).toBeTruthy()
  })

  it('PO-119-9: "Não é" dispensa; reabrir o detalhe não mostra de novo', async () => {
    const first = await renderCard()
    fireEvent.press(first.getByRole('button', { name: 'Não é' }))
    expect(first.queryByTestId('catalog-link-card')).toBeNull()
    first.unmount()
    const again = await renderCard()
    await waitFor(() => expect(again.queryByTestId('catalog-link-card')).toBeNull())
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('sem casamento, base indisponível ou com código ⇒ nada', async () => {
    expect((await renderCard({ ...MED, name: 'creatina' })).queryByTestId('catalog-link-card')).toBeNull()
    mockDb.items = null
    expect((await renderCard()).queryByTestId('catalog-link-card')).toBeNull()
    mockDb.items = [MOUNJARO]
    expect((await renderCard({ ...MED, therapeutic_class_code: 'A10S' })).queryByTestId('catalog-link-card')).toBeNull()
  })

  it('catalogMatchesFor: cai no princípio ativo quando o nome não casa', () => {
    expect(catalogMatchesFor([MOUNJARO], 'minha caneta', 'tirzepatida').map((i) => i.name)).toEqual(['Mounjaro'])
    expect(catalogMatchesFor(null, 'mounjaro')).toEqual([])
  })
})
