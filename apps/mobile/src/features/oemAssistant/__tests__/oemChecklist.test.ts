// 068 FR-013/014 · INV-7: checklist verificável a partir dos fatos do aparelho.

import { buildChecklist, type ChecklistFacts } from '../oemChecklist'

const f = (over: Partial<ChecklistFacts> = {}): ChecklistFacts => ({
  notificationsAllowed: true,
  backgroundRestricted: false,
  batteryOptimized: false,
  hibernationEnabled: false,
  ...over,
})
const ids = (c: ReturnType<typeof buildChecklist>) => c.items.map((i) => `${i.id}:${i.done ? 'ok' : 'pend'}`)

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('buildChecklist', () => {
  it('wireframe A — motorola restrito: item de segundo plano (botão), sem item de bateria', () => {
    const c = buildChecklist('motorola', f({ backgroundRestricted: true, batteryOptimized: true }))
    expect(ids(c)).toEqual(['background:pend', 'hibernation:ok'])
    expect(c.pending).toBe(1)
    expect(c.tips).toEqual([])
  })

  it('Pixel: ligar o botão (Otimizado) ⇒ ✓ — "Sem restrições" não é exigido (smoke 2026-11-10)', () => {
    expect(ids(buildChecklist('generic', f({ backgroundRestricted: true, batteryOptimized: true, hibernationEnabled: true })))).toEqual([
      'background:pend',
      'hibernation:pend',
    ])
    expect(ids(buildChecklist('generic', f({ backgroundRestricted: false, batteryOptimized: true })))).toEqual([
      'background:ok',
      'hibernation:ok',
    ])
  })

  it('samsung: item único de bateria, ✓ só com não-restrito E não-otimizado', () => {
    expect(ids(buildChecklist('samsung', f({ batteryOptimized: true })))[0]).toBe('battery:pend')
    expect(ids(buildChecklist('samsung', f({ backgroundRestricted: true })))[0]).toBe('battery:pend')
    expect(ids(buildChecklist('samsung', f()))[0]).toBe('battery:ok')
    expect(ids(buildChecklist('samsung', f())).some((i) => i.startsWith('background'))).toBe(false)
  })

  it('samsung com otimização desconhecida ⇒ cai no item de segundo plano', () => {
    expect(ids(buildChecklist('samsung', f({ batteryOptimized: null, backgroundRestricted: true })))[0]).toBe('background:pend')
  })

  it('wireframe B — xiaomi: bateria e hibernação pendentes; segundo plano omitido; dicas', () => {
    const c = buildChecklist('xiaomi', f({ batteryOptimized: true, hibernationEnabled: true }))
    expect(ids(c)).toEqual(['battery:pend', 'hibernation:pend'])
    expect(c.pending).toBe(2)
    expect(c.tips.length).toBe(2)
  })

  it('xiaomi restrito pelo SO ⇒ item de segundo plano aparece', () => {
    expect(ids(buildChecklist('xiaomi', f({ backgroundRestricted: true })))[0]).toBe('background:pend')
  })

  it('wireframe C — tudo ok ⇒ pending 0', () => {
    expect(buildChecklist('samsung', f()).pending).toBe(0)
    expect(buildChecklist('generic', f({ batteryOptimized: true })).pending).toBe(0)
  })

  it('wireframe D — notificações só aparecem desligadas, no topo', () => {
    expect(ids(buildChecklist('generic', f({ notificationsAllowed: false })))[0]).toBe('notifications:pend')
    expect(ids(buildChecklist('generic', f())).some((i) => i.startsWith('notifications'))).toBe(false)
  })

  it('INV-7 — fato null ⇒ item some (binário sem o módulo da hibernação)', () => {
    const c = buildChecklist('samsung', f({ hibernationEnabled: null, notificationsAllowed: null, backgroundRestricted: null }))
    expect(ids(c)).toEqual(['battery:ok'])
    expect(ids(buildChecklist('motorola', f({ hibernationEnabled: null, backgroundRestricted: null })))).toEqual([])
  })

  it('facts null ⇒ checklist vazia', () => {
    expect(buildChecklist('xiaomi', null)).toEqual({ items: [], pending: 0, tips: expect.any(Array) })
  })
})
