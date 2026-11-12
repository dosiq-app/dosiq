// 084 Slice B — dedupe sob concorrência. Prod 2026-11-04: 19 % de pares (instância, `to`) repetidos.
// M1 corrida (alarme × app) · M2 mesma entrega processada 2× · M3 card dispensado re-armado.
// PO-B1..B4 (spec §Slice B). Interleaving de referência: RC3 Slice B, "Fluxo decidido".

import notifee from '@notifee/react-native'
import { deriveDoseActivityState } from '@dosiq/core'
import { armDoseActivity, advanceDoseActivity, deferDoseItem } from '../doseActivityScheduler'
import { SURFACE_LOCK_TIMEOUT_MS } from '../surfaceEmissionStore'

const mockStore = new Map<string, string>()
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k) => mockStore.get(k) ?? null),
  setItem: jest.fn(async (k, v) => {
    mockStore.set(k, v)
  }),
  removeItem: jest.fn(async (k) => {
    mockStore.delete(k)
  }),
}))

const mockEnqueueSurface = jest.fn()
const mockEmitDelivered = jest.fn()
jest.mock('@platform/audit/surfaceAuditBeacon', () => ({
  enqueueSurfaceTransition: (...a) => mockEnqueueSurface(...a),
  emitDeliveredTransition: (...a) => mockEmitDelivered(...a),
}))

const RNPlatform = require('react-native').Platform
const ORIGINAL_OS = RNPlatform.OS
const mockedDisplayed = notifee.getDisplayedNotifications as jest.Mock
const mockedTrigger = notifee.createTriggerNotification as jest.Mock

beforeEach(() => {
  RNPlatform.OS = 'android'
  mockEnqueueSurface.mockResolvedValue(true)
  mockEmitDelivered.mockResolvedValue(true)
  mockedDisplayed.mockResolvedValue([]) // card ainda não exibido / dispensado
})
afterAll(() => {
  RNPlatform.OS = ORIGINAL_OS
})
afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
  mockStore.clear()
})

const NOW = new Date('2026-03-05T12:00:00.000Z')
const M = 60000
const iso = (offMin) => new Date(NOW.getTime() + offMin * M).toISOString()
const doseItem = (over = {}) => ({
  instanceId: 'inst-1',
  scheduledFor: iso(30), // upcoming
  status: 'pending',
  critical: true,
  toleranceMinutes: 120,
  medicineName: 'Lantus',
  scheduledTime: '12:30',
  ...over,
})
const arm = (di, source = 'app', now = NOW) => armDoseActivity(deriveDoseActivityState(di, now), di, { now, source })

describe('PO-B1 (M1) — arms concorrentes da mesma instância', () => {
  it('dois arms sem await entre eles ⇒ 1 enfileiramento', async () => {
    const di = doseItem()
    await Promise.all([arm(di, 'alarm'), arm(di, 'app')])
    expect(mockEnqueueSurface).toHaveBeenCalledTimes(1)
  })

  it('instâncias diferentes seguem em paralelo ⇒ 2 enfileiramentos', async () => {
    await Promise.all([arm(doseItem()), arm(doseItem({ instanceId: 'inst-2' }))])
    expect(mockEnqueueSurface).toHaveBeenCalledTimes(2)
  })

  it('E1: enqueue=false (sem sessão) NÃO marca; a tentativa seguinte emite', async () => {
    const di = doseItem()
    mockEnqueueSurface.mockResolvedValueOnce(false)
    await arm(di)
    await arm(di)
    await arm(di)
    expect(mockEnqueueSurface).toHaveBeenCalledTimes(2)
  })

  it('enqueue lança ⇒ não propaga, não marca e o card/boundary seguem (INV-1/INV-B1)', async () => {
    const di = doseItem()
    mockEnqueueSurface.mockRejectedValueOnce(new Error('x'))
    await expect(arm(di)).resolves.toBeUndefined()
    expect(notifee.displayNotification).toHaveBeenCalledTimes(1)
    expect(mockedTrigger).toHaveBeenCalledTimes(1)
    await arm(di)
    expect(mockEnqueueSurface).toHaveBeenCalledTimes(2)
  })

  it('emit que nunca resolve ⇒ arm segue após o teto, sem marcar; soneca e próximo arm não ficam presos', async () => {
    jest.useFakeTimers()
    try {
      const di = doseItem()
      mockEnqueueSurface.mockImplementationOnce(() => new Promise(() => {})) // promessa morta
      const first = arm(di)
      const defer = deferDoseItem({ ...di, snoozedUntil: NOW.getTime() + 5 * M }, NOW.getTime())
      await jest.advanceTimersByTimeAsync(SURFACE_LOCK_TIMEOUT_MS)
      await expect(first).resolves.toBeUndefined()
      await expect(defer).resolves.toBeUndefined()
      await arm(di)
      expect(mockEnqueueSurface).toHaveBeenCalledTimes(2) // não marcou ⇒ re-emite
    } finally {
      jest.useRealTimers()
    }
  })

  it('emit lento que resolve DEPOIS do teto e da soneca não marca (o now da volta não é suprimido)', async () => {
    jest.useFakeTimers()
    try {
      const di = doseItem({ scheduledFor: iso(0) }) // now
      let release: (v: boolean) => void = () => {}
      mockEnqueueSurface.mockImplementationOnce(() => new Promise<boolean>((r) => (release = r)))
      const first = arm(di)
      await jest.advanceTimersByTimeAsync(SURFACE_LOCK_TIMEOUT_MS) // estoura: lock liberado
      await first
      await deferDoseItem({ ...di, snoozedUntil: NOW.getTime() + 5 * M }, NOW.getTime()) // limpa now
      release(true) // o enqueue lento termina agora — tarde demais para marcar
      await jest.advanceTimersByTimeAsync(0)
      await arm(di) // volta da soneca
      expect(mockEnqueueSurface).toHaveBeenCalledTimes(2)
    } finally {
      jest.useRealTimers()
    }
  })

  it('INV-B2: registro ilegível ⇒ emite', async () => {
    const di = doseItem()
    await arm(di)
    mockStore.set('@dosiq/surface-emissions', '{corrompido')
    await arm(di)
    expect(mockEnqueueSurface).toHaveBeenCalledTimes(2)
  })
})

describe('PO-B2 (M2) — entrega processada 2×', () => {
  it('entrega: mesmo boundary entregue duas vezes ⇒ 1 emissão com occurred_at do boundary', async () => {
    await arm(doseItem()) // agenda upcoming→now em T−10 (NOW+20min)
    const [payload, trigger] = mockedTrigger.mock.calls.at(-1)
    expect(payload.data.transitionTo).toBe('now')
    expect(payload.data.transitionAt).toBe(String(trigger.timestamp))
    // eslint-disable-next-line no-restricted-syntax
    await advanceDoseActivity(payload.data, new Date(trigger.timestamp + 45))
    // eslint-disable-next-line no-restricted-syntax
    await advanceDoseActivity(payload.data, new Date(trigger.timestamp + 5 * M))
    expect(mockEmitDelivered).toHaveBeenCalledTimes(1)
    // eslint-disable-next-line no-restricted-syntax
    expect(mockEmitDelivered.mock.calls[0][1]).toBe(new Date(trigger.timestamp).toISOString())
  })

  it('entrega: trigger antigo sem transitionAt ⇒ occurred_at do handler (E5)', async () => {
    const data = { __surface: 'true', doseInstanceId: 'inst-1', scheduledFor: iso(10), toleranceMinutes: '120', isCritical: 'true', transitionFrom: 'upcoming', transitionTo: 'now' }
    const handlerNow = new Date(NOW.getTime() + 7)
    await advanceDoseActivity(data, handlerNow)
    expect(mockEmitDelivered.mock.calls[0][1]).toBe(handlerNow.toISOString())
  })

  it('entrega: transitionAt não numérico ⇒ occurred_at do handler', async () => {
    const data = { __surface: 'true', doseInstanceId: 'inst-1', scheduledFor: iso(10), toleranceMinutes: '120', isCritical: 'true', transitionTo: 'now', transitionAt: 'x' }
    await advanceDoseActivity(data, NOW)
    expect(mockEmitDelivered.mock.calls[0][1]).toBe(NOW.toISOString())
  })

  it('entrega depois do arm do mesmo estado ⇒ não repete', async () => {
    const di = doseItem({ scheduledFor: iso(5) }) // now
    await arm(di)
    const data = { __surface: 'true', doseInstanceId: 'inst-1', scheduledFor: iso(5), toleranceMinutes: '120', isCritical: 'true', transitionFrom: 'upcoming', transitionTo: 'now' }
    await advanceDoseActivity(data, NOW)
    expect(mockEnqueueSurface).toHaveBeenCalledTimes(1)
    expect(mockEmitDelivered).not.toHaveBeenCalled()
  })
})

describe('PO-B3 (M3) — card dispensado', () => {
  it('dispensado: re-arm no mesmo estado re-exibe o card sem emitir; transição real seguinte emite', async () => {
    const di = doseItem()
    await arm(di) // emite upcoming, card exibido
    mockedDisplayed.mockResolvedValue([]) // pessoa dispensou o card
    await arm(di) // app reaberto, mesmo estado
    expect(notifee.displayNotification).toHaveBeenCalledTimes(2)
    expect(mockEnqueueSurface).toHaveBeenCalledTimes(1)
    const later = new Date(NOW.getTime() + 25 * M) // now
    await arm(di, 'app', later)
    expect(mockEnqueueSurface).toHaveBeenCalledTimes(2)
    expect(mockEnqueueSurface.mock.calls[1][0].to).toBe('now')
  })
})

describe('PO-B4 — volta da soneca re-emite `now` (FR-003)', () => {
  const anchor = NOW.getTime() + 5 * M
  const nowData = (over = {}) => ({
    __surface: 'true',
    doseInstanceId: 'inst-1',
    scheduledFor: iso(-2),
    toleranceMinutes: '120',
    isCritical: 'true',
    transitionTo: 'now',
    transitionAt: String(anchor),
    ...over,
  })

  it('soneca: `now` emitido → deferDoseItem → boundary da âncora ⇒ 2ª linha `now`', async () => {
    const di = doseItem({ scheduledFor: iso(-2) })
    await arm(di) // emite now
    expect(mockEnqueueSurface.mock.calls[0][0].to).toBe('now')
    await deferDoseItem({ ...di, snoozedUntil: anchor }, NOW.getTime())
    const [payload] = mockedTrigger.mock.calls.at(-1)
    expect(payload.data.transitionTo).toBe('now')
    // eslint-disable-next-line no-restricted-syntax
    await advanceDoseActivity(payload.data, new Date(anchor + 10))
    expect(mockEmitDelivered).toHaveBeenCalledTimes(1)
  })

  it('soneca (controle): sem defer, a mesma entrega de `now` ⇒ 0', async () => {
    await arm(doseItem({ scheduledFor: iso(-2) }))
    // eslint-disable-next-line no-restricted-syntax
    await advanceDoseActivity(nowData(), new Date(anchor + 10))
    expect(mockEmitDelivered).not.toHaveBeenCalled()
  })
})
