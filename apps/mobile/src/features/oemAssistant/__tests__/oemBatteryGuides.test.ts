// 068 PO-3 (mapa por família) · PO-4 (terminologia) · PO-9 (sem marcação crua) · FR-013 (checklist).

import {
  CHECKLISTS,
  FULL_SCREEN_GUIDES,
  getChecklistCopy,
  getFullScreenGuide,
  guideToPlainText,
  type OemChecklistCopy,
} from '../oemBatteryGuides'
import { classifyOem } from '@platform/device/oemFamily'

const fullScreenTexts = Object.values(FULL_SCREEN_GUIDES).flatMap((g) => [g.title, g.intro, ...g.steps])
const checklistTexts = (c: OemChecklistCopy) => [
  ...Object.values(c.items).flatMap((i) => [i.title, i.instruction]),
  ...c.tips,
]
const ALL_TEXTS = [...fullScreenTexts, ...Object.values(CHECKLISTS).flatMap(checklistTexts)]

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('getChecklistCopy', () => {
  it.each([
    ['xiaomi', null, CHECKLISTS.xiaomi],
    ['Xiaomi', 'Redmi', CHECKLISTS.xiaomi],
    [null, 'POCO', CHECKLISTS.xiaomi],
    ['samsung', null, CHECKLISTS.samsung],
    ['motorola', null, CHECKLISTS.motorola],
    ['Google', 'pixel', CHECKLISTS.generic],
    ['', '', CHECKLISTS.generic],
    [null, null, CHECKLISTS.generic],
  ])('%s/%s ⇒ copy esperada', (m, b, expected) => {
    expect(getChecklistCopy(classifyOem(m, b))).toBe(expected)
  })

  it('família nula/indefinida ⇒ genérico', () => {
    expect(getChecklistCopy(null)).toBe(CHECKLISTS.generic)
    expect(getChecklistCopy(undefined)).toBe(CHECKLISTS.generic)
  })

  it('rótulos verbatim das telas do SO (smoke 2026-11-09/10)', () => {
    expect(CHECKLISTS.xiaomi.items.battery.instruction).toMatch(/Nenhuma restrição/)
    expect(CHECKLISTS.xiaomi.items.hibernation.instruction).toMatch(/Pausar atividade do app quando sem uso/)
    expect(CHECKLISTS.xiaomi.tips.join(' ')).toMatch(/Início automático/)
    expect(CHECKLISTS.xiaomi.tips.join(' ')).toMatch(/cadeado/)
    expect(CHECKLISTS.motorola.items.background.instruction).toMatch(/Permitir o uso em segundo plano/)
    // furo do smoke Pixel 2026-11-10: "Sem restrições" só aparece tocando no TEXTO da opção
    for (const fam of ['motorola', 'generic'] as const) {
      expect(CHECKLISTS[fam].items.battery.instruction).toMatch(/toque no nome "Permitir o uso em segundo plano"/)
      expect(CHECKLISTS[fam].items.battery.instruction).toMatch(/Sem restrições/)
    }
    expect(CHECKLISTS.motorola.items.hibernation.instruction).toMatch(/Gerenciar o app fora de uso/)
    expect(CHECKLISTS.samsung.tips.join(' ')).toMatch(/nunca suspensos/)
    expect(CHECKLISTS.motorola.tips).toEqual([])
    expect(CHECKLISTS.generic.tips).toEqual([])
  })
})

describe('getFullScreenGuide', () => {
  it('xiaomi tem roteiro próprio; demais caem no genérico', () => {
    expect(getFullScreenGuide('xiaomi')).toBe(FULL_SCREEN_GUIDES.xiaomi)
    expect(getFullScreenGuide('samsung')).toBe(FULL_SCREEN_GUIDES.generic)
    expect(getFullScreenGuide(null)).toBe(FULL_SCREEN_GUIDES.generic)
  })
})

describe('copy', () => {
  it('nenhum texto contém marcação crua (D-1/PO-9)', () => {
    for (const t of ALL_TEXTS) expect(t).not.toMatch(/[*<>]/)
  })

  it('terminologia R-UI: sem "protocolo" nem possessivo (PO-4)', () => {
    for (const t of ALL_TEXTS) expect(t).not.toMatch(/protocolo|\bseu\b|\bsua\b|\bmeu\b|\bminha\b/i)
  })

  it('informa, não garante (FR-010)', () => {
    for (const t of ALL_TEXTS) expect(t).not.toMatch(/garant/i)
  })

  it('guideToPlainText numera os passos', () => {
    expect(guideToPlainText(FULL_SCREEN_GUIDES.generic)).toBe(
      'Para o alarme funcionar na tela bloqueada:\n\n1. Toque em "Abrir configurações" abaixo.\n2. Ligue "Notificações em tela cheia".'
    )
  })
})
