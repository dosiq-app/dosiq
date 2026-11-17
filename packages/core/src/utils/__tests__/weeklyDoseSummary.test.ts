// Semana do tratamento — L1 Dose (spec 121 B: PO-10, PO-11, PO-13, PO-15; ADR-130).
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  resolveNextOpenDay,
  normalizeIntervalDays,
  resolveEarlyAnchorInstance,
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
