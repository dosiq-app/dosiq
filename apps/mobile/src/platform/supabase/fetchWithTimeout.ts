// fetchWithTimeout.ts — teto de tempo para toda requisição do cliente Supabase nativo.
//
// Smoke 084 B (2026-11-12, C-B4): ao acordar o app pelo toque na notificação, uma requisição presa
// numa conexão morta nunca resolvia. O supabase-js não tem timeout próprio e serializa o acesso ao
// token numa trava interna: uma requisição presa segurava TODAS as seguintes (soneca com botões
// travados, boot em tela preta, fila de auditoria sem flush). Com o teto, a requisição morta FALHA
// (AbortError), o chamador trata como erro de rede e a trava é liberada.

export const SUPABASE_FETCH_TIMEOUT_MS = 15000

type FetchFn = (input: any, init?: any) => Promise<any>

/**
 * Envolve `baseFetch` com teto de `timeoutMs`. Respeita o `signal` do chamador: aborta no que
 * vier primeiro. O timer é sempre limpo (sem vazamento).
 */
export function createFetchWithTimeout(baseFetch: FetchFn, timeoutMs: number = SUPABASE_FETCH_TIMEOUT_MS): FetchFn {
  return (input, init = {}) => {
    const controller = new AbortController()
    const outer = init?.signal
    const onOuterAbort = () => controller.abort()
    if (outer) {
      if (outer.aborted) controller.abort()
      else outer.addEventListener?.('abort', onOuterAbort)
    }
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    return Promise.resolve()
      .then(() => baseFetch(input, { ...init, signal: controller.signal }))
      .finally(() => {
        clearTimeout(timer)
        outer?.removeEventListener?.('abort', onOuterAbort)
      })
  }
}
