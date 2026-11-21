import { render, act, waitFor } from '@testing-library/react-native';
import TodayScreen from '../TodayScreen';
import { useTodayData } from '@dashboard/hooks/useTodayData';

// Mock do hook de dados
jest.mock('@dashboard/hooks/useTodayData');
// 069 A2: medidas do dia (interleave na agenda) — refresh observável após registrar dose
const mockRefreshMeasures = jest.fn();
jest.mock('@measures/hooks/useTodayMeasures', () => ({
  useTodayMeasures: () => ({ items: [], refresh: mockRefreshMeasures }),
}));

// Mock react-navigation — TodayScreen usa useFocusEffect (refresh on focus, Fase 4)
// que exige um NavigationContainer; sem isto o render lança fora do container.
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
  useFocusEffect: () => {},
  useScrollToTop: () => {},
  createNavigationContainerRef: () => ({ isReady: () => false, navigate: jest.fn() }),
}));

// Mock do lucide-react-native
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

// Redefinir View localmente para uso nos mocks (hoisted)
const MockView = require('react-native').View;

// Mock dos componentes como host components strings com testID
jest.mock('../../../../shared/components/ui/ScreenContainer', () => (props) => <MockView {...props} />);
jest.mock('../../../../shared/components/states/LoadingState', () => (props) => <MockView testID="loading-state" {...props} />);
jest.mock('../../../../shared/components/states/ErrorState', () => (props) => <MockView testID="error-state" {...props} />);
jest.mock('../../../../shared/components/states/EmptyState', () => (props) => <MockView testID="empty-state" {...props} />);
jest.mock('../../../dose/components/DoseRegisterModal', () => (props) => <MockView testID="dose-modal" {...props} />);
jest.mock('@dose/components/BulkDoseRegisterModal', () => (props) => <MockView testID="bulk-dose-modal" {...props} />);
jest.mock('../../components/AdherenceDayCard', () => (props) => <MockView testID="adherence-card" {...props} />);
jest.mock('../../components/TimeBlockSeparator', () => (props) => <MockView testID="time-separator" {...props} />);
jest.mock('../../components/DoseTimelineCard', () => (props) => <MockView testID="dose-card" {...props} />);
jest.mock('../../components/HeroDoseCard', () => (props) => <MockView testID="hero-card" {...props} />);
// 090 D-3: dose pendente de cold start lento — o Hoje a injeta nos próprios params ao montar.
let mockPending: unknown = null
jest.mock('@navigation/navigateToDose', () => ({
  subscribePendingDose: (fn: (p: unknown) => void) => {
    const p = mockPending; mockPending = null
    if (p) fn(p)
    return () => {}
  },
}))

// 125 fatia 2: estado do setup controlado pelo teste; o slot vira um marcador de posição.
let mockSetupCard: any = null
jest.mock('@dashboard/hooks/useTodaySetup', () => ({
  useTodaySetup: () => ({ card: mockSetupCard, protocol: null, medicine: null, scheduleConfirmed: false, entries: [], confirmCoherence: jest.fn(), confirmSchedule: jest.fn() }),
}))
jest.mock('../../components/TodaySetupSlot', () => (props: any) => (props.setup.card ? <MockView testID="setup-slot" /> : null))

// 125 (promo na vaga livre do wedge): nudge controlado pelo teste.
let mockNudge: any = null
jest.mock('@profile/hooks/useNudges', () => ({
  useNudges: () => ({ nudge: mockNudge, handleAction: jest.fn(), dismiss: jest.fn(), refresh: jest.fn() }),
}))
jest.mock('@shared/components/ui/NudgeBanner', () => () => <MockView testID="nudge-banner" />)

// 090 D-5: o banner lê a aba Estoque. Controle de estoque LIGADO para o banner montar.
const mockStockRefresh = jest.fn()
let mockStockActive: unknown[] = []
jest.mock('@stock/hooks/useStock', () => ({
  useStock: () => ({ data: { active: mockStockActive }, refresh: mockStockRefresh }),
}))
jest.mock('@shared/hooks/useStockTracking', () => ({ useStockTracking: () => ({ enabled: true }) }))
// 120 C: o alerta de estoque é escolhido pelo árbitro e renderizado pelo TodayAlertCard (moldura única).
jest.mock('../../components/TodayAlertCard', () => (props) => <MockView testID="today-alert" {...props} />);
jest.mock('@shared/components/feedback/Toast', () => ({ useToast: () => ({ show: jest.fn() }) }));
// 121 A: o módulo é REAL (classificador e estado persistido também — PO-1 boundary); só o repo de
// medidas (rede) é mockado.
const mockWeights: any[] = []
jest.mock('@measures/services/measuresRepo', () => ({
  measuresRepo: {
    list: jest.fn(async () => mockWeights),
    getLatest: jest.fn(async () => mockWeights[0] ?? null),
    create: jest.fn(async (r: any) => r),
  },
}))
jest.mock('../../../../shared/components/feedback/StaleBanner', () => (props) => <MockView testID="stale-banner" {...props} />);

describe('TodayScreen', () => {
  const mockRefresh = jest.fn();
  const baseMockData = {
    protocols: [],
    medicines: {},
    stats: { expected: 0, taken: 0, score: 0 },
    zones: { late: [], now: [], upcoming: [], done: [] },
    stockAlerts: [],
    timeline: [],
    user: { name: 'Test User' }
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading state when loading is true and no data', () => {
    jest.mocked(useTodayData).mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refresh: mockRefresh,
    } as any);

    const { getByTestId } = render(<TodayScreen route={{} as any} navigation={{} as any} />);
    expect(getByTestId('loading-state')).toBeTruthy();
  });

  it('renders summary and doses when data is present', () => {
    jest.mocked(useTodayData).mockReturnValue({
      data: {
        ...baseMockData,
        protocols: [{ id: '1', name: 'Protocol A', medicine_id: 'm1' }],
        medicines: { 'm1': { name: 'Med A' } },
        timeline: [{ id: 'd1', scheduledTime: '08:00', timelineStatus: 'PROXIMA' }]
      },
      loading: false,
      error: null,
      refresh: mockRefresh,
    } as any);

    const { getByTestId, queryByTestId } = render(<TodayScreen route={{} as any} navigation={{} as any} />);
    
    expect(queryByTestId('loading-state')).toBeNull();
    expect(getByTestId('adherence-card')).toBeTruthy();
    expect(getByTestId('hero-card')).toBeTruthy();
  });

  it('renders error state when error is present', () => {
    jest.mocked(useTodayData).mockReturnValue({
      data: null,
      loading: false,
      error: new Error('Failed to fetch'),
      refresh: mockRefresh,
    } as any);

    const { getByTestId } = render(<TodayScreen route={{} as any} navigation={{} as any} />);
    expect(getByTestId('error-state')).toBeTruthy();
  });

  it('renders empty state when there are no protocols', () => {
    jest.mocked(useTodayData).mockReturnValue({
      data: { ...baseMockData, protocols: [] },
      loading: false,
      error: null,
      refresh: mockRefresh,
    } as any);

    const { getByTestId } = render(<TodayScreen route={{} as any} navigation={{} as any} />);
    expect(getByTestId('empty-state')).toBeTruthy();
  });

  // 086 RC2 D-13 / PO-12: quem TEM tratamento nunca vê "Comece seu primeiro tratamento".
  it('sem nenhum tratamento (nem agendado) ⇒ estado de primeiro uso', () => {
    jest.mocked(useTodayData).mockReturnValue({
      data: { ...baseMockData, protocols: [], scheduledProtocols: [] },
      loading: false, error: null, refresh: mockRefresh,
    } as any);
    const { getByTestId } = render(<TodayScreen route={{} as any} navigation={{} as any} />);
    expect(getByTestId('empty-state').props.title).toBe('Comece seu primeiro tratamento');
  });

  it('só tratamento agendado (começa no futuro) ⇒ "Nenhuma dose hoje" + próxima dose, sem CTA de criar', () => {
    jest.mocked(useTodayData).mockReturnValue({
      data: {
        ...baseMockData,
        protocols: [],
        scheduledProtocols: [{
          id: 'p9', name: 'Mesigyna', active: true, frequency: 'intervalo_dias', interval_days: 30,
          time_schedule: ['16:00'], start_date: '2031-10-10', end_date: null, // > 400 dias: horizonte calculado
        }],
      },
      loading: false, error: null, refresh: mockRefresh,
    } as any);
    const { getByTestId } = render(<TodayScreen route={{} as any} navigation={{} as any} />);
    const empty = getByTestId('empty-state');
    expect(empty.props.title).toBe('Nenhuma dose hoje');
    expect(empty.props.message).toMatch(/^Próxima dose: .+ às 16:00 · Mesigyna$/);
    expect(empty.props.action.label).toBe('Ver tratamentos');
  });

  it('tratamento em curso sem dose hoje (cadência esparsa) ⇒ "Nenhuma dose hoje"', () => {
    jest.mocked(useTodayData).mockReturnValue({
      data: { ...baseMockData, protocols: [{ id: '1', name: 'A', medicine_id: 'm1' }], scheduledProtocols: [], timeline: [] },
      loading: false, error: null, refresh: mockRefresh,
    } as any);
    const { getByTestId } = render(<TodayScreen route={{} as any} navigation={{} as any} />);
    expect(getByTestId('empty-state').props.title).toBe('Nenhuma dose hoje');
  });

  // 069 A2 (smoke 02/10): o passo 2 da dose grava peso — fechar o sheet tem de recarregar as medidas
  // da agenda, não só as doses (antes só o foco da tela e o speed-dial recarregavam).
  describe('registro de dose recarrega a agenda E as medidas do dia (069 A2)', () => {
    const withData = () => jest.mocked(useTodayData).mockReturnValue({
      data: { ...baseMockData, protocols: [{ id: 'p1', medicine_id: 'm1' }], medicines: { m1: { name: 'Med' } },
        timeline: [{ id: 'd1', scheduledTime: '08:00', timelineStatus: 'PROXIMA' }] },
      loading: false, error: null, refresh: mockRefresh,
    } as any)

    it('dose única: onSuccess chama refresh e refresh das medidas', () => {
      withData()
      const { getByTestId } = render(<TodayScreen route={{} as any} navigation={{ setParams: jest.fn() } as any} />)
      mockRefresh.mockClear(); mockRefreshMeasures.mockClear()
      act(() => { getByTestId('dose-modal').props.onSuccess() })
      expect(mockRefresh).toHaveBeenCalledTimes(1)
      expect(mockRefreshMeasures).toHaveBeenCalledTimes(1)
    })

    it('lote: onSuccess chama refresh e refresh das medidas', () => {
      withData()
      const { getByTestId } = render(<TodayScreen route={{} as any} navigation={{ setParams: jest.fn() } as any} />)
      mockRefresh.mockClear(); mockRefreshMeasures.mockClear()
      act(() => { getByTestId('bulk-dose-modal').props.onSuccess({ successCount: 2 }) })
      expect(mockRefresh).toHaveBeenCalledTimes(1)
      expect(mockRefreshMeasures).toHaveBeenCalledTimes(1)
    })
  })

  // 065 AD-8: modal aberta por DEEPLINK (lembrete) → entryPoint 'reminder'; aberta pelo card → null.
  describe('entry_point reminder (065 AD-8)', () => {
    const withProtocol = () => jest.mocked(useTodayData).mockReturnValue({
      data: {
        ...baseMockData,
        protocols: [{ id: 'p1', medicine_id: 'm1' }],
        medicines: { m1: { name: 'Med' } },
        timeline: [{ id: 'd1', scheduledTime: '08:00', timelineStatus: 'PROXIMA' }],
      },
      loading: false, error: null, refresh: mockRefresh,
    } as any)
    const nav = { setParams: jest.fn() } as any

    it('deeplink bulk-plan → BulkDoseRegisterModal recebe entryPoint reminder', async () => {
      withProtocol()
      const { getByTestId } = render(
        <TodayScreen route={{ params: { screen: 'bulk-plan', planId: 'plan-1', at: '08:00' } } as any} navigation={nav} />
      )
      await waitFor(() => expect(getByTestId('bulk-dose-modal').props.entryPoint).toBe('reminder'))
    })

    it('deeplink dose-individual → reminder; depois, aberta pelo card → entryPoint zerado', async () => {
      withProtocol()
      const { getByTestId, getAllByTestId } = render(
        <TodayScreen route={{ params: { screen: 'dose-individual', protocolId: 'p1', at: '08:00' } } as any} navigation={nav} />
      )
      await waitFor(() => expect(getByTestId('dose-modal').props.entryPoint).toBe('reminder'))
      act(() => { getAllByTestId('dose-card')[0].props.onRegister({ id: 'p1', medicine_id: 'm1' }, '08:00') })
      expect(getByTestId('dose-modal').props.entryPoint).toBeNull()
    })

    // 090 C1.5 G-1 (PO-5): push tocado com o app fechado — o deeplink chega com os tratamentos
    // ainda carregando. Resolver cedo não acha o protocolo e o setParams apagava o pedido.
    // R-073: o efeito resolve num `setTimeout(0)` — fake timers drenam o timer de forma determinística
    // (a espera real de 10 ms dentro do `act` violava a R-070; achado RC6 #844).
    it('dose-individual no cold start: espera a carga e abre a modal quando o protocolo chega', () => {
      jest.useFakeTimers()
      try {
        const coldNav = { setParams: jest.fn() } as any
        jest.mocked(useTodayData).mockReturnValue({
          data: { ...baseMockData, protocols: [], medicines: {}, timeline: [] },
          loading: true, error: null, refresh: mockRefresh,
        } as any)
        const route = { params: { screen: 'dose-individual', protocolId: 'p1', at: '08:00' } } as any
        const { rerender, getByTestId } = render(<TodayScreen route={route} navigation={coldNav} />)
        act(() => { jest.runOnlyPendingTimers() })
        expect(coldNav.setParams).not.toHaveBeenCalled()

        withProtocol()
        rerender(<TodayScreen route={route} navigation={coldNav} />)
        act(() => { jest.runOnlyPendingTimers() })
        expect(getByTestId('dose-modal').props.entryPoint).toBe('reminder')
        expect(coldNav.setParams).toHaveBeenCalled()
      } finally {
        jest.useRealTimers()
      }
    })

    it('dose-individual de protocolo inexistente após a carga: limpa sem modal', async () => {
      const goneNav = { setParams: jest.fn() } as any
      withProtocol()
      const { queryByTestId } = render(
        <TodayScreen route={{ params: { screen: 'dose-individual', protocolId: 'apagado', at: '08:00' } } as any} navigation={goneNav} />
      )
      await waitFor(() => expect(goneNav.setParams).toHaveBeenCalled())
      expect(queryByTestId('dose-modal')?.props.entryPoint ?? null).toBeNull()
    })

    it('sem deeplink → nenhuma modal com reminder', () => {
      withProtocol()
      const { getByTestId } = render(<TodayScreen route={{} as any} navigation={nav} />)
      expect(getByTestId('bulk-dose-modal').props.entryPoint).toBeNull()
    })
  })

  it('renders stale banner when data is stale', () => {
    jest.mocked(useTodayData).mockReturnValue({
      data: { ...baseMockData, protocols: [{ id: '1' }] },
      loading: false,
      error: null,
      stale: true,
      refresh: mockRefresh,
    } as any);

    const { getByTestId } = render(<TodayScreen route={{} as any} navigation={{} as any} />);
    expect(getByTestId('stale-banner')).toBeTruthy();
  });

  // 090 D-5 (smoke 28/09): registrar dose recarrega o Hoje (novo capturedAt); o banner tem de
  // reler o estoque, senão fica com os dias do 1º render.
  describe('banner de estoque (090 D-5)', () => {
    afterEach(() => {
      jest.clearAllMocks()
      jest.clearAllTimers()
      mockStockActive = []
    })

    const today = (capturedAt: string) => jest.mocked(useTodayData).mockReturnValue({
      data: { ...baseMockData, capturedAt }, loading: false, error: null, refresh: mockRefresh,
    } as any)

    it('alerta sai dos itens da aba Estoque (id + dias em inteiro) e é UM só (120 C)', () => {
      mockStockActive = [{ id: 'm1', name: 'Selozok', daysRemaining: 6.5 }, { id: 'm2', name: 'Farto', daysRemaining: 40 }]
      today('2026-09-28T22:00:00.000Z')
      const { getAllByTestId } = render(<TodayScreen route={{ params: {} } as any} navigation={{ setParams: jest.fn() } as any} />)
      const alerts = getAllByTestId('today-alert')
      expect(alerts).toHaveLength(1)
      expect(alerts[0].props.payload.item).toEqual(expect.objectContaining({ medicineId: 'm1', medicineName: 'Selozok', daysRemaining: 6 }))
      expect(alerts[0].props.payload.level).toBe('stock_low')
    })

    it('dois remédios em alerta ⇒ ainda 1 alerta, o de menos dias (E-3)', () => {
      mockStockActive = [{ id: 'm1', name: 'Selozok', daysRemaining: 6.5 }, { id: 'm2', name: 'Farto', daysRemaining: 4 }]
      today('2026-09-28T22:00:00.000Z')
      const { getAllByTestId } = render(<TodayScreen route={{ params: {} } as any} navigation={{ setParams: jest.fn() } as any} />)
      const alerts = getAllByTestId('today-alert')
      expect(alerts).toHaveLength(1)
      expect(alerts[0].props.payload.item.medicineId).toBe('m2')
    })

    it('nova carga do Hoje (ex.: dose registrada) relê o estoque; a 1ª montagem não', () => {
      today('2026-09-28T22:00:00.000Z')
      const nav = { setParams: jest.fn() } as any
      const { rerender } = render(<TodayScreen route={{ params: {} } as any} navigation={nav} />)
      expect(mockStockRefresh).not.toHaveBeenCalled()
      today('2026-09-28T22:20:30.000Z')
      rerender(<TodayScreen route={{ params: {} } as any} navigation={nav} />)
      expect(mockStockRefresh).toHaveBeenCalledWith(true)
    })
  })

  describe('dose entregue pelo canal (090 PO-5)', () => {
    afterEach(() => {
      jest.clearAllMocks()
      jest.clearAllTimers()
      mockPending = null
    })

    // Smoke 28/09 21:11 (cold start real): a dose era entregue e virava `setParams`, mas o navegador de
    // abas ainda sem estado DESCARTAVA o setParams — route.params seguia undefined, Hoje sem modal.
    // Aqui o setParams é um no-op (como no aparelho): a modal só abre se a dose não depender dele.
    it('cold start: dose entregue ao montar abre a modal mesmo com o setParams descartado', async () => {
      mockPending = { screen: 'dose-individual', protocolId: 'p1', at: '20:10' }
      jest.mocked(useTodayData).mockReturnValue({
        data: { ...baseMockData, protocols: [], medicines: {}, timeline: [] },
        loading: true, error: null, refresh: mockRefresh,
      } as any)
      const nav = { setParams: jest.fn() } as any
      const route = { params: {} } as any
      const { rerender, getByTestId } = render(<TodayScreen route={route} navigation={nav} />)
      jest.mocked(useTodayData).mockReturnValue({
        data: { ...baseMockData, protocols: [{ id: 'p1', medicine_id: 'm1' }], medicines: { m1: { name: 'Med' } }, timeline: [] },
        loading: false, error: null, refresh: mockRefresh,
      } as any)
      rerender(<TodayScreen route={route} navigation={nav} />)
      await waitFor(() => expect(getByTestId('dose-modal').props.entryPoint).toBe('reminder'))
    })

    it('sem dose no canal não mexe nos params', () => {
      mockPending = null
      jest.mocked(useTodayData).mockReturnValue({ data: baseMockData, loading: true, error: null, refresh: mockRefresh } as any)
      const nav = { setParams: jest.fn() } as any
      const { queryByTestId } = render(<TodayScreen route={{ params: {} } as any} navigation={nav} />)
      expect(nav.setParams).not.toHaveBeenCalled()
      expect(queryByTestId('dose-modal')?.props.entryPoint ?? null).toBeNull()
    })
  })

  // 120 C · US9 cenário 1 / FR-013 — bloco de doses.
  describe('bloco de doses (120 C)', () => {
    const unlogged = { id: 'd1', instanceId: 'i1', scheduledTime: '08:00', scheduledFor: '2026-11-14T11:00:00Z', timelineStatus: 'SEM_REGISTRO', medicineName: 'Glifage', protocol: { id: 'p1' } }
    const withTimeline = (timeline: any[]) => jest.mocked(useTodayData).mockReturnValue({
      data: { ...baseMockData, protocols: [{ id: 'p1', name: 'P', medicine_id: 'm1' }], timeline }, loading: false, error: null, refresh: mockRefresh,
    } as any)

    it('sem hero + dose sem registro ⇒ card "sem registro" no bloco', () => {
      withTimeline([unlogged])
      const { getByTestId, queryByTestId } = render(<TodayScreen route={{ params: {} } as any} navigation={{ setParams: jest.fn() } as any} />)
      expect(queryByTestId('hero-card')).toBeNull()
      expect(getByTestId('unlogged-doses-card')).toBeTruthy()
    })

    it('com hero ⇒ sem card "sem registro" (o hero é a ação do momento)', () => {
      withTimeline([unlogged, { id: 'd2', instanceId: 'i2', scheduledTime: '21:00', scheduledFor: '2026-11-15T00:00:00Z', timelineStatus: 'PROXIMA', protocol: { id: 'p1' } }])
      const { getByTestId, queryByTestId } = render(<TodayScreen route={{ params: {} } as any} navigation={{ setParams: jest.fn() } as any} />)
      expect(getByTestId('hero-card')).toBeTruthy()
      expect(queryByTestId('unlogged-doses-card')).toBeNull()
    })
  })

  // ── 121 A · PO-1 / PO-5 / PO-6: composição por perfil ─────────────────────────────────────────
  describe('121 A — perfil wedge/misto', () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage')
    const med = (name: string, code: string | null) => ({ name, therapeutic_class_code: code })
    const proto = (id: string, m: any, start = '2026-10-01') => ({ id, name: id, medicine_id: `m-${id}`, start_date: start, medicine: m })
    const WEDGE = [proto('p1', med('Mounjaro', 'A10S1'))]
    const MISTO = [proto('p1', med('Mounjaro', 'A10S1')), proto('p2', med('Losartana', 'C9C'))]
    const NENHUM = [proto('p2', med('Losartana', 'C9C'))]
    const DOSE_NOW = [{ id: 'd1', scheduledTime: '08:00', timelineStatus: 'PROXIMA' }]

    function setData(protocols: any[], timeline: any[] = []) {
      jest.mocked(useTodayData).mockReturnValue({
        data: { ...baseMockData, user: { id: 'u1', name: 'T' }, timezone: 'America/Sao_Paulo', protocols, timeline },
        loading: false, error: null, refresh: mockRefresh,
      } as any)
    }

    // Ordem real na árvore (testIDs em pré-ordem).
    function order(json: any, ids: string[]): string[] {
      const out: string[] = []
      const walk = (n: any) => {
        if (!n || typeof n !== 'object') return
        if (Array.isArray(n)) return n.forEach(walk)
        if (ids.includes(n.props?.testID) && !out.includes(n.props.testID)) out.push(n.props.testID)
        walk(n.children)
      }
      walk(json)
      return out
    }

    beforeEach(async () => {
      mockWeights.length = 0
      await AsyncStorage.clear()
    })

    it('PO-1: wedge sem dose ⇒ módulo com Peso ABERTA no lugar de "Nenhuma dose hoje"; sem adesão', async () => {
      setData(WEDGE)
      const s = render(<TodayScreen route={{} as any} navigation={{} as any} />)
      expect(s.getByTestId('treatment-week-module')).toBeTruthy()
      await waitFor(() => expect(s.getByTestId('weight-row-body')).toBeTruthy())
      expect(s.getByText('SEMANA DO TRATAMENTO')).toBeTruthy()
      expect(s.getByText('Mounjaro')).toBeTruthy()
      expect(s.queryByTestId('empty-state')).toBeNull()
      expect(s.queryByText('Agenda de Hoje')).toBeNull()
      expect(s.queryByTestId('adherence-card')).toBeNull()
      expect(s.queryByText('Última medida')).toBeNull()
    })

    it('PO-6 + G-A2: wedge com dose agora ⇒ hero antes do módulo; Agenda fica (correção do dia)', async () => {
      setData(WEDGE, DOSE_NOW)
      const s = render(<TodayScreen route={{} as any} navigation={{} as any} />)
      expect(order(s.toJSON(), ['hero-card', 'treatment-week-module'])).toEqual(['hero-card', 'treatment-week-module'])
      expect(s.getByText('Agenda de Hoje')).toBeTruthy()
      expect(s.queryByTestId('adherence-card')).toBeNull()
      // módulo não repete a ação de dose (AC-8)
      expect(s.queryByText(/Já apliquei|Registrar dose/)).toBeNull()
      await waitFor(() => expect(s.getByTestId('weight-row-body')).toBeTruthy())
    })

    it('PO-5: misto ⇒ módulo FECHADO + adesão + Agenda', async () => {
      setData(MISTO, DOSE_NOW)
      const s = render(<TodayScreen route={{} as any} navigation={{} as any} />)
      expect(s.getByTestId('treatment-week-module')).toBeTruthy()
      expect(s.getByTestId('adherence-card')).toBeTruthy()
      expect(s.getByText('Agenda de Hoje')).toBeTruthy()
      await act(async () => {})
      expect(s.queryByTestId('weight-row-body')).toBeNull()
      expect(order(s.toJSON(), ['adherence-card', 'hero-card', 'treatment-week-module'])).toEqual(['adherence-card', 'hero-card', 'treatment-week-module'])
    })

    it('PO-5 / INV-4: sem wedge ⇒ sem módulo, Hoje de sempre', () => {
      setData(NENHUM)
      const s = render(<TodayScreen route={{} as any} navigation={{} as any} />)
      expect(s.queryByTestId('treatment-week-module')).toBeNull()
      expect(s.getByTestId('adherence-card')).toBeTruthy()
      expect(s.getByTestId('empty-state').props.title).toBe('Nenhuma dose hoje')
    })

    it('PO-5: medicamento sem código de classe ⇒ tratado como sem wedge (falha para a Hoje de sempre)', () => {
      setData([proto('p1', med('Sem código', null))])
      const s = render(<TodayScreen route={{} as any} navigation={{} as any} />)
      expect(s.queryByTestId('treatment-week-module')).toBeNull()
    })
  })

  // ── 125 fatia 2 · PO-125-16: superfície SETUP ─────────────────────────────────────────────────
  describe('125 — superfície SETUP (PO-125-16)', () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage')
    const HERO = [{ id: 'd1', scheduledTime: '08:00', timelineStatus: 'PROXIMA' }]
    const WEDGE = [{ id: 'p1', name: 'p1', medicine_id: 'm-p1', start_date: '2026-10-01', medicine: { name: 'Mounjaro', therapeutic_class_code: 'A10S1' } }]
    function setData(timeline: any[] = [], protocols: any[] = WEDGE) {
      jest.mocked(useTodayData).mockReturnValue({
        data: { ...baseMockData, user: { id: 'u1', name: 'T' }, timezone: 'America/Sao_Paulo', capturedAt: '2026-11-19T12:00:00.000Z', protocols, timeline },
        loading: false, error: null, refresh: mockRefresh,
      } as any)
    }
    function order(json: any, ids: string[]): string[] {
      const out: string[] = []
      const walk = (n: any) => {
        if (!n || typeof n !== 'object') return
        if (Array.isArray(n)) return n.forEach(walk)
        if (ids.includes(n.props?.testID) && !out.includes(n.props.testID)) out.push(n.props.testID)
        walk(n.children)
      }
      walk(json)
      return out
    }
    const IDS = ['adherence-card', 'hero-card', 'today-alert', 'setup-slot', 'treatment-week-module']

    beforeEach(async () => {
      mockWeights.length = 0
      await AsyncStorage.clear()
    })
    afterEach(() => {
      mockSetupCard = null
      mockStockActive = []
      mockNudge = null
    })

    it('emenda PO 20/11: estoque baixo (7) × Cadastrado (6) ABAIXO da Semana do tratamento, Cadastrado primeiro', async () => {
      mockSetupCard = { kind: 'cadastrado', protocolId: 'p1' }
      mockStockActive = [{ id: 'm1', name: 'Selozok', daysRemaining: 6.5 }]
      setData()
      const s = render(<TodayScreen route={{ params: {} } as any} navigation={{ setParams: jest.fn() } as any} />)
      await act(async () => {})
      // Wedge sem dose hoje ⇒ sem Agenda ⇒ cabem os dois abaixo do widget.
      expect(order(s.toJSON(), IDS)).toEqual(['treatment-week-module', 'setup-slot', 'today-alert'])
    })

    it('Confira (3) fica ACIMA da Semana do tratamento; com hero, a dose vem antes', async () => {
      mockSetupCard = { kind: 'confira', protocolId: 'p1', verdict: {} }
      mockStockActive = [{ id: 'm1', name: 'Selozok', daysRemaining: 6.5 }]
      setData(HERO)
      const s = render(<TodayScreen route={{ params: {} } as any} navigation={{ setParams: jest.fn() } as any} />)
      await act(async () => {})
      expect(order(s.toJSON(), IDS)).toEqual(['hero-card', 'setup-slot', 'treatment-week-module'])
      expect(s.queryByTestId('today-alert')).toBeNull()
    })

    it('sem setup, o alerta abaixo do widget (degrau 7) e sem promo junto', async () => {
      mockStockActive = [{ id: 'm1', name: 'Selozok', daysRemaining: 6.5 }]
      setData()
      const s = render(<TodayScreen route={{ params: {} } as any} navigation={{ setParams: jest.fn() } as any} />)
      await act(async () => {})
      expect(order(s.toJSON(), IDS)).toEqual(['treatment-week-module', 'today-alert'])
    })

    it('wedge sem Agenda de Hoje: até 2 cards abaixo do widget (Falta 5 → estoque baixo 7)', async () => {
      mockSetupCard = { kind: 'falta', medicineId: 'm9' }
      mockStockActive = [{ id: 'm1', name: 'Selozok', daysRemaining: 6.5 }]
      setData()
      const s = render(<TodayScreen route={{ params: {} } as any} navigation={{ setParams: jest.fn() } as any} />)
      await act(async () => {})
      expect(s.queryByText('Agenda de Hoje')).toBeNull()
      expect(order(s.toJSON(), IDS)).toEqual(['treatment-week-module', 'setup-slot', 'today-alert'])
    })

    it('wedge COM dose hoje (Agenda visível) volta ao orçamento de 1', async () => {
      mockSetupCard = { kind: 'falta', medicineId: 'm9' }
      mockStockActive = [{ id: 'm1', name: 'Selozok', daysRemaining: 6.5 }]
      setData(HERO)
      const s = render(<TodayScreen route={{ params: {} } as any} navigation={{ setParams: jest.fn() } as any} />)
      await act(async () => {})
      expect(s.getByText('Agenda de Hoje')).toBeTruthy()
      expect(order(s.toJSON(), IDS)).toEqual(['hero-card', 'treatment-week-module', 'setup-slot'])
    })

    it('wedge sem Agenda: Confira acima + estoque baixo abaixo ⇒ promo ocupa a vaga livre de baixo', async () => {
      mockSetupCard = { kind: 'confira', protocolId: 'p1', verdict: {} }
      mockStockActive = [{ id: 'm1', name: 'Selozok', daysRemaining: 6.5 }]
      mockNudge = { id: 'n1' }
      setData()
      const s = render(<TodayScreen route={{ params: {} } as any} navigation={{ setParams: jest.fn() } as any} />)
      await act(async () => {})
      expect(order(s.toJSON(), [...IDS, 'nudge-banner'])).toEqual(['setup-slot', 'treatment-week-module', 'today-alert', 'nudge-banner'])
    })

    it('com Agenda (dose hoje) o promo não entra junto de card', async () => {
      mockSetupCard = { kind: 'confira', protocolId: 'p1', verdict: {} }
      mockNudge = { id: 'n1' }
      setData(HERO)
      const s = render(<TodayScreen route={{ params: {} } as any} navigation={{ setParams: jest.fn() } as any} />)
      await act(async () => {})
      expect(s.queryByTestId('nudge-banner')).toBeNull()
    })

    it('Adesão some enquanto há setup (AC6.7) e volta sem ele', async () => {
      const NENHUM = [{ id: 'p2', name: 'p2', medicine_id: 'm2', start_date: '2026-10-01', medicine: { name: 'Losartana', therapeutic_class_code: 'C9C' } }]
      mockSetupCard = { kind: 'falta', medicineId: 'm9' }
      setData(HERO, NENHUM)
      const s = render(<TodayScreen route={{ params: {} } as any} navigation={{ setParams: jest.fn() } as any} />)
      expect(s.queryByTestId('adherence-card')).toBeNull()
      expect(s.getByTestId('setup-slot')).toBeTruthy()
      mockSetupCard = null
      s.rerender(<TodayScreen route={{ params: {} } as any} navigation={{ setParams: jest.fn() } as any} />)
      expect(s.getByTestId('adherence-card')).toBeTruthy()
      expect(s.queryByTestId('setup-slot')).toBeNull()
    })
  })
});

