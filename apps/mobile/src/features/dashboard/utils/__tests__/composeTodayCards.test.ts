// 125 fatia 2 · emenda PO 20/11: régua única alerta × setup, orçamento de cards e faixa acima/abaixo do widget.
import { composeTodayCards, tierOfAlert } from '../composeTodayCards'

const alert = (kind: any, key = `${kind}:m1`) => ({ kind, key })
const confira = { kind: 'confira', protocolId: 'p1', verdict: {} } as any
const falta = { kind: 'falta', medicineId: 'm9' } as any
const cadastrado = { kind: 'cadastrado', protocolId: 'p2' } as any
const keys = (cards: any[]) => cards.map((c) => c.key)

describe('composeTodayCards', () => {
  it('degraus da régua (1–7)', () => {
    expect(['stock_zero', 'push', 'stock_urgent', 'supply', 'stock_low', 'oem', 'ota'].map((k) => tierOfAlert(k as any))).toEqual([1, 2, 4, 4, 7, 7, 7])
  })

  it('bateria pelo motivo (PO 20/11): restrito = 3 acima do widget sem 2ª vaga; Xiaomi/Samsung = 4', () => {
    const restricted = { kind: 'oem', key: 'oem', oemReason: 'restricted' } as any
    const r = composeTodayCards({ alert: restricted, setup: cadastrado })
    expect(keys(r.upper)).toEqual(['oem'])
    expect(r.lower).toEqual([])
    const battery = composeTodayCards({ alert: { kind: 'oem', key: 'oem', oemReason: 'battery' } as any, setup: falta })
    expect(battery.lower.map((c) => c.tier)).toEqual([4])
  })

  it('print smoke 20/11 (wedge sem agenda): lembretes (2) + Ozivy acabando (4) + Confira o tratamento (6) ⇒ 1 acima, Ozivy abaixo; com espaço, os 2 abaixo', () => {
    const r = composeTodayCards({ alert: alert('push', 'push'), companion: alert('stock_urgent'), setup: cadastrado })
    expect(keys(r.upper)).toEqual(['push'])
    expect(keys(r.lower)).toEqual(['stock_urgent:m1'])
    const room = composeTodayCards({ alert: alert('push', 'push'), companion: alert('stock_urgent'), setup: cadastrado, roomBelow: true })
    expect(keys(room.lower)).toEqual(['stock_urgent:m1', 'setup_cadastrado:p2'])
  })

  it('2º não cabe (orçamento 1) ⇒ vira sinal na casa', () => {
    const r = composeTodayCards({ alert: alert('stock_urgent'), companion: alert('stock_low', 'stock_low:m2'), setup: null })
    expect(keys(r.lower)).toEqual(['stock_urgent:m1'])
    expect(r.dropped.map((d) => d.key)).toEqual(['stock_low:m2'])
  })

  it('nada ⇒ vazio', () => {
    expect(composeTodayCards({ alert: null, setup: null })).toEqual({ upper: [], lower: [], dropped: [] })
  })

  it('print do smoke 20/11: sem estoque com dose em 6 dias (4) × Falta 1 passo (5) ⇒ só o estoque, abaixo do widget; setup espera sem sinal', () => {
    const r = composeTodayCards({ alert: alert('stock_urgent'), setup: falta })
    expect(r.upper).toEqual([])
    expect(keys(r.lower)).toEqual(['stock_urgent:m1'])
    expect(r.dropped).toEqual([])
  })

  it('Confira (3) vence acabando (4) e fica acima do widget; o alerta vira sinal no Estoque', () => {
    const r = composeTodayCards({ alert: alert('supply'), setup: confira })
    expect(keys(r.upper)).toEqual(['setup_confira:p1'])
    expect(r.lower).toEqual([])
    expect(r.dropped).toEqual([{ kind: 'supply', key: 'supply:m1', home: 'stock_tab', reason: 'rank' }])
  })

  it('vermelho libera o 2º card: sem estoque em 24 h + Confira ⇒ os dois acima', () => {
    const r = composeTodayCards({ alert: alert('stock_zero'), setup: confira })
    expect(keys(r.upper)).toEqual(['stock_zero:m1', 'setup_confira:p1'])
    expect(r.dropped).toEqual([])
  })

  it('vermelho + setup de baixo ⇒ 2º vai para baixo do widget', () => {
    const r = composeTodayCards({ alert: alert('push', 'push'), setup: cadastrado })
    expect(keys(r.upper)).toEqual(['push'])
    expect(keys(r.lower)).toEqual(['setup_cadastrado:p2'])
  })

  it('no máximo 2: vermelho + companheiro técnico + setup ⇒ setup espera (sem sinal)', () => {
    const r = composeTodayCards({ alert: alert('stock_zero'), companion: alert('push', 'push'), setup: cadastrado })
    expect(keys(r.upper)).toEqual(['stock_zero:m1', 'push'])
    expect(r.dropped).toEqual([])
  })

  it('sem vermelho ⇒ 1 card: Cadastrado (6) vence estoque baixo (7)', () => {
    const r = composeTodayCards({ alert: alert('stock_low'), setup: cadastrado })
    expect(keys(r.lower)).toEqual(['setup_cadastrado:p2'])
    expect(r.dropped.map((d) => d.key)).toEqual(['stock_low:m1'])
  })

  it('OTA fora do orçamento não sinaliza (sem casa)', () => {
    const r = composeTodayCards({ alert: alert('ota', 'ota'), setup: falta })
    expect(keys(r.lower)).toEqual(['setup_falta:m9'])
    expect(r.dropped).toEqual([])
  })
  describe('roomBelow (wedge sem Agenda de Hoje)', () => {
    it('acabando (4) + Falta (5) ⇒ os dois abaixo do widget, nada sinaliza', () => {
      const r = composeTodayCards({ alert: alert('stock_urgent'), setup: falta, roomBelow: true })
      expect(r.upper).toEqual([])
      expect(keys(r.lower)).toEqual(['stock_urgent:m1', 'setup_falta:m9'])
      expect(r.dropped).toEqual([])
    })

    it('Confira (3) acima + estoque baixo (7) abaixo — o espaço é só da faixa de baixo', () => {
      const r = composeTodayCards({ alert: alert('stock_low'), setup: confira, roomBelow: true })
      expect(keys(r.upper)).toEqual(['setup_confira:p1'])
      expect(keys(r.lower)).toEqual(['stock_low:m1'])
    })

    it('teto de 2 abaixo: vermelho + técnico + Cadastrado ⇒ Cadastrado abaixo (os vermelhos já estão em cima)', () => {
      const r = composeTodayCards({ alert: alert('stock_zero'), companion: alert('push', 'push'), setup: cadastrado, roomBelow: true })
      expect(keys(r.upper)).toEqual(['stock_zero:m1', 'push'])
      expect(keys(r.lower)).toEqual(['setup_cadastrado:p2'])
      expect(r.dropped).toEqual([])
    })

    it('sem espaço (com Agenda) segue o orçamento de 1', () => {
      expect(composeTodayCards({ alert: alert('stock_urgent'), setup: falta }).lower).toHaveLength(1)
    })
  })
})
