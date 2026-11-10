// oemFamily.ts — fonte ÚNICA da família de fabricante (spec 068 E-5).
// `expo-device` (manufacturer + brand) é o único insumo: o `manufacturer` do notifee responde a
// mesma pergunta, e duas fontes para o mesmo fato dariam dois resultados na mesma tela.
// `alarmService.isXiaomiDevice` é wrapper deste predicado (E-4) — nunca duplicar a regex.

import { Platform } from 'react-native'
import * as Device from 'expo-device'

export type OemFamily = 'xiaomi' | 'samsung' | 'motorola' | 'generic'

/**
 * Classifica o fabricante a partir de `manufacturer` + `brand`. Função pura (testável sem SO).
 * Vazio, `null` ou desconhecido ⇒ `generic` — nunca `undefined`.
 */
export function classifyOem(manufacturer?: string | null, brand?: string | null): OemFamily {
  const id = `${manufacturer || ''} ${brand || ''}`.toLowerCase()
  if (/xiaomi|redmi|poco/.test(id)) return 'xiaomi'
  if (/samsung/.test(id)) return 'samsung'
  if (/motorola|moto/.test(id)) return 'motorola'
  return 'generic'
}

/** Família do aparelho atual. Fora do Android ⇒ `generic`. */
export function resolveOemFamily(): OemFamily {
  if (Platform.OS !== 'android') return 'generic'
  return classifyOem(Device.manufacturer, Device.brand)
}
