// miuiLockScreen.ts — casca JS de `miuiShowWhenLocked` do módulo Expo local `modules/background-restriction`
// (spec 128 C-6). Xiaomi/Redmi/POCO: "Mostrar na Tela de bloqueio" (Outras permissões) = appop MIUIOP(10020).
// Sem ela o alarme toca, mas não abre a tela cheia com o celular bloqueado (matriz POCO 2026-11-26).
// Fora do Android, sem o módulo, sem a função (binário anterior) ou fora do MIUI/HyperOS ⇒ null:
// desconhecido nunca vira pedido (o padrão da chave é ligado).

import { Platform } from 'react-native'
import { requireOptionalNativeModule } from 'expo'

type NativeMiui = { miuiShowWhenLocked?: () => boolean | null }

const native = Platform.OS === 'android' ? requireOptionalNativeModule<NativeMiui>('BackgroundRestriction') : null

export function canShowOnLockScreenMiui(): boolean | null {
  try {
    if (typeof native?.miuiShowWhenLocked !== 'function') return null
    const value = native.miuiShowWhenLocked()
    return typeof value === 'boolean' ? value : null
  } catch {
    return null
  }
}
