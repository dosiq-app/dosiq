// stockChangedBus.ts — sinal leve "o estoque mudou neste aparelho" (smoke spec 125 fatia 2, 20/11).
//
// Compra registrada pelo atalho do aviso da Hoje volta à aba Estoque em segundos; o refresh de foco do
// `useStock` tem trava de 10 s e pulava a leitura ⇒ o remédio seguia "+ Nova compra". A escrita avisa por
// aqui e TODA instância montada do `useStock` (aba Estoque, Hoje) relê sem a trava.
//
// Dep zero, só pub/sub (mesmo padrão do doseChangedBus). Emitir sem assinante é no-op. Best-effort.

const listeners = new Set<() => void>()

/** Assina o sinal de estoque alterado. Retorna unsubscribe. */
export function onStockChanged(fn: () => void) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** Avisa os assinantes — chamar só DEPOIS de uma escrita de estoque bem-sucedida. */
export function emitStockChanged() {
  for (const fn of listeners) {
    try {
      fn()
    } catch {
      // best-effort
    }
  }
}
