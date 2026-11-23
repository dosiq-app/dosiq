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
