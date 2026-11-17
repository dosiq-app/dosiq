// Semana do tratamento — L1 Dose (spec 121 B: PO-10, PO-11, PO-13, PO-15; ADR-130).
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  resolveNextOpenDay,
  normalizeIntervalDays,
  resolveEarlyAnchorInstance,
  summarizeDailyWindow,
  summarizeWeeklyDose,
} from '../weeklyDoseSummary'

const TZ = 'America/Sao_Paulo'

afterEach(() => {
  vi.clearAllMocks()
  vi.clearAllTimers()
})

describe('normalizeIntervalDays', () => {
  it('null/0/negativo/NaN caem para 7; inteiro válido passa', () => {
    expect(normalizeIntervalDays(null)).toBe(7)
    expect(normalizeIntervalDays(0)).toBe(7)
    expect(normalizeIntervalDays(-3)).toBe(7)
    expect(normalizeIntervalDays(Number.NaN)).toBe(7)
    expect(normalizeIntervalDays(30)).toBe(30)
  })
})

describe('summarizeWeeklyDose', () => {
  it('sem aplicação ⇒ first_dose com a próxima prevista', () => {
    const s = summarizeWeeklyDose({ applications: [], nextDay: '2026-11-18', todayLocal: '2026-11-16', tz: TZ })
    expect(s.state).toBe('first_dose')
    expect(s.last).toBeNull()
    expect(s.next).toEqual({ day: '2026-11-18', daysUntil: 2 })
  })

  it('com local conhecido ⇒ on_track com rótulo e dias desde a última', () => {
    const s = summarizeWeeklyDose({
      applications: [{ taken_at: '2026-11-13T11:10:00.000Z', injection_site: 'abdomen_d', medicine_id: 'm1' }],
      nextDay: '2026-11-20',
      todayLocal: '2026-11-16',
      tz: TZ,
    })
    expect(s.state).toBe('on_track')
    expect(s.last).toMatchObject({ day: '2026-11-13', time: '08:10', daysSince: 3, site: 'abdomen_d' })
    expect(s.last?.siteLabel).toBeTruthy()
  })

  it('local desconhecido no banco ⇒ sem local (nunca rótulo cru)', () => {
    const s = summarizeWeeklyDose({
      applications: [{ taken_at: '2026-11-13T11:10:00.000Z', injection_site: 'orelha' }],
      nextDay: null,
      todayLocal: '2026-11-16',
      tz: TZ,
    })
    expect(s.last?.site).toBeNull()
    expect(s.last?.siteLabel).toBeNull()
    expect(s.next).toBeNull()
  })

  it('aplicada hoje ⇒ daysSince 0', () => {
    const s = summarizeWeeklyDose({
      applications: [{ taken_at: '2026-11-16T12:00:00.000Z' }],
      nextDay: '2026-11-23',
      todayLocal: '2026-11-16',
      tz: TZ,
    })
    expect(s.last?.daysSince).toBe(0)
  })

  it('lacuna = mais de 1 intervalo (7 e 30)', () => {
    const base = { nextDay: '2026-11-18', todayLocal: '2026-11-16', tz: TZ }
    expect(summarizeWeeklyDose({ ...base, applications: [{ taken_at: '2026-11-09T12:00:00.000Z' }] }).state).toBe('on_track')
    expect(summarizeWeeklyDose({ ...base, applications: [{ taken_at: '2026-11-08T12:00:00.000Z' }] }).state).toBe('gap')
    const thirty = { ...base, intervalDays: 30 }
    expect(summarizeWeeklyDose({ ...thirty, applications: [{ taken_at: '2026-10-20T12:00:00.000Z' }] }).state).toBe('on_track')
    expect(summarizeWeeklyDose({ ...thirty, applications: [{ taken_at: '2026-10-10T12:00:00.000Z' }] }).state).toBe('gap')
  })

  it('PO-13: domingo 23h em GMT-3 (segunda em UTC) é domingo local', () => {
    const s = summarizeWeeklyDose({
      applications: [{ taken_at: '2026-11-16T02:00:00.000Z' }], // dom 15/11 23:00 local
      nextDay: null,
      todayLocal: '2026-11-16',
      tz: TZ,
    })
    expect(s.last).toMatchObject({ day: '2026-11-15', time: '23:00', daysSince: 1 })
  })

  it('PO-10: identidade é do log (R-299) — só a linha de fato é lida', () => {
    const s = summarizeWeeklyDose({
      applications: [{ taken_at: '2026-11-13T11:10:00.000Z', injection_site: 'coxa_e', medicine_id: 'med-antigo' }],
      nextDay: null,
      todayLocal: '2026-11-16',
      tz: TZ,
    })
    expect(s.last?.site).toBe('coxa_e')
  })
})

describe('resolveEarlyAnchorInstance (ADR-130, PO-15)', () => {
  const WEEK_TOL = 5040 // metade de 7 dias
  const now = new Date('2026-11-16T12:00:00.000Z')
  const inst = (id: string, iso: string, status = 'pending', tol: number | null = WEEK_TOL) => ({
    id,
    status,
    scheduled_for: iso,
    tolerance_minutes: tol,
  })

  it('futura dentro da tolerância ⇒ ancora na mais próxima', () => {
    const r = resolveEarlyAnchorInstance(
      [inst('b', '2026-11-26T12:00:00.000Z'), inst('a', '2026-11-19T12:00:00.000Z')],
      now
    )
    expect(r?.id).toBe('a')
  })

  it('futura além da tolerância (1ª dose em 4 dias) ⇒ null', () => {
    expect(resolveEarlyAnchorInstance([inst('a', '2026-11-20T12:00:00.000Z')], now)).toBeNull()
  })

  it('passado (atrasada) nunca ancora — é do hero', () => {
    expect(resolveEarlyAnchorInstance([inst('a', '2026-11-15T12:00:00.000Z')], now)).toBeNull()
  })

  it('status ≠ pending ou tolerância ausente ⇒ ignora', () => {
    expect(
      resolveEarlyAnchorInstance(
        [inst('a', '2026-11-18T12:00:00.000Z', 'taken'), inst('b', '2026-11-18T12:00:00.000Z', 'pending', null)],
        now
      )
    ).toBeNull()
  })

  it('semanal: atrasada dentro da tolerância e futura ancorável nunca coexistem', () => {
    // varre "agora" ao longo de 2 semanas de hora em hora
    const start = Date.parse('2026-11-09T12:00:00.000Z')
    const weekly = [0, 7, 14, 21].map((d) => inst(`w${d}`, new Date(start + d * 86400000).toISOString()))
    for (let h = 0; h < 14 * 24; h++) {
      const t = start + h * 3600000
      const anchor = resolveEarlyAnchorInstance(weekly, new Date(t))
      const late = weekly.some((w) => {
        const ms = Date.parse(w.scheduled_for)
        return ms <= t && t - ms <= WEEK_TOL * 60000
      })
      expect(anchor !== null && late).toBe(false)
    }
  })
})

describe('resolveNextOpenDay (smoke 121 B: "Já apliquei" na 1ª dose futura)', () => {
  const TZ = 'America/Sao_Paulo'
  const days = ['2026-11-18', '2026-11-25', '2026-12-02']

  it('ocorrência de 18/11 registrada adiantada ⇒ próxima = 25/11', () => {
    const inst = [{ scheduled_for: '2026-11-18T11:00:00.000Z', status: 'taken' }]
    expect(resolveNextOpenDay(days, inst, TZ)).toBe('2026-11-25')
  })

  it('pending/missed não contam como resolvidas', () => {
    const inst = [{ scheduled_for: '2026-11-18T11:00:00.000Z', status: 'pending' }]
    expect(resolveNextOpenDay(days, inst, TZ)).toBe('2026-11-18')
  })

  it('dia local do fuso (00:30 em SP = 03:30Z) e sem instâncias ⇒ calendário', () => {
    const inst = [{ scheduled_for: '2026-11-19T02:30:00.000Z', status: 'taken' }] // 18/11 23:30 SP
    expect(resolveNextOpenDay(days, inst, TZ)).toBe('2026-11-25')
    expect(resolveNextOpenDay(days, null, TZ)).toBe('2026-11-18')
    expect(resolveNextOpenDay([], [], TZ)).toBeNull()
  })
})

// ─── 121 C · L1 diária — janela móvel de 7 d (PO-16, PO-17; decisões PO 17/11) ───────
// Fixtures em instante local de São Paulo (−03:00), nunca derivadas de toISOString (AP-270).
describe('summarizeDailyWindow', () => {
  const everyDay = () => true
  const at = (day: string, hm: string) => `${day}T${hm}:00-03:00`
  const now = (day: string, hm: string) => new Date(at(day, hm))
  const base = { isScheduled: everyDay, startDay: '2026-10-01', truncated: false, tz: TZ }

  it('7 dias terminando hoje (hoje na ponta direita), segunda não zera a faixa', () => {
    const s = summarizeDailyWindow({
      ...base, timesOfDay: ['08:00'], todayLocal: '2026-11-16', now: now('2026-11-16', '07:00'),
      applications: [{ taken_at: at('2026-11-15', '08:10') }, { taken_at: at('2026-11-13', '08:00') }],
    })
    expect(s.days.map((d) => d.day)).toEqual(['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16'])
    expect(s.days.map((d) => d.state)).toEqual(['open', 'open', 'open', 'full', 'open', 'full', 'pending'])
    expect(s.days[6].isToday).toBe(true)
    expect(s.taken).toBe(2)
    expect(s.due).toBe(6) // hoje 08:00 ainda não venceu ⇒ fora da conta (decisão 2)
    expect(s.since).toBeNull()
  })

  it('R-299: passado pelas ocorrências gravadas — trocar 1→2 horários não reescreve a semana', () => {
    const days = ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']
    const s = summarizeDailyWindow({
      ...base, timesOfDay: ['08:00', '20:00'], todayLocal: '2026-11-16', now: now('2026-11-16', '07:00'),
      applications: days.map((d) => ({ taken_at: at(d, '08:05') })),
      pastInstances: days.map((d) => ({ scheduled_for: at(d, '08:00'), status: 'taken' })),
    })
    expect(s.days.slice(0, 6).map((d) => d.state)).toEqual(['full', 'full', 'full', 'full', 'full', 'full'])
    expect(s.days.slice(0, 6).every((d) => d.scheduled === 1)).toBe(true)
    expect(s.days[6].scheduled).toBe(2) // hoje = horário atual
    expect(s.taken).toBe(6)
    expect(s.due).toBe(6)
  })

  it('R-299: dia pausado gravado = off; dia sem ocorrência gravada cai no calendário atual', () => {
    const s = summarizeDailyWindow({
      ...base, timesOfDay: ['08:00'], todayLocal: '2026-11-16', now: now('2026-11-16', '07:00'),
      applications: [],
      pastInstances: [
        { scheduled_for: at('2026-11-14', '08:00'), status: 'skipped_paused' },
        { scheduled_for: at('2026-11-15', '08:00'), status: 'skipped_user' },
        { scheduled_for: at('2026-11-16', '08:00'), status: 'pending' }, // hoje: ignorada
      ],
    })
    const by = Object.fromEntries(s.days.map((d) => [d.day, d]))
    expect(by['2026-11-14'].state).toBe('off')
    expect(by['2026-11-15']).toMatchObject({ state: 'open', scheduled: 1 })
    expect(by['2026-11-13']).toMatchObject({ state: 'open', scheduled: 1 }) // sem fato ⇒ calendário
    expect(s.due).toBe(5)
  })

  it('R-299: pastInstances null (leitura falhou) ⇒ calendário atual', () => {
    const s = summarizeDailyWindow({
      ...base, timesOfDay: ['08:00', '20:00'], todayLocal: '2026-11-16', now: now('2026-11-16', '07:00'),
      applications: [], pastInstances: null,
    })
    expect(s.days[0].scheduled).toBe(2)
  })

  it('dose de hoje entra só depois da janela (08:00 + 120 min)', () => {
    const args = { ...base, timesOfDay: ['08:00'], todayLocal: '2026-11-16', applications: [] }
    expect(summarizeDailyWindow({ ...args, now: now('2026-11-16', '09:59') }).days[6].state).toBe('pending')
    const after = summarizeDailyWindow({ ...args, now: now('2026-11-16', '10:00') })
    expect(after.days[6].state).toBe('open')
    expect(after.due).toBe(7)
  })

  it('2 doses/dia: 1 de 2 vencidas = parcial; registro adiantado conta; extra não passa do previsto', () => {
    const s = summarizeDailyWindow({
      ...base, timesOfDay: ['08:00', '20:00'], todayLocal: '2026-11-16', now: now('2026-11-16', '15:00'),
      applications: [
        { taken_at: at('2026-11-16', '08:05') },
        { taken_at: at('2026-11-15', '08:00') },
        { taken_at: at('2026-11-14', '08:00') }, { taken_at: at('2026-11-14', '20:00') }, { taken_at: at('2026-11-14', '22:00') },
      ],
    })
    const by = Object.fromEntries(s.days.map((d) => [d.day, d]))
    expect(by['2026-11-14']).toMatchObject({ state: 'full', registered: 2, scheduled: 2 })
    expect(by['2026-11-15']).toMatchObject({ state: 'partial', registered: 1 })
    expect(by['2026-11-16']).toMatchObject({ state: 'full', registered: 1, due: 1 }) // 20:00 ainda por vir
    expect(s.todayLast).toEqual({ time: '08:05' })
    expect(s.taken).toBe(4)
    expect(s.due).toBe(13) // 6 dias × 2 + hoje 1
  })

  it('registro antes da janela fechar entra nos dois lados (nunca "2 de 1")', () => {
    const s = summarizeDailyWindow({ ...base, timesOfDay: ['20:00'], todayLocal: '2026-11-16', now: now('2026-11-16', '19:30'), applications: [{ taken_at: at('2026-11-16', '19:25') }] })
    expect(s.days[6]).toMatchObject({ state: 'full', registered: 1 })
    expect(s.taken).toBe(1)
    expect(s.due).toBe(7)
  })

  it('registro 23:30 local conta no dia LOCAL (UTC já é o dia seguinte)', () => {
    const s = summarizeDailyWindow({ ...base, timesOfDay: ['23:00'], todayLocal: '2026-11-16', now: now('2026-11-16', '07:00'), applications: [{ taken_at: '2026-11-16T02:30:00.000Z' }] })
    expect(s.days[5]).toMatchObject({ day: '2026-11-15', state: 'full' })
  })

  it('tratamento com menos de 7 dias: faixa começa no início e devolve `since`', () => {
    const s = summarizeDailyWindow({ ...base, startDay: '2026-11-14', timesOfDay: ['08:00'], todayLocal: '2026-11-16', now: now('2026-11-16', '12:00'), applications: [] })
    expect(s.days.map((d) => d.day)).toEqual(['2026-11-14', '2026-11-15', '2026-11-16'])
    expect(s.since).toBe('2026-11-14')
    expect(s.due).toBe(3)
  })

  it('dia não previsto ⇒ off, fora da conta; sem horários ⇒ nada vence', () => {
    const s = summarizeDailyWindow({ ...base, isScheduled: (d) => d !== '2026-11-12', timesOfDay: ['08:00'], todayLocal: '2026-11-16', now: now('2026-11-16', '12:00'), applications: [] })
    expect(s.days[2]).toMatchObject({ day: '2026-11-12', state: 'off' })
    expect(s.due).toBe(6)
    const none = summarizeDailyWindow({ ...base, timesOfDay: [], todayLocal: '2026-11-16', now: now('2026-11-16', '12:00'), applications: [] })
    expect(none.due).toBe(0)
  })

  it('null / taken_at inválido ⇒ ignorado, nunca lança', () => {
    const s = summarizeDailyWindow({ ...base, timesOfDay: ['08:00'], todayLocal: '2026-11-16', now: now('2026-11-16', '12:00'), applications: null })
    expect(s.taken).toBe(0)
    const bad = summarizeDailyWindow({ ...base, timesOfDay: ['08:00'], todayLocal: '2026-11-16', now: now('2026-11-16', '12:00'), applications: [{ taken_at: 'xx' }] })
    expect(bad.taken).toBe(0)
  })

  it('lista truncada (C-A3): dias antes do registro mais antigo carregado = unknown, fora da conta', () => {
    const s = summarizeDailyWindow({
      ...base, truncated: true, timesOfDay: ['08:00'], todayLocal: '2026-11-16', now: now('2026-11-16', '12:00'),
      applications: [{ taken_at: at('2026-11-16', '08:00') }, { taken_at: at('2026-11-15', '08:00') }],
    })
    expect(s.days.slice(0, 5).every((d) => d.state === 'unknown')).toBe(true)
    expect(s.taken).toBe(2)
    expect(s.due).toBe(2)
  })
})
