// stockAlertsFutureStart.test.ts — spec 117 Fatia B (PO-10 / INV-3 / FR-009).
//
// CP-2 (analysis-B): o filtro de início futuro NÃO entra no select de `_scanStockAlertCandidates` — o mesmo
// `protocolsByMedicine` alimenta o plano de compra (`supplyPlan`), e cortar o tratamento futuro ali
// calaria o `supply_reminder` do Programado. Quem exclui o futuro do `stock_alert` é a previsão
// canônica (072): `deriveStockForecast` só conta tratamento VIGENTE na data. Este teste prova as duas
// metades com o código real (payload único do legado + outbox, e o plano de compra) — sem mock do core.
// Pausado é cortado NA ORIGEM (`.eq('active', true).is('paused_at', null)`, coberto por
// stockAlertsVigency.test.ts); aqui se prova que, mesmo se vazasse, o payload não alertaria.

import { describe, it, expect, afterEach, vi } from 'vitest';
// Só funções puras são exercidas; o cliente real exige env (CI não tem — AP do test:critical sem env).
vi.mock('../../services/supabase.js', () => ({ supabase: {} }));

import { _computeStockAlertPayload } from '../reminders/stockAlerts.js';
import { planPurchasesForUser } from '../reminders/supplyPlan.js';

afterEach(() => {
  vi.clearAllMocks();
  vi.clearAllTimers();
});

const TODAY = '2026-11-13';
const USER = 'u1';
const MED = 'm1';
const stock = (qty: number) => ({ qty, name: 'Remédio', dosageUnit: 'mg', unitsPerMl: null, dosagePerPill: 10 });
const proto = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  user_id: USER,
  medicine_id: MED,
  time_schedule: ['08:00'],
  dosage_per_intake: 1,
  intake_unit: null,
  frequency: 'diário',
  interval_days: null,
  active: true,
  start_date: '2026-10-01',
  end_date: null,
  paused_at: null,
  ...over,
});

describe('stock_alert — início futuro e pausado não alertam (INV-3)', () => {
  it('controle: tratamento vigente com 2 dias de saldo alerta', () => {
    expect(_computeStockAlertPayload(MED, stock(2), [proto()], [], TODAY)).toMatchObject({ daysRemaining: 2 });
  });

  it('início futuro com saldo zero/baixo NÃO alerta (AC-4.4: Programado nunca BAIXO/CRÍTICO)', () => {
    expect(_computeStockAlertPayload(MED, stock(0), [proto({ start_date: '2026-12-09' })], [], TODAY)).toBeNull();
    expect(_computeStockAlertPayload(MED, stock(2), [proto({ start_date: '2026-11-14' })], [], TODAY)).toBeNull();
  });

  it('pausado (active=false) não alerta nem se escapasse do filtro da origem', () => {
    expect(_computeStockAlertPayload(MED, stock(0), [proto({ active: false, paused_at: '2026-11-01T00:00:00Z' })], [], TODAY)).toBeNull();
  });

  it('início futuro + tratamento vigente do mesmo remédio: o vigente decide (sem somar o futuro)', () => {
    const r = _computeStockAlertPayload(MED, stock(2), [proto(), proto({ id: 'p2', start_date: '2026-12-09' })], [], TODAY);
    expect(r).toMatchObject({ daysRemaining: 2 });
  });
});

describe('supply_reminder — Programado elegível segue no plano de compra (FR-009, conforme 105)', () => {
  it('mensal com início futuro: lembrete na véspera da 1ª dose não coberta (D-1)', () => {
    const p = proto({ id: 'pM', frequency: 'personalizado', interval_days: 30, start_date: '2026-11-15' });
    const purchases = planPurchasesForUser({
      userId: USER,
      protocolsByMedicine: { [`${USER}_${MED}`]: [p] },
      stockByMedicine: { [`${USER}_${MED}`]: stock(0) },
      steps: [],
      instances: [{ id: 'i1', protocol_id: 'pM', medicine_id: MED, scheduled_for: '2026-11-15T11:00:00Z', expected_dose: 1, status: 'pending' }],
      tz: 'America/Sao_Paulo',
      now: new Date('2026-11-14T13:00:00Z'),
    });
    expect(purchases).toEqual([{ medicineId: MED, date: '2026-11-15', reason: 'sparse', daysUntil: 1, protocolId: 'pM' }]);
    // …e o eixo de volume continua calado para o mesmo tratamento.
    expect(_computeStockAlertPayload(MED, stock(0), [p], [], '2026-11-14')).toBeNull();
  });
});
