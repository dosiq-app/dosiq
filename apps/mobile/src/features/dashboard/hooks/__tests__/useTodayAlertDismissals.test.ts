// spec 120 C · D-B — dispensa do alerta operacional: por chave (degrau+remédio), 7 dias.
import { parseDismissMap, isDismissed, pruneDismissMap, DISMISS_TTL_MS } from '../useTodayAlertDismissals'

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

const NOW = 1_800_000_000_000

describe('dispensa de alerta operacional', () => {
  it('lixo/nulo no storage ⇒ mapa vazio', () => {
    expect(parseDismissMap(null)).toEqual({})
    expect(parseDismissMap('{x')).toEqual({})
    expect(parseDismissMap('[1]')).toEqual({})
    expect(parseDismissMap('{"a":"x","b":5}')).toEqual({ b: 5 })
  })
  it('vale por 7 dias', () => {
    const map = { 'stock_low:m1': NOW - DISMISS_TTL_MS + 1 }
    expect(isDismissed(map, 'stock_low:m1', NOW)).toBe(true)
    expect(isDismissed(map, 'stock_low:m1', NOW + 1)).toBe(false)
  })
  it('nível que sobe muda a chave ⇒ volta', () => {
    const map = { 'stock_low:m1': NOW }
    expect(isDismissed(map, 'stock_urgent:m1', NOW)).toBe(false)
    expect(isDismissed(map, 'stock_zero:m1', NOW)).toBe(false)
  })
  it('instante no futuro (relógio mexido) não dispensa', () => {
    expect(isDismissed({ k: NOW + 1000 }, 'k', NOW)).toBe(false)
  })
  it('prune tira vencidos', () => {
    expect(pruneDismissMap({ a: NOW, b: NOW - DISMISS_TTL_MS }, NOW)).toEqual({ a: NOW })
  })
})
