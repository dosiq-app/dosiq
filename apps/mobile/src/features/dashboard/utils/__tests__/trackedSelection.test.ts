import {
  pickTrackedDefault,
  trackedKind,
  trackedStatus,
  trackedStatusLine,
  widgetMeasure,
  type TrackedCandidate,
  type TrackedStatus,
} from '@dashboard/utils/trackedSelection'

const TZ = 'America/Sao_Paulo'
const TODAY = '2026-11-24'
const weekly = (days: number) => ({ kind: 'weekly' as const, days })
const daily = { kind: 'daily' as const, days: 1 }
// 12:00 local em GMT-3 = 15:00Z (dia local nunca vira)
const at = (day: string) => ({ taken_at: `${day}T15:00:00.123456+00:00`, injection_site: null })

const status = (over: Partial<TrackedStatus> = {}): TrackedStatus => ({
  gapSince: null, first: false, today: false, nextDay: null, daysUntil: null, ...over,
})
const cand = (id: string, isWedge: boolean, s: Partial<TrackedStatus>): TrackedCandidate => ({ id, isWedge, status: status(s) })

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('trackedStatus', () => {
  it('mensal há 40 dias ⇒ lacuna desde o dia da dose', () => {
    const s = trackedStatus({ cadence: weekly(30), latest: at('2026-10-15'), upcomingDates: ['2026-11-26'], todayLocal: TODAY, tz: TZ })
    expect(s.gapSince).toBe('2026-10-15')
    expect(s.today).toBe(false)
  })

  it('mensal há 12 dias ⇒ sem lacuna, próxima em 18', () => {
    const s = trackedStatus({ cadence: weekly(30), latest: at('2026-11-12'), upcomingDates: ['2026-12-12'], todayLocal: TODAY, tz: TZ })
    expect(s).toEqual({ gapSince: null, first: false, today: false, nextDay: '2026-12-12', daysUntil: 18 })
  })

  it('diário nunca é lacuna (Q-2), mesmo sem dose há dias', () => {
    const s = trackedStatus({ cadence: daily, latest: at('2026-11-01'), upcomingDates: [TODAY], todayLocal: TODAY, tz: TZ })
    expect(s.gapSince).toBeNull()
    expect(s.today).toBe(true)
  })

  it('leitura falhou (undefined) ⇒ sem lacuna e sem 1ª dose (E-11)', () => {
    const s = trackedStatus({ cadence: weekly(7), latest: undefined, upcomingDates: ['2026-11-27'], todayLocal: TODAY, tz: TZ })
    expect(s.gapSince).toBeNull()
    expect(s.first).toBe(false)
  })

  it('nenhuma dose (null) ⇒ 1ª dose', () => {
    expect(trackedStatus({ cadence: weekly(7), latest: null, upcomingDates: null, todayLocal: TODAY, tz: TZ }).first).toBe(true)
  })

  it('datas passadas no calendário são ignoradas', () => {
    const s = trackedStatus({ cadence: weekly(7), latest: at('2026-11-20'), upcomingDates: ['2026-11-20', '2026-11-27'], todayLocal: TODAY, tz: TZ })
    expect(s.nextDay).toBe('2026-11-27')
    expect(s.daysUntil).toBe(3)
  })
})

describe('pickTrackedDefault (FR-014)', () => {
  it('vazio ⇒ null; 1 ⇒ o único', () => {
    expect(pickTrackedDefault([])).toBeNull()
    expect(pickTrackedDefault(null)).toBeNull()
    expect(pickTrackedDefault([cand('a', false, {})])).toBe('a')
  })

  it('lacuna ganha de dose hoje e de próxima (C-1)', () => {
    const list = [
      cand('wedge', true, { today: true, nextDay: TODAY, daysUntil: 0 }),
      cand('mensal', false, { gapSince: '2026-10-01', nextDay: '2026-11-30' }),
      cand('vitd', false, { nextDay: '2026-11-25', daysUntil: 1 }),
    ]
    expect(pickTrackedDefault(list)).toBe('mensal')
  })

  it('sem lacuna: hoje ganha de próxima', () => {
    expect(pickTrackedDefault([cand('vitd', false, { nextDay: '2026-11-25' }), cand('x', false, { today: true })])).toBe('x')
  })

  it('próxima mais cedo ganha', () => {
    expect(pickTrackedDefault([cand('b', false, { nextDay: '2026-11-30' }), cand('c', false, { nextDay: '2026-11-26' })])).toBe('c')
  })

  it('empate ⇒ wedge; empate entre iguais ⇒ id (estável)', () => {
    expect(pickTrackedDefault([cand('z', false, { nextDay: '2026-11-26' }), cand('w', true, { nextDay: '2026-11-26' })])).toBe('w')
    expect(pickTrackedDefault([cand('b', false, { today: true }), cand('a', false, { today: true })])).toBe('a')
  })

  it('duas lacunas ⇒ a mais antiga', () => {
    expect(pickTrackedDefault([cand('n', false, { gapSince: '2026-10-20' }), cand('o', false, { gapSince: '2026-09-01' })])).toBe('o')
  })
})

describe('trackedStatusLine', () => {
  it('lacuna usa o vocabulário da L1 (G-B3), por forma', () => {
    expect(trackedStatusLine(status({ gapSince: '2026-10-01' }), true)).toBe('Última aplicação registrada · qui, 01/10')
    expect(trackedStatusLine(status({ gapSince: '2026-10-01' }), false)).toBe('Última dose registrada · qui, 01/10')
  })
  it('hoje, 1ª dose, próxima, amanhã', () => {
    expect(trackedStatusLine(status({ today: true }), true)).toBe('Dose prevista hoje')
    expect(trackedStatusLine(status({ first: true, nextDay: '2026-11-27' }), true)).toBe('1ª dose · sex, 27/11')
    expect(trackedStatusLine(status({ nextDay: '2026-11-29', daysUntil: 5 }), true)).toBe('Próxima em 5 dias · dom, 29/11')
    expect(trackedStatusLine(status({ nextDay: '2026-11-25', daysUntil: 1 }), false)).toBe('Próxima amanhã · qua, 25/11')
  })
  it('nenhuma copy de juízo (INV-3)', () => {
    const all = [
      status({ gapSince: '2026-01-01' }), status({ today: true }), status({ first: true }), status({ nextDay: '2026-12-01', daysUntil: 7 }),
    ].map((s) => trackedStatusLine(s, true)).join(' ')
    expect(all).not.toMatch(/atras|risco|prote|janela|sem registro/i)
  })
})

describe('widgetMeasure (E-12)', () => {
  it('chave ausente = NULL (E-12 revisto: wedge segue com peso, como na 121)', () => {
    expect(widgetMeasure({ frequency: 'semanal' }, true)).toBe('peso')
    expect(widgetMeasure({ frequency: 'semanal' }, false)).toBe('nenhum')
    expect(widgetMeasure(null, true)).toBe('nenhum')
  })
  it('NULL ⇒ wedge peso / não wedge nenhum', () => {
    expect(widgetMeasure({ tracked_measure: null }, true)).toBe('peso')
    expect(widgetMeasure({ tracked_measure: null }, false)).toBe('nenhum')
  })
  it('valor do enum passa; fora do enum ⇒ nenhum', () => {
    expect(widgetMeasure({ tracked_measure: 'glicemia' }, false)).toBe('glicemia')
    expect(widgetMeasure({ tracked_measure: 'pressao_arterial' }, true)).toBe('pressao_arterial')
    expect(widgetMeasure({ tracked_measure: 'nenhum' }, true)).toBe('nenhum')
    expect(widgetMeasure({ tracked_measure: 'Peso' }, true)).toBe('nenhum')
  })
})

describe('trackedKind (E-15)', () => {
  it('wedge | injetavel | outro', () => {
    expect(trackedKind(true, { presentation: 'comprimido' })).toBe('wedge')
    expect(trackedKind(false, { presentation: 'injetavel' })).toBe('injetavel')
    expect(trackedKind(false, { presentation: 'comprimido' })).toBe('outro')
  })
})
