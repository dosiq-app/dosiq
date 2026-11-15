// pickTodaySurfaces — árbitro ÚNICO e puro das superfícies da Hoje (spec 120 C · ADR-129).
// Substitui `pickPromoCard` e a regra nudge × hero. Modelo: `docs/architecture/TODAY_SURFACES.md`.
//
// Cada superfície decide a própria ELEGIBILIDADE (044, 068, 105, 117, 120 A, 028 seguem valendo);
// aqui só se ESCOLHE entre elegíveis:
//   - 1 alerta, o primeiro da régua (ALERT_RANK); sem "+N" (D-2).
//   - dose acontecendo agora (hero) ⇒ o bloco de doses sobe acima do alerta (D-1).
//   - promo (≤ 1, upsell de estoque > nudge) só sem alerta TÉCNICO pendente — visível ou suprimido (D-8 · S-22).
//   - todo alerta elegível que não aparece — suprimido pela régua OU dispensado — volta em
//     `suppressed` com a casa que recebe o sinal discreto (D-6). Sem casa ⇒ não entra (OTA).

export type AlertKind = 'stock_zero' | 'push' | 'stock_urgent' | 'supply' | 'stock_low' | 'oem' | 'ota'
export type AlertNature = 'technical' | 'operational'
/** Casa permanente do alerta — onde o sinal discreto aparece (proposta §4.3). */
export type AlertHome = 'stock_tab' | 'profile_notifications' | 'profile_battery'
export type PromoKind = 'stock_upsell' | 'nudge'

/** Régua de relevância (proposta §4.2): o primeiro elegível vence. */
export const ALERT_RANK: readonly AlertKind[] = [
  'stock_zero', 'push', 'stock_urgent', 'supply', 'stock_low', 'oem', 'ota',
]

const NATURE: Record<AlertKind, AlertNature> = {
  stock_zero: 'operational',
  push: 'technical',
  stock_urgent: 'operational',
  supply: 'operational',
  stock_low: 'operational',
  oem: 'technical',
  ota: 'technical',
}

const HOME: Record<AlertKind, AlertHome | null> = {
  stock_zero: 'stock_tab',
  push: 'profile_notifications',
  stock_urgent: 'stock_tab',
  supply: 'stock_tab',
  stock_low: 'stock_tab',
  oem: 'profile_battery',
  // OTA não tem casa: aplica sozinho no próximo início frio. Suprimido ⇒ sem sinal (não é "sumir em
  // silêncio": a atualização acontece de qualquer jeito).
  ota: null,
}

export interface AlertCandidate<P = unknown> {
  kind: AlertKind
  /** Identidade estável (ex.: `stock_low:<medicineId>`) — chave de render e de dispensa. */
  key: string
  /** Dispensado pela pessoa: não aparece, mas sinaliza a casa enquanto existir. */
  dismissed?: boolean
  /** Desempate dentro do mesmo degrau: menor primeiro (dias até o impacto). */
  order?: number
  /** Dado da superfície (o árbitro não lê). */
  payload?: P
}

export interface TodaySurfacesInput<P = unknown> {
  hasHero: boolean
  alerts: Array<AlertCandidate<P>>
  stockUpsell: boolean
  nudge: boolean
  /**
   * Smoke 14/11 (PO, S-06): "1 aviso por sessão". Depois que a pessoa resolve ou dispensa o aviso
   * mostrado, o espaço fica vazio — sem próximo da régua e sem promo — até o próximo foreground.
   * Só `stock_zero` (dose em 24 h sem remédio) fura a espera. Os demais seguem com sinal na casa.
   */
  quiet?: boolean
}

export interface SuppressedAlert {
  kind: AlertKind
  key: string
  home: AlertHome
  reason: 'rank' | 'dismissed'
}

export interface TodaySurfaces<P = unknown> {
  alert: AlertCandidate<P> | null
  /**
   * S-23: 2º aviso, só sem hero, quando o 1º é vermelho (`stock_zero`) e há técnico pendente (push/bateria)
   * — dois bloqueios independentes da mesma dose. Fora isso, `null` (D-2 segue: 1 aviso).
   */
  companion: AlertCandidate<P> | null
  alertNature: AlertNature | null
  /** Bloco de doses acima do alerta (só com hero). */
  dosesFirst: boolean
  promo: PromoKind | null
  suppressed: SuppressedAlert[]
}

const rankOf = (kind: AlertKind) => ALERT_RANK.indexOf(kind)

function compareCandidates(a: AlertCandidate, b: AlertCandidate): number {
  const byRank = rankOf(a.kind) - rankOf(b.kind)
  if (byRank !== 0) return byRank
  const byOrder = (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY)
  if (byOrder !== 0 && !Number.isNaN(byOrder)) return byOrder
  return a.key.localeCompare(b.key)
}

export function pickTodaySurfaces<P = unknown>({ hasHero, alerts, stockUpsell, nudge, quiet = false }: TodaySurfacesInput<P>): TodaySurfaces<P> {
  const valid = (Array.isArray(alerts) ? alerts : []).filter((a) => a && rankOf(a.kind) >= 0 && typeof a.key === 'string')
  const sorted = [...valid].sort(compareCandidates)
  const alert = sorted.find((a) => !a.dismissed && (!quiet || a.kind === 'stock_zero')) ?? null

  const companion = !hasHero && alert?.kind === 'stock_zero'
    ? sorted.find((a) => a !== alert && !a.dismissed && (a.kind === 'push' || a.kind === 'oem')) ?? null
    : null

  const suppressed: SuppressedAlert[] = []
  for (const a of sorted) {
    if (a === alert || a === companion) continue
    const home = HOME[a.kind]
    if (!home) continue
    suppressed.push({ kind: a.kind, key: a.key, home, reason: a.dismissed ? 'dismissed' : 'rank' })
  }

  const alertNature = alert ? NATURE[alert.kind] : null
  // S-22 (smoke 15/11): técnico PENDENTE (visível ou suprimido pela régua, não dispensado) também cala
  // o promo — push desligado escondido atrás de um vermelho de estoque não libera pedido de avaliação.
  const technicalPending = sorted.some((a) => NATURE[a.kind] === 'technical' && !a.dismissed)
  let promo: PromoKind | null = null
  if (!quiet && !technicalPending) {
    if (stockUpsell) promo = 'stock_upsell'
    else if (nudge) promo = 'nudge'
  }

  return { alert, companion, alertNature, dosesFirst: hasHero === true, promo, suppressed }
}

export interface SessionGate {
  /** Chave do aviso mostrado nesta sessão (null = nenhum ainda). */
  shownKey: string | null
  quiet: boolean
}

export const OPEN_GATE: SessionGate = { shownKey: null, quiet: false }

/**
 * Transição da espera de sessão (S-06), pura: o aviso mostrado deixou de estar ATIVO (resolvido,
 * dispensado ou trocou de degrau) ⇒ silêncio até o próximo foreground. Primeiro aviso da sessão ⇒
 * memoriza. Devolve o MESMO objeto quando nada muda (o chamador compara por referência).
 */
export function nextSessionGate(gate: SessionGate, rawAlertKey: string | null, activeKeys: ReadonlySet<string>): SessionGate {
  if (gate.quiet) return gate
  if (gate.shownKey && !activeKeys.has(gate.shownKey)) return { shownKey: gate.shownKey, quiet: true }
  if (rawAlertKey && rawAlertKey !== gate.shownKey) return { shownKey: rawAlertKey, quiet: false }
  return gate
}

/** Casas com sinal ativo (presença, nunca contagem — boundary PO-120-14). */
export function homesWithSignal(suppressed: SuppressedAlert[]): Set<AlertHome> {
  return new Set((suppressed ?? []).map((s) => s.home))
}
