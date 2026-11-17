// earlyRegister.ts — registro manual adiantado da L1 (spec 121 B · ADR-130 · PO-15).
import { getUserTime, parseISO } from '@dosiq/core'
import { ENTRY_POINTS } from '@platform/analytics/analyticsEvents'
import { toInstancedItems } from '@dashboard/utils/unloggedDoses'

/**
 * Estado do `BulkDoseRegisterModal` para "Já apliquei": ocorrência FUTURA dentro da tolerância,
 * `instanceId` estrito (nunca avulsa), hora inicial = agora (não é tardio ⇒ `initialTakenAt` null).
 * Carrega o id para o desarme local (`cancelAlarmIds`).
 */
export function earlyRegisterModal(instance: { id: string; scheduled_for: string }, protocol: any, tz: string) {
  const local = getUserTime(parseISO(instance.scheduled_for), tz)
  const scheduledTime = `${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}`
  return {
    mode: 'hero',
    items: toInstancedItems([{ instanceId: instance.id, protocol, scheduledTime }]),
    initialTakenAt: null,
    entryPoint: ENTRY_POINTS.TODAY_INLINE,
    cancelAlarmIds: [instance.id],
  }
}

/**
 * Desarme local pós-registro. O push do servidor já para pelo status (`doseReminders` só lê
 * `pending`), mas o alarme crítico agendado no aparelho só cai com `cancelAlarm` — o resync depende
 * de outra dependência e não pode ser a garantia (PO-15). Best-effort: falha não desfaz o registro.
 */
export function disarmRegisteredAlarms(modal: { cancelAlarmIds?: string[] } | null | undefined, cancel: (id: string) => Promise<unknown>) {
  for (const id of modal?.cancelAlarmIds ?? []) Promise.resolve(cancel(id)).catch(() => {})
}
