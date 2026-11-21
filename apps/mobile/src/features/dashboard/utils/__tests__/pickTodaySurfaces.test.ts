// spec 120 C · PO-120-13/14 — matriz UC × E do árbitro (today-priority-proposal.md §6–§7).
import { pickTodaySurfaces, homesWithSignal, ALERT_RANK, nextSessionGate, OPEN_GATE, type AlertCandidate, type AlertKind } from '../pickTodaySurfaces'

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

const a = (kind: AlertKind, extra: Partial<AlertCandidate> = {}): AlertCandidate => ({ ...extra, kind, key: `${kind}:${extra.key ?? 'x'}` })
const base = { hasHero: false, alerts: [] as AlertCandidate[], stockUpsell: false, nudge: false }

describe('pickTodaySurfaces — régua (US7 cenário 1)', () => {
  it('ordem da régua é a acordada (D-3/D-5)', () => {
    expect(ALERT_RANK).toEqual(['stock_zero', 'push', 'stock_urgent', 'supply', 'stock_low', 'oem', 'ota'])
  })

  it.each(ALERT_RANK.map((k, i) => [k, ALERT_RANK.slice(i)] as const))('%s vence todos abaixo dele', (winner, rest) => {
    const r = pickTodaySurfaces({ ...base, alerts: [...rest].reverse().map((k) => a(k)) })
    expect(r.alert?.kind).toBe(winner)
  })

  it('no máximo 1 alerta; demais em suppressed com casa', () => {
    const r = pickTodaySurfaces({ ...base, alerts: ALERT_RANK.map((k) => a(k)) })
    expect(r.alert?.kind).toBe('stock_zero')
    // S-23: sem hero e 1º vermelho ⇒ push vira o 2º aviso (visível, fora do sinal). OTA sem casa.
    expect(r.companion?.kind).toBe('push')
    expect(r.suppressed.map((s) => s.kind)).toEqual(['stock_urgent', 'supply', 'stock_low', 'oem'])
    expect(r.suppressed.every((s) => s.reason === 'rank')).toBe(true)
  })

  it('E-3 vários estoques no mesmo degrau ⇒ menor `order` vence; empate por chave', () => {
    const r = pickTodaySurfaces({
      ...base,
      alerts: [a('stock_low', { key: 'b', order: 6 }), a('stock_low', { key: 'a', order: 4 }), a('stock_low', { key: 'c', order: 4 })],
    })
    expect(r.alert?.key).toBe('stock_low:a')
    expect(r.companion?.key).toBe('stock_low:c')
    expect(r.suppressed.map((s) => s.key)).toEqual(['stock_low:b'])
  })
})

describe('pickTodaySurfaces — casos de uso (proposta §6)', () => {
  it('UC-1 dose agora, tudo ok ⇒ só hero no topo', () => {
    expect(pickTodaySurfaces({ ...base, hasHero: true })).toEqual({ alert: null, companion: null, alertNature: null, dosesFirst: true, promo: null, suppressed: [] })
  })

  it('UC-2 dose agora + push off ⇒ doses acima, push abaixo', () => {
    const r = pickTodaySurfaces({ ...base, hasHero: true, alerts: [a('push')] })
    expect(r.dosesFirst).toBe(true)
    expect(r.alert?.kind).toBe('push')
  })

  it('UC-3/W1 caso do smoke: push + estoque 5 d + compra + nudge ⇒ push; estoque/compra sinalizados; nudge fora', () => {
    const r = pickTodaySurfaces({ ...base, nudge: true, alerts: [a('stock_low', { key: 'glifage', order: 5 }), a('supply'), a('push')] })
    expect(r.alert?.kind).toBe('push')
    expect(r.promo).toBeNull()
    expect([...homesWithSignal(r.suppressed)]).toEqual(['stock_tab'])
  })

  it('UC-4/W3 zerado com dose em 24 h + push off ⇒ os dois (S-23); com hero, push sinaliza Perfil › Notificações', () => {
    const r = pickTodaySurfaces({ ...base, alerts: [a('push'), a('stock_zero')] })
    expect(r.alert?.kind).toBe('stock_zero')
    expect(r.companion?.kind).toBe('push')
    expect(r.suppressed).toEqual([])
    // PO 20/11: com hero o push também segue como 2º candidato; a régua (compose) decide se aparece.
    const h = pickTodaySurfaces({ ...base, hasHero: true, alerts: [a('push'), a('stock_zero')] })
    expect(h.companion?.kind).toBe('push')
    expect(h.suppressed).toEqual([])
  })

  it('UC-5 estoque baixo 5 d + push ⇒ push', () => {
    expect(pickTodaySurfaces({ ...base, alerts: [a('stock_low'), a('push')] }).alert?.kind).toBe('push')
  })

  it('UC-6 estoque acabando (2 d) + push ⇒ push (#2 > #3)', () => {
    expect(pickTodaySurfaces({ ...base, alerts: [a('stock_urgent'), a('push')] }).alert?.kind).toBe('push')
  })

  it('UC-7/W5 só próxima compra ⇒ compra + promo permitida (operacional)', () => {
    const r = pickTodaySurfaces({ ...base, stockUpsell: true, alerts: [a('supply')] })
    expect(r.alert?.kind).toBe('supply')
    expect(r.alertNature).toBe('operational')
    expect(r.promo).toBe('stock_upsell')
  })

  it('UC-8/W4 tela calma ⇒ 1 promo, upsell > nudge', () => {
    expect(pickTodaySurfaces({ ...base, stockUpsell: true, nudge: true }).promo).toBe('stock_upsell')
    expect(pickTodaySurfaces({ ...base, nudge: true }).promo).toBe('nudge')
  })

  it('UC-9 bateria (técnico) ⇒ sem promo', () => {
    const r = pickTodaySurfaces({ ...base, nudge: true, stockUpsell: true, alerts: [a('oem')] })
    expect(r.alert?.kind).toBe('oem')
    expect(r.promo).toBeNull()
  })

  it('UC-12 primeiro uso (sem alertas) ⇒ promo possível', () => {
    expect(pickTodaySurfaces({ ...base, nudge: true }).promo).toBe('nudge')
  })

  it('nudge aparece mesmo com hero (a regra nudge × hero sai — ADR-129)', () => {
    expect(pickTodaySurfaces({ ...base, hasHero: true, nudge: true }).promo).toBe('nudge')
  })
})

describe('pickTodaySurfaces — edge cases (proposta §7)', () => {
  it('E-1 push dispensado ("Agora não") ⇒ próximo da régua sobe; push sinaliza', () => {
    const r = pickTodaySurfaces({ ...base, alerts: [a('push', { dismissed: true }), a('stock_low')] })
    expect(r.alert?.kind).toBe('stock_low')
    expect(r.suppressed).toEqual([{ kind: 'push', key: 'push:x', home: 'profile_notifications', reason: 'dismissed' }])
  })

  it('E-1 técnico dispensado não bloqueia a promo', () => {
    expect(pickTodaySurfaces({ ...base, nudge: true, alerts: [a('push', { dismissed: true })] }).promo).toBe('nudge')
  })

  it('E-2 estoque desligado (sem candidatos operacionais) ⇒ nada operacional', () => {
    expect(pickTodaySurfaces({ ...base }).alert).toBeNull()
  })

  it('E-6 OTA com hero sempre presente ⇒ OTA aparece (hero não bloqueia)', () => {
    const r = pickTodaySurfaces({ ...base, hasHero: true, alerts: [a('ota')] })
    expect(r.alert?.kind).toBe('ota')
    expect(r.dosesFirst).toBe(true)
  })

  it('E-14 nudge nunca vira alerta', () => {
    expect(pickTodaySurfaces({ ...base, nudge: true }).alert).toBeNull()
  })

  it('tudo dispensado ⇒ sem alerta, todos sinalizados', () => {
    const r = pickTodaySurfaces({ ...base, alerts: [a('push', { dismissed: true }), a('stock_low', { dismissed: true })] })
    expect(r.alert).toBeNull()
    expect(r.suppressed.map((s) => s.reason)).toEqual(['dismissed', 'dismissed'])
  })

  it('entrada degenerada: alerts null/undefined, tipo desconhecido, sem chave', () => {
    expect(pickTodaySurfaces({ ...base, alerts: null as any }).alert).toBeNull()
    expect(pickTodaySurfaces({ ...base, alerts: [{ kind: 'xyz' as any, key: 'k' }, { kind: 'push' } as any, null as any] }).alert).toBeNull()
  })

  it('order ausente vai depois do order presente no mesmo degrau', () => {
    const r = pickTodaySurfaces({ ...base, alerts: [a('stock_low', { key: 'sem' }), a('stock_low', { key: 'com', order: 3 })] })
    expect(r.alert?.key).toBe('stock_low:com')
  })
})

// Smoke 14/11 (PO, S-06): 1 aviso por sessão.
describe('pickTodaySurfaces — espera de sessão (quiet)', () => {
  it('quiet ⇒ sem aviso nem promo; todos sinalizados', () => {
    const r = pickTodaySurfaces({ ...base, nudge: true, stockUpsell: true, quiet: true, alerts: [a('push'), a('stock_low')] })
    expect(r.alert).toBeNull()
    expect(r.promo).toBeNull()
    expect(r.suppressed.map((s) => s.kind)).toEqual(['push', 'stock_low'])
  })
  it('quiet não segura stock_zero (dose em 24 h sem remédio)', () => {
    expect(pickTodaySurfaces({ ...base, quiet: true, alerts: [a('push'), a('stock_zero')] }).alert?.kind).toBe('stock_zero')
  })
})

describe('nextSessionGate', () => {
  const keys = (...k: string[]) => new Set(k)
  it('1º aviso da sessão ⇒ memoriza', () => {
    expect(nextSessionGate(OPEN_GATE, 'push', keys('push'))).toEqual({ shownKey: 'push', quiet: false })
  })
  it('aviso mostrado continua ativo ⇒ mesmo objeto (sem re-render)', () => {
    const g = { shownKey: 'push', quiet: false }
    expect(nextSessionGate(g, 'push', keys('push', 'stock_low:m1'))).toBe(g)
  })
  it('resolvido ou dispensado (saiu dos ativos) ⇒ silêncio', () => {
    expect(nextSessionGate({ shownKey: 'push', quiet: false }, 'stock_low:m1', keys('stock_low:m1'))).toEqual({ shownKey: 'push', quiet: true })
  })
  it('silêncio é estável até o foreground (quem reabre é o AppState)', () => {
    const g = { shownKey: 'push', quiet: true }
    expect(nextSessionGate(g, 'oem', keys('oem'))).toBe(g)
  })
  it('sem aviso ⇒ nada muda', () => {
    expect(nextSessionGate(OPEN_GATE, null, keys())).toBe(OPEN_GATE)
  })
})

describe('S-11 — bateria dispensada ("Não mostrar de novo") sinaliza a casa', () => {
  it('oem dismissed ⇒ sem alerta, suprimido em profile_battery', () => {
    const r = pickTodaySurfaces({ hasHero: false, alerts: [{ kind: 'oem', key: 'oem', dismissed: true }], stockUpsell: false, nudge: false })
    expect(r.alert).toBeNull()
    expect(r.suppressed).toEqual([{ kind: 'oem', key: 'oem', home: 'profile_battery', reason: 'dismissed' }])
  })
})

describe('S-18 — espera de sessão também no promo', () => {
  it('upsell mostrado e dispensado ⇒ silêncio; o nudge não sobe até o próximo foreground', () => {
    const shown = nextSessionGate(OPEN_GATE, 'stock_upsell', new Set(['stock_upsell', 'nudge']))
    expect(shown).toEqual({ shownKey: 'stock_upsell', quiet: false })
    const afterDismiss = nextSessionGate(shown, 'nudge', new Set(['nudge']))
    expect(afterDismiss.quiet).toBe(true)
  })
})

describe('S-22 — técnico suprimido também cala o promo', () => {
  it('estoque zerado visível + push suprimido ⇒ sem promo', () => {
    const r = pickTodaySurfaces({ hasHero: false, alerts: [{ kind: 'stock_zero', key: 'z' }, { kind: 'push', key: 'push' }], stockUpsell: false, nudge: true })
    expect(r.alert?.kind).toBe('stock_zero')
    expect(r.promo).toBeNull()
  })
  it('push dispensado ("Agora não") ⇒ promo volta', () => {
    const r = pickTodaySurfaces({ hasHero: false, alerts: [{ kind: 'stock_zero', key: 'z' }, { kind: 'push', key: 'push', dismissed: true }], stockUpsell: false, nudge: true })
    expect(r.promo).toBe('nudge')
  })
})

describe('2º candidato (S-23 revisto, PO smoke 125 20/11): sempre o próximo da régua', () => {
  const zero = { kind: 'stock_zero' as const, key: 'z' }
  const push = { kind: 'push' as const, key: 'push' }
  it('sem hero ⇒ estoque zerado + lembretes, ambos visíveis; push não vira sinal', () => {
    const r = pickTodaySurfaces({ hasHero: false, alerts: [zero, push, { kind: 'stock_low', key: 'l' }], stockUpsell: false, nudge: false })
    expect(r.alert?.key).toBe('z')
    expect(r.companion?.key).toBe('push')
    expect(r.suppressed.map((s) => s.key)).toEqual(['l'])
  })
  it('com hero ⇒ o 2º segue (a régua decide)', () => {
    const r = pickTodaySurfaces({ hasHero: true, alerts: [zero, push], stockUpsell: false, nudge: false })
    expect(r.companion?.key).toBe('push')
  })
  it('print do smoke 20/11: lembretes (1º) + Ozivy acabando ⇒ Ozivy é o 2º, sem sinal', () => {
    const r = pickTodaySurfaces({ hasHero: false, alerts: [{ kind: 'stock_urgent', key: 'u' }, push], stockUpsell: false, nudge: false })
    expect(r.alert?.key).toBe('push')
    expect(r.companion?.key).toBe('u')
    expect(r.suppressed).toEqual([])
  })
  it('espera da sessão (quiet) ⇒ 2º só se for stock_zero', () => {
    const r = pickTodaySurfaces({ hasHero: false, alerts: [zero, push], stockUpsell: false, nudge: false, quiet: true })
    expect(r.companion).toBeNull()
  })
  it('dispensado não vira 2º', () => {
    const r = pickTodaySurfaces({ hasHero: false, alerts: [zero, { ...push, dismissed: true }], stockUpsell: false, nudge: false })
    expect(r.companion).toBeNull()
  })

  it('2º plano restrito passa à frente de "acabando" (degrau 3 × 4, PO smoke 125 20/11)', () => {
    const r = pickTodaySurfaces({
      hasHero: false,
      alerts: [{ kind: 'stock_urgent', key: 'stock_urgent:m1' }, { kind: 'oem', key: 'oem', oemReason: 'restricted' }],
      stockUpsell: false,
      nudge: null,
    } as any)
    expect(r.alert?.kind).toBe('oem')
  })

  it('bateria Xiaomi/Samsung empata com "acabando" (4) e fica depois dele; sem motivo segue no fim', () => {
    const r = pickTodaySurfaces({
      hasHero: false,
      alerts: [{ kind: 'oem', key: 'oem', oemReason: 'battery' }, { kind: 'stock_low', key: 'stock_low:m1' }, { kind: 'supply', key: 'supply:m1' }],
      stockUpsell: false,
      nudge: null,
    } as any)
    expect(r.alert?.kind).toBe('supply')
    expect(r.companion?.kind).toBe('oem')
    expect(r.suppressed.map((x: any) => x.kind)).toEqual(['stock_low'])
  })
})
