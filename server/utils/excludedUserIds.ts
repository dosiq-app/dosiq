// Contas internas (smoke) que ficam fora de números e alertas operacionais.
//
// Uma lista só, na env `GROWTH_EXCLUDED_USER_IDS` (uuids separados por vírgula): nasceu para o painel
// de crescimento (spec 115) e também tira as contas de smoke da apuração diária de entrega crítica
// (DOSIQ-SERVER-4). O nome ficou o da primeira consumidora; o significado é "conta interna".
//
// 🔴 Exclusão é de MEDIÇÃO, nunca de entrega: nenhum caminho que envia notificação pode ler isto.

/** Uuid canônico (qualquer versão). A env é config, mas entra em SQL/filtros — valida antes. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export const EXCLUDED_USER_IDS_ENV = 'GROWTH_EXCLUDED_USER_IDS'

/**
 * Lê a lista (uuids separados por vírgula). Ausente/vazia ⇒ []. Inválido é descartado com log (só a
 * contagem — o valor pode ser lixo arbitrário). Dedupe e minúsculas.
 */
export function parseExcludedUserIds(raw: string | undefined, label = 'growth'): string[] {
  if (!raw) return []
  const ids: string[] = []
  let invalid = 0
  for (const piece of raw.split(',')) {
    const id = piece.trim().toLowerCase()
    if (id === '') continue
    if (!UUID_RE.test(id)) {
      invalid += 1
      continue
    }
    if (!ids.includes(id)) ids.push(id)
  }
  if (invalid > 0) console.warn(`[${label}] ${invalid} id(s) inválido(s) em ${EXCLUDED_USER_IDS_ENV} descartado(s)`)
  return ids
}
