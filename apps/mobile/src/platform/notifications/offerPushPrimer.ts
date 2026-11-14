// offerPushPrimer — quando o preparo de notificação cabe depois de salvar um tratamento (spec 120 US2).
//
// iOS: só com `undetermined` (negado não se repede — INV-2; o card da Hoje cobre).
// Android (C-01): o Expo diz `denied` para "nunca pedido" ⇒ todo "não concedido" recebe o preparo;
// se o SO negar na hora, `requestPushOrOpenSettings` manda aos Ajustes.
// Concedido ou leitura falhou ⇒ nada.

import { useEffect } from 'react'
import { Platform } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { getPushPermissionStatus } from './pushPermission'
import { usePushPrimer, type OpenPushPrimerArgs, type PrimerOutcome } from './pushPrimerContext'

export async function shouldOfferPushPrimer(): Promise<boolean> {
  const perm = await getPushPermissionStatus().catch(() => null)
  if (!perm || perm.granted) return false
  return Platform.OS === 'android' || perm.status === 'undetermined'
}

export async function offerPushPrimer(
  openPushPrimer: (args: OpenPushPrimerArgs) => Promise<PrimerOutcome>,
  args: OpenPushPrimerArgs
): Promise<PrimerOutcome | 'skipped'> {
  if (!(await shouldOfferPushPrimer())) return 'skipped'
  return openPushPrimer(args)
}

/**
 * D-6: no caminho da escada de titulação o preparo abre no FIM do fluxo — quando a tela da escada
 * sai da pilha (`beforeRemove`), não entre o salvar e a escada. `args` nulo ⇒ nada.
 * `beforeRemove` e não cleanup de effect: o StrictMode desmonta/remonta em dev e abriria em falso.
 */
export function useOfferPushPrimerOnLeave(args: OpenPushPrimerArgs | null | undefined) {
  const navigation = useNavigation<any>()
  const { openPushPrimer } = usePushPrimer()
  useEffect(() => {
    if (!args || typeof navigation?.addListener !== 'function') return
    const unsubscribe = navigation.addListener('beforeRemove', () => {
      void offerPushPrimer(openPushPrimer, args)
    })
    return unsubscribe
  }, [args, navigation, openPushPrimer])
}
