/**
 * stockForecast.ts — previsão de estoque CANÔNICA (spec 072 · ADR-126 · CON-046).
 *
 * UMA função decide, para um medicamento numa data, quanto ele consome por dia, quantos dias o
 * saldo cobre, se o estoque está baixo e em que REGIME a previsão vale. Alerta do servidor (legado,
 * enqueue e drain da outbox), `/estoque` do bot e contexto do chatbot consomem esta saída; o mobile
 * passa a consumir na 117 Fatia B. Nenhuma superfície refaz a conta (INV-1) — o gate
 * `lint:stock-forecast` acusa quem tentar.
 *
 * Pura, sem I/O, sem relógio: `asOf` é OBRIGATÓRIO (RC3 E-5) — quem chama decide o "hoje".
 *
 * Primitivos internos (FR-004): `calculateDailyIntake` (vigência + líquido + frequência),
 * `stockDoseMetrics` (doses restantes, dose de referência em ordem estável), `resolveStockStatus`
 * (gravidade) e o predicado de compra planejada da 105 (`isStockRunwayAlertExpected`).
 */

import { calculateDailyIntake, isProtocolVigentOn, type AdherenceProtocol } from './adherenceLogic'
import { stockDoseMetrics, resolveStockStatus, STOCK_THRESHOLDS } from './stock'
import { isStockRunwayAlertExpected, type RunwayProtocol, type RunwayStep } from './stockRunway'
import { cleanFloat } from './formUtils'

/**
 * Regime da previsão (FR-002):
 * - `continuous`: consumo com rotina — previsão em dias, alerta de estoque baixo.
 * - `planned_purchase`: zerar o estoque É o plano (esparso / etapa de passagem — 105); quem avisa é
 *   o `supply_reminder`, não o alerta de falta.
 * - `prn`: todos os tratamentos vigentes são "quando necessário". Previsão HOJE igual à contínua
 *   (fator 1/dia — D-5); o regime nomeado existe para que a decisão futura mude um lugar só.
 * - `no_forecast`: sem consumo na data (nenhum tratamento vigente).
 */
export type StockRegime = 'continuous' | 'planned_purchase' | 'prn' | 'no_forecast'

/** Protocolo como as superfícies o têm (linha crua do banco); a função filtra id e vigência. */
export type StockForecastProtocol = AdherenceProtocol & {
  [key: string]: unknown
}

export interface StockForecastInput {
  medicineId: string
  medicine: AdherenceProtocol['medicine']
  /** Pode vir com protocolos de outros medicamentos e fora de vigência: a função filtra os dois. */
  protocols: StockForecastProtocol[] | null | undefined
  /** Saldo somado (ml para líquido). NaN/ausente ⇒ 0. */
  quantity: number | null | undefined
  /** Etapas de escada do usuário. Ausente ⇒ [] — só a regra do esparso vale (INV-4, lado audível). */
  steps?: RunwayStep[] | null
  /** Data local YYYY-MM-DD de referência. Sem default (E-5). */
  asOf: string
}

export interface StockForecast {
  regime: StockRegime
  /** Consumo diário (unidades de tomada; ml se líquido). */
  dailyIntake: number
  /** Dias INTEIROS que o saldo cobre (floor). `null` ⇔ sem consumo. */
  daysRemaining: number | null
  /** Dias crus (fração). `Infinity` sem consumo. */
  runwayDays: number
  /** Doses físicas restantes (dose de referência em ordem estável). */
  dosesRemaining: number
  /** Todos os vigentes são diários — decide se a superfície exibe dias ou doses (ADR-067). */
  isDaily: boolean
  /** `critico` | `baixo` | `normal` | `alto` (gravidade por runway — `resolveStockStatus`). */
  severity: string
  /** Saldo zerado (ou negativo). */
  isZero: boolean
  /** Há consumo e `floor(dias) <= 7` — INCLUI saldo zero (D-6). */
  isCritical: boolean
  /** `isCritical` com saldo > 0 ("estoque baixo", distinto de "acabou"). */
  isLow: boolean
  /** O alerta de estoque baixo vale para este medicamento: crítico em regime com rotina ou PRN. */
  alertExpected: boolean
}

/** Limiar único de "estoque baixo" em dias inteiros (FR-003 / D-6). */
export const STOCK_LOW_DAYS = STOCK_THRESHOLDS.CRITICAL_DAYS

function regimeOf(
  medicineId: string,
  own: StockForecastProtocol[],
  steps: RunwayStep[],
  dailyIntake: number,
): StockRegime {
  if (!(dailyIntake > 0)) return 'no_forecast'
  // Predicado ÚNICO da 105, sobre os protocolos VIGENTES (contrato de `isStockRunwayAlertExpected`).
  if (!isStockRunwayAlertExpected(medicineId, own as unknown as RunwayProtocol[], steps)) return 'planned_purchase'
  if (own.every((p) => p.frequency === 'quando_necessário')) return 'prn'
  return 'continuous'
}

/**
 * Previsão de estoque de UM medicamento numa data.
 * @returns a previsão; nunca lança — entrada ausente cai em valores neutros (`no_forecast`, 0).
 */
export function deriveStockForecast(input: StockForecastInput): StockForecast {
  const { medicineId, medicine, asOf } = input
  const qty = Number(input.quantity) || 0
  const steps = input.steps ?? []
  const own = (input.protocols ?? []).filter(
    (p) => p?.medicine_id === medicineId && isProtocolVigentOn(p, asOf),
  )

  const dailyIntake = calculateDailyIntake(medicineId, own, medicine, asOf)
  const regime = regimeOf(medicineId, own, steps, dailyIntake)
  const hasIntake = dailyIntake > 0

  // cleanFloat antes do floor (R-277): 0,3÷0,1 = 2,9999… não pode virar 2 dias.
  const runwayDays = hasIntake ? cleanFloat(qty / dailyIntake) : Infinity
  const daysRemaining = hasIntake ? Math.floor(runwayDays) : null
  const { dosesRemaining, isDaily } = stockDoseMetrics(qty, own, medicine, asOf)

  const isZero = qty <= 0
  const isCritical = daysRemaining !== null && daysRemaining <= STOCK_LOW_DAYS
  const isLow = isCritical && !isZero
  const alertExpected = isCritical && (regime === 'continuous' || regime === 'prn')

  return {
    regime,
    dailyIntake,
    daysRemaining,
    runwayDays,
    dosesRemaining,
    isDaily,
    severity: resolveStockStatus(qty, dailyIntake, null, asOf),
    isZero,
    isCritical,
    isLow,
    alertExpected,
  }
}
