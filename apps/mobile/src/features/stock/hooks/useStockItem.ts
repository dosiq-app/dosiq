// useStockItem — 117 Fatia A (FR-003 / INV-5): o item de estoque de UM medicamento, tirado do MESMO
// dataset da aba Estoque (`useStock`: leitura, transformer, 105 B, re-split por período).
//
// Sem derivador paralelo: não se calcula saldo nem status aqui. A aba e o card do detalhe do
// tratamento leem o mesmo objeto, então nunca divergem (AC-2.4). C1.5 P-2: o `useStock` não tem
// cache em memória compartilhado — o snapshot do aparelho pode ter até 24h e quebraria a AC-2.4 —,
// então este hook faz a leitura dele. Quem não deve ler (estoque desligado) não monta o hook.
//
// Retorno: `item` = objeto do transformer, ou null quando o medicamento não está na lista (sem
// saldo e sem tratamento no período — o card trata como "registre a primeira compra").

import { useMemo } from 'react'
import { useStock } from './useStock'

export function useStockItem(medicineId: string | null | undefined) {
  const { data, loading, error, refresh } = useStock() as {
    data: { active?: any[]; scheduled?: any[]; inactive?: any[] } | null
    loading: boolean
    error: string | null
    refresh: (bypassThrottle?: boolean) => void
  }

  const item = useMemo(() => {
    if (!medicineId || !data) return null
    // 117 B (T016): as três seções da classificação — o card lê o MESMO item que a aba mostra.
    const all = [...(data.active ?? []), ...(data.scheduled ?? []), ...(data.inactive ?? [])]
    return all.find((it) => it?.id === medicineId) ?? null
  }, [data, medicineId])

  return { item, loading: loading && !data, error, ready: Boolean(data), refresh }
}
