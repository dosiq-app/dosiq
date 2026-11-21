// composeTodayCards — orçamento de cards de ação da Hoje (spec 125 fatia 2 · emenda PO smoke 19–20/11 ·
// ADR-129 E-7 revista · TODAY_SURFACES §2).
//
// O árbitro (`pickTodaySurfaces`) continua escolhendo o alerta; aqui ele concorre com o card de setup
// numa régua ÚNICA de 7 degraus e se decide ONDE cada um entra:
//   1 sem estoque c/ dose em 24 h (urgente, vermelho) · 2 lembretes desligados (urgente, âmbar) · 3 Confira · 2º plano restrito
//   ──────────── Semana do tratamento (widget fixo, spec 121) ────────────
//   4 acabando / próxima compra / bateria Xiaomi-Samsung · 5 Falta 1 passo · 6 Tratamento cadastrado · 7 estoque baixo, OTA
// Orçamento: 1 card. 2 só quando o melhor é urgente (1–2) — classe da régua, não a cor do card. Degraus 1–3 ficam acima
// do widget; 4–7, abaixo. ALERTA que não entra acende o sinal discreto na casa dele (sem número); SETUP que
// não entra só espera na fila — sem sinal (PO 20/11: a aba Tratamentos não mostra o setup, o ponto apontaria
// para o vazio).
// `roomBelow` (wedge sem "Agenda de Hoje", PO smoke 20/11): abaixo do widget não há nada disputando a
// atenção ⇒ a faixa de baixo aceita até 2 cards de 4–7, além do orçamento de cima.

import type { SetupCardPick } from '@dosiq/core'
import { ALERT_HOME, tierOfCandidate, type AlertCandidate, type AlertKind, type CardTier, type SuppressedAlert } from '@dashboard/utils/pickTodaySurfaces'

export type { CardTier }

const SETUP_TIER: Record<SetupCardPick['kind'], CardTier> = { confira: 3, falta: 5, cadastrado: 6 }

/** Último degrau que fica ACIMA da Semana do tratamento. */
export const UPPER_MAX_TIER = 3
const RED_MAX_TIER = 2

export type TodayCard<P = unknown> =
  | { source: 'alert'; tier: CardTier; key: string; alert: AlertCandidate<P> }
  | { source: 'setup'; tier: CardTier; key: string; setup: SetupCardPick }

export interface ComposeInput<P = unknown> {
  alert: AlertCandidate<P> | null
  companion?: AlertCandidate<P> | null
  setup: SetupCardPick | null
  /** Hoje sem Agenda abaixo do widget (wedge sem dose hoje) ⇒ até 2 cards na faixa de baixo. */
  roomBelow?: boolean
}

/** Teto da faixa de baixo quando há espaço (wedge sem Agenda). */
export const LOWER_MAX_WITH_ROOM = 2

export interface TodayComposition<P = unknown> {
  upper: Array<TodayCard<P>>
  lower: Array<TodayCard<P>>
  /** Alertas que ficaram de fora do orçamento — viram sinal na casa (setup fora não sinaliza). */
  dropped: SuppressedAlert[]
}

export function tierOfAlert(kind: AlertKind): CardTier {
  return tierOfCandidate({ kind })
}

function signalOf(card: TodayCard): SuppressedAlert | null {
  if (card.source === 'setup') return null
  const home = ALERT_HOME[card.alert.kind]
  return home ? { kind: card.alert.kind, key: card.key, home, reason: 'rank' } : null
}

export function composeTodayCards<P = unknown>({ alert, companion = null, setup, roomBelow = false }: ComposeInput<P>): TodayComposition<P> {
  const cards: Array<TodayCard<P>> = []
  for (const a of [alert, companion]) {
    if (a && tierOfCandidate(a)) cards.push({ source: 'alert', tier: tierOfCandidate(a), key: a.key, alert: a })
  }
  if (setup) {
    const id = setup.kind === 'falta' ? setup.medicineId : setup.protocolId
    cards.push({ source: 'setup', tier: SETUP_TIER[setup.kind], key: `setup_${setup.kind}:${id}`, setup })
  }
  // Estável: no mesmo degrau, alerta antes de setup (ordem de inserção).
  const sorted = cards.map((c, i) => ({ c, i })).sort((a, b) => a.c.tier - b.c.tier || a.i - b.i).map((x) => x.c)
  const budget = sorted.length && sorted[0].tier <= RED_MAX_TIER ? 2 : 1
  const shown = sorted.slice(0, budget)
  let lower = shown.filter((c) => c.tier > UPPER_MAX_TIER)
  if (roomBelow) {
    const extra = sorted.filter((c) => !shown.includes(c) && c.tier > UPPER_MAX_TIER)
    lower = [...lower, ...extra].slice(0, Math.max(lower.length, LOWER_MAX_WITH_ROOM))
  }
  const visible = new Set([...shown.filter((c) => c.tier <= UPPER_MAX_TIER), ...lower])
  const dropped = sorted.filter((c) => !visible.has(c)).map(signalOf).filter((s): s is SuppressedAlert => s !== null)
  return { upper: shown.filter((c) => c.tier <= UPPER_MAX_TIER), lower, dropped }
}
