import { reviewQueue, presentationLabel } from '@medications/utils/formChangeReview'

const comprimido = { id: 'm1', name: 'Losartana', presentation: 'comprimido', dosage_per_pill: 25, dosage_unit: 'mg' }
const injetavel = { ...comprimido, presentation: 'injetavel', dosage_per_pill: 5, dosage_unit: 'mg/ml', concentration_volume_ml: 0.5 }
const t1 = { id: 'p1', name: 'Pressão', active: true, dosage_per_intake: 1, intake_unit: null }
const t2 = { id: 'p2', name: 'Pressão noite', active: true, dosage_per_intake: 2, intake_unit: null }

describe('reviewQueue (AC7.5/AC7.10)', () => {
  afterEach(() => {
    jest.clearAllMocks()
    jest.clearAllTimers()
  })

  it('forma mudou ⇒ cada tratamento ativo entra, na ordem', () => {
    const q = reviewQueue({ before: comprimido, after: injetavel, protocols: [t1, t2] })
    expect(q.map((r) => r.protocol.id)).toEqual(['p1', 'p2'])
    expect(q[0]).toMatchObject({ formChanged: true, fromLabel: 'comprimido', toLabel: 'injetável' })
  })

  it('sem tratamento (vazio ou null) ⇒ fila vazia', () => {
    expect(reviewQueue({ before: comprimido, after: injetavel, protocols: [] })).toEqual([])
    expect(reviewQueue({ before: comprimido, after: injetavel, protocols: null })).toEqual([])
  })

  it('tratamento inativo fica fora', () => {
    const q = reviewQueue({ before: comprimido, after: injetavel, protocols: [{ ...t1, active: false }, t2] })
    expect(q.map((r) => r.protocol.id)).toEqual(['p2'])
  })

  it('só o nome mudou ⇒ fila vazia (não incomoda)', () => {
    expect(reviewQueue({ before: comprimido, after: { ...comprimido, name: 'Losartana 25' }, protocols: [t1] })).toEqual([])
  })

  it('forma igual, aviso de dose NOVO ⇒ entra com os avisos', () => {
    const pen = { ...injetavel, dosage_per_pill: 5 } // 2,5 mg/0,5 mL salvo como razão 5 mg/mL
    const smaller = { ...pen, dosage_per_pill: 2 } // agora 1 mg/0,5 mL
    const dose = { ...t1, dosage_per_intake: 2.5, intake_unit: 'mg' }
    const q = reviewQueue({ before: pen, after: smaller, protocols: [dose] })
    expect(q).toHaveLength(1)
    expect(q[0].formChanged).toBe(false)
    expect(q[0].warnings.map((w) => w.kind)).toContain('exceeds_pen')
  })

  it('aviso que já existia antes não reabre a folha', () => {
    const pen = { ...injetavel, dosage_per_pill: 2 }
    const dose = { ...t1, dosage_per_intake: 2.5, intake_unit: 'mg' }
    expect(reviewQueue({ before: pen, after: { ...pen, name: 'Outro nome' }, protocols: [dose] })).toEqual([])
  })

  it('forma antes nula (legado) conta como troca, com rótulo neutro', () => {
    const q = reviewQueue({ before: { ...comprimido, presentation: null }, after: injetavel, protocols: [t1] })
    expect(q[0]).toMatchObject({ formChanged: true, fromLabel: 'sem forma informada' })
  })

  it('dose vazia no tratamento: sem aviso, entra só pela troca de forma', () => {
    const q = reviewQueue({ before: comprimido, after: injetavel, protocols: [{ ...t1, dosage_per_intake: null }] })
    expect(q[0].warnings).toEqual([])
  })
})

describe('presentationLabel', () => {
  it('minúsculo e com acento', () => {
    expect(presentationLabel('injetavel')).toBe('injetável')
    expect(presentationLabel(undefined)).toBe('sem forma informada')
  })
})
