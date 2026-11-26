// fullScreenIntent.ts — casca JS de `canUseFullScreenIntent` do módulo Expo local `modules/background-restriction`
// (spec 128 A · 054 T007d). Android 14+: lê `NotificationManager.canUseFullScreenIntent()`; abaixo do 14 o
// módulo responde true. Fora do Android, sem o módulo ou sem a função (binário anterior) ⇒ null:
// desconhecido nunca esconde o pedido (INV-3).

import { Platform } from 'react-native'
import { requireOptionalNativeModule } from 'expo'

type NativeFullScreen = { canUseFullScreenIntent?: () => boolean | null }

const native = Platform.OS === 'android' ? requireOptionalNativeModule<NativeFullScreen>('BackgroundRestriction') : null

export function canUseFullScreenIntent(): boolean | null {
  try {
    if (typeof native?.canUseFullScreenIntent !== 'function') return null
    const value = native.canUseFullScreenIntent()
    return typeof value === 'boolean' ? value : null
  } catch {
    return null
  }
}
