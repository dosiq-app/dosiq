// useTodayPushPermission — estado do aviso de permissão da Hoje (spec 120 US1 / E-7 / S-2).
// Fora da TodayScreen para não engordar o render: alcance do push (fonte única, também do gate da 068),
// a lista que gera lembrete (em curso + agendados) e se o card aparece.
import { useMemo } from 'react'
import { hasRemindableTreatment } from '@dashboard/utils/hasRemindableTreatment'
import { usePushReachability, type PushReachability } from '@platform/notifications/usePushReachability'

/** Pura: tratamento que gera lembrete + push não utilizável + sem adiamento vigente (FR-001/FR-003). */
export function isPushPermissionVisible(reach: Pick<PushReachability, 'usable' | 'snoozed'>, protocols: any[]): boolean {
  return reach.usable === false && reach.snoozed === false && hasRemindableTreatment(protocols)
}

export function useTodayPushPermission({ data, protocols, scheduledProtocols }: { data: any; protocols: any[]; scheduledProtocols?: any[] | null }) {
  const reach = usePushReachability({ userId: data?.user?.id ?? null })
  const remindable = useMemo(() => [...(protocols ?? []), ...(scheduledProtocols ?? [])], [protocols, scheduledProtocols])
  return { reach, remindable, visible: isPushPermissionVisible(reach, remindable) }
}
