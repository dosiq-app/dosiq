// summarizeWedgeProfile (spec 121 FR-001 / FR-023 · PO-5): agregação por usuário sobre classifyWedge.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WEDGE_CLASS_PREFIXES, summarizeWedgeProfile } from '../trackedMeasure'

const p = (id: string, medicine_id: string | null, start_date: string | null = '2026-10-01') => ({ id, medicine_id, start_date })
const CODES = { tirz: 'A10S1', sema: 'a10s1 ', orli: 'A8A2', insu: 'A10C1', losa: 'C9C', semCod: null }

describe('summarizeWedgeProfile', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.clearAllTimers()
  })

  it('nenhum protocolo ativo ⇒ nenhum', () => {
    expect(summarizeWedgeProfile([], CODES)).toEqual({ profile: 'nenhum', wedgeProtocolId: null, wedgeStart: null })
  })

  it('todos wedge (inclui código com caixa/espaço e A8A oral) ⇒ wedge', () => {
    expect(summarizeWedgeProfile([p('1', 'tirz'), p('2', 'sema'), p('3', 'orli')], CODES).profile).toBe('wedge')
  })

  it('wedge + outro ⇒ misto', () => {
    expect(summarizeWedgeProfile([p('1', 'tirz'), p('2', 'losa')], CODES)).toEqual({ profile: 'misto', wedgeProtocolId: '1', wedgeStart: '2026-10-01' })
  })

  it('insulina (A10 não wedge) sozinha ⇒ nenhum', () => {
    expect(summarizeWedgeProfile([p('1', 'insu')], CODES).profile).toBe('nenhum')
  })

  it('sem código, medicine_id nulo ou medicamento fora do mapa ⇒ não-wedge', () => {
    expect(summarizeWedgeProfile([p('1', 'semCod'), p('2', null), p('3', 'desconhecido')], CODES).profile).toBe('nenhum')
    expect(summarizeWedgeProfile([p('1', 'tirz'), p('2', 'desconhecido')], CODES).profile).toBe('misto')
  })

  it('2 wedge ⇒ módulo do iniciado mais recentemente; empate de data ⇒ maior id (estável)', () => {
    expect(summarizeWedgeProfile([p('a', 'sema', '2026-09-01'), p('b', 'tirz', '2026-10-15')], CODES).wedgeProtocolId).toBe('b')
    expect(summarizeWedgeProfile([p('b', 'tirz', '2026-10-15'), p('a', 'sema', '2026-10-15')], CODES).wedgeProtocolId).toBe('b')
    expect(summarizeWedgeProfile([p('a', 'sema', null), p('b', 'tirz', '2026-01-01')], CODES).wedgeProtocolId).toBe('b')
  })

  it('wedgeStart = início mais antigo entre os wedge (jornada GLP-1), ignora não-wedge e data nula', () => {
    const r = summarizeWedgeProfile([p('a', 'sema', '2026-10-15'), p('b', 'tirz', '2026-10-30'), p('c', 'losa', '2026-01-01'), p('d', 'orli', null)], CODES)
    expect(r.wedgeProtocolId).toBe('b')
    expect(r.wedgeStart).toBe('2026-10-15')
  })

  it('cada prefixo do wedge classifica como wedge (paridade com WEDGE_CLASS_PREFIXES)', () => {
    for (const prefix of WEDGE_CLASS_PREFIXES) {
      expect(summarizeWedgeProfile([p('1', 'm')], { m: `${prefix}1` }).profile).toBe('wedge')
    }
  })
})
