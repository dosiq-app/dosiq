// 121 B — copy da L1 (AC-11..AC-13, G-B3) e da L3 (AC-15, PO-14). Pura.
import { describe, it, expect, afterEach } from '@jest/globals'
import { doseRowCopy, evolutionDetail, evolutionRowCopy, siteShort, weekdayDate, weeklyCadenceDays } from '../treatmentWeek'

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
