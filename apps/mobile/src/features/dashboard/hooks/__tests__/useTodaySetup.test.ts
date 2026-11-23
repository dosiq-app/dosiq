import { renderHook, act, waitFor } from '@testing-library/react-native'

const mockStore: Record<string, string> = {}
jest.mock('@platform/storage/nativeStorageAdapter', () => ({
  nativeStorageAdapter: {
    getItem: jest.fn((k: string) => Promise.resolve(mockStore[k] ?? null)),
    setItem: jest.fn((k: string, v: string) => { mockStore[k] = v; return Promise.resolve() }),
  },
}))
const mockStrengths = { current: { status: 'idle', strengths: null, byRegistration: null, reason: null } as any }
jest.mock('@shared/hooks/useCmedStrengths', () => ({ useCmedStrengths: jest.fn(() => mockStrengths.current) }))
jest.mock('@dashboard/services/dashboardService', () => ({ getRecentMedicines: jest.fn(() => Promise.resolve([])) }))
// 2a: base leve (Vincular) e dispensa da 119. Padrão: base pronta sem nada que case; nada dispensado.
const mockDatabase = { current: { items: [] as any[] | null, isReady: true, error: null } as any }
jest.mock('@shared/hooks/useMedicineDatabase', () => ({ useMedicineDatabase: jest.fn(() => mockDatabase.current) }))
const mockDismissed: Record<string, boolean> = {}
jest.mock('@medications/services/catalogLinkStore', () => ({
  isCatalogLinkDismissed: jest.fn((id: string) => Promise.resolve(!!mockDismissed[id])),
  dismissCatalogLink: jest.fn((id: string) => { mockDismissed[id] = true; return Promise.resolve() }),
}))

import { useTodaySetup, SETUP_VERDICT_TIMEOUT_MS } from '../useTodaySetup'
import { getRecentMedicines } from '@dashboard/services/dashboardService'
import { useCmedStrengths } from '@shared/hooks/useCmedStrengths'
import { useMedicineDatabase } from '@shared/hooks/useMedicineDatabase'
import { dismissCatalogLink } from '@medications/services/catalogLinkStore'
import { strengthEntriesFor } from '@dosiq/core'

const TODAY = '2026-11-19'
const iso = (d: string) => new Date(`${d}T12:00:00`).toISOString()
const mounjaro = { name: 'Mounjaro', presentation: 'injetavel', dosage_per_pill: 5, dosage_unit: 'mg/ml', concentration_volume_ml: 0.5, anvisa_registration: '112600202' }
const pill = { name: 'Losartana', presentation: 'comprimido', dosage_per_pill: 50, dosage_unit: 'mg', anvisa_registration: null }
const proto = (over: any = {}) => ({ id: 'p1', medicine_id: 'm1', medicine: mounjaro, frequency: 'semanal', weekdays: ['terça'], time_schedule: ['08:00'], dosage_per_intake: 1, intake_unit: 'mg', start_date: TODAY, created_at: iso(TODAY), ...over })
const data = (protocols: any[], extra: any = {}) => ({ protocols, scheduledProtocols: [], logs: [], localDay: TODAY, user: { id: 'u1' }, capturedAt: 'c1', ...extra })

// Sidecar pronto com Mounjaro 5..30 mg/ml, lv 0,5.
function readyStrengths() {
  const items = [[5, 10, 15, 20, 25, 30].map((d) => [d, 0, null, null, null, null, 0, 0.5, 0, 0])]
  // Tupla mínima: o lookup real é testado no core; aqui só o encadeamento importa.
  return { status: 'ready', strengths: { version: '1', medCount: 1, dict: { u: ['mg/ml'], ds: [], f: [], c: [], l: [], iu: [] }, items }, byRegistration: new Map([['112600202', 0]]), reason: null }
}

jest.mock('@dosiq/core', () => {
  const actual = jest.requireActual('@dosiq/core')
  return {
    ...actual,
    strengthEntriesFor: jest.fn(() => [5, 10, 15, 20, 25, 30].map((d) => ({ d, u: 'mg/ml', lv: 0.5, dd: [], amb: false }))),
  }
})

describe('useTodaySetup', () => {
  beforeEach(() => {
    for (const k of Object.keys(mockStore)) delete mockStore[k]
    mockStrengths.current = { status: 'idle', strengths: null, byRegistration: null, reason: null }
    mockDatabase.current = { items: [], isReady: true, error: null }
    for (const k of Object.keys(mockDismissed)) delete mockDismissed[k]
  })
  afterEach(() => { jest.clearAllMocks(); jest.useRealTimers() })

  it('tratamento sem registro de dose ⇒ "cadastrado"; some com log (AC6.1/AC6.5)', async () => {
    const p = proto({ medicine: pill, medicine_id: 'm2' })
    const { result, rerender } = renderHook(({ d }) => useTodaySetup({ data: d, stale: false }), { initialProps: { d: data([p]) } })
    await waitFor(() => expect(result.current.card).toEqual({ kind: 'cadastrado', protocolId: 'p1' }))
    rerender({ d: data([p], { logs: [{ protocol_id: 'p1' }], capturedAt: 'c2' }) })
    await waitFor(() => expect(result.current.card).toBeNull())
  })

  it('tratamento já na tela (widget/agenda) não ganha "cadastrado"; o próximo fora da tela ganha (PO 20/11)', async () => {
    const a = proto({ medicine: pill, medicine_id: 'm2' })
    const b = proto({ id: 'p2', medicine: pill, medicine_id: 'm3' })
    const { result } = renderHook(() => useTodaySetup({ data: data([a, b]), stale: false, onScreenProtocolIds: ['p1'] }))
    await waitFor(() => expect(result.current.card).toEqual({ kind: 'cadastrado', protocolId: 'p2' }))
  })

  it('tudo na tela ⇒ sem "cadastrado"; o Confira continua mesmo na tela', async () => {
    const r1 = renderHook(() => useTodaySetup({ data: data([proto({ medicine: pill, medicine_id: 'm2' })]), stale: false, onScreenProtocolIds: ['p1'] }))
    await waitFor(() => expect(getRecentMedicines).toHaveBeenCalled())
    await act(async () => {})
    expect(r1.result.current.card).toBeNull()
    mockStrengths.current = readyStrengths()
    const r2 = renderHook(() => useTodaySetup({ data: data([proto()]), stale: false, onScreenProtocolIds: ['p1'] }))
    await waitFor(() => expect(r2.result.current.card?.kind).toBe('confira'))
  })

  it('RC6 #971: releitura do storage não desfaz confirmação da sessão', async () => {
    const pillP = proto({ medicine: pill, medicine_id: 'm2' })
    const { result, rerender } = renderHook(({ d }) => useTodaySetup({ data: d, stale: false }), { initialProps: { d: data([pillP]) } })
    await waitFor(() => expect(result.current.card?.kind).toBe('cadastrado'))
    // storage falha na escrita (nada persiste) e a lista de chaves muda ⇒ releitura
    const { nativeStorageAdapter } = jest.requireMock('@platform/storage/nativeStorageAdapter')
    nativeStorageAdapter.setItem.mockImplementationOnce(() => Promise.reject(new Error('disk')))
    await act(async () => { await result.current.confirmSchedule() })
    expect(result.current.scheduleConfirmed).toBe(true)
    rerender({ d: data([pillP, proto({ id: 'p9', medicine: pill, medicine_id: 'm9', created_at: iso('2026-01-01') })]) })
    await act(async () => {})
    expect(result.current.scheduleConfirmed).toBe(true)
  })

  it('remédio do card leva o id do tratamento (o mapa da Hoje não traz id — smoke 20/11)', async () => {
    mockStrengths.current = readyStrengths()
    const { result } = renderHook(() => useTodaySetup({ data: data([proto()]), stale: false }))
    await waitFor(() => expect(result.current.card?.kind).toBe('confira'))
    expect(result.current.medicine).toMatchObject({ id: 'm1', name: 'Mounjaro' })
  })

  it('sidecar liga com qualquer remédio com registro (2a S-7; antes só injetável)', async () => {
    renderHook(() => useTodaySetup({ data: data([proto({ medicine: pill, medicine_id: 'm2' })]), stale: false }))
    expect(useCmedStrengths).toHaveBeenLastCalledWith({ enabled: false })
    renderHook(() => useTodaySetup({ data: data([proto({ medicine: { ...pill, anvisa_registration: '100' }, medicine_id: 'm2' })]), stale: false }))
    expect(useCmedStrengths).toHaveBeenLastCalledWith({ enabled: true })
  })

  it('espera o veredito: sem card enquanto carrega; Confira quando pronto (AC6.4e)', async () => {
    mockStrengths.current = { status: 'loading', strengths: null, byRegistration: null, reason: null }
    const { result, rerender } = renderHook(() => useTodaySetup({ data: data([proto()]), stale: false }))
    await waitFor(() => expect(getRecentMedicines).toHaveBeenCalled())
    expect(result.current.card).toBeNull()
    mockStrengths.current = readyStrengths()
    rerender({})
    await waitFor(() => expect(result.current.card).toMatchObject({ kind: 'confira', protocolId: 'p1' }))
    expect(result.current.entries).toHaveLength(6)
  })

  it('teto de 2 s: sidecar que não chega ⇒ escolhe sem Confira', async () => {
    jest.useFakeTimers()
    mockStrengths.current = { status: 'loading', strengths: null, byRegistration: null, reason: null }
    const { result } = renderHook(() => useTodaySetup({ data: data([proto()]), stale: false }))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(result.current.card).toBeNull()
    await act(async () => { jest.advanceTimersByTime(SETUP_VERDICT_TIMEOUT_MS) })
    await waitFor(() => expect(result.current.card).toEqual({ kind: 'cadastrado', protocolId: 'p1' }))
  })

  it('"Aplico X mesmo" grava a combinação e o Confira some (AC6.4a)', async () => {
    mockStrengths.current = readyStrengths()
    const { result } = renderHook(() => useTodaySetup({ data: data([proto()]), stale: false }))
    await waitFor(() => expect(result.current.card?.kind).toBe('confira'))
    await act(async () => { await result.current.confirmCoherence() })
    expect(Object.keys(mockStore)[0]).toMatch(/^dosiq:setup-confirmed:112600202\|5\|mg\/ml\|0\.5\|1\|mg$/)
    await waitFor(() => expect(result.current.card).toEqual({ kind: 'cadastrado', protocolId: 'p1' }))
  })

  it('"Sim" do dia/hora vale para a agenda; agenda nova salva também conta', async () => {
    const p = proto({ medicine: pill, medicine_id: 'm2' })
    const { result } = renderHook(() => useTodaySetup({ data: data([p]), stale: false }))
    await waitFor(() => expect(result.current.card).not.toBeNull())
    expect(result.current.scheduleConfirmed).toBe(false)
    await act(async () => { await result.current.confirmSchedule() })
    expect(result.current.scheduleConfirmed).toBe(true)
    await act(async () => { await result.current.confirmSchedule({ weekdays: ['sexta'] }) })
    expect(Object.keys(mockStore).some((k) => k.includes('|sexta|'))).toBe(true)
  })

  it('remédio novo sem NENHUM tratamento ⇒ "falta" (pausado não; campo ausente não); consulta falha ⇒ sem card', async () => {
    ;(getRecentMedicines as jest.Mock).mockResolvedValueOnce([
      { id: 'm8', name: 'Pausado', created_at: iso(TODAY), protocols: [{ id: 'px' }] },
      { id: 'm7', name: 'Sem campo', created_at: iso(TODAY) },
      { id: 'm9', name: 'Vitamina D', created_at: iso(TODAY), protocols: [] },
    ])
    const { result } = renderHook(() => useTodaySetup({ data: data([]), stale: false }))
    await waitFor(() => expect(result.current.card).toEqual({ kind: 'falta', medicineId: 'm9' }))
    expect(result.current.medicine?.name).toBe('Vitamina D')
    ;(getRecentMedicines as jest.Mock).mockRejectedValueOnce(new Error('rede'))
    const r2 = renderHook(() => useTodaySetup({ data: data([], { capturedAt: 'x' }), stale: false }))
    await act(async () => { await Promise.resolve() })
    expect(r2.result.current.card).toBeNull()
  })

  it('snapshot offline ⇒ nenhum card (falha fechada)', async () => {
    const { result } = renderHook(() => useTodaySetup({ data: data([proto({ medicine: pill })]), stale: true }))
    await act(async () => { await Promise.resolve() })
    expect(result.current.card).toBeNull()
    expect(getRecentMedicines).not.toHaveBeenCalled()
  })

  it('storage que lança ⇒ trata como não confirmado', async () => {
    const { nativeStorageAdapter } = jest.requireMock('@platform/storage/nativeStorageAdapter')
    nativeStorageAdapter.getItem.mockImplementationOnce(() => Promise.reject(new Error('io')))
    const { result } = renderHook(() => useTodaySetup({ data: data([proto({ medicine: pill, medicine_id: 'm2' })]), stale: false }))
    await waitFor(() => expect(result.current.card).toEqual({ kind: 'cadastrado', protocolId: 'p1' }))
  })

  describe('2a — Vincular e Corrigir forma', () => {
    const OLD = iso('2026-01-01')
    // Mapa real da Hoje: remédio SEM `id` (S-4 — fixture com id mascarou o 22P02 no #971).
    const tizerpatida = { name: 'Tizerpatida', presentation: 'comprimido', dosage_per_pill: 5, dosage_unit: 'mg', anvisa_registration: null, therapeutic_class_code: null, active_ingredient: null }
    const mounjaroItem = { name: 'Mounjaro', activeIngredient: 'Tirzepatida', forms: ['injetavel'] }
    const coded = (over: any) => ({ presentation: 'comprimido', dosage_per_pill: 1, dosage_unit: 'mg', therapeutic_class_code: 'A10S1', active_ingredient: null, ...over })
    const linkProto = proto({ id: 'p7', medicine_id: 'm7', medicine: tizerpatida, created_at: OLD, logs: [] })

    it('sem remédio sem código nem código sem registro ⇒ a base leve não carrega (C-2a-1)', async () => {
      renderHook(() => useTodaySetup({ data: data([proto({ medicine: coded({ name: 'Rybelsus', anvisa_registration: '117660037' }), medicine_id: 'm2', created_at: OLD })]), stale: false }))
      await act(async () => {})
      expect(useMedicineDatabase).toHaveBeenLastCalledWith({ enabled: false })
    })

    it('sem código + casa com a lista ⇒ Vincular (cadastro antigo, sem janela de 14 d); escrita pelo medicine_id', async () => {
      mockDatabase.current = { items: [mounjaroItem, { name: 'Losartana', activeIngredient: 'Losartana' }], isReady: true, error: null }
      const { result } = renderHook(() => useTodaySetup({ data: data([{ ...linkProto, medicine: { ...tizerpatida, name: 'Mounjaro caneta' } }]), stale: false }))
      await waitFor(() => expect(result.current.card).toEqual({ kind: 'vincular', medicineId: 'm7', protocolId: 'p7' }))
      expect(result.current.medicine).toMatchObject({ id: 'm7' })
      expect(result.current.linkMatches.map((i: any) => i.name)).toEqual(['Mounjaro'])
      expect(useMedicineDatabase).toHaveBeenLastCalledWith({ enabled: true })
    })

    it('vários casamentos ("Vitaminas") ⇒ sem card (só 1 casamento — PO 22/11, C-2a-11)', async () => {
      mockDatabase.current = { items: [{ name: 'Vitamina A' }, { name: 'Vitamina C' }], isReady: true, error: null }
      const { result } = renderHook(() => useTodaySetup({ data: data([{ ...linkProto, medicine: { ...tizerpatida, name: 'Vitamina' } }]), stale: false }))
      await waitFor(() => expect(getRecentMedicines).toHaveBeenCalled())
      await act(async () => {})
      expect(result.current.card).toBeNull()
    })

    it('código sem registro: forma da MARCA de mesmo nome na base leve (C-2a-10); genérico não julga', async () => {
      mockDatabase.current = {
        items: [
          { name: 'Ozempic', regulatoryCategory: 'Novo', forms: ['injetavel'] },
          { name: 'Budesonida', regulatoryCategory: 'Genérico', forms: ['liquido'] },
        ],
        isReady: true, error: null,
      }
      const oz = proto({ id: 'p3', medicine_id: 'm3', medicine: coded({ name: 'ozempic ' }), created_at: OLD })
      const r1 = renderHook(() => useTodaySetup({ data: data([oz]), stale: false }))
      // C-2a-16: código sem registro + marca exata ⇒ VINCULAR primeiro (absorve a forma)…
      await waitFor(() => expect(r1.result.current.card).toEqual({ kind: 'vincular', medicineId: 'm3', protocolId: 'p3' }))
      expect(r1.result.current.linkMatches.map((i: any) => i.name)).toEqual(['Ozempic'])
      expect(useMedicineDatabase).toHaveBeenLastCalledWith({ enabled: true })
      // …"Não é" ⇒ a divergência de forma volta a ter card.
      await act(async () => { await r1.result.current.dismissLink() })
      await waitFor(() => expect(r1.result.current.card).toEqual({ kind: 'forma', medicineId: 'm3', protocolId: 'p3', mismatch: { proposed: 'injetavel', reason: 'catalog' } }))
      const bud = proto({ id: 'p5', medicine_id: 'm5', medicine: coded({ name: 'Budesonida', presentation: 'spray' }), created_at: OLD })
      const r2 = renderHook(() => useTodaySetup({ data: data([bud]), stale: false }))
      await waitFor(() => expect(getRecentMedicines).toHaveBeenCalledTimes(2))
      await act(async () => {})
      expect(r2.result.current.card).toBeNull()
    })

    it('código sem registro + marca exata com forma CERTA ⇒ nenhum card (C-2a-16: sem "Rivotril é o Rivotril?")', async () => {
      mockDatabase.current = { items: [{ name: 'Ozempic', regulatoryCategory: 'Novo', forms: ['injetavel'] }], isReady: true, error: null }
      const oz = proto({ id: 'p3', medicine_id: 'm3', medicine: coded({ name: 'Ozempic', presentation: 'injetavel' }), created_at: OLD })
      const { result } = renderHook(() => useTodaySetup({ data: data([oz]), stale: false }))
      await waitFor(() => expect(getRecentMedicines).toHaveBeenCalled())
      await act(async () => {})
      expect(result.current.card).toBeNull()
    })

    it('nome sem par (Retratutida) ⇒ nenhum card de vínculo (AC8.6)', async () => {
      mockDatabase.current = { items: [mounjaroItem], isReady: true, error: null }
      const { result } = renderHook(() => useTodaySetup({ data: data([{ ...linkProto, medicine: { ...tizerpatida, name: 'Retratutida' } }]), stale: false }))
      await waitFor(() => expect(getRecentMedicines).toHaveBeenCalled())
      await act(async () => {})
      expect(result.current.card).toBeNull()
    })

    it('"Não é" ⇒ dispensa na loja da 119 e o card sai na hora; dispensado não volta', async () => {
      mockDatabase.current = { items: [mounjaroItem], isReady: true, error: null }
      const d = data([{ ...linkProto, medicine: { ...tizerpatida, name: 'Mounjaro caneta' } }])
      const { result } = renderHook(() => useTodaySetup({ data: d, stale: false }))
      await waitFor(() => expect(result.current.card?.kind).toBe('vincular'))
      await act(async () => { await result.current.dismissLink() })
      expect(dismissCatalogLink).toHaveBeenCalledWith('m7')
      expect(result.current.card).toBeNull()
      const again = renderHook(() => useTodaySetup({ data: d, stale: false }))
      await waitFor(() => expect(getRecentMedicines).toHaveBeenCalledTimes(2))
      await act(async () => {})
      expect(again.result.current.card).toBeNull()
    })

    it('base leve ainda carregando ⇒ espera (sem card); teto de 2 s ⇒ escolhe sem Vincular', async () => {
      jest.useFakeTimers()
      mockDatabase.current = { items: null, isReady: false, error: null }
      const { result } = renderHook(() => useTodaySetup({ data: data([{ ...linkProto, created_at: iso(TODAY) }]), stale: false }))
      await act(async () => { await Promise.resolve(); await Promise.resolve() })
      expect(result.current.card).toBeNull()
      await act(async () => { jest.advanceTimersByTime(SETUP_VERDICT_TIMEOUT_MS) })
      await waitFor(() => expect(result.current.card).toEqual({ kind: 'cadastrado', protocolId: 'p7' }))
    })

    it('Ozempic comprimido com registro só injetável ⇒ Corrigir forma; "Está certo" grava a dispensa e o card sai', async () => {
      mockStrengths.current = readyStrengths()
      ;(strengthEntriesFor as jest.Mock).mockReturnValue([{ d: 1.34, u: 'mg/ml', f: 'injetavel', lv: null, dd: [], amb: false }])
      const p = proto({ id: 'p8', medicine_id: 'm8', medicine: coded({ name: 'Ozempic', anvisa_registration: '117660036' }), created_at: OLD, intake_unit: null })
      const { result } = renderHook(() => useTodaySetup({ data: data([p]), stale: false }))
      await waitFor(() => expect(result.current.card).toEqual({ kind: 'forma', medicineId: 'm8', protocolId: 'p8', mismatch: { proposed: 'injetavel', reason: 'catalog' } }))
      await act(async () => { await result.current.confirmForm() })
      expect(mockStore['dosiq:form-mismatch-dismissed:m8']).toBe('1')
      expect(result.current.card).toBeNull()
    })

    it('genérico com código sem registro (Budesonida spray) ⇒ sem card; pista no nome com código ⇒ Corrigir forma (name)', async () => {
      const bud = proto({ id: 'p5', medicine_id: 'm5', medicine: coded({ name: 'Budesonida', presentation: 'spray' }), created_at: OLD })
      const r1 = renderHook(() => useTodaySetup({ data: data([bud]), stale: false }))
      await waitFor(() => expect(getRecentMedicines).toHaveBeenCalled())
      await act(async () => {})
      expect(r1.result.current.card).toBeNull()
      const ibu = proto({ id: 'p6', medicine_id: 'm6', medicine: coded({ name: 'Ibuprofeno (gotas)' }), created_at: OLD })
      const r2 = renderHook(() => useTodaySetup({ data: data([ibu]), stale: false }))
      await waitFor(() => expect(r2.result.current.card).toMatchObject({ kind: 'forma', mismatch: { proposed: 'liquido', reason: 'name' } }))
    })

    it('sem código, a forma não é julgada (INV-4): Tizerpatida "(injetável)" sem par na lista ⇒ sem card', async () => {
      const t = proto({ id: 'p4', medicine_id: 'm4', medicine: { ...tizerpatida, name: 'Lipoless (injetável)' }, created_at: OLD })
      const { result } = renderHook(() => useTodaySetup({ data: data([t]), stale: false }))
      await waitFor(() => expect(getRecentMedicines).toHaveBeenCalled())
      await act(async () => {})
      expect(result.current.card).toBeNull()
    })
  })
})
