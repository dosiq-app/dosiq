// Links das lojas. Usos: VersionGate e scanner ("Abrir a loja") com STORE_FALLBACK_URLS;
// botão "Avaliar na App Store / Google Play" (Perfil e Problema ou sugestão) com
// STORE_REVIEW_URLS + openStoreReviewPage.

import { Linking, Platform } from 'react-native'

/**
 * Lojas por plataforma — fallback COMPILADO quando `store_url` remoto está ausente ou fora da
 * allowlist (S-8). Prefixos batem `STORE_URL_ALLOWLIST` (`@dosiq/core`).
 * ⚠️ Android é o link direto e funcional (`androidPackage` — app.config.js). iOS aponta para a
 * busca até o app publicar e o PO preencher o Apple App ID real aqui.
 */
export const STORE_FALLBACK_URLS = {
  ios: 'https://apps.apple.com/br/app/dosiq-inteligencia-em-doses/id6762740948',
  android: 'https://play.google.com/store/apps/details?id=com.coelhotv.dosiq',
} as const

/**
 * Página de escrever avaliação. Só para ação do usuário (toque num botão): a Apple orienta
 * deep link com `action=write-review` nesse caso e reserva a API nativa de pedido para momentos
 * que o app escolhe. A primária abre o app da loja; a reserva abre a loja no navegador.
 */
export const STORE_REVIEW_URLS = {
  ios: {
    primary: 'itms-apps://itunes.apple.com/app/viewContentsUserReviews/id6762740948?action=write-review',
    fallback: 'https://apps.apple.com/br/app/id6762740948?action=write-review',
  },
  android: {
    primary: 'market://details?id=com.coelhotv.dosiq',
    fallback: STORE_FALLBACK_URLS.android,
  },
} as const

type StoreOs = keyof typeof STORE_REVIEW_URLS

/** Abre a página de avaliação: primária → reserva. `false` quando nenhuma abriu (nunca lança). */
export async function openStoreReviewPage(
  os: StoreOs = Platform.OS === 'android' ? 'android' : 'ios',
): Promise<boolean> {
  const urls = STORE_REVIEW_URLS[os]
  for (const url of [urls.primary, urls.fallback]) {
    try {
      await Linking.openURL(url)
      return true
    } catch {
      // tenta a próxima
    }
  }
  return false
}
