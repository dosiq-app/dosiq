// 125 T015 (AC3.1) — dose inicial pela forma no form completo: '1' só p/ contagem; mg/mL nasce vazia.
import { renderHook, act } from '@testing-library/react-native'

jest.mock('../useProtocols', () => ({ useProtocol: () => ({ data: null, loading: false, error: null }) }))
jest.mock('../../services/treatmentPlanService', () => ({ treatmentPlanService: { getAll: jest.fn(() => Promise.resolve([])) } }))

import { useProtocolFormState } from '../useProtocolFormState'

const UUID_A = '11111111-1111-4111-8111-111111111111'
const UUID_B = '22222222-2222-4222-8222-222222222222'

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

function setup(editId: string | null = null) {
  return renderHook(() => useProtocolFormState({ editId, todayIso: '2026-11-18', presetPlanId: null }))
}

describe('useProtocolFormState — dose pela forma (125 AC3.1)', () => {
  it('comprimido ⇒ 1; trocar para líquido mg/mL ⇒ volta a vazia (era o default)', async () => {
    const { result } = setup()
    await act(async () => { result.current.selectMedicine({ id: UUID_A, presentation: 'comprimido', dosage_unit: 'mg' }) })
    expect(result.current.form.values.dosage_per_intake).toBe('1')
    expect(result.current.form.values.medicine_id).toBe(UUID_A)
    await act(async () => { result.current.selectMedicine({ id: UUID_B, presentation: 'liquido', dosage_unit: 'mg/ml' }) })
    expect(result.current.form.values.dosage_per_intake).toBe('')
  })

  // Emenda PO smoke iOS 19/11: a digitada só sobrevive à troca por remédio da MESMA forma e unidade.
  it('mesma forma e unidade (outra marca) ⇒ dose digitada fica', async () => {
    const { result } = setup()
    await act(async () => { result.current.selectMedicine({ id: UUID_A, presentation: 'comprimido', dosage_unit: 'mg' }) })
    await act(async () => { result.current.form.handleChange('dosage_per_intake', '2') })
    await act(async () => { result.current.selectMedicine({ id: UUID_B, presentation: 'comprimido', dosage_unit: 'mg' }) })
    expect(result.current.form.values.dosage_per_intake).toBe('2')
    expect(result.current.form.values.medicine_id).toBe(UUID_B)
  })

  it('líquido 15 gotas → comprimido ⇒ dose 1 e unidade/densidade zeradas (nunca "15 gotas" de comprimido)', async () => {
    const { result } = setup()
    await act(async () => { result.current.selectMedicine({ id: UUID_A, presentation: 'liquido', dosage_unit: 'mg/ml' }) })
    await act(async () => {
      result.current.form.handleChange('dosage_per_intake', '15')
      result.current.form.handleChange('intake_unit', 'gotas')
      result.current.form.handleChange('units_per_ml', '20')
    })
    await act(async () => { result.current.selectMedicine({ id: UUID_B, presentation: 'comprimido', dosage_unit: 'mg' }) })
    expect(result.current.form.values.dosage_per_intake).toBe('1')
    expect(result.current.form.values.intake_unit).toBeNull()
    expect(result.current.form.values.units_per_ml).toBe('')
  })
})
