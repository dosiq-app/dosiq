import { describe, it, expect } from 'vitest'
import { classifyCoherence, coherenceKey, pickSetupCard, SETUP_WINDOW_DAYS } from '../treatmentSetup'

// Entradas do sidecar 1.3.0 (fixture: cmedStrengths.test.ts — Mounjaro 112600202, Ozempic 117660036, Ozivy 102351473).
const MOUNJARO = [5, 10, 15, 20, 25, 30].map((d) => ({ d, u: 'mg/ml', lv: 0.5, dd: [] as number[] }))
const OZEMPIC = [{ d: 1.34, u: 'mg/ml', lv: null, dd: [0.25, 0.5, 1] }]
const OZIVY = [{ d: 1.34, u: 'mg/ml', lv: null, dd: [] as number[] }]

const med = (perMl: number | string | null, extra: Record<string, unknown> = {}) => ({
  presentation: 'injetavel', dosage_per_pill: perMl, dosage_unit: 'mg/ml', concentration_volume_ml: 0.5,
  anvisa_registration: '112600202', ...extra,
})
const tr = (dose: number | string | null, intake_unit: string | null = 'mg') => ({ dosage_per_intake: dose, intake_unit })

describe('classifyCoherence — perfis de prod (analysis-2.md §Medição)', () => {
  it('P0 controle: 5 mg/ml × 0,5 = 2,5 mg ⇒ coerente', () => {
    expect(classifyCoherence(tr(2.5), med(5), MOUNJARO)).toEqual({ status: 'coerente' })
  })
  it('P1/P2: caixa 2,5 mg, dose 1 mg ⇒ dose, caixa maior ⇒ provável caixa', () => {
    const v = classifyCoherence(tr(1), med(5, { concentration_volume_ml: null }), MOUNJARO)
    expect(v).toMatchObject({ status: 'incoerente', reason: 'dose', probableSide: 'caixa', doseMass: 1, multidose: false })
    expect(v.status === 'incoerente' && v.box).toMatchObject({ dose: 2.5, volumeMl: 0.5, perMl: 5, unit: 'mg' })
  })
  it('P3: 2,5 gotas num injetável ⇒ unidade, com atalho (2,5 mg é coerente)', () => {
    expect(classifyCoherence(tr(2.5, 'gotas'), med(5), MOUNJARO)).toMatchObject({ status: 'incoerente', reason: 'unidade', fixAvailable: true })
  })
  it('unidade sem atalho quando o número também não fecha', () => {
    expect(classifyCoherence(tr(7, 'gotas'), med(5), MOUNJARO)).toMatchObject({ reason: 'unidade', fixAvailable: false })
  })
  it('P4: 15 mg/ml (caixa 7,5) com 2,5 mg ⇒ dose, provável caixa', () => {
    expect(classifyCoherence(tr(2.5), med(15), MOUNJARO)).toMatchObject({ reason: 'dose', probableSide: 'caixa' })
  })
  it('P5: 30 mg/ml com 0,6 mg ⇒ dose, provável caixa', () => {
    expect(classifyCoherence(tr(0.6), med(30), MOUNJARO)).toMatchObject({ reason: 'dose', probableSide: 'caixa' })
  })
  it('caixa menor que a dose ⇒ provável dose (microdose não; dose acima)', () => {
    expect(classifyCoherence(tr(5), med(5), MOUNJARO)).toMatchObject({ reason: 'dose', probableSide: 'dose' })
  })
  it('P6: Ozempic salvo 15 mg/ml não existe no registro ⇒ conc_fora, dose não julgada', () => {
    expect(classifyCoherence(tr(2.5), med(15, { anvisa_registration: '117660036' }), OZEMPIC))
      .toMatchObject({ status: 'incoerente', reason: 'conc_fora', box: null, probableSide: 'caixa' })
  })
  it('Ozempic 1,34 com dose do mostrador ⇒ coerente; fora ⇒ dose multidose', () => {
    expect(classifyCoherence(tr(0.5), med(1.34), OZEMPIC)).toEqual({ status: 'coerente' })
    expect(classifyCoherence(tr(2), med(1.34), OZEMPIC)).toMatchObject({ reason: 'dose', multidose: true, probableSide: 'dose' })
  })
  it('float do cadastro: 0,4466… não casa 1,34 (conc_fora); 5,0000001 casa 5', () => {
    expect(classifyCoherence(tr(0.25), med(0.44666667), OZEMPIC)).toMatchObject({ reason: 'conc_fora' })
    expect(classifyCoherence(tr(2.5), med(5.0000001), MOUNJARO)).toEqual({ status: 'coerente' })
  })
  it('unidade salva diferente da do registro ⇒ conc_fora (E-5)', () => {
    expect(classifyCoherence(tr(2.5), med(5, { dosage_unit: 'mg' }), MOUNJARO)).toMatchObject({ reason: 'conc_fora' })
  })
  it('dose em mL convertida pela concentração', () => {
    expect(classifyCoherence(tr(0.5, 'ml'), med(5), MOUNJARO)).toEqual({ status: 'coerente' })
  })
  it('contagem: 1 aplicação da dose única ⇒ coerente; 2 ⇒ indeterminado', () => {
    expect(classifyCoherence(tr(1, null), med(5), MOUNJARO)).toEqual({ status: 'coerente' })
    expect(classifyCoherence(tr(2, null), med(5), MOUNJARO)).toEqual({ status: 'indeterminado' })
  })
})

describe('classifyCoherence — falha fechada (AC6.4c)', () => {
  const INDET = { status: 'indeterminado' }
  it.each([
    ['sidecar não pronto', tr(1), med(5), null],
    ['registro sem entradas', tr(1), med(5), []],
    ['Ozivy sem lv nem dd', tr(1), med(1.34), OZIVY],
    ['não injetável', tr(1), med(5, { presentation: 'comprimido' }), MOUNJARO],
    ['concentração vazia', tr(1), med(''), MOUNJARO],
    ['concentração zero', tr(1), med(0), MOUNJARO],
    ['dose nula', tr(null), med(5), MOUNJARO],
    ['dose zero', tr(0), med(5), MOUNJARO],
    ['entrada ambígua (d null)', tr(1), med(5), [{ d: null, u: 'mg/ml', lv: 0.5, dd: [] }]],
    ['multidose em contagem', tr(1, null), med(1.34), OZEMPIC],
  ])('%s', (_l, t, m, e) => {
    expect(classifyCoherence(t as any, m as any, e as any)).toEqual(INDET)
  })
})

describe('coherenceKey (AC6.4a)', () => {
  it('muda quando conc, volume, dose ou unidade mudam; estável no float', () => {
    const k = coherenceKey(tr(1), med(5))
    expect(coherenceKey(tr('1'), med('5,0'))).toBe(k)
    expect(coherenceKey(tr(1), med(10))).not.toBe(k)
    expect(coherenceKey(tr(1), med(5, { concentration_volume_ml: 1 }))).not.toBe(k)
    expect(coherenceKey(tr(2.5), med(5))).not.toBe(k)
    expect(coherenceKey(tr(1, 'gotas'), med(5))).not.toBe(k)
    expect(coherenceKey(tr(null), med(null, { anvisa_registration: null }))).toBe('||mg/ml|0.5||mg')
  })
})

describe('pickSetupCard (AC6.1 · AC6.3 · AC6.6)', () => {
  const today = '2026-11-19'
  const iso = (localDay: string) => new Date(`${localDay}T12:00:00`).toISOString()
  const incoerente = classifyCoherence(tr(1), med(5), MOUNJARO)
  const base = { protocols: [], loggedProtocolIds: [], verdicts: {}, orphanMedicines: [], today }

  it('nada elegível ⇒ null', () => {
    expect(pickSetupCard(base)).toBeNull()
  })
  it('prioridade Confira > Falta > Cadastrado', () => {
    const input = {
      ...base,
      protocols: [{ id: 'novo', created_at: iso(today) }, { id: 'velho', created_at: iso('2025-01-01') }],
      verdicts: { velho: incoerente },
      orphanMedicines: [{ id: 'm1', created_at: iso(today) }],
    }
    expect(pickSetupCard(input)).toMatchObject({ kind: 'confira', protocolId: 'velho' })
    expect(pickSetupCard({ ...input, verdicts: {} })).toEqual({ kind: 'falta', medicineId: 'm1' })
    expect(pickSetupCard({ ...input, verdicts: {}, orphanMedicines: [] })).toEqual({ kind: 'cadastrado', protocolId: 'novo' })
  })
  it('Cadastrado some no 1º registro (AC6.5)', () => {
    expect(pickSetupCard({ ...base, protocols: [{ id: 'p', created_at: iso(today) }], loggedProtocolIds: ['p'] })).toBeNull()
  })
  it('janela de 14 dias, dia local; created_at ausente/inválido ⇒ não elegível (cache antigo)', () => {
    const at = (d: string | null) => pickSetupCard({ ...base, protocols: [{ id: 'p', created_at: d }] })
    expect(at(iso('2026-11-05'))).not.toBeNull() // 14 d
    expect(at(iso('2026-11-04'))).toBeNull() // 15 d
    expect(at(null)).toBeNull()
    expect(at('lixo')).toBeNull()
    expect(SETUP_WINDOW_DAYS).toBe(14)
  })
  it('remédio sem tratamento antigo não entra (Q-2)', () => {
    expect(pickSetupCard({ ...base, orphanMedicines: [{ id: 'm', created_at: iso('2026-10-01') }] })).toBeNull()
  })
  it('coerente/indeterminado não viram Confira', () => {
    expect(pickSetupCard({ ...base, protocols: [{ id: 'p', created_at: null }], verdicts: { p: { status: 'indeterminado' } } })).toBeNull()
  })
})
