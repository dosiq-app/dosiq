// Spec 119 · PO-119-12 / PO-119-13 (parte automatizável): estados e acessibilidade da lista.
import { render, fireEvent, screen } from '@testing-library/react-native'
import { CatalogSuggestionList } from '../CatalogSuggestionList'

const mounjaro = { name: 'Mounjaro', activeIngredient: 'Tirzepatida', laboratory: 'Lilly' }
const tirz = { name: 'Tirzepatida', activeIngredient: 'Tirzepatida', laboratory: null }

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('CatalogSuggestionList (119 B)', () => {
  it('zero resultados ⇒ não renderiza nada', () => {
    render(<CatalogSuggestionList exact={[]} approx={[]} onSelect={jest.fn()} onSeeAll={jest.fn()} />)
    expect(screen.queryByTestId('catalog-suggestions')).toBeNull()
  })

  it('exact sem cabeçalho; approx sob "Você quis dizer…"; contagem anunciada', () => {
    render(<CatalogSuggestionList exact={[mounjaro]} approx={[tirz]} onSelect={jest.fn()} onSeeAll={jest.fn()} />)
    expect(screen.getByText('2 sugestões da lista oficial')).toBeTruthy()
    expect(screen.getByRole('header', { name: 'Você quis dizer…' })).toBeTruthy()
  })

  it('só exact ⇒ sem cabeçalho "Você quis dizer"', () => {
    render(<CatalogSuggestionList exact={[mounjaro]} approx={[]} onSelect={jest.fn()} onSeeAll={jest.fn()} />)
    expect(screen.queryByText('Você quis dizer…')).toBeNull()
    expect(screen.getByText('1 sugestão da lista oficial')).toBeTruthy()
  })

  it('rótulo completo por item e rank contínuo entre camadas', () => {
    const onSelect = jest.fn()
    render(<CatalogSuggestionList exact={[mounjaro]} approx={[tirz]} onSelect={onSelect} onSeeAll={jest.fn()} />)
    fireEvent.press(screen.getByRole('button', { name: 'Tirzepatida, Tirzepatida' }))
    expect(onSelect).toHaveBeenCalledWith(tirz, 1)
    fireEvent.press(screen.getByRole('button', { name: 'Mounjaro, Tirzepatida, Lilly' }))
    expect(onSelect).toHaveBeenCalledWith(mounjaro, 0)
  })

  it('"Ver todos na lista ANVISA" chama onSeeAll', () => {
    const onSeeAll = jest.fn()
    render(<CatalogSuggestionList exact={[mounjaro]} approx={[]} onSelect={jest.fn()} onSeeAll={onSeeAll} />)
    fireEvent.press(screen.getByRole('button', { name: 'Ver todos na lista ANVISA' }))
    expect(onSeeAll).toHaveBeenCalledTimes(1)
  })
})
