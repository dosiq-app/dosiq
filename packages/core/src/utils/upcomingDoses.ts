// upcomingDoses.ts — 117 Fatia A (FR-001/FR-002): as próximas doses de um tratamento, com data,
// horário e a dose da etapa vigente NAQUELA data.
//
// Duas fontes, nenhuma regra própria (INV-1):
//   - datas e horários: `listUpcomingOccurrences`, o mesmo walk de `listUpcomingDoseDates` e do
//     gerador (`isProtocolActiveOnDate`, CON-036);
//   - dose: `resolveTitrationStageAt` no instante da ocorrência, a mesma chamada do gerador
//     (`doseInstanceGenerator.ts`). Sem etapa regendo a data, cai em `dosage_per_intake`, como lá.
// A resolução da etapa não atravessa troca de medicamento (093/INV-4): o medicamento da ocorrência
// é sempre o do protocolo, então este helper não devolve medicamento.

import { listUpcomingOccurrences, type AdherenceProtocol } from './adherenceLogic'
import { resolveTitrationStageAt, type TitrationStepLike } from './titrationUtils'
import { getNow, parseLocalDate } from './dateUtils'

export interface UpcomingDose {
  /** Data local YYYY-MM-DD. */
  date: string
  /** Horário HH:MM. */
  time: string
  /** Dose por tomada nessa ocorrência (unidade de tomada do protocolo). */
  dose: number
  /** Número da etapa (1 = primeira) quando a escada rege a data; null sem escada ou etapa contínua. */
  stageNumber: number | null
}

export type UpcomingDoseProtocol = AdherenceProtocol & {
  dosage_per_intake?: number | string | null
  titration_steps?: TitrationStepLike[] | null
}

/** Instante local da ocorrência (data + HH:MM), ou NaN se inválido. */
function occurrenceInstant(date: string, time: string): number {
  const day = parseLocalDate(date)
  const [hh, mm] = time.split(':').map(Number)
  if (!day || !Number.isFinite(hh) || !Number.isFinite(mm)) return Number.NaN
  day.setHours(hh, mm, 0, 0)
  return day.getTime()
}

/**
 * Próximas `count` doses a partir de `now`. Protocolo nulo, PRN ou sem horário ⇒ `[]`.
 * Pausado/finalizado não é filtrado aqui (o walk trata como ativo): quem chama decide se mostra.
 */
export function listUpcomingDoses(
  protocol: UpcomingDoseProtocol | null | undefined,
  count = 3,
  now: Date = getNow()
): UpcomingDose[] {
  if (!protocol) return []
  const fallback = Number(protocol.dosage_per_intake ?? 1)
  const steps = Array.isArray(protocol.titration_steps) ? protocol.titration_steps : null
  const { occurrences } = listUpcomingOccurrences(protocol, count, now)
  return occurrences.map(({ date, time }) => {
    const at = occurrenceInstant(date, time)
    const stage = Number.isNaN(at) ? null : resolveTitrationStageAt(steps, at)
    return {
      date,
      time,
      dose: stage ? stage.dosage : fallback,
      stageNumber: stage ? stage.stageIndex + 1 : null,
    }
  })
}
