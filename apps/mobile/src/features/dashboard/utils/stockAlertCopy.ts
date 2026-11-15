import { formatLocalDate, addDays, getNow } from '@dosiq/core'
import { supplyNoticeCopy } from '@dashboard/utils/supplyNoticeCopy'
import type { StockAlertPayload } from '@dashboard/utils/todayStockCandidates'

// Texto do alerta operacional da Hoje (spec 120 C · RC2-C DC-2 · D-13). Do `TodayAlertCard`.
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

function shortDate(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

function whenLabel(occ: { date: string; time: string } | null, now: Date): string | null {
  if (!occ) return null
  if (occ.date === formatLocalDate(now)) return `hoje às ${occ.time}`
  if (occ.date === formatLocalDate(addDays(now, 1))) return `amanhã às ${occ.time}`
  return `${shortDate(occ.date)} às ${occ.time}`
}

type Copy = { title: string; subtitle: string; name: string; medicineId: string }

function supplyCopy(item): Copy {
  const copy = supplyNoticeCopy(item)
  const name = item.buyMedicineName || item.medicineName
  return {
    name,
    medicineId: item.buyMedicineId || item.medicineId,
    title: copy?.title ?? `Próxima compra de ${name}`,
    subtitle: copy?.hint ?? 'Você ainda não tem estoque para ela.',
  }
}

function leftLabel(item): string {
  const byDoses = item.isDailyStock === false && Number.isFinite(item.dosesRemaining)
  if (byDoses) return `${plural(item.dosesRemaining, 'Resta 1 dose', `Restam ${item.dosesRemaining} doses`)} de ${item.medicineName}`
  return `${item.medicineName} acaba em ${item.daysRemaining} ${plural(item.daysRemaining ?? 0, 'dia', 'dias')}`
}

function zeroSubtitle(level, nextDose, now: Date): string {
  const when = whenLabel(nextDose, now)
  return when && level === 'stock_zero'
    ? `A próxima dose é ${when}. Registre a compra para não faltar.`
    : 'Registre a compra antes da próxima dose.'
}

/** Texto por situação. Sem possessivo e sem "protocolo" (INV-3). */
export function stockAlertCopy(payload: StockAlertPayload, now: Date = getNow()): Copy {
  if (payload.type === 'supply') return supplyCopy(payload.item)
  const { item, level, nextDose } = payload
  const base = { name: item.medicineName, medicineId: item.medicineId }
  if (item.isZero === true || item.dosesRemaining === 0) {
    return { ...base, title: `Sem estoque de ${item.medicineName}`, subtitle: zeroSubtitle(level, nextDose, now) }
  }
  return {
    ...base,
    title: leftLabel(item),
    subtitle: level === 'stock_urgent' ? 'Compre logo para não faltar.' : 'Vale comprar nos próximos dias.',
  }
}
