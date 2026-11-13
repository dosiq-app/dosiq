// 117 Fatia B: a SEÇÃO de cada medicamento (Em uso → Programado → Sem tratamentos) vem da função pura
// do core `classifyStockMedicines` (FR-005, INV-2) e a CONTA (consumo, dias, doses, gravidade) vem da
// previsão canônica `deriveStockForecast` (072 · ADR-126 · CON-046). Este arquivo não faz conta de
// estoque própria (gate `lint:stock-forecast`) nem decide período com o predicado estrito do gerador.
import {
  getTodayLocal,
  deriveStockForecast,
  classifyStockMedicines,
  isBiologicallyExpired,
  biologicalExpiryDaysLeft,
  isStockRunwayAlertExpected,
  computeSupplyDate,
  purchaseUrgency,
  addCalendarDays,
  DEFAULT_TZ,
  formatMedicineFullName,
} from '@dosiq/core'

/** Gravidade canônica (`resolveStockStatus`) → tier exibido pela aba. Sem consumo ⇒ HIGH (como antes). */
const SEVERITY_TO_STATUS = {
  critico: { status: 'CRITICAL', statusLabel: 'Crítico', color: '#ef4444' },
  baixo: { status: 'LOW', statusLabel: 'Baixo', color: '#f59e0b' },
  normal: { status: 'NORMAL', statusLabel: 'Normal', color: '#22c55e' },
  alto: { status: 'HIGH', statusLabel: 'Bom', color: '#3b82f6' },
}
const NO_FORECAST_STATUS = SEVERITY_TO_STATUS.alto
const PLANNED_STATUS = { status: 'PLANNED', statusLabel: 'Planejado', color: '#64748b' }
const PAUSED_STATUS = { status: 'PAUSED', statusLabel: 'Pausado', color: '#64748b' }
const ORPHAN_STATUS = { status: 'NONE', statusLabel: '', color: '#64748b' }

/** Protocolos com `medicine_id` (o embed é filho do medicamento — não traz a coluna). */
const withMedicineId = (protocols, medicineId) =>
  (protocols ?? []).map((p) => ({ ...p, medicine_id: p?.medicine_id ?? medicineId }))

function forecastOf(item, protocols, quantity, steps, asOf) {
  return deriveStockForecast({
    medicineId: item.id,
    medicine: { dosage_unit: item.dosage_unit, units_per_ml: item.units_per_ml, dosage_per_pill: item.dosage_per_pill },
    protocols: withMedicineId(protocols, item.id),
    quantity,
    steps: steps ?? [],
    asOf,
  })
}

function ttlOf(item, totalQuantity) {
  // Eixo TTL pós-abertura (012 Fase A) — paralelo ao status por volume.
  // _latestOpenedAt injetado por useStock._fetchAndPersistStock.
  const stockRow = item._latestOpenedAt ? { opened_at: item._latestOpenedAt } : null
  const ttlExpired = stockRow ? isBiologicallyExpired(stockRow, item) : false
  const ttlDaysLeft = stockRow ? biologicalExpiryDaysLeft(stockRow, item) : null
  // Alerta ativo: vencido OU faltam ≤3 dias (e lote tem saldo)
  const ttlAlertActive = totalQuantity > 0 && (ttlExpired || (ttlDaysLeft !== null && ttlDaysLeft >= 0 && ttlDaysLeft <= 3))
  return { ttlExpired, ttlDaysLeft, ttlAlertActive }
}

function statusOf(cls, forecast) {
  if (cls.section === 'scheduled') return PLANNED_STATUS
  if (cls.section === 'inactive') return cls.paused ? PAUSED_STATUS : ORPHAN_STATUS
  if (!(forecast.dailyIntake > 0)) return NO_FORECAST_STATUS
  return SEVERITY_TO_STATUS[forecast.severity] ?? NO_FORECAST_STATUS
}

/**
 * Itens da aba Estoque a partir da leitura crua (`getStockOverview`, sem corte por hoje).
 * Medicamento que a classificação deixa de fora (órfão/encerrado sem saldo) não vira item.
 *
 * @param rawData medicamentos crus (com `medicine_stock_summary` e `protocols`)
 * @param opts.steps etapas de escada (`null` = leitura falhou ⇒ sem Programado por etapa, INV-2)
 */
export function transformStockData(rawData, { steps = null, today = getTodayLocal(), tz = DEFAULT_TZ } = {}) {
  const raw = Array.isArray(rawData) ? rawData : []
  const qtyOf = (item) => item.medicine_stock_summary?.[0]?.total_quantity || 0
  const classes = classifyStockMedicines({
    medicines: raw.map((item) => ({ id: item.id, totalQuantity: qtyOf(item), protocols: item.protocols ?? [] })),
    steps,
    today,
    tz,
  })
  const byId = new Map(classes.map((c) => [c.medicineId, c]))

  return raw.filter((item) => byId.has(item.id)).map((item) => {
    const cls = byId.get(item.id)
    const totalQuantity = qtyOf(item)
    const hasPurchases = (item.medicine_stock_summary?.[0]?.stock_entries_count ?? 0) > 0
    const activeProtocols = cls.section === 'in_use' ? cls.inUseProtocols : []

    // Em uso: hoje. Programado: contado A PARTIR DO INÍCIO (AC-4.4) — início futuro usa a data de início;
    // etapa usa um protocolo de contagem efêmero (dose da etapa, cadência da escada). Sem tratamentos: nada.
    const forecast =
      cls.section === 'in_use'
        ? forecastOf(item, activeProtocols, totalQuantity, steps, today)
        : cls.section === 'scheduled'
          ? forecastOf(item, cls.scheduled.countingProtocols, totalQuantity, steps, cls.scheduled.countAsOf)
          : null

    return {
      ...item,
      totalQuantity,
      hasPurchases,
      section: cls.section,
      paused: cls.paused,
      scheduled: cls.scheduled,
      forecast,
      dailyConsumption: forecast?.dailyIntake ?? 0,
      daysRemaining: forecast?.runwayDays ?? Infinity,
      dosesRemaining: forecast?.dosesRemaining ?? 0,
      isDailyStock: forecast?.isDaily ?? true,
      ...statusOf(cls, forecast),
      hasActiveProtocol: cls.section === 'in_use',
      activeProtocols,
      ...ttlOf(item, totalQuantity),
    }
  })
}

/** Em uso (com previsão): o mais crítico primeiro. */
export function filterActiveStockItems(processed) {
  return processed
    .filter(item => item.section === 'in_use')
    .sort((a, b) => a.daysRemaining - b.daysRemaining)
}

const byName = (a, b) => (a.name || '').localeCompare(b.name || '')

/**
 * Seções da aba (W-2 / INV-2). Cada item já traz a sua seção — aqui só se agrupa e ordena:
 * - active: Em uso, por `daysRemaining` asc (mais crítico primeiro);
 * - scheduled: Programado, `startsOn` asc, sem data por último;
 * - inactive: Sem tratamentos ativos, pausados primeiro, depois órfãos; nome dentro de cada grupo.
 */
export function splitStockItems(processed) {
  const items = Array.isArray(processed) ? processed : []
  const active = items.filter((it) => it.section === 'in_use').sort((a, b) => a.daysRemaining - b.daysRemaining)
  const scheduled = items
    .filter((it) => it.section === 'scheduled')
    .sort((a, b) => {
      const sa = a.scheduled?.startsOn ?? null
      const sb = b.scheduled?.startsOn ?? null
      if (sa === sb) return byName(a, b)
      if (sa === null) return 1
      if (sb === null) return -1
      return sa < sb ? -1 : 1
    })
  const inactive = items
    .filter((it) => it.section === 'inactive')
    .sort((a, b) => (a.paused === b.paused ? byName(a, b) : a.paused ? -1 : 1))
  return { active, scheduled, inactive }
}

// ═══ 105 Fatia B — remédio que zera de propósito (mensal / etapa de passagem) ═══
// INV-1: elegibilidade e data vêm do core (`isStockRunwayAlertExpected` / `computeSupplyDate`), as
// MESMAS funções do servidor. Aqui só se monta a entrada e se anota o item — lista, badge e banner do
// Hoje leem o item, então este é o ponto único de troca (C-B1).

/**
 * Protocolos do item na forma do core. 🔴 O embed `protocols(...)` do select do estoque NÃO traz
 * `medicine_id` (`createStockRepository.getMedicinesWithStockOrActiveProtocol`), e o core filtra por
 * ele: sem isto a lista ficava vazia e o predicado respondia "alerta como hoje" (smoke 2026-11-06).
 * O embed é filho do medicamento, então `medicine_id = item.id` é fato, não suposição.
 */
function runwayProtocolsOf(it) {
  return (it?.activeProtocols ?? []).map((p) => ({ ...p, medicine_id: p?.medicine_id ?? it.id }))
}

/** Itens elegíveis à leitura de doses pendentes (o predicado diz que zerar é o plano). */
export function supplyEligibleMedicineIds(items, steps) {
  if (!Array.isArray(items) || !Array.isArray(steps)) return []
  return items
    .filter((it) => it?.hasActiveProtocol && !isStockRunwayAlertExpected(it.id, runwayProtocolsOf(it), steps))
    .map((it) => it.id)
}

/** Saldo por medicamento na forma do core (líquido precisa da concentração p/ converter a dose). */
function runwayStocksOf(items) {
  const stocks = {}
  for (const it of items) {
    stocks[it.id] = {
      qty: it.totalQuantity ?? 0,
      dosage_unit: it.dosage_unit ?? null,
      units_per_ml: it.units_per_ml ?? null,
      dosage_per_pill: it.dosage_per_pill ?? null,
    }
  }
  return stocks
}

/**
 * Anota cada item com `runwayAlertExpected` e `supply` (resultado do core, ou null).
 *
 * `steps === null` = leitura das etapas falhou ⇒ fail-safe (AP-277 / INV-2): alerta como hoje, sem
 * data. Nunca cala por falta de dado.
 * Item elegível perde o tier de falta (`CRITICAL`/`LOW`) e vira `PLANNED`: saldo segue visível (FR-G5).
 */
export function attachSupplyRunway(items, { steps, instances, now, tz = DEFAULT_TZ }) {
  if (!Array.isArray(items)) return items
  if (!Array.isArray(steps)) {
    return attachScheduledPurchase(items.map((it) => ({ ...it, runwayAlertExpected: true, supply: null })))
  }
  const stocks = runwayStocksOf(items)
  const annotated = items.map((it) => {
    if (!it.hasActiveProtocol) return { ...it, runwayAlertExpected: true, supply: null }
    const protocols = runwayProtocolsOf(it)
    const runwayAlertExpected = isStockRunwayAlertExpected(it.id, protocols, steps)
    if (runwayAlertExpected) return { ...it, runwayAlertExpected, supply: null }
    const supply = computeSupplyDate({
      medicineId: it.id,
      protocols,
      steps,
      instances: instances ?? [],
      stocks,
      tz,
      now,
    })
    return { ...it, runwayAlertExpected, supply, status: 'PLANNED', statusLabel: 'Planejado', color: '#64748b' }
  })
  return attachScheduledPurchase(annotated)
}

/**
 * 117 Fatia B (AC-4.5): data "comprar até" do item Programado.
 * - próxima troca da escada: a MESMA data do `supply` (`step_switch`) que o item vigente já calculou
 *   com a regra do core — nada de 2ª conta (INV-1 da 105);
 * - início futuro: véspera do início (decisão do PO, U-B1 — só exibição/tom; sem lembrete novo);
 * - etapa distante ou avanço manual: sem data (nenhum D-x sem data, Edge Cases).
 */
function attachScheduledPurchase(items) {
  const switchDate = new Map()
  for (const it of items) {
    const s = it?.supply
    if (s?.status === 'due' && s.reason === 'step_switch' && !switchDate.has(s.medicineId)) switchDate.set(s.medicineId, s.date)
  }
  // Remédio da próxima troca que já tem card no Programado: a data mora LÁ. O item vigente não repete
  // "Próxima etapa: comprar até" — lido no card errado, parecia a compra do remédio em uso (smoke 117 B).
  const scheduledNext = new Set(items.filter((it) => it?.section === 'scheduled' && it.scheduled?.kind === 'next_step').map((it) => it.id))
  return items.map((it) => {
    if (it?.section === 'in_use' && it.supply?.reason === 'step_switch' && scheduledNext.has(it.supply.medicineId)) {
      return { ...it, supplyShownOnTarget: true }
    }
    if (it?.section !== 'scheduled') return it
    const sch = it.scheduled
    let purchaseBy = null
    if (sch?.kind === 'next_step') purchaseBy = switchDate.get(it.id) ?? null
    else if (sch?.kind === 'future_start' && sch.startsOn) purchaseBy = addCalendarDays(sch.startsOn, -1)
    return { ...it, purchaseBy }
  })
}

/** 'YYYY-MM-DD' → 'DD/MM', sem `new Date(string)` (R-020). Inválido ⇒ null. */
export function formatSupplyDateShort(date) {
  const m = typeof date === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(date) : null
  return m ? `${m[3]}/${m[2]}` : null
}

/**
 * Texto da próxima compra do item (FR-009/G-B3), ou null quando não há data (FR-010: a UI mostra o
 * saldo em doses). Escada: a compra é do PRÓXIMO remédio, dito no texto.
 */
export function supplyLabelOf(item) {
  const s = item?.supply
  if (!s || s.status !== 'due' || item.supplyShownOnTarget) return null
  const short = formatSupplyDateShort(s.date)
  if (!short) return null
  return s.reason === 'step_switch' ? `Próxima etapa: comprar até ${short}` : `Próxima compra até ${short}`
}

/** Medicamentos a comprar (data `due`) que NÃO estão na lista — precisam do cadastro buscado. */
export function supplyBuyIdsMissing(items) {
  if (!Array.isArray(items)) return []
  const listed = new Set(items.map((it) => it?.id))
  const ids = items
    .filter((it) => it?.supply?.status === 'due' && !listed.has(it.supply.medicineId))
    .map((it) => it.supply.medicineId)
  return [...new Set(ids)]
}

/**
 * Anota `supplyBuyName` = nome COMPLETO (com concentração) do remédio a comprar, como o card da
 * titulação mostra: "Mounjaro" sozinho não diz qual caneta comprar. Fonte: o próprio item da lista
 * ou o cadastro buscado (`summaries`); sem nenhum dos dois ⇒ null (o card cai num texto genérico).
 */
export function attachSupplyBuyNames(items, summaries = []) {
  if (!Array.isArray(items)) return items
  const byId = new Map()
  for (const m of summaries ?? []) if (m?.id) byId.set(m.id, m)
  for (const it of items) if (it?.id) byId.set(it.id, it)
  return items.map((it) => {
    if (it?.supply?.status !== 'due') return it
    const med = byId.get(it.supply.medicineId)
    return { ...it, supplyBuyName: med ? formatMedicineFullName(med) : null }
  })
}

/** Linha "começa" do Programado (FR-008): "Começa 09/12" · "Etapa 2 de X · começa ~14/11" · sem data. */
export function scheduleLabelOf(item) {
  const sch = item?.scheduled
  if (!sch) return null
  const short = formatSupplyDateShort(sch.startsOn)
  if (sch.kind === 'future_start') return short ? `Começa ${short}` : null
  const base = sch.treatmentName ? `Etapa ${sch.stepNumber} de ${sch.treatmentName}` : `Etapa ${sch.stepNumber}`
  return short ? `${base} · começa ~${short}` : base
}

const NONE_VIEW = { purchaseCta: null, badge: null, supplyLabel: null }

/**
 * O que o card de um item de estoque mostra — o MESMO para a aba (`StockItem`) e o detalhe do
 * tratamento (`ProtocolStockCard`): duas telas, uma regra (117 INV-5).
 *
 * - `purchaseCta`: `{ tone: 'alert' | 'neutral' }` = pílula "+ Nova compra" no lugar do selo; null = sem CTA.
 * - `badge`: tier exibido (`StockLevelBadge`), null = sem selo.
 * - `supplyLabel`: linha de data de compra, null sem data.
 * - `scheduleLabel`: linha "começa" do Programado.
 * - `tapOpensPurchase`: o toque abre a compra (sem saldo e nada a detalhar) em vez do detalhe.
 * - `showInitialStockHint`/`showBadge`: compatibilidade (117 A) — derivados dos de cima.
 *
 * Régua (FR-013 / AC-4.5, `purchaseUrgency` do core, número único com o servidor):
 *   Programado: com saldo ⇒ `PLANEJADO | N` (do início); zerado ⇒ CTA neutro, vermelho quando
 *   "comprar até" ≤ hoje. Zerar planejado EM USO (mensal/esparso): antes de D-2 selo + "Próxima compra
 *   até"; D-2..D-1 CTA neutro + "Comprar até"; D+ CTA vermelho. Escada em uso: o selo fica — a compra
 *   é do PRÓXIMO remédio, que tem o seu próprio item Programado.
 */
export function stockItemView(item, today = getTodayLocal()) {
  const view = computeView(item, today)
  return {
    ...view,
    scheduleLabel: scheduleLabelOf(item),
    showInitialStockHint: Boolean(view.purchaseCta),
    showBadge: Boolean(view.badge),
    tapOpensPurchase: Boolean(view.purchaseCta) || (!item?.hasPurchases && (item?.totalQuantity ?? 0) === 0),
  }
}

function computeView(item, today) {
  if (!item) return NONE_VIEW
  const totalQuantity = item.totalQuantity ?? 0
  const short = (d) => formatSupplyDateShort(d)

  if (item.section === 'scheduled') {
    if (totalQuantity > 0) return { purchaseCta: null, badge: 'PLANNED', supplyLabel: null }
    const tone = purchaseUrgency(item.purchaseBy, today) === 'due' ? 'alert' : 'neutral'
    const by = short(item.purchaseBy)
    return { purchaseCta: { tone }, badge: null, supplyLabel: by ? `Próxima compra até ${by}` : null }
  }

  if (item.section === 'inactive') {
    // AC-5.1: pausado = selo neutro; a ação é só adicionar estoque (nunca "retomar").
    return { purchaseCta: null, badge: item.paused ? 'PAUSED' : null, supplyLabel: null }
  }

  // Em uso.
  const plannedZero = item.runwayAlertExpected === false
  const s = item.supply
  if (plannedZero && s?.status === 'due' && s.reason === 'sparse' && s.medicineId === item.id) {
    const urgency = purchaseUrgency(s.date, today)
    if (urgency !== 'planned') {
      return { purchaseCta: { tone: urgency === 'due' ? 'alert' : 'neutral' }, badge: null, supplyLabel: `Comprar até ${short(s.date)}` }
    }
  }
  // Nunca comprou e saldo zero ⇒ 1ª compra — exceto quando zerar é o plano (smoke 117 A, C-2).
  if (!item.hasPurchases && totalQuantity === 0 && !plannedZero) {
    return { purchaseCta: { tone: 'alert' }, badge: null, supplyLabel: supplyLabelOf(item) }
  }
  return { purchaseCta: null, badge: item.status ?? null, supplyLabel: supplyLabelOf(item) }
}
