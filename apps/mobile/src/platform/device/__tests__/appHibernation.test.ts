// 068 hibernação: casca JS do módulo nativo — desconhecido nunca vira negativo.

const mockNative = {
  getUnusedAppRestrictionsStatus: jest.fn(),
  openUnusedAppRestrictionsSettings: jest.fn(),
}

function load(os: 'android' | 'ios', native: unknown = mockNative) {
  jest.resetModules()
  jest.doMock('react-native', () => ({ Platform: { OS: os } }))
  jest.doMock('expo', () => ({ requireOptionalNativeModule: () => native }))
  return require('../appHibernation') as typeof import('../appHibernation')
}

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('appHibernation', () => {
  it.each([
    ['enabled', true],
    ['disabled', false],
    ['unavailable', null],
  ])('status %s ⇒ %s', async (status, expected) => {
    mockNative.getUnusedAppRestrictionsStatus.mockResolvedValue(status)
    await expect(load('android').isAppHibernationEnabled()).resolves.toBe(expected)
  })

  it('leitura que rejeita ⇒ null', async () => {
    mockNative.getUnusedAppRestrictionsStatus.mockRejectedValue(new Error('x'))
    await expect(load('android').isAppHibernationEnabled()).resolves.toBeNull()
  })

  it('binário sem a função (build antigo) ⇒ null e não abre', async () => {
    const mod = load('android', {})
    await expect(mod.isAppHibernationEnabled()).resolves.toBeNull()
    expect(mod.openAppHibernationSettings()).toBe(false)
  })

  it('iOS ⇒ null e não abre', async () => {
    const mod = load('ios')
    await expect(mod.isAppHibernationEnabled()).resolves.toBeNull()
    expect(mod.openAppHibernationSettings()).toBe(false)
  })

  it('abrir: repassa o resultado nativo; exceção ⇒ false', () => {
    mockNative.openUnusedAppRestrictionsSettings.mockReturnValueOnce(true)
    const mod = load('android')
    expect(mod.openAppHibernationSettings()).toBe(true)
    mockNative.openUnusedAppRestrictionsSettings.mockImplementationOnce(() => {
      throw new Error('x')
    })
    expect(mod.openAppHibernationSettings()).toBe(false)
  })
})
