import { describe, it, expect } from 'vitest'
import { formatDoseAmount, formatDoseListItem, DOSE_DETAIL_SEP } from '../doseAmountLabel'

const NBSP = ' '
const plain = (s: string | null) => (s == null ? s : s.replaceAll(NBSP, ' '))

describe('formatDoseAmount (120 A, fonte única do push/alarme/prévia)', () => {
  it('comprimido 1 por dose ⇒ só a concentração', () => {
    expect(plain(formatDoseAmount(1, 50, 'mg', null))).toBe('50 mg')
  })
  it('2 por dose ⇒ "2 × 25 mcg", com espaço inquebrável', () => {
    const out = formatDoseAmount(2, 25, 'mcg', null)
    expect(plain(out)).toBe('2 × 25 mcg')
    expect(out).not.toContain(' ')
  })
  it('decimal com vírgula', () => {
    expect(plain(formatDoseAmount(1.5, null, null, null))).toBe('1,5 un.')
  })
  it('líquido ⇒ unidade de tomada, sem concentração', () => {
    expect(plain(formatDoseAmount(20, 100, 'mg/ml', 'gotas'))).toBe('20 gotas')
  })
  it('acrônimo em caixa canônica (ui → UI)', () => {
    expect(plain(formatDoseAmount(1, 10, 'ui', null))).toBe('10 UI')
  })
  it('sem nenhuma informação ⇒ null', () => {
    expect(formatDoseAmount(null, null, null, null)).toBeNull()
    expect(formatDoseAmount(0, 0, 'mg', null)).toBeNull()
  })
  it('texto livre de dose quando não há números', () => {
    expect(formatDoseAmount(null, null, null, null, '1 ampola')).toBe('1 ampola')
  })
})

describe('formatDoseListItem', () => {
  it('nome + quantidade; sem quantidade ⇒ só o nome', () => {
    expect(plain(formatDoseListItem({ medicineName: 'Losartana', dosagePerIntake: 1, dosagePerPill: 50, dosageUnit: 'mg' }))).toBe('Losartana 50 mg')
    expect(formatDoseListItem({ medicineName: 'Vitamina' })).toBe('Vitamina')
  })
  it('separador canônico', () => {
    expect(DOSE_DETAIL_SEP).toBe(' · ')
  })
})
