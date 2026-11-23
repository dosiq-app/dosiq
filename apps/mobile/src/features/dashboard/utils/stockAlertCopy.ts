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
  // RC6 #957: sem número (cache sem previsão) não imprime "null dias".
  if (!Number.isFinite(item.daysRemaining)) return `Estoque de ${item.medicineName} acabando`
  return `${item.medicineName} acaba em ${item.daysRemaining} ${plural(item.daysRemaining, 'dia', 'dias')}`
}

function zeroSubtitle(level, nextDose, now: Date): string {
  const when = whenLabel(nextDose, now)
  if (!when) return 'Registre a compra antes da próxima dose.'
  // Smoke 125 fatia 2 (20/11): sem a data, "antes da próxima dose" soava urgente com a dose a 6 dias.
  return level === 'stock_zero'
    ? `A próxima dose é ${when}. Registre a compra para não faltar.`
    : `A próxima dose é ${when}. Registre a compra até lá.`
}

/** "A e B" · "A, B e C" · "A, B e mais 2" (o card não cresce com a lista). */
function namesLabel(names: string[]): string {
  if (names.length <= 3) return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`
  return `${names.slice(0, 2).join(', ')} e mais ${names.length - 2}`
}

const GROUP_TITLE: Record<string, (n: number) => string> = {
  stock_zero: (n) => `Sem estoque de ${n} remédios`,
  stock_urgent: (n) => `${n} remédios acabando`,
  stock_low: (n) => `${n} remédios com estoque baixo`,
}

// Smoke 125 2a (PO 22/11): um card para N remédios — nomes numa linha e só a dose mais cedo.
function groupCopy(payload: Extract<StockAlertPayload, { type: 'stock_group' }>, now: Date): Copy {
  const names = payload.items.map((it) => it.medicineName)
  const allZero = payload.items.every((it) => it.isZero === true || it.dosesRemaining === 0)
  const when = whenLabel(payload.nextDose, now)
  const hint = allZero
    ? (when ? `A primeira dose sem estoque é ${when}.` : 'Registre as compras antes das próximas doses.')
    : payload.level === 'stock_low' ? 'Vale comprar nos próximos dias.' : 'Compre logo para não faltar.'
  const title = allZero && payload.level !== 'stock_zero'
    ? `Sem estoque de ${names.length} remédios`
    : GROUP_TITLE[payload.level](names.length)
  return { name: names.join(', '), medicineId: '', title, subtitle: `${namesLabel(names)}.\n${hint}` }
}

/** Texto por situação. Sem possessivo e sem "protocolo" (INV-3). */
export function stockAlertCopy(payload: StockAlertPayload, now: Date = getNow()): Copy {
  if (payload.type === 'supply') return supplyCopy(payload.item)
  if (payload.type === 'stock_group') return groupCopy(payload, now)
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
