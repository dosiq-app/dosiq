// 068 PO-3 (mapa por família) · PO-4 (terminologia) · PO-9 (sem marcação crua) · FR-013 (checklist).

import {
  CHECKLISTS,
  FULL_SCREEN_COPY,
  getChecklistCopy,
  type OemChecklistCopy,
} from '../oemBatteryGuides'
import { classifyOem } from '@platform/device/oemFamily'

const fullScreenTexts = [...Object.values(FULL_SCREEN_COPY)]
const checklistTexts = (c: OemChecklistCopy) => [
  ...Object.values(c.items).flatMap((i) => [i.title, i.action, i.instruction]),
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

  // 128 A (RC2 D-3): o resultado é medido e dito na tela — nada de pôr a verificação na pessoa.
  it('sheet de tela cheia: sem "pode fechar esta janela"; resultado explícito', () => {
    for (const t of fullScreenTexts) expect(t).not.toMatch(/fechar esta janela/i)
    expect(FULL_SCREEN_COPY.granted).toMatch(/^Pronto/)
    expect(FULL_SCREEN_COPY.dismiss).toBe('Agora não')
  })
})

describe('128 C-6 — Xiaomi: chaves de "Outras permissões"', () => {
  it('tela cheia e tela de bloqueio apontam para "Outras permissões" com os rótulos verbatim', () => {
    const x = CHECKLISTS.xiaomi.items
    expect(x.fullScreen.instruction).toMatch(/"Outras permissões".*"Abrir novas janelas enquanto executa em segundo plano"/)
    expect(x.lockScreen.instruction).toMatch(/"Outras permissões".*"Mostrar na Tela de bloqueio"/)
  })
  it('"Notificações na Tela de bloqueio" (ilegível) é dica sem estado, não item', () => {
    expect(CHECKLISTS.xiaomi.tips.some((t) => t.includes('"Notificações na Tela de bloqueio"'))).toBe(true)
  })
  it('fora do Xiaomi a tela cheia segue nas notificações do app', () => {
    expect(CHECKLISTS.generic.items.fullScreen.instruction).toMatch(/notificações do app/)
  })
})
