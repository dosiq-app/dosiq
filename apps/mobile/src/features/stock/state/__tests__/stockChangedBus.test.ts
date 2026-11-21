import { onStockChanged, emitStockChanged } from '../stockChangedBus'

describe('stockChangedBus', () => {
  it('avisa assinantes, isola erro de um listener e respeita unsubscribe', () => {
    const a = jest.fn()
    const boom = jest.fn(() => { throw new Error('x') })
    const offA = onStockChanged(a)
    const offBoom = onStockChanged(boom)
    emitStockChanged()
    expect(a).toHaveBeenCalledTimes(1)
    expect(boom).toHaveBeenCalledTimes(1)
    offA()
    offBoom()
    emitStockChanged()
    expect(a).toHaveBeenCalledTimes(1)
  })
})
