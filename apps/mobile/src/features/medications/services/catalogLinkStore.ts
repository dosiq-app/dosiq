// catalogLinkStore — dispensa do convite de vínculo ao catálogo, por medicamento (spec 119 US4 · Q1).
//
// No aparelho (PO 2026-11-10, opção a): o convite pode voltar em outro aparelho ou após reinstalar.
// A chave guarda só o id do medicamento, nunca o nome (RC-SEC S-6). Fora da allowlist do logout
// (CON-037) ⇒ some ao sair da conta. Padrão do `alarmEnabledStore`: best-effort, nunca lança.

import AsyncStorage from '@react-native-async-storage/async-storage'

export const CATALOG_LINK_DISMISSED_PREFIX = 'catalog-link-dismissed:'

function keyFor(medicineId: string): string {
  return `${CATALOG_LINK_DISMISSED_PREFIX}${medicineId}`
}

/** O convite deste medicamento já foi dispensado? Erro de leitura ⇒ true (não insistir). */
export async function isCatalogLinkDismissed(medicineId: string | null | undefined): Promise<boolean> {
  if (!medicineId) return true
  try {
    return (await AsyncStorage.getItem(keyFor(medicineId))) === 'true'
  } catch {
    return true
  }
}

/** Marca o convite como dispensado ("Não é este", ou vínculo feito). */
export async function dismissCatalogLink(medicineId: string | null | undefined): Promise<void> {
  if (!medicineId) return
  try {
    await AsyncStorage.setItem(keyFor(medicineId), 'true')
  } catch {
    // best-effort
  }
}

// Smoke 1c (PO 19/11): veredito "quais itens da lista oficial vinculam" por remédio — evita carregar o
// índice CMED (1,4–8 s de disco no Android) a cada abertura do detalhe. Guarda id + assinatura da força
// (sem nome em claro: a assinatura vira hash) e os nomes dos itens vinculáveis (dado público da ANVISA).
export const CATALOG_LINK_VERDICT_PREFIX = 'catalog-link-verdict:'

function hash(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** Nomes vinculáveis guardados para esta assinatura; null = sem veredito (calcular). */
export async function readCatalogLinkVerdict(medicineId: string, signature: string): Promise<string[] | null> {
  try {
    const raw = await AsyncStorage.getItem(`${CATALOG_LINK_VERDICT_PREFIX}${medicineId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.sig === hash(signature) && Array.isArray(parsed.names) ? parsed.names : null
  } catch {
    return null
  }
}

export async function saveCatalogLinkVerdict(medicineId: string, signature: string, names: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(`${CATALOG_LINK_VERDICT_PREFIX}${medicineId}`, JSON.stringify({ sig: hash(signature), names }))
  } catch {
    // best-effort
  }
}
