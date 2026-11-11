// 068 FR-013/014 · INV-7: checklist verificável a partir dos fatos do aparelho.
// PO 2026-11-11: notificações sempre em 1º quando lidas; bateria/segundo plano não lidos ⇒ `manual`.

import { buildChecklist, summarizeChecklist, type ChecklistFacts } from '../oemChecklist'

const f = (over: Partial<ChecklistFacts> = {}): ChecklistFacts => ({
  notificationsAllowed: true,
  backgroundRestricted: false,
  batteryOptimized: false,
  hibernationEnabled: false,
  ...over,
})
const TAG = { done: 'ok', pending: 'pend', manual: 'manual' } as const
const ids = (c: ReturnType<typeof buildChecklist>) => c.items.map((i) => `${i.id}:${TAG[i.state]}`)

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('buildChecklist', () => {
  it('wireframe A — motorola restrito: notificações ✓ + segundo plano (botão), sem item de bateria', () => {
    const c = buildChecklist('motorola', f({ backgroundRestricted: true, batteryOptimized: true }))
    expect(ids(c)).toEqual(['notifications:ok', 'background:pend', 'hibernation:ok'])
    expect(c.pending).toBe(1)
    expect(c.tips).toEqual([])
  })

  it('Pixel: ligar o botão (Otimizado) ⇒ ✓ — "Sem restrições" não é exigido (smoke 2026-11-10)', () => {
    expect(ids(buildChecklist('generic', f({ backgroundRestricted: true, batteryOptimized: true, hibernationEnabled: true })))).toEqual([
      'notifications:ok',
      'background:pend',
      'hibernation:pend',
    ])
    expect(ids(buildChecklist('generic', f({ backgroundRestricted: false, batteryOptimized: true })))).toEqual([
      'notifications:ok',
      'background:ok',
      'hibernation:ok',
    ])
  })

  it('samsung: item único de bateria, ✓ só com não-restrito E não-otimizado', () => {
    expect(ids(buildChecklist('samsung', f({ batteryOptimized: true })))[1]).toBe('battery:pend')
    expect(ids(buildChecklist('samsung', f({ backgroundRestricted: true })))[1]).toBe('battery:pend')
    expect(ids(buildChecklist('samsung', f()))[1]).toBe('battery:ok')
    expect(ids(buildChecklist('samsung', f())).some((i) => i.startsWith('background'))).toBe(false)
  })

  it('samsung com otimização desconhecida ⇒ cai no item de segundo plano', () => {
    expect(ids(buildChecklist('samsung', f({ batteryOptimized: null, backgroundRestricted: true })))[1]).toBe('background:pend')
  })

  it('wireframe B — xiaomi: bateria e hibernação pendentes; segundo plano omitido; dicas', () => {
    const c = buildChecklist('xiaomi', f({ batteryOptimized: true, hibernationEnabled: true }))
    expect(ids(c)).toEqual(['notifications:ok', 'battery:pend', 'hibernation:pend'])
    expect(c.pending).toBe(2)
    expect(c.tips.length).toBe(2)
  })

  it('xiaomi restrito pelo SO ⇒ item de segundo plano aparece', () => {
    expect(ids(buildChecklist('xiaomi', f({ backgroundRestricted: true })))[1]).toBe('background:pend')
  })

  it('wireframe C — tudo ok ⇒ pending 0', () => {
    expect(buildChecklist('samsung', f()).pending).toBe(0)
    expect(buildChecklist('generic', f({ batteryOptimized: true })).pending).toBe(0)
  })

  it('notificações sempre em 1º: ✓ ligadas, ○ desligadas (conta no pending)', () => {
    expect(ids(buildChecklist('generic', f()))[0]).toBe('notifications:ok')
    const off = buildChecklist('generic', f({ notificationsAllowed: false }))
    expect(ids(off)[0]).toBe('notifications:pend')
    expect(off.pending).toBe(1)
  })

  it('INV-7 — notificações/hibernação null somem (hibernação pode não existir no aparelho)', () => {
    const c = buildChecklist('samsung', f({ hibernationEnabled: null, notificationsAllowed: null }))
    expect(ids(c)).toEqual(['battery:ok'])
  })

  it('INV-7 — bateria/segundo plano null ⇒ passo manual, fora do pending (nunca ✓)', () => {
    expect(ids(buildChecklist('motorola', f({ hibernationEnabled: null, backgroundRestricted: null })))).toEqual([
      'notifications:ok',
      'background:manual',
    ])
    expect(ids(buildChecklist('samsung', f({ batteryOptimized: null, backgroundRestricted: null })))).toContain('battery:manual')
    const x = buildChecklist('xiaomi', f({ batteryOptimized: null }))
    expect(ids(x)).toContain('battery:manual')
    expect(x.pending).toBe(0)
  })

  it('facts null (leitura falhou) ⇒ só passos manuais', () => {
    const c = buildChecklist('xiaomi', null)
    expect(ids(c)).toEqual(['battery:manual'])
    expect(c.pending).toBe(0)
  })
})

describe('summarizeChecklist (068 PR 2 — tela e linha do Perfil)', () => {
  it('sondando ⇒ probing, sem rótulo', () => {
    expect(summarizeChecklist(buildChecklist('samsung', null), true)).toEqual({ status: 'probing', label: null })
  })

  it('G-1/G-2 — passo não conferível ⇒ manual, nunca "Tudo certo" (mesmo com notificações ✓)', () => {
    expect(summarizeChecklist(buildChecklist('xiaomi', null), false).status).toBe('manual')
    const noBattery = buildChecklist('motorola', f({ hibernationEnabled: null, backgroundRestricted: null }))
    expect(summarizeChecklist(noBattery, false)).toEqual({ status: 'manual', label: 'Confira os ajustes de bateria' })
  })

  it('pendência medida vence o manual', () => {
    const c = buildChecklist('motorola', f({ notificationsAllowed: false, backgroundRestricted: null }))
    expect(summarizeChecklist(c, false)).toEqual({ status: 'pending', label: 'Falta 1 ajuste' })
  })

  it('sem item nenhum ⇒ unknown', () => {
    expect(summarizeChecklist({ items: [], pending: 0, tips: [] }, false).status).toBe('unknown')
  })

  it('tudo ✓ ⇒ "Tudo certo"', () => {
    expect(summarizeChecklist(buildChecklist('samsung', f()), false)).toEqual({ status: 'done', label: 'Tudo certo' })
  })

  it('pendências ⇒ singular/plural', () => {
    expect(summarizeChecklist(buildChecklist('samsung', f({ batteryOptimized: true })), false).label).toBe('Falta 1 ajuste')
    const two = buildChecklist('xiaomi', f({ batteryOptimized: true, hibernationEnabled: true }))
    expect(summarizeChecklist(two, false)).toEqual({ status: 'pending', label: 'Faltam 2 ajustes' })
  })
})
