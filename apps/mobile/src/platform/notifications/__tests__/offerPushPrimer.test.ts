// 120 D-6 — preparo no fim do fluxo da escada (sai quando a tela deixa a pilha).
import { renderHook, act } from '@testing-library/react-native'

let removeListener: (() => void) | null = null
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    addListener: (event: string, cb: () => void) => {
      if (event === 'beforeRemove') removeListener = cb
      return () => { removeListener = null }
    },
  }),
}))
const mockStatus = jest.fn()
jest.mock('../pushPermission', () => ({ getPushPermissionStatus: () => mockStatus() }))
const mockOpen = jest.fn(async (..._a: any[]) => 'dismissed')
jest.mock('../pushPrimerContext', () => ({ usePushPrimer: () => ({ openPushPrimer: (...a: any[]) => mockOpen(...a) }) }))

import { useOfferPushPrimerOnLeave, shouldOfferPushPrimer } from '../offerPushPrimer'

const RN = require('react-native')
const ORIGINAL_OS = RN.Platform.OS
const ARGS = { entryPoint: 'treatment_form' as const, anchor: 'Tratamento salvo' }

beforeEach(() => {
  RN.Platform.OS = 'ios'
})

afterEach(() => {
  RN.Platform.OS = ORIGINAL_OS
  removeListener = null
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('useOfferPushPrimerOnLeave (D-6)', () => {
  it('não abre ao montar; abre quando a escada sai da pilha', async () => {
    mockStatus.mockResolvedValue({ status: 'undetermined', granted: false })
    renderHook(() => useOfferPushPrimerOnLeave(ARGS))
    expect(mockOpen).not.toHaveBeenCalled()
    await act(async () => removeListener?.())
    expect(mockOpen).toHaveBeenCalledWith(ARGS)
  })

  it('sem args (edição) ⇒ nem escuta', () => {
    renderHook(() => useOfferPushPrimerOnLeave(null))
    expect(removeListener).toBeNull()
  })
})

describe('shouldOfferPushPrimer', () => {
  it('leitura falhou ⇒ não oferece', async () => {
    mockStatus.mockRejectedValue(new Error('x'))
    expect(await shouldOfferPushPrimer()).toBe(false)
  })
})
