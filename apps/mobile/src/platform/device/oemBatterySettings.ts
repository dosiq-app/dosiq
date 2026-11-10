// oemBatterySettings.ts — AÇÕES de abrir configurações de energia (spec 068 FR-004/FR-005).
// A LEITURA (`batteryOptimized`, `powerManagerActivity`, `backgroundRestricted`) é do
// `deviceProbe` (082 D2, X-1) — aqui só o que abre tela do SO. Fail-safe total: nenhum caminho
// lança; `false` = não abriu e a UI mantém os passos escritos como caminho principal (E-2: o mapa
// de activities do notifee é um AAR de 2021, sem Motorola; em HyperOS o open pode lançar).

import { Linking, Platform } from 'react-native'
import notifee from '@notifee/react-native'

/**
 * Abre a tela de energia do fabricante quando o notifee conhece a activity.
 * @param activity - `DeviceFacts.powerManagerActivity` (`null` = OEM sem tela mapeada)
 * @returns `true` se abriu; `false` sem activity, fora do Android ou se o SO rejeitou
 */
export async function openOemPowerSettings(activity: string | null): Promise<boolean> {
  if (Platform.OS !== 'android' || !activity) return false
  try {
    await notifee.openPowerManagerSettings()
    return true
  } catch {
    return false
  }
}

/**
 * Abre os detalhes do app (Bateria → "Permitir uso em segundo plano"). Funciona em qualquer OEM
 * (`ACTION_APPLICATION_DETAILS_SETTINGS` via RN), sem código nativo.
 * @returns `true` se abriu; `false` fora do Android ou se o SO rejeitou
 */
export async function openAppDetailsSettings(): Promise<boolean> {
  if (Platform.OS !== 'android') return false
  try {
    await Linking.openSettings()
    return true
  } catch {
    return false
  }
}
