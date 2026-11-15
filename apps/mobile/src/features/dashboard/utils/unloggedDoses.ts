// unloggedDoses — "doses de hoje sem registro" (spec 120 C · US9 · FR-013/FR-014).
// Fonte: a timeline do dia (`useTodayDerived`) com `timelineStatus === 'SEM_REGISTRO'` — pending fora
// da tolerância, ainda não varrida para `missed` pelo cron. Dose pulada nem chega aqui (core exclui
// `skipped_*` — C1.5 D-A). Agrupa por horário previsto: [Registrar] abre o lote daquele horário e
// [Pular] é UMA chamada por horário (E-9 — o RPC é all-or-nothing).

export interface UnloggedGroup {
  /** `scheduledFor` (ISO) — chave do grupo e instante declarado do pulo (D-10). */
  scheduledFor: string
  scheduledTime: string
  doses: any[]
  names: string[]
}

/** R-299: nome congelado na ocorrência; o do tratamento vivo é só fallback. */
export const doseName = (d: any): string => d?.medicineName || d?.medicine?.name || d?.protocol?.name || 'Medicamento'

export function groupUnloggedDoses(timeline: any[] | null | undefined): UnloggedGroup[] {
  const byFor = new Map<string, UnloggedGroup>()
  for (const d of timeline ?? []) {
    if (!d || d.timelineStatus !== 'SEM_REGISTRO' || !d.scheduledFor || !d.instanceId) continue
    const g = byFor.get(d.scheduledFor) ?? { scheduledFor: d.scheduledFor, scheduledTime: d.scheduledTime, doses: [], names: [] }
    g.doses.push(d)
    const name = doseName(d)
    if (!g.names.includes(name)) g.names.push(name)
    byFor.set(d.scheduledFor, g)
  }
  // Mais antigo primeiro (DC-6).
  return [...byFor.values()].sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))
}

/** Itens no formato do `BulkDoseRegisterModal` (modo 'hero': `instancedItems`). */
export function toInstancedItems(doses: any[]) {
  return (doses ?? []).map((d) => ({
    id: d.instanceId,
    protocol: d.protocol,
    scheduledTime: d.scheduledTime,
    plan: d.protocol?.treatment_plan,
    instanceId: d.instanceId,
  }))
}

/** Payload do `registerSkip` agrupado (mesmo formato do alarme agrupado). */
export function toSkipPayload(group: UnloggedGroup) {
  const doses = group.doses.map((d) => ({ instanceId: d.instanceId, protocolId: d.protocol?.id ?? null }))
  return {
    doseInstanceId: doses[0]?.instanceId,
    protocolId: doses[0]?.protocolId ?? null,
    scheduledFor: group.scheduledFor,
    isGrouped: doses.length > 1 ? 'true' : 'false',
    groupedDoses: JSON.stringify(doses),
  }
}

export function skipToastMessage(group: UnloggedGroup): string {
  return group.doses.length > 1
    ? `Doses das ${group.scheduledTime} marcadas como puladas`
    : `Dose das ${group.scheduledTime} marcada como pulada`
}
