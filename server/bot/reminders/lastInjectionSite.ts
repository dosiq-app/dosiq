// Spec 120 B (ADR-124): último local de aplicação do usuário para o push de dose semanal injetável.
//
// Semântica = rotação GLOBAL do ADR-072: último `medicine_logs.injection_site` não nulo do usuário,
// sem filtro de remédio. O cron roda como service_role (sem RLS) — o filtro por `user_id` é o único
// controle (RC-SEC S-1): cada consulta é de UM usuário e o Map é chaveado por esse mesmo id.
//
// Uma consulta `.limit(1)` por usuário-alvo, em paralelo: "o 1º por usuário" num `.in()` paginaria
// N logs por pessoa e truncaria em silêncio no teto de linhas (AP-186). Os alvos são só os usuários
// com dose semanal injetável no minuto — poucos por tick.
//
// Fail-open: erro de leitura ⇒ usuário fora do Map ⇒ o push sai sem o trecho. O valor devolvido é o
// cru do banco; o rótulo (e o descarte de valor fora do enum) é do builder (RC-SEC S-2).

import { createLogger } from '../logger.js'

const logger = createLogger('LastInjectionSite')

interface QueryResult {
  data: Array<{ injection_site: string | null }> | null
  error: unknown
}

// Recorte mínimo do cliente supabase usado aqui (DI: o teste injeta um cliente falso por usuário).
export interface InjectionSiteClient {
  from(table: 'medicine_logs'): {
    select(columns: string): {
      eq(column: 'user_id', value: string): {
        not(column: 'injection_site', op: 'is', value: null): {
          order(column: 'taken_at', options: { ascending: boolean }): {
            limit(n: number): PromiseLike<QueryResult>
          }
        }
      }
    }
  }
}

async function fetchOne(client: InjectionSiteClient, userId: string): Promise<string | null> {
  try {
    const { data, error } = await client
      .from('medicine_logs')
      .select('injection_site')
      .eq('user_id', userId)
      .not('injection_site', 'is', null)
      .order('taken_at', { ascending: false })
      .limit(1)
    if (error) {
      logger.error('Falha ao ler último local de aplicação (fail-open)', error instanceof Error ? error : null, { userId, error })
      return null
    }
    const site = data?.[0]?.injection_site
    return typeof site === 'string' && site.length > 0 ? site : null
  } catch (err) {
    logger.error('Erro ao ler último local de aplicação (fail-open)', err instanceof Error ? err : null, { userId })
    return null
  }
}

/**
 * Último local de aplicação por usuário. Usuário sem log com local (ou com erro de leitura) fica fora.
 */
export async function fetchLastInjectionSites(
  client: InjectionSiteClient,
  userIds: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set((userIds ?? []).filter((id) => typeof id === 'string' && id.length > 0))]
  const out = new Map<string, string>()
  if (unique.length === 0) return out
  const sites = await Promise.all(unique.map((id) => fetchOne(client, id)))
  unique.forEach((id, i) => {
    const site = sites[i]
    if (site) out.set(id, site)
  })
  return out
}
