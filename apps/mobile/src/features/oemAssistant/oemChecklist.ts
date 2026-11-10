// oemChecklist.ts — monta a checklist verificável da tela (spec 068 FR-013/014 · INV-7). Pura.
// Fato `null` ⇒ item some (desconhecido não vira ✓ nem ○). Notificações só aparecem quando desligadas.
// Android puro/Motorola: só o segundo plano (botão). Samsung: item único "Sem restrições". Xiaomi: dois itens.
// Segundo plano em Xiaomi só aparece se o SO acusar restrição: o modo restritivo do HyperOS é
// proprietário (adb 2026-11-10: `RUN_ANY_IN_BACKGROUND` segue allow) — um ✓ ali seria falso conforto.

import type { DeviceFacts } from '@platform/device/deviceProbe'
import type { OemFamily } from '@platform/device/oemFamily'
import { getChecklistCopy, type CheckId } from './oemBatteryGuides'

export type ChecklistFacts = Pick<
  DeviceFacts,
  'notificationsAllowed' | 'backgroundRestricted' | 'batteryOptimized' | 'hibernationEnabled'
>

export interface ChecklistItem {
  id: CheckId
  title: string
  instruction: string
  done: boolean
}

export interface Checklist {
  items: ChecklistItem[]
  pending: number
  tips: string[]
}

export function buildChecklist(family: OemFamily, facts: ChecklistFacts | null): Checklist {
  const copy = getChecklistCopy(family)
  const items: ChecklistItem[] = []
  const push = (id: CheckId, done: boolean) => items.push({ id, ...copy.items[id], done })

  if (facts) {
    if (facts.notificationsAllowed === false) push('notifications', false)
    const restricted = facts.backgroundRestricted
    const optimized = facts.batteryOptimized
    const knownOptimized = optimized !== null && optimized !== undefined
    if (family === 'xiaomi') {
      if (restricted === true) push('background', false)
      if (knownOptimized) push('battery', !optimized)
    } else if (family === 'samsung' && knownOptimized) {
      // Samsung: "Sem restrições" exigido (apps em suspensão da One UI matam app otimizado). A escolha
      // Restrito · Otimizado · Sem restrições é UMA só ⇒ um item, ✓ = não restrito E não otimizado.
      push('battery', restricted !== true && !optimized)
    } else if (family !== 'samsung' && restricted !== null && restricted !== undefined) {
      // Android puro e Motorola: "Otimizado" basta ao alarme (082 T101: só RESTRITO prendeu o alarme);
      // "Sem restrições" fica escondido atrás do texto da linha do botão (smoke Pixel 2026-11-10) ⇒
      // o ajuste é só ligar o botão.
      push('background', !restricted)
    } else if (restricted !== null && restricted !== undefined) {
      push('background', !restricted)
    }
    if (facts.hibernationEnabled !== null && facts.hibernationEnabled !== undefined) push('hibernation', !facts.hibernationEnabled)
  }

  return { items, pending: items.filter((i) => !i.done).length, tips: copy.tips }
}
