import { describe, expect, it } from 'vitest'
import { weightChange } from '../weightChange'

const pts = (...values: number[]) => values.map((value) => ({ value }))

describe('weightChange — 121 FR-012 / ADR-125', () => {
  it('0 ou 1 ponto ⇒ null', () => {
    expect(weightChange([])).toBeNull()
    expect(weightChange(pts(80))).toBeNull()
  })

  it('perda usa o sinal U+2212 e vírgula decimal', () => {
    expect(weightChange(pts(82.4, 81, 80.2))).toEqual({ delta: -2.2, label: '−2,2' })
  })

  it('ganho com +', () => {
    expect(weightChange(pts(70, 71.25))).toEqual({ delta: 1.3, label: '+1,3' })
  })

  it('variação que arredonda a zero não sai "−0"', () => {
    const r = weightChange(pts(80, 79.96))
    expect(r?.label).toBe('0')
    expect(Object.is(r?.delta, -0)).toBe(false)
  })

  it('só primeira e última contam (meio ignorado)', () => {
    expect(weightChange(pts(80, 60, 120, 80))?.label).toBe('0')
  })

  it('valor não finito ⇒ null', () => {
    expect(weightChange(pts(80, Number.NaN))).toBeNull()
  })
})
