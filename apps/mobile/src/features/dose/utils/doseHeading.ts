// doseHeading — cabeçalho do sheet da dose (spec 124 A). Puro; dia LOCAL do dono (R-020).
import { daysDifference, formatLocalDate, getUserTime, parseISO } from '@dosiq/core'
import { weekdayDate } from '@dashboard/utils/treatmentWeek'

/** "qui, 02/10 · 09:05" e "há 42 dias" / "ontem" / "hoje". */
export function doseHeading(takenAt: string, tz: string, todayLocal: string): { date: string; ago: string } {
  const local = getUserTime(parseISO(takenAt), tz)
  const day = formatLocalDate(local)
  const time = `${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}`
  const n = Math.max(0, daysDifference(day, todayLocal))
  const ago = n === 0 ? 'hoje' : n === 1 ? 'ontem' : `há ${n} dias`
  return { date: `${weekdayDate(day)} · ${time}`, ago }
}
