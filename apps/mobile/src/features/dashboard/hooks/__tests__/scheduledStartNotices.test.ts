// 125 fatia 2 · FR-034: início futuro sem estoque para a 1ª dose avisa como a próxima etapa.
import { deriveScheduledStartNotices } from '../_useTodayDerived'
import { buildStockCandidates } from '@dashboard/utils/todayStockCandidates'
import { supplyNoticeCopy } from '@dashboard/utils/supplyNoticeCopy'

const TODAY = '2026-11-19'
const item = (over: any = {}) => ({
  id: 'm1', name: 'Mounjaro', dosesRemaining: 0,
  forecast: { isZero: true },
  scheduled: { kind: 'future_start', startsOn: '2026-11-24', countingProtocols: [{ frequency: 'semanal', interval_days: null }] },
  ...over,
})

describe('deriveScheduledStartNotices (FR-034)', () => {
  it('sem estoque, começa em 5 dias ⇒ aviso de compra na data de início', () => {
    const [n] = deriveScheduledStartNotices([item()], TODAY)
    expect(n).toMatchObject({ medicineId: 'm1', reason: 'future_start', date: '2026-11-24', daysUntil: 5, frequency: 'semanal' })
    expect(supplyNoticeCopy(n)).toEqual({ title: 'Dose semanal de Mounjaro em 24/11', hint: 'Você ainda não tem estoque para ela.' })
  })

  it('vira candidato do árbitro como os outros avisos de compra', () => {
    const [c] = buildStockCandidates([], deriveScheduledStartNotices([item()], TODAY), [], new Date(2026, 10, 19, 10))
    expect(c).toMatchObject({ key: 'supply:m1', payload: { type: 'supply' } })
  })

  it.each([
    ['com estoque', item({ dosesRemaining: 4, forecast: { isZero: false } })],
    ['fora da janela (8 dias)', item({ scheduled: { ...item().scheduled, startsOn: '2026-11-27' } })],
    ['etapa de escada', item({ scheduled: { ...item().scheduled, kind: 'next_step' } })],
    ['sem data de início', item({ scheduled: { ...item().scheduled, startsOn: null } })],
    ['sem previsão (cache antigo)', item({ forecast: null })],
    ['sem scheduled', item({ scheduled: null })],
  ])('%s ⇒ nada', (_l, it) => {
    expect(deriveScheduledStartNotices([it], TODAY)).toEqual([])
  })

  it('entrada inválida ⇒ []', () => {
    expect(deriveScheduledStartNotices(null, TODAY)).toEqual([])
  })
})
