// RC5 119 B: força/forma salvas vencem o rascunho em edição; índice da base construído uma vez.
import { catalogLinkPayload, keepSavedStrength, suggestionIndexFor } from '../catalogMatch'

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

  it('catalogLinkPayload: força diferente ⇒ null (bloqueio da edição e do vínculo)', () => {
    expect(catalogLinkPayload({ dosage_per_pill: 2.5, dosage_unit: 'mg/ml' }, { ...draftValues, therapeutic_class_code: 'A10S' })).toBeNull()
  })

  it('suggestionIndexFor: mesma base ⇒ mesmo índice (sem reconstruir)', () => {
    const items = [{ name: 'Mounjaro', activeIngredient: 'Tirzepatida' }]
    expect(suggestionIndexFor(items)).toBe(suggestionIndexFor(items))
    expect(suggestionIndexFor([...items])).not.toBe(suggestionIndexFor(items))
  })
})

describe('vínculo com unidade sem número (smoke 1c, "Aas" comprimido null + g)', () => {
  const draft = { name: 'AAS', dosage_per_pill: 100, dosage_unit: 'mg', presentation: 'comprimido', therapeutic_class_code: 'B01C' }
  it('unidade sozinha não é força conhecida: vincula e traz 100 mg da caixa', () => {
    const payload = catalogLinkPayload({ name: 'Aas', presentation: 'comprimido', dosage_per_pill: null, dosage_unit: 'g' }, draft)
    expect(payload).toMatchObject({ dosage_per_pill: 100, dosage_unit: 'mg' })
  })
  it('com número, unidade diferente segue não vinculando (R-299)', () => {
    expect(catalogLinkPayload({ presentation: 'comprimido', dosage_per_pill: 100, dosage_unit: 'g' }, draft)).toBeNull()
  })
  it('pomada fica em un: a força da caixa não entra', () => {
    const payload = catalogLinkPayload({ presentation: 'pomada', dosage_per_pill: null, dosage_unit: 'un' }, { ...draft, presentation: 'pomada', dosage_unit: 'g', dosage_per_pill: 30 })
    expect(payload).not.toBeNull()
    expect(payload).not.toHaveProperty('dosage_per_pill')
    expect(payload).not.toHaveProperty('dosage_unit')
  })
  it('edição: unidade salva sem número não vence a da caixa', () => {
    expect(keepSavedStrength({ dosage_per_pill: null, dosage_unit: 'g' }, { dosage_per_pill: 100, dosage_unit: 'mg' })).toEqual({ dosage_per_pill: 100, dosage_unit: 'mg' })
  })
})

describe('cadastro em "un" com caixa de comprimido (smoke 1c, heurística mínima)', () => {
  const box = { name: 'AAS', dosage_per_pill: 100, dosage_unit: 'mg', presentation: 'comprimido', therapeutic_class_code: 'B01C' }
  it('"outro" 1 un ⇒ vira comprimido 100 mg', () => {
    expect(catalogLinkPayload({ presentation: 'outro', dosage_per_pill: 1, dosage_unit: 'un' }, box)).toMatchObject({
      presentation: 'comprimido', dosage_per_pill: 100, dosage_unit: 'mg',
    })
  })
  it('comprimido 32 un ⇒ assume 100 mg, forma fica', () => {
    const p = catalogLinkPayload({ presentation: 'comprimido', dosage_per_pill: 32, dosage_unit: 'un' }, box)
    expect(p).toMatchObject({ dosage_per_pill: 100, dosage_unit: 'mg' })
    expect(p).not.toHaveProperty('presentation')
  })
  it('caixa líquida não sobrescreve "un" (estoque mudaria de sentido)', () => {
    const p = catalogLinkPayload({ presentation: 'outro', dosage_per_pill: 1, dosage_unit: 'un' }, { ...box, presentation: 'liquido', dosage_unit: 'mg/ml', dosage_per_pill: 50 })
    expect(p).toBeNull()
  })
})
