// chartAxisFrom — smoke 121 A: o eixo corta os dias vazios do começo, nunca a linha de base.
import { describe, it, expect, afterEach } from '@jest/globals'
import { chartAxisFrom } from '../treatmentWeek'

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('chartAxisFrom', () => {
  const W30 = '2026-10-17'
  const TODAY = '2026-11-15'

  it('GLP-1 iniciado há 2 dias, sem pesagem antes ⇒ eixo começa no início do tratamento', () => {
    expect(chartAxisFrom(W30, '2026-11-14', '2026-11-13', TODAY)).toBe('2026-11-13')
  })

  it('pesagem antes do início (linha de base) ⇒ eixo começa nela', () => {
    expect(chartAxisFrom(W30, '2026-11-05', '2026-11-13', TODAY)).toBe('2026-11-05')
  })

  it('histórico mais antigo que a janela ⇒ início nominal da janela', () => {
    expect(chartAxisFrom(W30, '2026-10-22', '2026-10-15', TODAY)).toBe(W30)
  })

  it('sem âncora nenhuma ou âncora no futuro ⇒ início nominal', () => {
    expect(chartAxisFrom(W30, null, null, TODAY)).toBe(W30)
    expect(chartAxisFrom(W30, null, '2026-11-20', TODAY)).toBe(W30)
  })
})
