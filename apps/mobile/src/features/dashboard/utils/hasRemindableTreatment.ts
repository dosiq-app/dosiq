// hasRemindableTreatment — "há tratamento que gera lembrete" (068 · reuso previsto pela 120 E-8).
// Ativo (pausado = `active: false`), com horário, e ≠ `quando_necessário` (sem horário ⇒ sem lembrete).
// Enum COM acento (R-021). Pura: a Hoje já entrega só protocolos vigentes (`getActiveProtocols`).

type RemindableProtocol = {
  active?: boolean | null
  frequency?: string | null
  time_schedule?: unknown
}

export function hasRemindableTreatment(protocols: readonly RemindableProtocol[] | null | undefined): boolean {
  if (!Array.isArray(protocols)) return false
  return protocols.some(
    (p) =>
      !!p &&
      p.active !== false &&
      p.frequency !== 'quando_necessário' &&
      Array.isArray(p.time_schedule) &&
      p.time_schedule.length > 0
  )
}
