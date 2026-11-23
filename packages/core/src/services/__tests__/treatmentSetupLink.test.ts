import { describe, it, expect } from 'vitest'
import { diffCatalogBox, describeBoxChange, formMismatch, pickSetupCard } from '../treatmentSetup'

// Spec 125 fatia 2a (FR-039/FR-042/FR-043 · PO-125-23/24/25/29). Casos reais de prod 19/11 (slice-2a-brief).

const mounjaroBox = {
  name: 'Mounjaro',
  active_ingredient: 'Tirzepatida',
  laboratory: 'Eli Lilly',
  therapeutic_class: 'Análogos de GLP-1',
  therapeutic_class_code: 'A10S1',
  regulatory_category: 'novo',
  anvisa_registration: '112600202',
  presentation: 'injetavel',
  dosage_per_pill: 5,
  dosage_unit: 'mg/ml',
  concentration_volume_ml: 0.5,
}

describe('diffCatalogBox — vínculo traz identidade, forma e força da caixa (FR-039)', () => {
  const tizerpatida = { name: 'Tizerpatida', presentation: 'comprimido', dosage_per_pill: 5, dosage_unit: 'mg', concentration_volume_ml: null }

  it('Tizerpatida comprimido 5 mg → Mounjaro caneta: payload completo e as 3 linhas', () => {
    const { payload, changes } = diffCatalogBox(tizerpatida, mounjaroBox)
    expect(payload).toMatchObject({
      name: 'Mounjaro',
      active_ingredient: 'Tirzepatida',
      therapeutic_class_code: 'A10S1',
      anvisa_registration: '112600202',
      regulatory_category: 'Novo',
      presentation: 'injetavel',
      dosage_per_pill: 5,
      dosage_unit: 'mg/ml',
      concentration_volume_ml: 0.5,
    })
    expect(changes.map((c) => c.field)).toEqual(['name', 'ingredient', 'presentation', 'strength'])
    expect(describeBoxChange(changes)).toEqual([
      'Nome: Tizerpatida → Mounjaro',
      'Princípio ativo: Tirzepatida (novo)',
      'Forma: Comprimido → Injetável',
      'Dosagem: 5 mg → 2,5 mg / 0,5 mL',
    ])
  })

  it('outra concentração não bloqueia mais (revoga 119 INV-6)', () => {
    const { payload } = diffCatalogBox({ ...tizerpatida, dosage_per_pill: 60 }, mounjaroBox)
    expect(payload.dosage_per_pill).toBe(5)
  })

  it('nome igual com caixa/acento diferente não gera linha de nome', () => {
    const { changes } = diffCatalogBox({ ...mounjaroBox, name: 'mounjáro ' }, mounjaroBox)
    expect(changes).toEqual([])
  })

  it('caixa sem volume limpa o volume velho (RC6 #971)', () => {
    const { payload } = diffCatalogBox({ ...mounjaroBox, name: 'Ozempic' }, { ...mounjaroBox, name: 'Ozempic', concentration_volume_ml: undefined })
    expect(payload.concentration_volume_ml).toBeNull()
  })

  it('força ambígua (dose null) mantém a força salva', () => {
    const { payload, changes } = diffCatalogBox(tizerpatida, { ...mounjaroBox, dosage_per_pill: null, dosage_unit: null })
    expect(payload).not.toHaveProperty('dosage_per_pill')
    expect(payload).not.toHaveProperty('dosage_unit')
    expect(changes.map((c) => c.field)).toEqual(['name', 'ingredient', 'presentation'])
  })

  it('princípio ativo igual (acento/caixa) não gera linha; diferente mostra o salvo', () => {
    expect(diffCatalogBox({ ...mounjaroBox, active_ingredient: 'tirzepatída' }, mounjaroBox).changes).toEqual([])
    const { changes } = diffCatalogBox({ name: 'Lipoless', active_ingredient: 'Sibutramina', presentation: 'comprimido' }, { name: 'Lipless', active_ingredient: 'Ciprofibrato', presentation: 'comprimido' })
    expect(describeBoxChange(changes)).toEqual(['Nome: Lipoless → Lipless', 'Princípio ativo: Sibutramina → Ciprofibrato'])
  })

  it('pomada/spray/outro: forma entra, força não (fica em un)', () => {
    const { payload } = diffCatalogBox({ name: 'Budesonida', presentation: 'comprimido', dosage_per_pill: 32, dosage_unit: 'mcg' }, { ...mounjaroBox, name: 'Budesonida', presentation: 'spray', dosage_per_pill: 50, dosage_unit: 'mcg' })
    expect(payload.presentation).toBe('spray')
    expect(payload).not.toHaveProperty('dosage_per_pill')
  })

  it('forma ausente no cadastro aparece como "sem forma informada"', () => {
    const { changes } = diffCatalogBox({ name: 'Mounjaro', active_ingredient: 'Tirzepatida', presentation: null, dosage_per_pill: 5, dosage_unit: 'mg/ml', concentration_volume_ml: 0.5 }, mounjaroBox)
    expect(describeBoxChange(changes)).toEqual(['Forma: sem forma informada → Injetável'])
  })

  it('linha de estoque só com quantidade positiva; estoque nunca vai no payload (RC3 E-2)', () => {
    expect(diffCatalogBox(tizerpatida, mounjaroBox, 2960).stockLine).toBe('O estoque (2.960) fica como está. Confira depois se ainda vale.')
    expect(diffCatalogBox(tizerpatida, mounjaroBox, 0).stockLine).toBeNull()
    expect(diffCatalogBox(tizerpatida, mounjaroBox, null).stockLine).toBeNull()
    expect(diffCatalogBox(tizerpatida, mounjaroBox, Number.NaN).stockLine).toBeNull()
    expect(diffCatalogBox(tizerpatida, mounjaroBox, 2960).payload).not.toHaveProperty('quantity')
  })

  it('campos ausentes na caixa não entram no payload', () => {
    const { payload } = diffCatalogBox(tizerpatida, { ...mounjaroBox, laboratory: undefined })
    expect(payload).not.toHaveProperty('laboratory')
  })

  it('RC6 #973: genérico (laboratório e registro null) não apaga o que a pessoa cadastrou', () => {
    const { payload } = diffCatalogBox(tizerpatida, { ...mounjaroBox, laboratory: null, anvisa_registration: null } as any)
    expect(payload).not.toHaveProperty('laboratory')
    expect(payload).not.toHaveProperty('anvisa_registration')
  })
})

describe('formMismatch — forma divergente do catálogo ou do nome (FR-042)', () => {
  it('Ozempic comprimido, registro só injetável ⇒ propõe injetável (catalog)', () => {
    expect(formMismatch({ name: 'Ozempic', presentation: 'comprimido' }, ['injetavel'])).toEqual({ proposed: 'injetavel', reason: 'catalog' })
  })
  it('Tresiba líquido ⇒ injetável', () => {
    expect(formMismatch({ name: 'Tresiba', presentation: 'liquido' }, ['injetavel', 'injetavel'])).toEqual({ proposed: 'injetavel', reason: 'catalog' })
  })
  it('Venvanse comprimido, registro só cápsula ⇒ cápsula', () => {
    expect(formMismatch({ name: 'Venvanse', presentation: 'comprimido' }, ['capsula'])).toEqual({ proposed: 'capsula', reason: 'catalog' })
  })
  it('negativos: Rybelsus comprimido, Mounjaro injetável', () => {
    expect(formMismatch({ name: 'Rybelsus', presentation: 'comprimido' }, ['comprimido'])).toBeNull()
    expect(formMismatch({ name: 'Mounjaro', presentation: 'injetavel' }, ['injetavel'])).toBeNull()
  })
  it('várias formas sem a gravada e o nome não decide ⇒ pergunta sem proposta', () => {
    expect(formMismatch({ name: 'Xpto', presentation: 'comprimido' }, ['capsula', 'liquido'])).toEqual({ proposed: null, reason: 'catalog' })
  })
  it('várias formas sem a gravada e o nome decide ⇒ propõe a do nome', () => {
    expect(formMismatch({ name: 'Xpto (gotas)', presentation: 'comprimido' }, ['capsula', 'liquido'])).toEqual({ proposed: 'liquido', reason: 'catalog' })
  })
  it('pista no nome: "(gotas)" / "(xarope)" / "(líquido)" comprimido ⇒ líquido (name)', () => {
    for (const name of ['Ibuprofeno (gotas)', 'Ambroxol xarope', 'Dipirona (líquido)', 'Amoxicilina suspensão']) {
      expect(formMismatch({ name, presentation: 'comprimido' }, null)).toEqual({ proposed: 'liquido', reason: 'name' })
    }
  })
  it('pista no nome igual à gravada ⇒ null', () => {
    expect(formMismatch({ name: 'Ibuprofeno (gotas)', presentation: 'liquido' }, null)).toBeNull()
  })
  it('genérico sem registro (catalogForms null) e sem pista ⇒ null — Budesonida spray (revisão 22/11)', () => {
    expect(formMismatch({ name: 'Budesonida', presentation: 'spray' }, null)).toBeNull()
  })
  it('catálogo vazio não julga; forma gravada ausente não julga', () => {
    expect(formMismatch({ name: 'Ozempic', presentation: 'comprimido' }, [])).toBeNull()
    expect(formMismatch({ name: 'Ozempic (injetável)', presentation: null }, ['injetavel'])).toBeNull()
  })
  it('catálogo confirma a gravada e o nome diz outra coisa fora do catálogo ⇒ null', () => {
    expect(formMismatch({ name: 'Ibuprofeno (gotas)', presentation: 'comprimido' }, ['comprimido'])).toBeNull()
  })
})

describe('pickSetupCard — Confira > Corrigir forma > Vincular > Falta > Cadastrado (FR-043)', () => {
  const today = '2026-11-22'
  const base = { loggedProtocolIds: [], verdicts: {}, orphanMedicines: [], today }
  const old = '2026-01-01T12:00:00Z'
  const protocols = [
    { id: 'p1', medicine_id: 'm1', created_at: old },
    { id: 'p2', medicine_id: 'm2', created_at: old },
  ]
  const incoerente = { status: 'incoerente', reason: 'dose', box: null, doseMass: 1, probableSide: 'dose', fixAvailable: false, multidose: false } as any

  it('Vincular sem janela de 14 d (cadastro antigo)', () => {
    expect(pickSetupCard({ ...base, protocols, linkCandidateIds: ['m2'] })).toEqual({ kind: 'vincular', medicineId: 'm2', protocolId: 'p2' })
  })
  it('Corrigir forma antes de Vincular', () => {
    const pick = pickSetupCard({ ...base, protocols, linkCandidateIds: ['m1'], formMismatches: { m2: { proposed: 'injetavel', reason: 'catalog' } } })
    expect(pick).toEqual({ kind: 'forma', medicineId: 'm2', protocolId: 'p2', mismatch: { proposed: 'injetavel', reason: 'catalog' } })
  })
  it('Confira antes de Corrigir forma', () => {
    const pick = pickSetupCard({ ...base, protocols, verdicts: { p1: incoerente }, formMismatches: { m2: { proposed: 'injetavel', reason: 'catalog' } } })
    expect(pick?.kind).toBe('confira')
  })
  it('Vincular antes de Falta 1 passo', () => {
    const pick = pickSetupCard({ ...base, protocols, linkCandidateIds: ['m1'], orphanMedicines: [{ id: 'm9', created_at: '2026-11-21T12:00:00Z' }] })
    expect(pick?.kind).toBe('vincular')
  })
  it('candidato sem tratamento ativo não entra', () => {
    expect(pickSetupCard({ ...base, protocols, linkCandidateIds: ['m-sem-tratamento'] })).toBeNull()
  })
  it('sem os campos novos = comportamento da fatia 2', () => {
    expect(pickSetupCard({ ...base, protocols })).toBeNull()
  })
})
