import { useCallback, useRef, useState } from 'react'
import { useToast } from '@shared/components/feedback/Toast'
import { registerSkip } from '@platform/alarms/quickDoseRegistration'
import { SURFACES } from '@platform/analytics/analyticsEvents'
import { toInstancedItems, toSkipPayload, skipToastMessage, type UnloggedGroup } from '@dashboard/utils/unloggedDoses'

/**
 * Ações de correção do dia na Hoje (spec 120 C · US9 · D-9/D-10 · RC2-C DC-5).
 *
 * - Registrar tardio: abre o `BulkDoseRegisterModal` com o `instanceId` de cada dose (âncora estrita —
 *   nunca vira avulsa, PO-120-16) e a hora inicial = horário PREVISTO (C1.5 C-3), editável.
 * - Pular: `registerSkip` com `declaredAt = scheduledFor` — decisão registrada "no horário" (PO 14/11);
 *   uma chamada por horário (E-9). Sem confirmação (DC-5); toast confirma; a dose sai da agenda
 *   (core exclui `skipped_*` — D-A). Correção de pulada → tomada é pelo histórico.
 * - Uma linha em voo por vez (`busyKey`): duplo toque não duplica RPC.
 */
export function useLateDoseActions({ setBulkModal, refresh }: { setBulkModal: (m: any) => void; refresh: () => void }) {
  const { show } = useToast()
  const [busyKey, setBusyKey] = useState<string | null>(null)
  // RC6 #957: trava síncrona — dois toques antes do re-render passariam pelo estado.
  const inFlight = useRef(false)

  const registerLate = useCallback((doses: any[]) => {
    const list = (doses ?? []).filter((d) => d?.instanceId)
    if (list.length === 0) return
    setBulkModal({ mode: 'hero', items: toInstancedItems(list), initialTakenAt: list[0].scheduledFor ?? null })
  }, [setBulkModal])

  const skipGroup = useCallback(async (group: UnloggedGroup) => {
    if (!group?.scheduledFor || inFlight.current) return
    inFlight.current = true
    setBusyKey(group.scheduledFor)
    try {
      const result: any = await registerSkip(toSkipPayload(group), { surface: SURFACES.MOBILE, declaredAt: group.scheduledFor })
      if (result?.success) {
        show(skipToastMessage(group), { variant: 'success', duration: 2000 })
      } else {
        // R-305: recusa é barulhenta — mensagem PT do core (janela, dia fechado, dono).
        show(result?.message || 'Não foi possível pular esta dose.', { variant: 'error' })
      }
    } finally {
      inFlight.current = false
      setBusyKey(null)
      refresh()
    }
  }, [refresh, show])

  /** Uma linha da agenda vira um grupo de 1 (mesmo caminho do card). */
  const skipDose = useCallback((dose: any) => skipGroup({
    scheduledFor: dose?.scheduledFor,
    scheduledTime: dose?.scheduledTime,
    doses: [dose],
    names: [],
  }), [skipGroup])

  return { busyKey, registerLate, skipGroup, skipDose }
}
