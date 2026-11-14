// nextDoseReminder — a próxima dose que vai gerar lembrete, e o texto do push dela (spec 120 D-3/D-4).
//
// Alimenta o subtítulo do card de permissão ("a dose de Mounjaro de amanhã às 08:00") e a PRÉVIA do
// push no primer. O texto espelha o push real da fatia B (D-9): mesmo verbo (`doseVerb`) e mesma dose
// (`formatDoseAmount`), ambos do core. O local da última aplicação fica de fora da prévia (exigiria
// ler `medicine_logs` só para isto — analysis-A, Correções #1).
// Só tratamentos que geram lembrete (`hasRemindableTreatment`); a data vem de `getNextOccurrence`, a
// mesma recorrência do gerador (086 INV-3).
import { getNextOccurrence, doseVerb, formatDoseAmount, DOSE_DETAIL_SEP } from '@dosiq/core'
import { hasRemindableTreatment } from './hasRemindableTreatment'
import { whenLabel } from './nextDoseSummary'

export interface NextDoseReminder {
  medicineName: string
  /** Verbo da dose pela apresentação (D-9). */
  verb: string
  /** "hoje" | "amanhã" | "sex, 10 out" */
  when: string
  time: string
  /** Título do push (D-9). */
  title: string
  /** Corpo do push (D-9): dose · hora. */
  body: string
}

function _earliest(protocols: any[] | null | undefined, now: Date): { p: any; date: string; time: string } | null {
  let best: { p: any; date: string; time: string } | null = null
  for (const p of protocols ?? []) {
    if (!hasRemindableTreatment([p])) continue
    const occ = getNextOccurrence(p, now)
    if (!occ) continue
    if (!best || `${occ.date} ${occ.time}` < `${best.date} ${best.time}`) best = { p, ...occ }
  }
  return best
}

/** Título do push (D-9): essencial > semanal injetável > padrão. */
function _pushTitle(p: any, medicine: any, medicineName: string): string {
  const verb = doseVerb(medicine?.presentation)
  if (p?.critical_alarm) return `💊 Essencial: ${verb} ${medicineName}`
  if (medicine?.presentation === 'injetavel' && p?.frequency === 'semanal') return `Dia da aplicação de ${medicineName}`
  return `Hora de ${verb} ${medicineName}`
}

export function nextDoseReminder(protocols: any[] | null | undefined, now: Date): NextDoseReminder | null {
  const best = _earliest(protocols, now)
  if (!best) return null
  const { p, date, time } = best
  const medicine = p?.medicine ?? null
  const medicineName = medicine?.name || p?.name || ''
  if (!medicineName) return null
  const amount = formatDoseAmount(p?.dosage_per_intake, medicine?.dosage_per_pill, medicine?.dosage_unit, p?.intake_unit)
  const body = [amount, time].filter(Boolean).join(DOSE_DETAIL_SEP)
  return { medicineName, verb: doseVerb(medicine?.presentation), when: whenLabel(date, now), time, title: _pushTitle(p, medicine, medicineName), body }
}
