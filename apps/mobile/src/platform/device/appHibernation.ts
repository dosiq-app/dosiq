// appHibernation.ts — casca JS da hibernação do app (spec 068), via módulo local `background-restriction`.
// Hibernação = "Gerenciar o app fora de uso" (Motorola/AOSP) / "Pausar atividade do app quando sem uso"
// (HyperOS): ligada por padrão; após meses sem abrir o app, o SO revoga permissões e para notificações.
// `androidx PackageManagerCompat.getUnusedAppRestrictionsStatus()` — API pública, vale para todo OEM.
// Fora do Android, ou sem a função no binário (build < 0.34.9), devolve null: desconhecido ≠ negativo.

import { Platform } from 'react-native'
import { requireOptionalNativeModule } from 'expo'

type NativeHibernation = {
  getUnusedAppRestrictionsStatus?: () => Promise<string>
  openUnusedAppRestrictionsSettings?: () => boolean
}

const native = Platform.OS === 'android' ? requireOptionalNativeModule<NativeHibernation>('BackgroundRestriction') : null

/** `true` = hibernação ligada · `false` = desligada · `null` = sem o recurso ou leitura falhou. */
export async function isAppHibernationEnabled(): Promise<boolean | null> {
  try {
    const status = await native?.getUnusedAppRestrictionsStatus?.()
    if (status === 'enabled') return true
    if (status === 'disabled') return false
    return null
  } catch {
    return null
  }
}

/** Abre a tela do SO onde se desliga a hibernação. `false` = não abriu (a instrução escrita segue). */
export function openAppHibernationSettings(): boolean {
  try {
    return native?.openUnusedAppRestrictionsSettings?.() === true
  } catch {
    return false
  }
}
