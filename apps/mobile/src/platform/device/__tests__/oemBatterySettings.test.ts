// 068 PO-5 (4 caminhos, RC3 E-2) + PO-2 (rejeição do SO nunca lança).

import notifee from '@notifee/react-native'
import { openOemPowerSettings, openAppDetailsSettings } from '../oemBatterySettings'
import { probeDevice } from '../deviceProbe'

jest.mock('../backgroundRestriction', () => ({ isBackgroundRestricted: () => null }))

const RN = require('react-native')
const ORIGINAL_OS = RN.Platform.OS
const mocked = notifee as unknown as Record<string, jest.Mock>

beforeEach(() => {
  RN.Platform.OS = 'android'
})

afterEach(() => {
  RN.Platform.OS = ORIGINAL_OS
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('openOemPowerSettings', () => {
  it('activity presente ⇒ openPowerManagerSettings chamado 1x e retorna true', async () => {
    mocked.openPowerManagerSettings.mockResolvedValueOnce(undefined)
    await expect(openOemPowerSettings('com.miui.securitycenter/x')).resolves.toBe(true)
    expect(mocked.openPowerManagerSettings).toHaveBeenCalledTimes(1)
  })

  it('activity null ⇒ não chama, retorna false', async () => {
    await expect(openOemPowerSettings(null)).resolves.toBe(false)
    expect(mocked.openPowerManagerSettings).not.toHaveBeenCalled()
  })

  it('getPowerManagerInfo rejeita ⇒ probe devolve activity null ⇒ open retorna false sem throw', async () => {
    mocked.getPowerManagerInfo.mockRejectedValueOnce(new Error('boom'))
    const facts = await probeDevice()
    expect(facts.powerManagerActivity).toBeNull()
    await expect(openOemPowerSettings(facts.powerManagerActivity)).resolves.toBe(false)
  })

  it('openPowerManagerSettings REJEITA (ActivityNotFound) ⇒ retorna false sem throw', async () => {
    mocked.openPowerManagerSettings.mockRejectedValueOnce(new Error('ActivityNotFoundException'))
    await expect(openOemPowerSettings('com.miui.x/y')).resolves.toBe(false)
  })

  it('iOS ⇒ false sem chamar o SO', async () => {
    RN.Platform.OS = 'ios'
    await expect(openOemPowerSettings('x')).resolves.toBe(false)
    expect(mocked.openPowerManagerSettings).not.toHaveBeenCalled()
  })
})

describe('openAppDetailsSettings', () => {
  it('Android ⇒ Linking.openSettings e true', async () => {
    const spy = jest.spyOn(RN.Linking, 'openSettings').mockResolvedValueOnce(undefined)
    await expect(openAppDetailsSettings()).resolves.toBe(true)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('Linking.openSettings rejeita ⇒ false sem throw', async () => {
    jest.spyOn(RN.Linking, 'openSettings').mockRejectedValueOnce(new Error('no activity'))
    await expect(openAppDetailsSettings()).resolves.toBe(false)
  })
})

describe('isBatteryOptimizationEnabled rejeita (PO-2)', () => {
  it('probe devolve batteryOptimized null, sem throw', async () => {
    mocked.isBatteryOptimizationEnabled.mockRejectedValueOnce(new Error('boom'))
    await expect(probeDevice()).resolves.toMatchObject({ batteryOptimized: null })
  })
})
