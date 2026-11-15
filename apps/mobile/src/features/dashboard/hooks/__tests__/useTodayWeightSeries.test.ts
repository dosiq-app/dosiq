// useTodayWeightSeries — 121 A: 1 ponto por dia LOCAL (R-020) e "Tratamento" paginado (AP-186).
import { describe, it, expect, afterEach } from '@jest/globals'

const mockList = jest.fn()
const mockJourney = jest.fn(async (_uid: string): Promise<string | null> => null)
jest.mock('@dashboard/services/dashboardService', () => ({ getGlp1JourneyStart: (uid: string) => mockJourney(uid) }))
jest.mock('@measures/services/measuresRepo', () => ({ measuresRepo: { list: (...a: any[]) => mockList(...a), getLatest: jest.fn(async () => null) } }))

import { renderHook, act, waitFor } from '@testing-library/react-native'
import { dailyWeightPoints, listAllWeights, useTodayWeightSeries, WEIGHT_PAGE_SIZE } from '../useTodayWeightSeries'

const TZ = 'America/Sao_Paulo'

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('dailyWeightPoints', () => {
  it('2 pesagens no mesmo dia local ⇒ vale a mais recente; ordem crescente', () => {
    const r = dailyWeightPoints(
      [
        { value: 80, measured_at: '2026-11-14T22:30:00-03:00' }, // 01:30Z do dia 15, mas dia 14 local
        { value: 81, measured_at: '2026-11-14T07:00:00-03:00' },
        { value: 79, measured_at: '2026-11-13T08:00:00-03:00' },
      ],
      TZ
    )
    expect(r).toEqual([
      { day: '2026-11-13', kg: 79 },
      { day: '2026-11-14', kg: 80 },
    ])
  })

  it('valor não finito ou data inválida é ignorado; vazio ⇒ []', () => {
    expect(dailyWeightPoints([{ value: Number.NaN, measured_at: '2026-11-14T07:00:00-03:00' }, { value: 80, measured_at: 'x' }], TZ)).toEqual([])
    expect(dailyWeightPoints([], TZ)).toEqual([])
  })
})

describe('listAllWeights (AP-186)', () => {
  it('pagina até a página vir incompleta, usando a mais antiga como teto', async () => {
    const full = Array.from({ length: WEIGHT_PAGE_SIZE }, (_, i) => ({ value: 80, measured_at: `t${String(1000 - i).padStart(4, '0')}` }))
    mockList.mockResolvedValueOnce(full).mockResolvedValueOnce([{ value: 81, measured_at: 'old' }])
    const all = await listAllWeights('2026-01-01T03:00:00.000Z')
    expect(all).toHaveLength(WEIGHT_PAGE_SIZE + 1)
    expect(mockList).toHaveBeenCalledTimes(2)
    expect(mockList.mock.calls[1][0]).toEqual({ type: 'peso', fromTs: '2026-01-01T03:00:00.000Z', toTs: full[full.length - 1].measured_at, limit: WEIGHT_PAGE_SIZE })
  })

  it('página curta na 1ª leitura ⇒ 1 chamada só; null tratado como vazio', async () => {
    mockList.mockResolvedValueOnce(null)
    expect(await listAllWeights(undefined)).toEqual([])
    expect(mockList).toHaveBeenCalledTimes(1)
  })
})

describe('useTodayWeightSeries — recarga com "Tratamento" aberto (RC5)', () => {
  it('salvar com a janela Tratamento já carregada relê as duas séries, sem voltar a null', async () => {
    mockList.mockResolvedValue([{ value: 80, measured_at: '2026-11-14T08:00:00-03:00' }])
    const h = renderHook(() => useTodayWeightSeries({ enabled: true, timezone: TZ, treatmentStart: '2026-10-01' }))
    await waitFor(() => expect(h.result.current.recent).not.toBeNull())
    await act(async () => { await h.result.current.loadTreatment() })
    expect(h.result.current.full).toHaveLength(1)
    mockList.mockResolvedValue([{ value: 80, measured_at: '2026-11-14T08:00:00-03:00' }, { value: 79, measured_at: '2026-11-15T08:00:00-03:00' }])
    await act(async () => { await h.result.current.reload() })
    expect(h.result.current.full).toHaveLength(2)
    expect(h.result.current.recent).toHaveLength(2)
  })
})

describe('useTodayWeightSeries — jornada GLP-1 (smoke 121 A)', () => {
  it('"Tratamento" parte do 1º GLP-1 (encerrado inclusive) quando é anterior aos ativos', async () => {
    mockList.mockResolvedValue([])
    mockJourney.mockResolvedValueOnce('2026-09-01')
    const h = renderHook(() => useTodayWeightSeries({ enabled: false, userId: 'u1', timezone: TZ, treatmentStart: '2026-10-30' }))
    await act(async () => { await h.result.current.loadTreatment() })
    expect(h.result.current.journeyStart).toBe('2026-09-01')
    expect(mockList.mock.calls[0][0].fromTs).toBe(new Date(2026, 7, 31).toISOString())
  })

  it('RC6 #962: lê com 1 dia de folga (fuso do device × do usuário) e recorta pelo dia local do usuário', async () => {
    mockList.mockResolvedValue([
      { value: 81, measured_at: '2026-09-01T08:00:00-03:00' },
      { value: 82, measured_at: '2026-08-31T08:00:00-03:00' },
    ])
    mockJourney.mockResolvedValueOnce('2026-09-01')
    const h = renderHook(() => useTodayWeightSeries({ enabled: false, userId: 'u1', timezone: TZ, treatmentStart: '2026-10-30' }))
    await act(async () => { await h.result.current.loadTreatment() })
    expect(h.result.current.full).toEqual([{ day: '2026-09-01', kg: 81 }])
  })

  it('leitura da jornada falha ⇒ início dos ativos, sem erro na série', async () => {
    mockList.mockResolvedValue([])
    mockJourney.mockRejectedValueOnce(new Error('rede'))
    const h = renderHook(() => useTodayWeightSeries({ enabled: false, userId: 'u1', timezone: TZ, treatmentStart: '2026-10-30' }))
    await act(async () => { await h.result.current.loadTreatment() })
    expect(h.result.current.journeyStart).toBe('2026-10-30')
    expect(h.result.current.error).toBeNull()
  })
})
