// summarizeTrackedProfile / trackableCadence (spec 124 A · FR-005/FR-013 · PO-4/PO-6).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { summarizeTrackedProfile, summarizeWedgeProfile, trackableCadence } from '../trackedMeasure'

afterEach(() => {
  vi.clearAllMocks()
  vi.clearAllTimers()
})

const GLP1 = 'A10S1' // wedge
const OTHER = 'G03A' // não wedge
const p = (id: string, medicine_id: string, frequency: string, extra: Record<string, unknown> = {}) => ({
  id, medicine_id, frequency, start_date: '2026-10-01', ...extra,
})

describe('trackableCadence', () => {
  it('wedge segue doseCadence (diário entra)', () => {
    expect(trackableCadence({ frequency: 'diário' }, true)).toEqual({ kind: 'daily', days: 1 })
    expect(trackableCadence({ frequency: 'semanal' }, true)).toEqual({ kind: 'weekly', days: 7 })
  })
  it('não wedge: só cadência ≥ 7 d (FR-013, AC-9)', () => {
    expect(trackableCadence({ frequency: 'intervalo_dias', interval_days: 30 }, false)).toEqual({ kind: 'weekly', days: 30 })
    expect(trackableCadence({ frequency: 'semanal' }, false)).toEqual({ kind: 'weekly', days: 7 })
    for (const pr of [
      { frequency: 'diário' },
      { frequency: 'intervalo_dias', interval_days: 1 },
      { frequency: 'intervalo_dias', interval_days: 6 },
      { frequency: 'intervalo_dias', interval_days: null },
      { frequency: 'quando_necessário' },
      { frequency: 'dias_alternados' },
    ]) expect(trackableCadence(pr, false)).toBeNull()
    expect(trackableCadence(null, false)).toBeNull()
  })
})

describe('summarizeTrackedProfile', () => {
  it('vazio ⇒ sem módulo', () => {
    const s = summarizeTrackedProfile([], {})
    expect(s).toMatchObject({ profile: 'nenhum', eligible: [], moduleProtocolId: null, moduleIsWedge: false })
  })

  it('só diário não wedge ⇒ sem módulo (AC-9)', () => {
    const s = summarizeTrackedProfile([p('a', 'm1', 'diário')], { m1: OTHER })
    expect(s.moduleProtocolId).toBeNull()
    expect(s.eligible).toEqual([])
  })

  it('só mensal não wedge ⇒ módulo dele, não wedge (FR-005)', () => {
    const s = summarizeTrackedProfile([p('a', 'm1', 'intervalo_dias', { interval_days: 30 }), p('b', 'm2', 'diário')], { m1: OTHER, m2: OTHER })
    expect(s).toMatchObject({ profile: 'nenhum', moduleProtocolId: 'a', moduleIsWedge: false })
    expect(s.eligible).toEqual([{ id: 'a', isWedge: false, cadence: { kind: 'weekly', days: 30 } }])
  })

  it('wedge + mensal ⇒ módulo segue no wedge até a B (A)', () => {
    const s = summarizeTrackedProfile(
      [p('w', 'm1', 'semanal', { start_date: '2026-09-01' }), p('a', 'm2', 'intervalo_dias', { interval_days: 30, start_date: '2026-11-01' })],
      { m1: GLP1, m2: OTHER }
    )
    expect(s).toMatchObject({ profile: 'misto', moduleProtocolId: 'w', moduleIsWedge: true })
    expect(s.eligible.map((e) => e.id).sort()).toEqual(['a', 'w'])
  })

  it('wedge diário entra como elegível (cadência conhecida)', () => {
    const s = summarizeTrackedProfile([p('w', 'm1', 'diário')], { m1: GLP1 })
    expect(s.eligible).toEqual([{ id: 'w', isWedge: true, cadence: { kind: 'daily', days: 1 } }])
  })

  it('wedge sem cadência conhecida mantém o módulo (121 intacta) mas não é elegível de L1', () => {
    const s = summarizeTrackedProfile([p('w', 'm1', 'quando_necessário')], { m1: GLP1 })
    expect(s).toMatchObject({ profile: 'wedge', moduleProtocolId: 'w', moduleIsWedge: true, eligible: [] })
  })

  it('2 não wedge: o iniciado mais recentemente; empate ⇒ maior id (determinístico)', () => {
    const a = p('a', 'm1', 'semanal', { start_date: '2026-10-01' })
    const b = p('b', 'm2', 'semanal', { start_date: '2026-10-01' })
    const c = p('c', 'm3', 'semanal', { start_date: '2026-09-01' })
    expect(summarizeTrackedProfile([a, b, c], { m1: OTHER, m2: OTHER, m3: OTHER }).moduleProtocolId).toBe('b')
    expect(summarizeTrackedProfile([c, b, a], { m1: OTHER, m2: OTHER, m3: OTHER }).moduleProtocolId).toBe('b')
  })

  it('campos do perfil wedge iguais ao summarizeWedgeProfile (PO-6)', () => {
    const list = [p('w', 'm1', 'semanal'), p('a', 'm2', 'diário')]
    const codes = { m1: GLP1, m2: OTHER }
    const { profile, wedgeProtocolId, wedgeStart } = summarizeTrackedProfile(list, codes)
    expect({ profile, wedgeProtocolId, wedgeStart }).toEqual(summarizeWedgeProfile(list, codes))
  })
})
