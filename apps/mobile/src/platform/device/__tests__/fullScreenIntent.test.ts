// fullScreenIntent — 128 A (INV-3): desconhecido (sem módulo, sem função, erro, fora do Android) ⇒ null.
import { describe, it, expect, afterEach } from '@jest/globals'

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
  jest.resetModules()
})

function load(os: string, native: unknown): () => boolean | null {
  let fn: () => boolean | null = () => null
  jest.isolateModules(() => {
    jest.doMock('react-native', () => ({ Platform: { OS: os } }))
    jest.doMock('expo', () => ({ requireOptionalNativeModule: () => native }))
    fn = require('../fullScreenIntent').canUseFullScreenIntent
  })
  return fn
}

describe('canUseFullScreenIntent', () => {
  it('Android com permissão ⇒ true; sem ⇒ false', () => {
    expect(load('android', { canUseFullScreenIntent: () => true })()).toBe(true)
    expect(load('android', { canUseFullScreenIntent: () => false })()).toBe(false)
  })
  it('binário anterior (módulo sem a função) ⇒ null', () => {
    expect(load('android', { isBackgroundRestricted: () => false })()).toBeNull()
  })
  it('sem módulo ⇒ null', () => {
    expect(load('android', null)()).toBeNull()
  })
  it('nativo lança ou devolve não-boolean ⇒ null', () => {
    expect(load('android', { canUseFullScreenIntent: () => { throw new Error('x') } })()).toBeNull()
    expect(load('android', { canUseFullScreenIntent: () => null })()).toBeNull()
  })
  it('iOS ⇒ null (não consulta o nativo)', () => {
    expect(load('ios', { canUseFullScreenIntent: () => true })()).toBeNull()
  })
})
