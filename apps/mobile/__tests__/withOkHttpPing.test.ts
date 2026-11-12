// 084 B C-B4: plugin que liga o ping HTTP/2 do OkHttp — conexão morta no sono não prende o app.

const { applyOkHttpPing, PING_SECONDS } = require('../withOkHttpPing')

const MAIN_APP = `package com.coelhotv.dosiq

import android.app.Application

class MainApplication : Application() {
  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
`

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('withOkHttpPing', () => {
  it('instala a fábrica com ping logo após super.onCreate e antes do loadReactNative', () => {
    const out = applyOkHttpPing(MAIN_APP)
    expect(out).toContain('import com.facebook.react.modules.network.OkHttpClientProvider')
    expect(out).toContain(`pingInterval(${PING_SECONDS}L, TimeUnit.SECONDS)`)
    expect(out.indexOf('super.onCreate()')).toBeLessThan(out.indexOf('setOkHttpClientFactory'))
    expect(out.indexOf('setOkHttpClientFactory')).toBeLessThan(out.indexOf('loadReactNative(this)'))
  })

  it('idempotente: prebuild repetido não duplica', () => {
    const once = applyOkHttpPing(MAIN_APP)
    expect(applyOkHttpPing(once)).toBe(once)
  })

  it('sem onCreate reconhecível ⇒ falha alto (não gera build sem o ping em silêncio)', () => {
    expect(() => applyOkHttpPing('package x\nclass A')).toThrow('withOkHttpPing')
  })
})
