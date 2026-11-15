// S-17 (smoke 14/11): título da próxima compra pela cadência do tratamento — não mais "mensal" fixo.
import { doseCadenceLabel, supplyNoticeCopy } from '../supplyNoticeCopy'

describe('doseCadenceLabel', () => {
  afterEach(() => { jest.clearAllMocks() })
  it.each([
    ['semanal', null, 'Dose semanal'],
    ['intervalo_dias', 7, 'Dose semanal'],
    ['intervalo_dias', 14, 'Dose quinzenal'],
    ['intervalo_dias', 30, 'Dose mensal'],
    ['intervalo_dias', 10, 'Dose a cada 10 dias'],
    [null, null, 'Próxima dose'],
    ['diário', null, 'Próxima dose'],
  ])('%s / %s ⇒ %s', (f, n, out) => {
    expect(doseCadenceLabel(f as any, n as any)).toBe(out)
  })
})

it('aviso do semanal zerado diz "Dose semanal", não "mensal"', () => {
  const c = supplyNoticeCopy({ reason: 'sparse', date: '2026-11-20', medicineName: 'Mounjaro', frequency: 'semanal' })
  expect(c?.title).toMatch(/^Dose semanal de Mounjaro em /)
})

it('S-21: compra hoje/amanhã diz a palavra, não a data', () => {
  expect(supplyNoticeCopy({ reason: 'sparse', date: '2026-11-15', daysUntil: 0, medicineName: 'AC', intervalDays: 30 })?.title).toBe('Dose mensal de AC hoje')
  expect(supplyNoticeCopy({ reason: 'sparse', date: '2026-11-16', daysUntil: 1, medicineName: 'AC', intervalDays: 30 })?.title).toBe('Dose mensal de AC amanhã')
})
