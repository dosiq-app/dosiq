// stockForecastSurfaces.test.ts — spec 072 (SC-002 / PO-072-1).
//
// Snapshot das TRÊS superfícies de estoque sobre a MESMA fixture (`stockForecastCases`):
//   1. alerta do servidor (`_computeStockAlertPayload` — legado, enqueue e drain);
//   2. `/estoque` do bot (mensagem inteira + aviso de estoque baixo);
//   3. resumo de estoque do chatbot (`fetchChatbotContextData().stockSummary`).
// O snapshot foi gravado ANTES da migração para a canônica; o diff do snapshot no PR é a prova de
// que só mudou o que a spec declara (dia 7 — D-6 — e a dose de referência estável).

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { STOCK_FORECAST_CASES } from '../../../packages/core/src/utils/__tests__/fixtures/stockForecastCases';

const mockDataQueue: any[] = [];

const { mockSupabase } = vi.hoisted(() => {
  const m: any = {
    from: vi.fn(function (this: any) { return this; }),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(() => Promise.resolve(mockDataQueue.shift() || { data: null, error: null })),
    then: vi.fn((onFulfilled: any) =>
      Promise.resolve(mockDataQueue.shift() || { data: [], error: null }).then(onFulfilled)),
  };
  return { mockSupabase: m };
});

vi.mock('../../services/supabase.js', () => ({ supabase: mockSupabase }));
vi.mock('../../services/userService.js', () => ({ getUserIdByChatId: vi.fn(async () => 'user-1') }));
vi.mock('../../../packages/core/src/repositories/createDoseInstanceRepository', () => ({
  createDoseInstanceRepository: () => ({
    getWindow: async () => [],
    countByStatus: async () => ({ taken: 0, missed: 0 }),
  }),
}));

const { _computeStockAlertPayload } = await import('../reminders/stockAlerts.js');
const { handleEstoque } = await import('../commands/estoque.js');
const { fetchChatbotContextData } = await import('../../../packages/core/src/chatbot/fetchChatbotContextData');

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // Meio-dia local de 2026-11-12 (STOCK_FORECAST_AS_OF): longe da virada de dia em qualquer fuso BR.
  vi.setSystemTime(new Date(2026, 10, 12, 12, 0, 0));
});

afterAll(() => {
  vi.useRealTimers();
});

afterEach(() => {
  mockDataQueue.length = 0;
  vi.clearAllMocks();
  vi.clearAllTimers();
});

function alertOf(c: (typeof STOCK_FORECAST_CASES)[number]) {
  const stock = {
    qty: c.quantity,
    name: c.medicine.name,
    unitsPerMl: c.medicine.units_per_ml,
    dosageUnit: c.medicine.dosage_unit,
    dosagePerPill: c.medicine.dosage_per_pill,
  };
  return _computeStockAlertPayload(c.medicine.id, stock, c.protocols, []);
}

async function estoqueOf(c: (typeof STOCK_FORECAST_CASES)[number]) {
  const bot = { sendMessage: vi.fn(async (_id: number, _text: string, _opts?: unknown) => ({})) };
  mockDataQueue.push({ data: { stock_tracking_enabled: true }, error: null });
  mockDataQueue.push({
    data: [{ ...c.medicine, stock: [{ quantity: c.quantity }], protocols: c.protocols }],
    error: null,
  });
  await handleEstoque(bot, { chat: { id: 1 } });
  const text = String(bot.sendMessage.mock.calls[0]?.[1] ?? '');
  return { text, low: text.includes('estoque baixo') };
}

async function chatbotOf(c: (typeof STOCK_FORECAST_CASES)[number]) {
  // Ordem das leituras no Promise.all do fetcher: medicines, protocols, logs, plans (then) e
  // user_settings (maybeSingle — fila própria, consumida depois).
  const thenQueue = [
    { data: [{ ...c.medicine, stock: [{ quantity: c.quantity }] }], error: null },
    { data: c.protocols, error: null },
    { data: [], error: null },
    { data: [], error: null },
  ];
  const client: any = {
    from: () => client, select: () => client, eq: () => client, is: () => client, gte: () => client,
    maybeSingle: () => Promise.resolve({ data: { stock_tracking_enabled: true }, error: null }),
    then: (ok: any) => Promise.resolve(thenQueue.shift() ?? { data: [], error: null }).then(ok),
  };
  const data: any = await fetchChatbotContextData({ supabase: client, getUserId: async () => 'user-1' });
  const entry = data.stockSummary[0];
  if (!entry) return null;
  const { medicine: _m, ...rest } = entry;
  return rest;
}

describe('072 — snapshot das 3 superfícies de estoque sobre a fixture compartilhada', () => {
  for (const c of STOCK_FORECAST_CASES) {
    it(`${c.id} — ${c.label}`, async () => {
      const alert = alertOf(c);
      const estoque = await estoqueOf(c);
      const chatbot = await chatbotOf(c);
      expect({ alert, estoque, chatbot }).toMatchSnapshot();
    });
  }
});
