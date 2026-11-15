// spec 120 C · PO-120-16 (registro tardio pela ocorrência) · PO-120-17 (pulo com instante = previsto).
import { renderHook, act } from '@testing-library/react-native'

const mockShow = jest.fn()
jest.mock('@shared/components/feedback/Toast', () => ({ useToast: () => ({ show: mockShow }) }))
const mockRegisterSkip = jest.fn()
jest.mock('@platform/alarms/quickDoseRegistration', () => ({ registerSkip: (...a: any[]) => mockRegisterSkip(...a) }))

import { useLateDoseActions } from '../useLateDoseActions'

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

const dose = (id: string, iso = '2026-11-14T11:00:00Z') => ({ instanceId: id, scheduledFor: iso, scheduledTime: '08:00', protocol: { id: `p-${id}` } })
const group = { scheduledFor: '2026-11-14T11:00:00Z', scheduledTime: '08:00', doses: [dose('a'), dose('b')], names: ['Glifage', 'Cozaar'] }

describe('useLateDoseActions', () => {
  it('registrar tardio abre o lote com o instanceId de cada dose e a hora PREVISTA (C-3)', () => {
    const setBulkModal = jest.fn()
    const { result } = renderHook(() => useLateDoseActions({ setBulkModal, refresh: jest.fn() }))
    act(() => result.current.registerLate([dose('a'), dose('b')]))
    expect(setBulkModal).toHaveBeenCalledWith({
      mode: 'hero',
      items: [expect.objectContaining({ instanceId: 'a' }), expect.objectContaining({ instanceId: 'b' })],
      initialTakenAt: '2026-11-14T11:00:00Z',
    })
  })

  it('sem instanceId não abre nada (nunca vira avulsa)', () => {
    const setBulkModal = jest.fn()
    const { result } = renderHook(() => useLateDoseActions({ setBulkModal, refresh: jest.fn() }))
    act(() => result.current.registerLate([{ scheduledFor: 'x' }]))
    expect(setBulkModal).not.toHaveBeenCalled()
  })

  it('pular o grupo: UMA chamada, instante declarado = horário previsto, toast e refresh', async () => {
    mockRegisterSkip.mockResolvedValueOnce({ success: true })
    const refresh = jest.fn()
    const { result } = renderHook(() => useLateDoseActions({ setBulkModal: jest.fn(), refresh }))
    await act(async () => { await result.current.skipGroup(group) })
    expect(mockRegisterSkip).toHaveBeenCalledTimes(1)
    const [payload, opts] = mockRegisterSkip.mock.calls[0]
    expect(opts).toEqual(expect.objectContaining({ declaredAt: '2026-11-14T11:00:00Z' }))
    expect(JSON.parse(payload.groupedDoses).map((d: any) => d.instanceId)).toEqual(['a', 'b'])
    expect(mockShow).toHaveBeenCalledWith('Doses das 08:00 marcadas como puladas', expect.objectContaining({ variant: 'success' }))
    expect(refresh).toHaveBeenCalled()
  })

  it('recusa do banco ⇒ toast de erro com a mensagem do core (R-305)', async () => {
    mockRegisterSkip.mockResolvedValueOnce({ success: false, message: 'Esta dose já passou do prazo' })
    const { result } = renderHook(() => useLateDoseActions({ setBulkModal: jest.fn(), refresh: jest.fn() }))
    await act(async () => { await result.current.skipGroup(group) })
    expect(mockShow).toHaveBeenCalledWith('Esta dose já passou do prazo', { variant: 'error' })
  })

  it('pular uma linha da agenda = grupo de 1, singular', async () => {
    mockRegisterSkip.mockResolvedValueOnce({ success: true })
    const { result } = renderHook(() => useLateDoseActions({ setBulkModal: jest.fn(), refresh: jest.fn() }))
    await act(async () => { await result.current.skipDose(dose('z')) })
    expect(mockShow).toHaveBeenCalledWith('Dose das 08:00 marcada como pulada', expect.anything())
  })

  it('sem scheduledFor não pula (não há instante a declarar)', async () => {
    const { result } = renderHook(() => useLateDoseActions({ setBulkModal: jest.fn(), refresh: jest.fn() }))
    await act(async () => { await result.current.skipDose({ instanceId: 'q', scheduledFor: null }) })
    expect(mockRegisterSkip).not.toHaveBeenCalled()
  })
})
