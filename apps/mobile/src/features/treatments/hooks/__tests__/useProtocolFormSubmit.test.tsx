// 120 US2 / E-3 / D-6 / C-01 — o pedido de notificação saiu do submit; o preparo abre depois de navegar
// (PO-120-3, PO-120-11).
import { renderHook, act } from '@testing-library/react-native'

jest.mock('../../services/treatmentPlanService', () => ({ treatmentPlanService: { create: jest.fn() } }))
jest.mock('@medications/services/medicineService', () => ({ medicineService: { update: jest.fn() } }))
const mockStatus = jest.fn()
const mockRequestOS = jest.fn()
jest.mock('@platform/notifications/pushPermission', () => ({
  getPushPermissionStatus: () => mockStatus(),
  requestPermissionsAsync: (...a: any[]) => mockRequestOS(...a),
}))
const mockOpen = jest.fn()
jest.mock('@platform/notifications/pushPrimerContext', () => ({ usePushPrimer: () => ({ openPushPrimer: (...a: any[]) => mockOpen(...a) }) }))
jest.mock('@dosiq/core', () => ({ ...jest.requireActual('@dosiq/core'), getNow: () => new Date(2026, 8, 30, 12, 0, 0) }))

import { useProtocolFormSubmit } from '../useProtocolFormSubmit'

const RN = require('react-native')
const ORIGINAL_OS = RN.Platform.OS
const order: string[] = []

const MEDICINE = { name: 'Mounjaro', presentation: 'injetavel', dosage_per_pill: 2.5, dosage_unit: 'mg' }
const VALUES = {
  medicine_id: 'm1', frequency: 'semanal', weekdays: ['friday'], time_schedule: ['08:00'], start_date: '2026-09-01',
  dosage_per_intake: 1, treatment_plan_id: null,
}

function setup({ editId = null }: { editId?: string | null } = {}) {
  const mutation = {
    create: jest.fn(async () => {
      order.push('create')
      return { id: 'p1' }
    }),
    update: jest.fn(async () => ({ id: 'p1' })),
  }
  const form = { values: VALUES, validate: () => true, handleChange: jest.fn() }
  const { result } = renderHook(() =>
    useProtocolFormSubmit({ editId, form, medicine: MEDICINE, planField: { mode: 'existing' }, mutation, show: jest.fn(), onValidateFail: jest.fn() } as any)
  )
  return { result, mutation }
}

beforeEach(() => {
  RN.Platform.OS = 'ios'
  mockOpen.mockImplementation(async () => {
    order.push('primer')
    return 'dismissed'
  })
})

afterEach(() => {
  RN.Platform.OS = ORIGINAL_OS
  order.length = 0
  jest.clearAllMocks()
  jest.clearAllTimers()
})

const flush = () => act(async () => { await new Promise((r) => setImmediate(r)) })

describe('useProtocolFormSubmit × preparo (PO-120-3)', () => {
  it('🔴 iOS undetermined, caminho goBack ⇒ salva (navega) e SÓ DEPOIS abre o preparo; o SO não é chamado', async () => {
    mockStatus.mockResolvedValue({ status: 'undetermined', granted: false })
    const { result, mutation } = setup()
    await act(async () => { await result.current.submit() })
    await flush()
    expect(mutation.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ goBack: true }))
    expect(order).toEqual(['create', 'primer'])
    expect(mockRequestOS).not.toHaveBeenCalled()
    expect(mockOpen).toHaveBeenCalledWith({
      entryPoint: 'treatment_form',
      anchor: 'Tratamento salvo',
      preview: expect.objectContaining({ title: 'Dia da aplicação de Mounjaro', verb: 'aplicar' }),
    })
  })

  it('🔴 C-01: Android com status denied (nunca pedido) ⇒ preparo oferecido (PO-120-11)', async () => {
    RN.Platform.OS = 'android'
    mockStatus.mockResolvedValue({ status: 'denied', canAskAgain: false, granted: false })
    const { result } = setup()
    await act(async () => { await result.current.submit() })
    await flush()
    expect(mockOpen).toHaveBeenCalledTimes(1)
  })

  it('guard INV-2: iOS negado ⇒ sem preparo (não repede)', async () => {
    mockStatus.mockResolvedValue({ status: 'denied', canAskAgain: false, granted: false })
    const { result } = setup()
    await act(async () => { await result.current.submit() })
    await flush()
    expect(mockOpen).not.toHaveBeenCalled()
  })

  it('já concedido ⇒ sem preparo', async () => {
    mockStatus.mockResolvedValue({ status: 'granted', granted: true })
    const { result } = setup()
    await act(async () => { await result.current.submit() })
    await flush()
    expect(mockOpen).not.toHaveBeenCalled()
  })

  it('edição ⇒ sem preparo', async () => {
    mockStatus.mockResolvedValue({ status: 'undetermined', granted: false })
    const { result } = setup({ editId: 'p1' })
    await act(async () => { await result.current.submit() })
    await flush()
    expect(mockOpen).not.toHaveBeenCalled()
  })

  it('D-6: caminho onSaved (escada) ⇒ NÃO abre agora; os args seguem para o fim do fluxo', async () => {
    mockStatus.mockResolvedValue({ status: 'undetermined', granted: false })
    const onSaved = jest.fn()
    const { result, mutation } = setup()
    await act(async () => { await result.current.submit({ onSaved }) })
    await flush()
    expect(mutation.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ goBack: false }))
    expect(mockOpen).not.toHaveBeenCalled()
    expect(onSaved).toHaveBeenCalledWith({ id: 'p1' }, { pushPrimer: expect.objectContaining({ entryPoint: 'treatment_form' }) })
  })
})
