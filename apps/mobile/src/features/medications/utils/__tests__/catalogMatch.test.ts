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
