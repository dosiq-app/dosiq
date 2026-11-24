// useTodayWeekRows — 121 A · PO-4 (persistência por usuário) e PO-9 (evento só com consentimento B,
// payload só {row, open}). AsyncStorage e wrapper de analytics REAIS; só o SDK do PostHog é mockado.
const mockCapture = jest.fn()
jest.mock('posthog-react-native', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    capture: (...a: unknown[]) => mockCapture(...a),
    screen: jest.fn(), identify: jest.fn(), register: jest.fn(), reset: jest.fn(), optIn: jest.fn(), optOut: jest.fn(),
  })),
}))
jest.mock('@sentry/react-native', () => ({ setUser: jest.fn() }))
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: {} } } }))
jest.mock('@platform/config/nativePublicAppConfig', () => ({ posthogApiKey: 'phc_teste', posthogHost: 'https://us.i.posthog.com' }))
jest.mock('@platform/updates/bundleInfo', () => ({ bundleTags: () => ({}) }))
// Dublê de storage COM estado (o global do jest-setup devolve sempre null): remontar o hook precisa
// ler o que ele gravou — é isso que o PO-4 prova.
const mockStore = new Map<string, string>()
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => { mockStore.set(k, v) }),
    clear: jest.fn(async () => { mockStore.clear() }),
  },
}))

import { renderHook, act, waitFor } from '@testing-library/react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { resetUser, setAnalyticsConsent } from '@platform/analytics/productAnalytics'
import { useTodayWeekRows, todayWeekRowsKey } from '../useTodayWeekRows'

const toggled = () => mockCapture.mock.calls.filter((c) => c[0] === 'today_week_row_toggled')

afterEach(async () => {
  await resetUser()
  await AsyncStorage.clear()
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('useTodayWeekRows', () => {
  it('padrão por perfil: wedge = Peso aberta; misto = tudo fechado', () => {
    expect(renderHook(() => useTodayWeekRows('u1', 'wedge')).result.current.rows.peso).toBe(true)
    expect(renderHook(() => useTodayWeekRows('u1', 'misto')).result.current.rows).toEqual({ dose: false, peso: false, evolucao: false })
  })

  it('PO-4: X fecha Peso, remonta ⇒ fechada; Y no mesmo storage ⇒ padrão do perfil', async () => {
    const a = renderHook(() => useTodayWeekRows('userX', 'wedge'))
    await act(async () => { a.result.current.toggle('peso') })
    expect(a.result.current.rows.peso).toBe(false)
    expect(JSON.parse((await AsyncStorage.getItem(todayWeekRowsKey('userX'))) as string).peso).toBe(false)
    a.unmount()

    const b = renderHook(() => useTodayWeekRows('userX', 'wedge'))
    await waitFor(() => expect(b.result.current.rows.peso).toBe(false))
    const y = renderHook(() => useTodayWeekRows('userY', 'wedge'))
    await act(async () => {})
    expect(y.result.current.rows.peso).toBe(true)
  })

  it('JSON corrompido ⇒ padrão do perfil', async () => {
    await AsyncStorage.setItem(todayWeekRowsKey('u1'), '{nope')
    const h = renderHook(() => useTodayWeekRows('u1', 'wedge'))
    await act(async () => {})
    expect(h.result.current.rows.peso).toBe(true)
  })

  it('PO-9: com consentimento B o toggle sai com {row, open} e nada mais', async () => {
    await setAnalyticsConsent('allowed')
    const h = renderHook(() => useTodayWeekRows('u1', 'wedge'))
    await act(async () => { h.result.current.toggle('peso') })
    await waitFor(() => expect(toggled()).toHaveLength(1))
    const props = toggled()[0][1]
    expect(props).toMatchObject({ row: 'peso', open: false, surface: 'mobile' })
    // Só super-propriedades do wrapper podem somar; nada de valor clínico.
    expect(Object.keys(props)).not.toEqual(expect.arrayContaining(['value', 'kg', 'weight']))
  })

  it('PO-9: sem consentimento B nada é enviado', async () => {
    await setAnalyticsConsent('denied')
    const h = renderHook(() => useTodayWeekRows('u1', 'wedge'))
    await act(async () => { h.result.current.toggle('peso') })
    await act(async () => {})
    expect(toggled()).toHaveLength(0)
  })
})

// 124 B (FR-016, E-14 revisto): glicemia/PA na mesma chave, fora de `rows`.
describe('useTodayWeekRows — L2 por medida (124 B)', () => {
  it('glicemia/PA abertas por padrão; escolha de peso já salva segue valendo', async () => {
    mockStore.set(todayWeekRowsKey('u9'), JSON.stringify({ dose: false, peso: false, evolucao: false }))
    const h = renderHook(() => useTodayWeekRows('u9', 'wedge'))
    await waitFor(() => expect(h.result.current.rows.peso).toBe(false))
    expect(h.result.current.biomarkerOpen).toEqual({ glicemia: true, pressao_arterial: true })
  })

  it('fechar glicemia persiste e sobrevive ao remount, sem mexer em peso', async () => {
    const h = renderHook(() => useTodayWeekRows('u8', 'wedge'))
    await act(async () => { h.result.current.toggle('glicemia') })
    expect(h.result.current.biomarkerOpen.glicemia).toBe(false)
    expect(h.result.current.rows.peso).toBe(true)
    h.unmount()
    const again = renderHook(() => useTodayWeekRows('u8', 'wedge'))
    await waitFor(() => expect(again.result.current.biomarkerOpen.glicemia).toBe(false))
    expect(again.result.current.biomarkerOpen.pressao_arterial).toBe(true)
  })

  it('JSON com valor não booleano para glicemia ⇒ padrão', async () => {
    mockStore.set(todayWeekRowsKey('u7'), JSON.stringify({ glicemia: 'x' }))
    const h = renderHook(() => useTodayWeekRows('u7', 'misto'))
    await act(async () => {})
    expect(h.result.current.biomarkerOpen.glicemia).toBe(true)
  })
})
