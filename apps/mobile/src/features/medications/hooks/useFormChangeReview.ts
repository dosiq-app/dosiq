// useFormChangeReview — fila "A dose de {tratamento} pode ter mudado" depois de salvar a edição de um
// remédio (spec 125 1c, AC7.5 · AC7.10). Um tratamento por vez; "Revisar" abre o form do tratamento e,
// ao voltar, mostra o próximo; "Agora não" segue sem mudar nada (INV-2).
//
// Ao terminar a fila, volta a quem abriu a edição (goBack). O form do tratamento não abre a edição do
// remédio (smoke 1c: remédio errado = "Trocar").

import { useCallback, useRef, useState } from 'react'
import { useFocusEffect, useIsFocused } from '@react-navigation/native'
import { ROUTES } from '@navigation/routes'
import { protocolService } from '@treatments/services/protocolService'
import { reviewQueue, type FormChangeReviewItem } from '@medications/utils/formChangeReview'

interface Options {
  navigation: any
  before: any
}

export function useFormChangeReview({ navigation, before }: Options) {
  // States
  const [items, setItems] = useState<FormChangeReviewItem[]>([])
  // Foi revisar e ainda não voltou.
  const awaitingReturn = useRef(false)
  const isFocused = useIsFocused()

  // Handlers
  const finish = useCallback(() => navigation.goBack(), [navigation])

  /**
   * Depois do `update` com sucesso. Ler os tratamentos é best-effort: falhar não desfaz o save — sai
   * como antes (INV-1).
   */
  const afterUpdate = useCallback(
    async (after: any) => {
      let protocols: any[] = []
      try {
        protocols = (await protocolService.getByMedicineId(before.id)) ?? []
      } catch {
        protocols = []
      }
      const queue = reviewQueue({ before, after, protocols })
      if (queue.length === 0) finish()
      else setItems(queue)
    },
    [before, finish],
  )

  const review = useCallback(() => {
    const [current, ...rest] = items
    if (!current) return
    awaitingReturn.current = true
    setItems(rest)
    navigation.push(ROUTES.PROTOCOL_FORM, { id: current.protocol.id })
  }, [items, navigation])

  const skip = useCallback(() => {
    const rest = items.slice(1)
    setItems(rest)
    if (rest.length === 0) finish()
  }, [items, finish])

  // Voltou de revisar o último da fila ⇒ termina a edição.
  useFocusEffect(
    useCallback(() => {
      if (!awaitingReturn.current) return
      awaitingReturn.current = false
      if (items.length === 0) finish()
    }, [items, finish]),
  )

  // Só com a tela em foco — nunca por cima do form do tratamento aberto pelo "Revisar".
  return { current: isFocused ? (items[0] ?? null) : null, afterUpdate, review, skip }
}
