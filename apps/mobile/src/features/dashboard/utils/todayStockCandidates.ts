// todayStockCandidates — alertas operacionais da Hoje como candidatos do árbitro (spec 120 C · D-13).
// Elegibilidade NÃO muda aqui: estoque = `deriveStockAlerts` (117 B / 105 G4); compra =
// `deriveSupplyNotices` (105 G-B5). Este módulo só classifica em degrau da régua:
//   #1 stock_zero   — sem estoque E dose do remédio nas próximas 24 h (impede a próxima dose)
//   #3 stock_urgent — acabando (`forecast.isUrgent`, CON-046) ou zerado sem dose em 24 h
//   #4 supply       — próxima compra (105). S-21: escala pela MESMA régua da aba Estoque
//                     (`purchaseUrgency`): D-2..D-1 ⇒ degrau #3 (âmbar); D ou atrasada ⇒ #1 (vermelho).
//   #5 stock_low    — demais alertas de estoque
import { getNextOccurrence, formatLocalDate, addDays, STOCK_URGENT_DAYS, purchaseUrgency } from '@dosiq/core'
import type { AlertCandidate } from '@dashboard/utils/pickTodaySurfaces'

export type StockLevel = 'stock_zero' | 'stock_urgent' | 'stock_low'

export interface StockAlertItem {
  medicineId: string
  medicineName: string
  daysRemaining: number | null
  dosesRemaining?: number | null
  isDailyStock?: boolean | null
  isZero?: boolean
  isUrgent?: boolean
}

export interface SupplyNoticeItem {
  medicineId: string
  medicineName: string
  date: string
  daysUntil: number
  buyMedicineId?: string | null
  buyMedicineName?: string | null
  reason?: string
  /** S-17: cadência do tratamento de origem (título "Dose semanal/mensal/…"). */
  frequency?: string | null
  intervalDays?: number | null
}

export type StockAlertPayload =
  | { type: 'stock'; level: StockLevel; item: StockAlertItem; nextDose: { date: string; time: string } | null }
  | { type: 'supply'; item: SupplyNoticeItem; urgency: SupplyUrgency }

/** S-21: urgência da compra (régua da aba Estoque). */
export type SupplyUrgency = 'planned' | 'soon' | 'due'
const SUPPLY_KIND = { planned: 'supply', soon: 'stock_urgent', due: 'stock_zero' } as const

/** Próxima dose do remédio (menor entre os tratamentos dele) — `getNextOccurrence` do core (C-2). */
export function nextDoseOfMedicine(medicineId: string, protocols: any[] | null | undefined, now: Date) {
  let best: { date: string; time: string } | null = null
  for (const p of protocols ?? []) {
    if (!p || p.medicine_id !== medicineId) continue
    const occ = getNextOccurrence(p, now)
    if (!occ) continue
    if (!best || `${occ.date} ${occ.time}` < `${best.date} ${best.time}`) best = occ
  }
  return best
}

/** Ocorrência local (data + HH:mm) cai nas próximas 24 h a partir de `now`. */
export function isWithin24h(occ: { date: string; time: string } | null, now: Date): boolean {
  if (!occ) return false
  const today = formatLocalDate(now)
  const tomorrow = formatLocalDate(addDays(now, 1))
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  if (occ.date === today) return true
  return occ.date === tomorrow && occ.time <= hhmm
}

function isZeroItem(it: StockAlertItem): boolean {
  return it.isZero === true || it.dosesRemaining === 0
}

// Cache antigo sem `forecast` (≤ 24 h): mesma regra do core sobre os números do item.
function isUrgentItem(it: StockAlertItem): boolean {
  if (typeof it.isUrgent === 'boolean') return it.isUrgent
  if (it.isDailyStock === false && Number.isFinite(it.dosesRemaining)) return (it.dosesRemaining as number) <= 1
  return it.daysRemaining !== null && Number.isFinite(it.daysRemaining) && (it.daysRemaining as number) <= STOCK_URGENT_DAYS
}

export function stockLevelOf(it: StockAlertItem, nextDose: { date: string; time: string } | null, now: Date): StockLevel {
  if (isZeroItem(it)) return isWithin24h(nextDose, now) ? 'stock_zero' : 'stock_urgent'
  return isUrgentItem(it) ? 'stock_urgent' : 'stock_low'
}

export function buildStockCandidates(
  stockAlerts: StockAlertItem[] | null | undefined,
  supplyNotices: SupplyNoticeItem[] | null | undefined,
  protocols: any[] | null | undefined,
  now: Date,
): Array<AlertCandidate<StockAlertPayload>> {
  const out: Array<AlertCandidate<StockAlertPayload>> = []
  for (const item of stockAlerts ?? []) {
    if (!item?.medicineId) continue
    const nextDose = nextDoseOfMedicine(item.medicineId, protocols, now)
    const level = stockLevelOf(item, nextDose, now)
    out.push({
      kind: level,
      key: `${level}:${item.medicineId}`,
      order: isZeroItem(item) ? 0 : item.daysRemaining ?? Number.POSITIVE_INFINITY,
      payload: { type: 'stock', level, item, nextDose },
    })
  }
  const today = formatLocalDate(now)
  for (const item of supplyNotices ?? []) {
    if (!item?.medicineId) continue
    const urgency = purchaseUrgency(item.date, today) as SupplyUrgency
    out.push({
      kind: SUPPLY_KIND[urgency],
      // Faixa na chave (D-B): dispensado volta quando a compra escala.
      key: urgency === 'planned' ? `supply:${item.medicineId}` : `supply_${urgency}:${item.medicineId}`,
      order: item.daysUntil,
      payload: { type: 'supply', item, urgency },
    })
  }
  return out
}
