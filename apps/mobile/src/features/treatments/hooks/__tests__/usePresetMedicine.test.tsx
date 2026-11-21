// 125 fatia 2 (AC6.3 · PO-125-14): "Definir agora" da Hoje abre a criação já com o remédio.
import { renderHook, waitFor, act } from '@testing-library/react-native'

jest.mock('@medications/services/medicineService', () => ({ medicineService: { getById: jest.fn() } }))
jest.mock('../useProtocols', () => ({ useProtocol: () => ({ data: null, loading: false, error: null }) }))
jest.mock('../../services/treatmentPlanService', () => ({ treatmentPlanService: { getAll: jest.fn(() => Promise.resolve([])) } }))

import { usePresetMedicine } from '../usePresetMedicine'
import { useProtocolFormState } from '../useProtocolFormState'
import { medicineService } from '@medications/services/medicineService'

const MED = { id: '11111111-1111-4111-8111-111111111111', name: 'Losartana', presentation: 'comprimido', dosage_unit: 'mg' }

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

// O form real + o preset, como a tela monta.
function setup(presetId: string | null) {
  return renderHook(() => {
    const state = useProtocolFormState({ editId: null, todayIso: '2026-11-19', presetPlanId: null })
    usePresetMedicine(presetId, state.selectMedicine)
    return state
  })
}

describe('usePresetMedicine (AC6.3)', () => {
  it('com medicine_id ⇒ remédio escolhido, nome e dose pela forma; busca uma vez', async () => {
    ;(medicineService.getById as jest.Mock).mockResolvedValue(MED)
    const { result } = setup(MED.id)
    await waitFor(() => expect(result.current.medicine).toEqual(MED))
    expect(result.current.form.values.medicine_id).toBe(MED.id)
    expect(result.current.form.values.name).toBe('Losartana')
    expect(result.current.form.values.dosage_per_intake).toBe('1')
    expect(medicineService.getById).toHaveBeenCalledTimes(1)
  })

  it('remédio que sumiu ⇒ form como sempre', async () => {
    ;(medicineService.getById as jest.Mock).mockRejectedValue(new Error('not found'))
    const { result } = setup(MED.id)
    await act(async () => { await Promise.resolve() })
    expect(result.current.medicine).toBeNull()
  })

  it('sem preset não busca', async () => {
    setup(null)
    await act(async () => { await Promise.resolve() })
    expect(medicineService.getById).not.toHaveBeenCalled()
  })
})
