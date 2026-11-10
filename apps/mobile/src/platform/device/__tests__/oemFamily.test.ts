// 068 PO-3: cada fabricante conhecido mapeia para sua família; desconhecido ⇒ generic.

import { classifyOem, resolveOemFamily } from '../oemFamily'

const RN = require('react-native')
const ORIGINAL_OS = RN.Platform.OS

afterEach(() => {
  RN.Platform.OS = ORIGINAL_OS
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('classifyOem', () => {
  it.each([
    ['Xiaomi', 'Redmi', 'xiaomi'],
    ['Xiaomi', 'POCO', 'xiaomi'],
    ['xiaomi', null, 'xiaomi'],
    [null, 'redmi', 'xiaomi'],
    ['samsung', 'samsung', 'samsung'],
    ['SAMSUNG', null, 'samsung'],
    ['motorola', 'motorola', 'motorola'],
    ['Google', 'google', 'generic'],
    ['', '', 'generic'],
    [null, null, 'generic'],
    [undefined, undefined, 'generic'],
  ])('%s / %s ⇒ %s', (manufacturer, brand, expected) => {
    expect(classifyOem(manufacturer as string | null, brand as string | null)).toBe(expected)
  })
})

describe('resolveOemFamily', () => {
  it('iOS ⇒ generic, sem consultar fabricante', () => {
    RN.Platform.OS = 'ios'
    expect(resolveOemFamily()).toBe('generic')
  })

  it('Android ⇒ nunca undefined', () => {
    RN.Platform.OS = 'android'
    expect(['xiaomi', 'samsung', 'motorola', 'generic']).toContain(resolveOemFamily())
  })
})
