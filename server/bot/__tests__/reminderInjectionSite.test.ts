import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkRemindersViaDispatcher } from '../reminders/doseReminders.js';
import { fetchLastInjectionSites } from '../reminders/lastInjectionSite.js';

const mockDataQueue = [];

const { mockSupabase } = vi.hoisted(() => {
  const m = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    // 082 D2: corte da prova (`gt` em created_at) e leitura do último boletim negativo (`order`).
    gt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    // 082 Slice C: o leitor de evidência fecha a cadeia com `.limit()` (teto explícito, AP-186).
    // Sem este método o builder estoura TypeError, o try/catch por usuário engole, e o teste que
    // afere "nenhum motivo de supressão" passa por VACUIDADE — dispatch nunca chamado.
    limit: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    then: vi.fn((onFulfilled) => {
      const result = mockDataQueue.shift() || { data: [], error: null };
      return Promise.resolve(result).then(onFulfilled);
    }),
  };
  return { mockSupabase: m };
});

// Spec 101 (FR-008): a recriação da LA no claim da soneca é observada pelo spy; o resto do módulo é real.
const { mockStartSnoozed } = vi.hoisted(() => ({ mockStartSnoozed: vi.fn((..._a: any[]) => Promise.resolve('sent')) }));
vi.mock('../../notifications/apns/dispatchLiveActivityStarts.js', async (importOriginal) => ({
  ...(await importOriginal()),
  startSnoozedLiveActivity: (...a) => mockStartSnoozed(...a),
}));

vi.mock('../../services/supabase.js', () => ({
  supabase: mockSupabase
}));

vi.mock('../../bot/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../../services/notificationDeduplicator.js', () => ({
  shouldSendNotification: vi.fn(() => Promise.resolve(true)),
  shouldSendGroupedNotification: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('../utils/partitionDoses.js', () => ({
  partitionDoses: vi.fn((doses) => {
    if (doses.length === 0) return [];
    const block = {
      kind: 'dose_reminder',
      planId: null,
      planName: null,
      doses,
    };
    return [block];
  }),
}));

const setMockData = (data, error = null) => {
  mockDataQueue.push({ data, error });
};

// 120 B: o lote é observado/forjado aqui; a filtragem real por user_id é provada em lastInjectionSite.test.ts.
vi.mock('../reminders/lastInjectionSite.js', () => ({
  fetchLastInjectionSites: vi.fn(async () => new Map()),
}));

describe('120 B — local da última aplicação no produtor (PO-SEC-1)', () => {
  const originalEnv = process.env.REMINDER_SOURCE;
  let dispatcher;

  const inst = (id, userId, presentation, frequency) => ({
    id, user_id: userId, protocol_id: `p-${id}`, medicine_id: 'med-catalogo', scheduled_for: '2026-11-13T11:00:00Z',
    // MESMO medicine_id para os dois usuários (ataque do RC-SEC S-1).
    medicine: { name: 'Mounjaro', dosage_unit: 'mg', dosage_per_pill: 2.5, presentation },
    protocol: { id: `p-${id}`, name: 'Mounjaro', dosage_per_intake: 1, treatment_plan_id: null, medicine_id: 'med-catalogo', frequency, treatment_plan: null },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockDataQueue.length = 0;
    process.env.REMINDER_SOURCE = 'instances';
    dispatcher = { dispatch: vi.fn(() => Promise.resolve({ success: true })) };
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    if (originalEnv === undefined) delete process.env.REMINDER_SOURCE;
    else process.env.REMINDER_SOURCE = originalEnv;
  });

  function queueTick(instances) {
    setMockData(instances.map((i) => ({ user_id: i.user_id, notification_mode: 'realtime', timezone: 'America/Sao_Paulo' })));
    setMockData(instances); // não-snoozed
    setMockData([]);        // snoozed
  }

  const sentFor = (userId) => dispatcher.dispatch.mock.calls.map((c) => c[0]).find((a) => a.userId === userId);

  it('2 usuários, mesmo remédio: cada push leva só o próprio local', async () => {
    (fetchLastInjectionSites as any).mockResolvedValueOnce(new Map([['user-a', 'abdomen_e'], ['user-b', 'coxa_d']]));
    queueTick([inst('ia', 'user-a', 'injetavel', 'semanal'), inst('ib', 'user-b', 'injetavel', 'semanal')]);
    setMockData([{ id: 'ia' }]); // claim A
    setMockData([{ id: 'ib' }]); // claim B

    await checkRemindersViaDispatcher(dispatcher, 'corr-120');

    expect(sentFor('user-a').data).toMatchObject({ presentation: 'injetavel', frequency: 'semanal', lastInjectionSite: 'abdomen_e' });
    expect(sentFor('user-b').data).toMatchObject({ lastInjectionSite: 'coxa_d' });
  });

  it('lote consultado só p/ quem tem semanal injetável no minuto', async () => {
    queueTick([
      inst('ia', 'user-a', 'injetavel', 'semanal'),
      inst('ib', 'user-b', 'comprimido', 'semanal'),
      inst('ic', 'user-c', 'injetavel', 'diário'),
    ]);
    setMockData([{ id: 'ia' }]);
    setMockData([{ id: 'ib' }]);
    setMockData([{ id: 'ic' }]);

    await checkRemindersViaDispatcher(dispatcher, 'corr-120');

    expect(fetchLastInjectionSites).toHaveBeenCalledTimes(1);
    expect((fetchLastInjectionSites as any).mock.calls[0][1]).toEqual(['user-a']);
  });

  it('local nunca é anexado a dose que não é semanal injetável, mesmo do mesmo usuário', async () => {
    (fetchLastInjectionSites as any).mockResolvedValueOnce(new Map([['user-a', 'abdomen_e']]));
    queueTick([inst('ic', 'user-a', 'injetavel', 'diário')]);
    setMockData([{ id: 'ic' }]);

    await checkRemindersViaDispatcher(dispatcher, 'corr-120');

    expect(sentFor('user-a').data.lastInjectionSite).toBeNull();
  });

  it('lote lança ⇒ push sai sem local (fail-open)', async () => {
    (fetchLastInjectionSites as any).mockRejectedValueOnce(new Error('boom'));
    queueTick([inst('ia', 'user-a', 'injetavel', 'semanal')]);
    setMockData([{ id: 'ia' }]);

    await checkRemindersViaDispatcher(dispatcher, 'corr-120');

    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
    expect(sentFor('user-a').data.lastInjectionSite).toBeNull();
  });
});
