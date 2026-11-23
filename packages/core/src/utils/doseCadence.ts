/**
 * doseCadence — cadência de dose de um tratamento (spec 121 C, movido para o core na 124 A · RC3 E-10).
 *
 * Funções PURAS sobre `frequency`/`interval_days` do protocolo. Moram no core porque a elegibilidade
 * do módulo da Hoje (`summarizeTrackedProfile`) depende delas — cópia no app seria drift (R-231).
 */

export type DoseCadence = { kind: 'daily'; days: 1 } | { kind: 'weekly'; days: number }

type CadenceProtocol = { frequency?: string | null; interval_days?: number | null } | null | undefined

/** Cadência ≥ 7 dias (semanal ou `intervalo_dias` ≥ 7); devolve o intervalo ou null. Base de `doseCadence`. */
export function weeklyCadenceDays(protocol: CadenceProtocol): number | null {
  if (!protocol) return null
  if (protocol.frequency === 'semanal') return 7
  if (protocol.frequency === 'intervalo_dias' && typeof protocol.interval_days === 'number' && protocol.interval_days >= 7) {
    return protocol.interval_days
  }
  return null
}

/**
 * FR-040 (121 C): a L1 vale para wedge com cadência CONHECIDA — a forma não decide (substitui G-B5).
 * C-A2: `intervalo_dias` 2..6, alternado, PRN e personalizado ficam sem L1 (sem caso nem copy).
 */
export function doseCadence(protocol: CadenceProtocol): DoseCadence | null {
  if (!protocol) return null
  if (protocol.frequency === 'diário') return { kind: 'daily', days: 1 }
  if (protocol.frequency === 'intervalo_dias' && protocol.interval_days === 1) return { kind: 'daily', days: 1 }
  const weekly = weeklyCadenceDays(protocol)
  return weekly ? { kind: 'weekly', days: weekly } : null
}
