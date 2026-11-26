// miuiLockScreen — 128 C-6: desconhecido (sem módulo, sem função, erro, fora do Android) ⇒ null.
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
    fn = require('../miuiLockScreen').canShowOnLockScreenMiui
  })
  return fn
}

describe('canShowOnLockScreenMiui', () => {
  it('HyperOS permitido ⇒ true; negado ⇒ false', () => {
    expect(load('android', { miuiShowWhenLocked: () => true })()).toBe(true)
    expect(load('android', { miuiShowWhenLocked: () => false })()).toBe(false)
  })
  it('binário anterior (módulo sem a função) ⇒ null', () => {
    expect(load('android', { isBackgroundRestricted: () => false })()).toBeNull()
  })
  it('sem módulo ⇒ null', () => {
    expect(load('android', null)()).toBeNull()
  })
  it('nativo lança ou devolve não-boolean ⇒ null', () => {
    expect(load('android', { miuiShowWhenLocked: () => { throw new Error('x') } })()).toBeNull()
    expect(load('android', { miuiShowWhenLocked: () => null })()).toBeNull()
  })
  it('iOS ⇒ null (não consulta o nativo)', () => {
    expect(load('ios', { miuiShowWhenLocked: () => true })()).toBeNull()
  })
})
