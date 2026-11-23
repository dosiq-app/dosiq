import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MedicineForm from '../MedicineForm'

vi.mock('@shared/components/ui/animations/ShakeEffect', () => ({
  default: ({ children }) => <div data-testid="shake-effect">{children}</div>
}))

// Mock expõe os dois caminhos reais do GenericAutocomplete: digitar (onChange)
// e selecionar da base ANVISA (onSelect).
vi.mock('../MedicineAutocomplete', () => ({
  default: ({ value, onChange, onSelect }) => (
    <div data-testid="medicine-autocomplete">
      <input aria-label="mock-nome" value={value} onChange={(e) => onChange(e.target.value)} />
      <button
        type="button"
        onClick={() =>
          onSelect({
            name: 'Tylenol',
            activeIngredient: 'PARACETAMOL',
            therapeuticClass: 'ANALGESICO',
            regulatoryCategory: 'Referência',
            laboratory: 'Janssen',
          })
        }
      >
        selecionar-anvisa
      </button>
    </div>
  )
}))

vi.mock('../LaboratoryAutocomplete', () => ({
  default: () => <div data-testid="laboratory-autocomplete">LaboratoryAutocomplete</div>
}))

afterEach(() => {
  vi.clearAllMocks()
  vi.clearAllTimers()
})

describe('MedicineForm Smoke Test', () => {
  it('renders correctly', () => {
    render(<MedicineForm onSave={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText('Novo Medicamento')).toBeInTheDocument()
    expect(screen.getByText('Tipo')).toBeInTheDocument()
    expect(screen.getByText(/Nome do Remédio/)).toBeInTheDocument()
    expect(screen.getByText(/Princípio Ativo/)).toBeInTheDocument()
    expect(screen.getByText(/Classe Terapêutica/)).toBeInTheDocument()
    expect(screen.getByText(/Marca \/ Laboratório/)).toBeInTheDocument()
  })
})

describe('MedicineForm — princípio ativo (spec 128 B)', () => {
  const getIngredient = () => screen.getByLabelText(/Princípio Ativo/) as HTMLInputElement

  it('PO-B1: cadastro novo digitado letra a letra segue editável, sem selo ANVISA', () => {
    render(<MedicineForm onSave={vi.fn()} onCancel={vi.fn()} />)

    // Letra a letra: cada tecla re-renderiza; no bug, a 1ª letra já travava o campo.
    let typed = ''
    for (const ch of 'Paracetamol') {
      typed += ch
      fireEvent.change(getIngredient(), { target: { value: typed } })
    }

    expect(getIngredient().value).toBe('Paracetamol')
    expect(getIngredient()).not.toHaveAttribute('readonly')
    expect(screen.queryByTitle('Preenchido via Base ANVISA')).not.toBeInTheDocument()
  })

  it('PO-B2: seleção ANVISA preenche, fica readOnly e mostra o selo', () => {
    render(<MedicineForm onSave={vi.fn()} onCancel={vi.fn()} />)

    fireEvent.click(screen.getByText('selecionar-anvisa'))

    expect(getIngredient().value).toBe('Paracetamol')
    expect(getIngredient()).toHaveAttribute('readonly')
    expect(screen.getAllByTitle('Preenchido via Base ANVISA').length).toBeGreaterThan(0)
  })

  it('PO-B2: digitar outro nome depois da seleção libera o campo', () => {
    render(<MedicineForm onSave={vi.fn()} onCancel={vi.fn()} />)

    fireEvent.click(screen.getByText('selecionar-anvisa'))
    fireEvent.change(screen.getByLabelText('mock-nome'), { target: { value: 'Outro' } })

    expect(getIngredient()).not.toHaveAttribute('readonly')
  })

  it('PO-B2: edição de remédio existente segue editável', () => {
    render(
      <MedicineForm
        medicine={{ id: 'm1', name: 'Dipirona', active_ingredient: 'Dipirona' }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    expect(getIngredient()).not.toHaveAttribute('readonly')
  })

  it('flag de origem não vai ao payload salvo', async () => {
    const onSave = vi.fn().mockResolvedValue({ id: 'novo' })
    render(<MedicineForm onSave={onSave} onCancel={vi.fn()} showSuccessMessage={false} />)

    fireEvent.click(screen.getByText('selecionar-anvisa'))
    fireEvent.submit(document.querySelector('form') as HTMLFormElement)

    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const payload = onSave.mock.calls[0][0]
    expect(payload.active_ingredient).toBe('Paracetamol')
    expect(Object.keys(payload).some((k) => /anvisa/i.test(k))).toBe(false)
  })
})
