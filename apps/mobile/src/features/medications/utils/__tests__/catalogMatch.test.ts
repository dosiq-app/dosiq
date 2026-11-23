// RC5 119 B: força/forma salvas vencem o rascunho em edição; índice da base construído uma vez.
import { boxKeepsSavedStrength, keepSavedStrength, linkMatchesFor, suggestionIndexFor } from '../catalogMatch'

describe('catalogMatch (119 B, RC5)', () => {
  afterEach(() => {
    jest.clearAllMocks()
    jest.clearAllTimers()
  })

  const draftValues = { name: 'Mounjaro', dosage_per_pill: 5, dosage_unit: 'mg/ml', presentation: 'injetavel', concentration_volume_ml: 0.5 }

  it('keepSavedStrength: valores salvos vencem; vazios do salvo deixam o rascunho', () => {
    const saved = { dosage_per_pill: 2.5, dosage_unit: 'mg/ml', presentation: null, concentration_volume_ml: '' }
    expect(keepSavedStrength(saved, draftValues)).toEqual({ ...draftValues, dosage_per_pill: 2.5 })
  })

  it('keepSavedStrength: cadastro novo (sem salvo) não muda nada', () => {
    expect(keepSavedStrength(null, draftValues)).toBe(draftValues)
  })

  it('boxKeepsSavedStrength: força diferente ⇒ trava a edição', () => {
    expect(boxKeepsSavedStrength({ dosage_per_pill: 2.5, dosage_unit: 'mg/ml' }, { ...draftValues, therapeutic_class_code: 'A10S' })).toBe(false)
  })

  it('suggestionIndexFor: mesma base ⇒ mesmo índice (sem reconstruir)', () => {
    const items = [{ name: 'Mounjaro', activeIngredient: 'Tirzepatida' }]
    expect(suggestionIndexFor(items)).toBe(suggestionIndexFor(items))
    expect(suggestionIndexFor([...items])).not.toBe(suggestionIndexFor(items))
  })
})

describe('boxKeepsSavedStrength — trava do form em edição (E-R5-5; o vínculo da Hoje é o core)', () => {
  const box = { name: 'AAS', dosage_per_pill: 100, dosage_unit: 'mg', presentation: 'comprimido', therapeutic_class_code: 'B01C' }
  it('unidade sozinha não é força conhecida: a caixa entra', () => {
    expect(boxKeepsSavedStrength({ presentation: 'comprimido', dosage_per_pill: null, dosage_unit: 'g' }, box)).toBe(true)
  })
  it('com número, unidade diferente trava (R-299)', () => {
    expect(boxKeepsSavedStrength({ presentation: 'comprimido', dosage_per_pill: 100, dosage_unit: 'g' }, box)).toBe(false)
  })
  it('cadastro em "un" com caixa sólida: a caixa entra', () => {
    expect(boxKeepsSavedStrength({ presentation: 'outro', dosage_per_pill: 1, dosage_unit: 'un' }, box)).toBe(true)
  })
  it('edição: unidade salva sem número não vence a da caixa', () => {
    expect(keepSavedStrength({ dosage_per_pill: null, dosage_unit: 'g' }, { dosage_per_pill: 100, dosage_unit: 'mg' })).toEqual({ dosage_per_pill: 100, dosage_unit: 'mg' })
  })
})

// Smoke 2a (PO 22/11): o ranking por raridade deixava uma palavra genérica rara propor outro remédio.
describe('linkMatchesFor (125 2a)', () => {
  const base = [
    { name: 'Babymed Tratamento', activeIngredient: 'Nistatina; Óxido de Zinco', laboratory: 'X' },
    { name: 'Losartana Potássica', activeIngredient: 'Losartana Potássica' },
    { name: 'Aradois', activeIngredient: 'Losartana Potássica', laboratory: 'Y' },
    { name: 'Mounjaro', activeIngredient: 'Tirzepatida', laboratory: 'Lilly' },
    { name: 'Oxalato De Escitalopram', activeIngredient: 'Oxalato De Escitalopram' },
    { name: 'Esc Odt', activeIngredient: 'Oxalato De Escitalopram', laboratory: 'Z' },
  ]

  it('exige todas as palavras conhecidas: "Losartana sem tratamento" não vira "Babymed Tratamento"', () => {
    expect(linkMatchesFor(base, '[s125] Losartana sem tratamento', null).map((i) => i.name)).not.toContain('Babymed Tratamento')
  })

  it('erro de digitação segue pelo fuzzy: Tizerpatida → Mounjaro', () => {
    expect(linkMatchesFor(base, 'Tizerpatida', null).map((i) => i.name)).toEqual(['Mounjaro'])
  })

  it('nome idêntico (no nome ou no princípio ativo cadastrado) vence a marca', () => {
    expect(linkMatchesFor(base, 'Escitalopram', 'Oxalato de Escitalopram').map((i) => i.name)).toEqual(['Oxalato De Escitalopram'])
  })

  it('RC6 #973: exato pelo princípio ativo precisa cobrir o nome — "Aradois H" não vira o genérico', () => {
    expect(linkMatchesFor(base, 'Aradois H', 'Losartana Potássica').map((i) => i.name)).not.toContain('Losartana Potássica')
  })
})
