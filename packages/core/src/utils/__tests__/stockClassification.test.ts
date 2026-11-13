import { describe, it, expect, afterEach, vi } from 'vitest'
import { classifyStockMedicines, type ClassifiableMedicine, type ClassifiableProtocol } from '../stockClassification'
import { purchaseUrgency, PURCHASE_CTA_LEAD_DAYS, MONTHLY_HEADS_UP_DAYS, PURCHASE_OFFSETS, type RunwayStep } from '../stockRunway'

afterEach(() => {
  vi.clearAllMocks()
  vi.clearAllTimers()
})

const TZ = 'America/Sao_Paulo'
const TODAY = '2026-11-13' // sexta

const proto = (over: Partial<ClassifiableProtocol> = {}): ClassifiableProtocol => ({
  id: 'p1',
  name: 'Tratamento',
  active: true,
  start_date: '2026-10-01',
  end_date: null,
  archived_at: null,
  frequency: 'diário',
  interval_days: null,
  time_schedule: ['08:00'],
  dosage_per_intake: 1,
  intake_unit: null,
  ...over,
})

const med = (id: string, totalQuantity: number, protocols: ClassifiableProtocol[] = []): ClassifiableMedicine => ({
  id,
  totalQuantity,
  protocols,
})

const step = (over: Partial<RunwayStep> = {}): RunwayStep => ({
  id: 's0',
  titration_id: 't1',
  position: 0,
  medicine_id: 'A',
  status: 'current',
  protocol_id: 'pA',
  dose: 2.5,
  intake_unit: 'mg',
  started_at: '2026-11-07T12:00:00Z',
  duration_days: 28,
  ...over,
})

const classify = (medicines: ClassifiableMedicine[], steps: RunwayStep[] | null = []) =>
  Object.fromEntries(classifyStockMedicines({ medicines, steps, today: TODAY, tz: TZ }).map((c) => [c.medicineId, c]))

// Escada de GLP-1: A (vigente) → B (próxima troca) → C (distante) → C de novo.
const ladderSteps = (): RunwayStep[] => [
  step(),
  step({ id: 's1', position: 1, medicine_id: 'B', status: 'upcoming', protocol_id: null, dose: 5, started_at: null }),
  step({ id: 's2', position: 2, medicine_id: 'C', status: 'upcoming', protocol_id: null, dose: 7.5, started_at: null }),
  step({ id: 's3', position: 3, medicine_id: 'C', status: 'upcoming', protocol_id: null, dose: 10, started_at: null, duration_days: null }),
]
const ladderMed = () => med('A', 1, [proto({ id: 'pA', name: 'Mounjaro configurado', frequency: 'semanal' })])

describe('classifyStockMedicines — seções (PO-5 / INV-2)', () => {
  it('ativo no período ⇒ Em uso', () => {
    expect(classify([med('M', 10, [proto()])]).M.section).toBe('in_use')
  })

  it('active NULL conta como ativo (coluna nullable — AP-289)', () => {
    expect(classify([med('M', 0, [proto({ active: null })])]).M.section).toBe('in_use')
  })

  it('início futuro ⇒ Programado com startsOn e contagem a partir do início (AC-4.1/4.4)', () => {
    const c = classify([med('M', 0, [proto({ start_date: '2026-12-09' })])]).M
    expect(c.section).toBe('scheduled')
    expect(c.scheduled).toMatchObject({ kind: 'future_start', startsOn: '2026-12-09', countAsOf: '2026-12-09', stepNumber: null })
  })

  it('próxima troca da escada sem tratamento próprio ⇒ Programado "Etapa 2 de <tratamento>" com data prevista (AC-4.2)', () => {
    const c = classify([ladderMed(), med('B', 0)], ladderSteps()).B
    expect(c.section).toBe('scheduled')
    expect(c.scheduled).toMatchObject({
      kind: 'next_step',
      stepNumber: 2,
      treatmentName: 'Mounjaro configurado',
      startsOn: '2026-12-05', // 07/11 + 28
    })
    // Contagem pela dose da etapa e cadência da escada, sem gravar nada (INV-4).
    expect(c.scheduled?.countingProtocols[0]).toMatchObject({ medicine_id: 'B', dosage_per_intake: 5, frequency: 'semanal', active: true })
  })

  it('comprado pelo atalho da etapa futura (com saldo) ⇒ Programado, nunca Sem tratamentos (AC-4.3 / SC-003)', () => {
    expect(classify([ladderMed(), med('B', 2)], ladderSteps()).B.section).toBe('scheduled')
  })

  it('etapa distante: sem saldo fica fora; com saldo ⇒ Programado (FR-006)', () => {
    expect(classify([ladderMed(), med('C', 0)], ladderSteps()).C).toBeUndefined()
    const c = classify([ladderMed(), med('C', 3)], ladderSteps()).C
    expect(c.scheduled).toMatchObject({ kind: 'distant_step', stepNumber: 3, startsOn: '2027-01-02' })
  })

  it('duas etapas futuras do mesmo medicamento ⇒ um item, data da primeira', () => {
    const all = classifyStockMedicines({ medicines: [ladderMed(), med('C', 3)], steps: ladderSteps(), today: TODAY, tz: TZ })
    expect(all.filter((c) => c.medicineId === 'C')).toHaveLength(1)
    expect(all.find((c) => c.medicineId === 'C')?.scheduled?.stepNumber).toBe(3)
  })

  it('etapa futura com o mesmo medicamento da vigente ⇒ nada novo', () => {
    const steps = [step(), step({ id: 's1', position: 1, medicine_id: 'A', status: 'upcoming', protocol_id: null })]
    const all = classifyStockMedicines({ medicines: [ladderMed()], steps, today: TODAY, tz: TZ })
    expect(all).toHaveLength(1)
    expect(all[0].section).toBe('in_use')
  })

  it('em uso E previsto no futuro ⇒ só Em uso (AC-4.7)', () => {
    const steps = [...ladderSteps()]
    const c = classify([ladderMed(), med('B', 2, [proto({ id: 'pB' })])], steps).B
    expect(c.section).toBe('in_use')
  })

  it('avanço manual (vigente sem duração) ⇒ Programado sem data (Q-1)', () => {
    const steps = ladderSteps().map((s) => (s.id === 's0' ? { ...s, duration_days: null } : s))
    expect(classify([ladderMed(), med('B', 0)], steps).B.scheduled?.startsOn).toBeNull()
  })

  it('escada pausada não programa a próxima etapa', () => {
    const paused = med('A', 1, [proto({ id: 'pA', active: false })])
    const r = classify([paused, med('B', 0)], ladderSteps())
    expect(r.B).toBeUndefined()
    expect(r.A).toMatchObject({ section: 'inactive', paused: true })
  })

  it('etapas indisponíveis (null) ⇒ sem Programado por etapa, sem quebrar o resto (INV-2)', () => {
    const r = classify([ladderMed(), med('B', 2)], null)
    expect(r.A.section).toBe('in_use')
    expect(r.B).toMatchObject({ section: 'inactive', paused: false })
  })

  it('pausado com e sem saldo ⇒ Sem tratamentos, PAUSADO (AC-5.1)', () => {
    const r = classify([med('P0', 0, [proto({ active: false })]), med('P1', 5, [proto({ active: false })])])
    expect(r.P0).toMatchObject({ section: 'inactive', paused: true })
    expect(r.P1).toMatchObject({ section: 'inactive', paused: true })
  })

  it('encerrado (end_date vencida) não é pausado: só com saldo, como órfão', () => {
    const ended = proto({ active: false, end_date: '2026-11-01' })
    expect(classify([med('E', 0, [ended])]).E).toBeUndefined()
    expect(classify([med('E', 4, [ended])]).E).toMatchObject({ section: 'inactive', paused: false })
  })

  it('órfão: com saldo ⇒ Sem tratamentos; sem saldo ⇒ fora', () => {
    expect(classify([med('O', 10)]).O).toMatchObject({ section: 'inactive', paused: false })
    expect(classify([med('O', 0)]).O).toBeUndefined()
  })

  it('tratamento arquivado é ignorado (CON-039)', () => {
    expect(classify([med('X', 0, [proto({ archived_at: '2026-11-01T00:00:00Z' })])]).X).toBeUndefined()
  })
})

describe('PO-8 — iniciar a etapa migra para Em uso sem escrita extra', () => {
  it('antes: Programado; depois (executor muda o medicine_id do tratamento — ADR-085): Em uso', () => {
    const before = classify([ladderMed(), med('B', 2)], ladderSteps())
    expect(before.B.section).toBe('scheduled')
    const afterSteps = ladderSteps().map((s) =>
      s.id === 's0' ? { ...s, status: 'completed' } : s.id === 's1' ? { ...s, status: 'current', protocol_id: 'pA', started_at: '2026-11-13T12:00:00Z' } : s,
    )
    const after = classify([med('A', 1), med('B', 2, [proto({ id: 'pA', name: 'Mounjaro configurado', frequency: 'semanal' })])], afterSteps)
    expect(after.B.section).toBe('in_use')
    expect(after.A).toMatchObject({ section: 'inactive', paused: false })
  })
})

describe('PO-11 — não diário com saldo zero continua na aba em dia sem dose (regressão; CP-1)', () => {
  // 13/11/2026 é sexta. Semanal de segunda e mensal que tocou dia 01: nenhum dispara hoje.
  it.each([
    ['semanal', { frequency: 'semanal', weekdays: [1] }],
    ['mensal', { frequency: 'personalizado', interval_days: 30 }],
  ])('%s', (_label, over) => {
    expect(classify([med('W', 0, [proto(over as Partial<ClassifiableProtocol>)])]).W.section).toBe('in_use')
  })
})

describe('purchaseUrgency — régua FR-013 / AC-4.5 (D = 2026-11-20)', () => {
  it.each([
    ['2026-11-17', 'planned'], // D-3
    ['2026-11-18', 'soon'], // D-2
    ['2026-11-19', 'soon'], // D-1
    ['2026-11-20', 'due'], // D
    ['2026-11-21', 'due'], // D+1
  ])('hoje %s ⇒ %s', (today, expected) => {
    expect(purchaseUrgency('2026-11-20', today)).toBe(expected)
  })

  it('sem data ou data inválida ⇒ planned (não inventa urgência)', () => {
    expect(purchaseUrgency(null, TODAY)).toBe('planned')
    expect(purchaseUrgency('20/11/2026', TODAY)).toBe('planned')
  })

  it('antecedência = o 1º aviso do servidor (número único)', () => {
    expect(PURCHASE_CTA_LEAD_DAYS).toBe(Math.max(MONTHLY_HEADS_UP_DAYS, ...PURCHASE_OFFSETS.step_switch, ...PURCHASE_OFFSETS.sparse))
    expect(PURCHASE_CTA_LEAD_DAYS).toBe(2)
  })
})
