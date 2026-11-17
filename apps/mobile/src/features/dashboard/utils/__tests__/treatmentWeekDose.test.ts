// 121 B — copy da L1 (AC-11..AC-13, G-B3) e da L3 (AC-15, PO-14). Pura.
import { describe, it, expect, afterEach } from '@jest/globals'
import { dailyRowCopy, doseCadence, doseRowCopy, evolutionDetail, evolutionRowCopy, firstScheduledTime, siteShort, weekdayDate, weeklyCadenceDays } from '../treatmentWeek'

const TZ = 'America/Sao_Paulo'

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('L1 copy', () => {
  it('weekdayDate e siteShort', () => {
    expect(weekdayDate('2026-11-11')).toBe('qua, 11/11')
    expect(siteShort('Abdômen (direito)')).toBe('abdômen direito')
  })

  it('AC-11 com local', () => {
    const c = doseRowCopy(
      { state: 'on_track', last: { day: '2026-11-13', time: '08:10', daysSince: 3, siteLabel: 'Abdômen (direito)' }, next: { day: '2026-11-20', daysUntil: 4 } },
      '2,5 mg'
    )
    expect(c).toEqual({ primary: 'Aplicada há 3 dias · abdômen direito', secondary: 'Próxima em 4 dias · sex, 20/11' })
  })

  it('AC-12 sem local ⇒ dia e hora', () => {
    const c = doseRowCopy({ state: 'on_track', last: { day: '2026-11-11', time: '08:10', daysSince: 5, siteLabel: null }, next: null }, null)
    expect(c).toEqual({ primary: 'Aplicada há 5 dias · qua, 11/11', secondary: null })
  })

  it('AC-13 lacuna neutra sem "sem registro" (G-B3)', () => {
    const c = doseRowCopy({ state: 'gap', last: { day: '2026-10-28', time: '08:00', daysSince: 19, siteLabel: null }, next: { day: '2026-11-18', daysUntil: 2 } }, null)
    expect(c).toEqual({ primary: 'Última aplicação registrada · qua, 28/10', secondary: 'Próxima prevista: qua, 18/11' })
    expect(`${c.primary} ${c.secondary}`.toLowerCase()).not.toContain('sem registro')
  })

  it('AC-13 1ª dose', () => {
    expect(doseRowCopy({ state: 'first_dose', last: null, next: { day: '2026-11-20', daysUntil: 4 } }, '2,5 mg')).toEqual({
      primary: 'Primeira aplicação · sex, 20/11',
      secondary: 'Em 4 dias · 2,5 mg',
    })
  })

  it('PO-12: nenhuma copy sugere local', () => {
    const all = [
      doseRowCopy({ state: 'on_track', last: { day: '2026-11-13', time: '08:10', daysSince: 3, siteLabel: 'Coxa (esquerda)' }, next: { day: '2026-11-20', daysUntil: 4 } }, null),
      doseRowCopy({ state: 'first_dose', last: null, next: { day: '2026-11-20', daysUntil: 4 } }, null),
    ].map((c) => `${c.primary} ${c.secondary}`.toLowerCase())
    for (const t of all) expect(t).not.toMatch(/sugerid|recomend|próximo local|aplique n|rodízio|alterne/)
  })


  it('G-B5: cadência ≥ 7 dias', () => {
    expect(weeklyCadenceDays({ frequency: 'semanal' })).toBe(7)
    expect(weeklyCadenceDays({ frequency: 'intervalo_dias', interval_days: 14 })).toBe(14)
    expect(weeklyCadenceDays({ frequency: 'intervalo_dias', interval_days: 3 })).toBeNull()
    expect(weeklyCadenceDays({ frequency: 'diário' })).toBeNull()
  })
})

describe('L3 copy (PO-14) — escada completa nos 3 estados', () => {
  const med = { dosage_unit: 'mg', presentation: 'injetavel' }
  const step = (position: number, status: string, dose: number, extra: any = {}) => ({
    id: `s${position}`, titration_id: 't1', position, status, dose, intake_unit: 'mg', duration_days: 28, medicine: med, ...extra,
  })

  it('em evolução', () => {
    const ladder = [0, 1, 2].map((p) => step(p, 'completed', 2.5 + p * 2.5)).concat([step(3, 'current', 10, { started_at: '2026-11-04T12:00:00Z' }), step(4, 'pending', 12.5)])
    const c = evolutionRowCopy(ladder, '2026-11-16', TZ)
    expect(c?.key).toBe('em_evolucao')
    expect(c?.primary).toMatch(/^Etapa 4 de 5 · 10/)
    expect(c?.secondary).toBe('Em evolução')
  })

  it('estável (vigente contínua) com "desde"', () => {
    const ladder = [step(0, 'completed', 2.5), step(1, 'current', 15, { duration_days: null, started_at: '2026-10-29T12:00:00Z' })]
    const c = evolutionRowCopy(ladder, '2026-11-16', TZ)
    expect(c?.key).toBe('estavel')
    expect(c?.secondary).toBe('Estável · desde 29/10')
  })

  it('aguardando: etapa pendente + lembretes seguem na vigente', () => {
    const ladder = [step(3, 'current', 10, { started_at: '2026-10-14T12:00:00Z' }), step(4, 'pending_confirmation', 12.5)]
    const c = evolutionRowCopy(ladder, '2026-11-16', TZ)
    expect(c?.key).toBe('aguardando')
    expect(c?.primary).toMatch(/^Etapa 5 aguardando · 12,5/)
    expect(c?.secondary).toMatch(/^Desde 11\/11 · lembretes seguem em 10/)
  })

  it('sem escada ⇒ null (linha omitida)', () => {
    expect(evolutionRowCopy(null, '2026-11-16', TZ)).toBeNull()
    expect(evolutionRowCopy([], '2026-11-16', TZ)).toBeNull()
  })
})

describe('evolutionDetail (L3 aberta, B-2)', () => {
  const TZ = 'America/Sao_Paulo'
  const st = (position: number, status: string, dose: number, extra: Record<string, unknown> = {}) =>
    ({ id: `s${position}`, position, status, dose, duration_days: 28, started_at: null, ...extra })
  const ladder = [0, 1, 2].map((p) => st(p, 'completed', 2.5 + p * 2.5))
    .concat([st(3, 'current', 10, { started_at: '2026-11-04T12:00:00Z' }), st(4, 'pending', 12.5)])

  it('em evolução: calendário da etapa (próxima = 3ª de 4) e escada com notas', () => {
    const d = evolutionDetail(ladder, '2026-11-18', 7, TZ, '2026-11-16')!
    expect(d.bar).toEqual({ done: 4, total: 5 })
    expect(d.stageDoses).toEqual({ total: 4, done: 2, nextOrdinal: 3, nextDay: '2026-11-18', nextText: 'próxima: 3ª de 4\nqua, 18/11' })
    expect(d.steps.map((s) => [s.state, s.note])).toEqual([
      ['done', 'concluída'], ['done', 'concluída'], ['done', 'concluída'], ['now', 'até 02/12'], ['next', 'prevista 02/12'],
    ])
  })

  it('etapa completa ⇒ todas cheias e "próxima" aponta a 1ª da etapa seguinte', () => {
    const d = evolutionDetail(ladder, '2026-12-02', 7, TZ, '2026-11-16')!
    expect(d.stageDoses).toEqual({ total: 4, done: 4, nextOrdinal: null, nextDay: null, nextText: 'próxima: 1ª da etapa 5\nqua, 02/12' })
  })

  it('etapa final sem duração (estável): sem bloco de doses; vigente "desde dd/mm"', () => {
    const final = [st(0, 'completed', 2.5), st(1, 'current', 5, { duration_days: null, started_at: '2026-10-29T12:00:00Z' })]
    const d = evolutionDetail(final, '2026-11-19', 7, TZ, '2026-11-16')!
    expect(d.stageDoses).toBeNull()
    expect(d.steps[1]).toMatchObject({ state: 'now', note: 'desde 29/10' })
    expect(d.currentDose).toEqual({ dose: expect.any(String), since: 'há 2 semanas', nextText: 'próxima:\nqui, 19/11' })
  })

  it('RC5: escada diária (sem cadência semanal) ⇒ sem "Doses desta etapa" (fatia C)', () => {
    expect(evolutionDetail(ladder, '2026-11-17', null, TZ, '2026-11-16')!.stageDoses).toBeNull()
  })

  it('RC5: sem próxima data ⇒ sem bloco (nunca tudo "feito")', () => {
    expect(evolutionDetail(ladder, null, 7, TZ, '2026-11-16')!.stageDoses).toBeNull()
  })

  it('sem escada ⇒ null', () => {
    expect(evolutionDetail([], null, 7, TZ, '2026-11-16')).toBeNull()
    expect(evolutionDetail(null, null, 7, TZ, '2026-11-16')).toBeNull()
  })
})

// ─── 121 C (PO-16, PO-18, PO-19) ─────────────────────────────────────────────────
describe('doseCadence (FR-040, PO-18) — cadência decide, forma não', () => {
  it('diário e intervalo 1 ⇒ daily; semanal e intervalo ≥ 7 ⇒ weekly', () => {
    expect(doseCadence({ frequency: 'diário' })).toEqual({ kind: 'daily', days: 1 })
    expect(doseCadence({ frequency: 'intervalo_dias', interval_days: 1 })).toEqual({ kind: 'daily', days: 1 })
    expect(doseCadence({ frequency: 'semanal' })).toEqual({ kind: 'weekly', days: 7 })
    expect(doseCadence({ frequency: 'intervalo_dias', interval_days: 14 })).toEqual({ kind: 'weekly', days: 14 })
  })
  it('C-A2: intervalo 2..6, alternado, PRN, personalizado, null ⇒ sem L1', () => {
    expect(doseCadence({ frequency: 'intervalo_dias', interval_days: 3 })).toBeNull()
    expect(doseCadence({ frequency: 'intervalo_dias', interval_days: null })).toBeNull()
    expect(doseCadence({ frequency: 'dias_alternados' })).toBeNull()
    expect(doseCadence({ frequency: 'quando_necessário' })).toBeNull()
    expect(doseCadence({ frequency: 'personalizado' })).toBeNull()
    expect(doseCadence(null)).toBeNull()
  })
})

describe('doseRowCopy não injetável (AC-18) — verbo neutro', () => {
  const last = { day: '2026-11-13', time: '08:10', daysSince: 3, siteLabel: null }
  it('semanal "comprimido" ⇒ Registrada, sem "aplicação"', () => {
    const c = doseRowCopy({ state: 'on_track', last, next: { day: '2026-11-20', daysUntil: 4 } }, null, false)
    expect(c.primary).toBe('Registrada há 3 dias · sex, 13/11')
    expect(c.secondary).toBe('Próxima em 4 dias · sex, 20/11')
  })
  it('lacuna e 1ª dose neutras', () => {
    expect(doseRowCopy({ state: 'gap', last, next: null }, null, false).primary).toBe('Último registro · sex, 13/11')
    expect(doseRowCopy({ state: 'first_dose', last: null, next: { day: '2026-11-18', daysUntil: 2 } }, null, false).primary).toBe('Primeira dose · qua, 18/11')
  })
  it('injetável mantém a copy da B', () => {
    expect(doseRowCopy({ state: 'gap', last, next: null }, null).primary).toBe('Última aplicação registrada · sex, 13/11')
  })
})

describe('dailyRowCopy (AC-16, PO-16) — doses na janela móvel', () => {
  const week = (taken: number, due: number, todayLast: { time: string } | null, since: string | null = null) => ({ taken, due, todayLast, since })
  it('registro hoje: oral "Tomado"/doses, injetável "Aplicado"/aplicações', () => {
    expect(dailyRowCopy(week(11, 13, { time: '08:05' }), { injectable: false, todayTime: '20:00', next: null })).toEqual({
      primary: 'Tomado hoje · 08:05', secondary: '11 de 13 doses nos últimos 7 dias',
    })
    expect(dailyRowCopy(week(6, 7, { time: '21:00' }), { injectable: true, todayTime: null, next: null })).toEqual({
      primary: 'Aplicado hoje · 21:00', secondary: '6 de 7 aplicações nos últimos 7 dias',
    })
  })
  it('sem registro hoje ⇒ "Hoje às hh:mm"; tratamento novo ⇒ "desde o início"', () => {
    expect(dailyRowCopy(week(2, 2, null, '2026-11-14'), { injectable: false, todayTime: '08:00', next: null })).toEqual({
      primary: 'Hoje às 08:00', secondary: '2 de 2 doses desde o início (sáb, 14/11)',
    })
  })
  it('hoje não previsto ⇒ próxima; m = 0 ⇒ sem contagem; m = 1 singular', () => {
    expect(dailyRowCopy(week(0, 0, null), { injectable: false, todayTime: null, next: { date: '2026-11-19', time: '08:00' } })).toEqual({
      primary: 'Próxima · qui, 19/11 às 08:00', secondary: null,
    })
    expect(dailyRowCopy(week(0, 1, null), { injectable: true, todayTime: '08:00', next: null }).secondary).toBe('0 de 1 aplicação nos últimos 7 dias')
  })
  it('FR-046: nenhuma copy com %, "perdeu", "parabéns"', () => {
    const all = JSON.stringify([
      dailyRowCopy(week(0, 5, null), { injectable: false, todayTime: '08:00', next: null }),
      dailyRowCopy(week(5, 5, { time: '08:00' }), { injectable: true, todayTime: '08:00', next: null }),
    ])
    expect(all).not.toMatch(/%|perd|parab|protocolo/i)
  })
})

describe('firstScheduledTime', () => {
  it('menor horário válido; vazio ⇒ null', () => {
    expect(firstScheduledTime({ time_schedule: ['20:00', '08:00'] })).toBe('08:00')
    expect(firstScheduledTime({ time_schedule: [] })).toBeNull()
    expect(firstScheduledTime(null)).toBeNull()
  })
})

describe('evolutionDetail diário (AC-19, PO-19)', () => {
  const st = (position: number, status: string, extra: Record<string, unknown> = {}) =>
    ({ id: `s${position}`, position, status, dose: 1 + position, duration_days: 7, started_at: null, ...extra })
  // Etapa 2 começou 16/11 12:00 local (15:00Z); hoje 18/11 ⇒ dia 3 de 7.
  const ladder = [st(0, 'completed'), st(1, 'current', { started_at: '2026-11-16T15:00:00Z' }), st(2, 'pending')]

  it('"Dia N de M desta etapa" + próxima etapa prevista; nunca bolinhas', () => {
    const d = evolutionDetail(ladder, '2026-11-19', 1, TZ, '2026-11-18', 'daily')!
    expect(d.stageDoses).toBeNull()
    expect(d.stageCalendar).toEqual({ day: 3, total: 7, nextText: 'Etapa 3 prevista · seg, 23/11' })
  })
  it('hoje além do fim ⇒ clamp em M; sem started_at ⇒ sem calendário; última etapa ⇒ sem próxima', () => {
    expect(evolutionDetail(ladder, null, 1, TZ, '2026-11-30', 'daily')!.stageCalendar).toMatchObject({ day: 7, total: 7 })
    const noStart = [st(0, 'current'), st(1, 'pending')]
    expect(evolutionDetail(noStart, null, 1, TZ, '2026-11-18', 'daily')!.stageCalendar).toBeNull()
    const last = [st(0, 'completed'), st(1, 'current', { started_at: '2026-11-16T15:00:00Z' })]
    expect(evolutionDetail(last, null, 1, TZ, '2026-11-18', 'daily')!.stageCalendar).toEqual({ day: 3, total: 7, nextText: null })
  })
  it('semanal não ganha stageCalendar', () => {
    expect(evolutionDetail(ladder, '2026-11-19', 7, TZ, '2026-11-18')!.stageCalendar).toBeNull()
  })
})
