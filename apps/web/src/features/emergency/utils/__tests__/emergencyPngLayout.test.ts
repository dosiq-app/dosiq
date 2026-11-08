// emergencyPngLayout.test.ts — 074 RC2 G-2/G-3/G-9, RC3 E-4: layout puro do PNG CR80 com
// `measure` injetado (jsdom não tem canvas). Medida fake: largura = chars × 0,55 × px.
import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  layoutEmergencyPng,
  emergencyPngFileName,
  wrapText,
  PNG_WIDTH,
  PNG_HEIGHT,
  PNG_PADDING,
  PNG_BODY_MIN_PX,
  PNG_TRUNCATION,
  PNG_INSTRUCTION,
  type MeasureText,
} from '../emergencyPngLayout'

const measure: MeasureText = (text, px) => text.length * 0.55 * px

const fields = {
  name: 'Maria José da Conceição',
  bloodType: 'O+',
  allergies: ['Dipirona', 'Penicilina'],
  contact: 'João (Filho) (11) 98765-4321',
}

describe('074 — layoutEmergencyPng', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.clearAllTimers()
  })

  it('PO-6 guard: canvas CR80 1024×1632, QR ~80% da largura com margem de 4 módulos', () => {
    const l = layoutEmergencyPng(fields, measure)
    expect([l.width, l.height]).toEqual([1024, 1632])
    expect(l.qr.margin).toBe(4)
    expect(l.qr.size / l.width).toBeGreaterThanOrEqual(0.78)
  })

  it('FR-011/014: faixa com título, nome, sangue, alergias, contato e instrução; corpo ≥ 64 px', () => {
    const l = layoutEmergencyPng(fields, measure)
    const all = l.lines.map((x) => x.text).join(' ')
    expect(l.lines[0]).toMatchObject({ text: 'EMERGÊNCIA MÉDICA', bold: true, color: 'title' })
    expect(all).toContain('Maria José da Conceição')
    expect(all).toContain('Sangue: O+')
    expect(all).toContain('Alergias: Dipirona, Penicilina')
    expect(all).toContain('11) 98765-4321')
    expect(all).toContain(PNG_INSTRUCTION)
    expect(l.bodyPx).toBe(64)
    expect(l.truncated).toBe(false)
  })

  it('todas as linhas cabem no canvas (largura e altura)', () => {
    const l = layoutEmergencyPng(fields, measure)
    for (const line of l.lines) {
      expect(measure(line.text, line.fontPx)).toBeLessThanOrEqual(PNG_WIDTH - 2 * PNG_PADDING)
      expect(line.y).toBeLessThanOrEqual(PNG_HEIGHT - PNG_PADDING)
    }
  })

  it('sem nome/sangue/contato: omitidos, alergia declarada, nunca "Paciente"', () => {
    const l = layoutEmergencyPng({ allergies: [] }, measure)
    const all = l.lines.map((x) => x.text).join(' ')
    expect(all).toContain('Alergias: nenhuma informada')
    expect(all).not.toMatch(/Paciente|Sangue|Avisar/)
  })

  it('E-4: alergias gigantes reduzem até 56 px e truncam com "… ver cartão completo"', () => {
    const allergies = Array.from({ length: 20 }, (_, i) => `Alergia muito longa e detalhada número ${i}`.repeat(4))
    const l = layoutEmergencyPng({ ...fields, allergies }, measure)
    expect(l.bodyPx).toBe(PNG_BODY_MIN_PX)
    expect(l.truncated).toBe(true)
    const texts = l.lines.map((x) => x.text)
    expect(texts).toContain(PNG_TRUNCATION)
    // contato e instrução sobrevivem ao corte
    expect(texts.join(' ')).toContain('98765-4321')
    expect(texts[texts.length - 1]).toBe(PNG_INSTRUCTION)
    expect(l.lines[l.lines.length - 1].y).toBeLessThanOrEqual(PNG_HEIGHT - PNG_PADDING)
  })

  it('wrapText quebra palavra maior que a largura por caractere', () => {
    const lines = wrapText('A'.repeat(100), 100, 10, measure)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) expect(measure(line, 10)).toBeLessThanOrEqual(100)
  })
})

describe('074 G-9 — emergencyPngFileName', () => {
  it('normaliza o nome (sem acento, kebab) e cai em dosiq sem nome', () => {
    expect(emergencyPngFileName('Maria José da Conceição')).toBe('cartao-emergencia-maria-jose-da-conceicao.png')
    expect(emergencyPngFileName(null)).toBe('cartao-emergencia-dosiq.png')
    expect(emergencyPngFileName('  ')).toBe('cartao-emergencia-dosiq.png')
  })
})
