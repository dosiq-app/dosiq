// useSetupLink — "Confira o remédio" (Vincular) do slot de setup da Hoje (spec 125 fatia 2a · AC8.1–AC8.4).
//
// Abrir: lê o estoque (best-effort, só texto na conferência — RC3 E-2) e abre o sheet da busca com
// `linkTarget`. Escolher a caixa: grava no MESMO remédio pela mutação canônica (`diffCatalogBox`, FR-039).
// Forma mudou ou aviso novo nos tratamentos dele ⇒ folha AC7.5 aqui (`reviewQueue` puro — o
// `useFormChangeReview` faz goBack, que a Hoje não tem; RC3 E-R5-3). A Hoje só recarrega quando a fila
// acaba: recarregar antes tira o card (o remédio ganhou código) e desmonta o slot com a folha.

import { useCallback, useState } from 'react'
import { diffCatalogBox } from '@dosiq/core'
import { reviewQueue, type FormChangeReviewItem } from '@medications/utils/formChangeReview'
import { stockService } from '@stock/services/stockService'
import { openTreatmentEdit } from '@dashboard/utils/setupCopy'

type Run = (work: () => Promise<unknown>, options?: { reload?: boolean }) => Promise<void>

interface Options {
  medicine: any | null
  /** Tratamentos ativos (em uso + agendados) da Hoje. */
  protocols: any[]
  run: Run
  /** `useMedicineMutation().update` — cache + alarmes (FR-006); `undefined` = falhou (toast da mutação). */
  update: (id: string, payload: Record<string, unknown>) => Promise<unknown>
  refresh: () => void
  openSheet: () => void
  closeSheet: () => void
  notify: (message: string) => void
}

export function useSetupLink({ medicine, protocols, run, update, refresh, openSheet, closeSheet, notify }: Options) {
  // States
  const [stockQty, setStockQty] = useState<number | null>(null)
  const [review, setReview] = useState<FormChangeReviewItem[]>([])

  // Handlers
  const open = useCallback(async () => {
    if (!medicine?.id) return
    const qty = await stockService.getTotalQuantity(medicine.id).catch(() => null)
    setStockQty(typeof qty === 'number' ? qty : null)
    openSheet()
  }, [medicine, openSheet])

  const choose = useCallback(({ cmedDraft }: { anvisaItem: any; cmedDraft?: any }) => {
    // Sem caixa (sem índice, "Minha embalagem não está aqui"): nada grava, o card fica (INV-1).
    if (!cmedDraft?.therapeutic_class_code) {
      closeSheet()
      notify('O remédio ficou como estava.')
      return
    }
    // Smoke 2a (PO 22/11): fecha já. O fluxo da busca volta ao passo 1 ao escolher; sem fechar aqui,
    // a busca aparecia por baixo durante o update, antes da folha de revisão.
    closeSheet()
    const before = medicine
    const { payload } = diffCatalogBox(before, cmedDraft)
    let queue: FormChangeReviewItem[] = []
    let saved = false
    void run(async () => {
      const row = await update(before.id, payload)
      if (row !== undefined) {
        saved = true
        const mine = protocols.filter((p) => p?.medicine_id === before.id)
        queue = reviewQueue({ before, after: { ...before, ...payload }, protocols: mine })
        setReview(queue)
      }
      return row
    }, { reload: false }).then(() => {
      // Sem folha para mostrar: recarrega já (a regra julga de novo e a fila avança — AC8.4).
      if (saved && queue.length === 0) refresh()
    })
  }, [medicine, protocols, run, update, refresh, closeSheet, notify])

  // AC7.5: "Revisar" abre o tratamento (aba Tratamentos) e avança a fila; "Agora não" só avança.
  const reviewNext = useCallback((openTreatment: boolean) => {
    const [current, ...rest] = review
    setReview(rest)
    if (openTreatment && current) openTreatmentEdit(current.protocol.id)
    if (rest.length === 0) refresh()
  }, [review, refresh])

  return { stockQty, reviewItem: review[0] ?? null, open, choose, reviewNext }
}
