// oemChecklist.ts — monta a checklist verificável da tela (spec 068 FR-013/014 · INV-7). Pura.
// Fato `null` nunca vira ✓ nem ○: bateria/segundo plano viram passo `manual`; notificações/hibernação somem.
// Notificações sempre em 1º quando lidas (✓ ou ○) — PO 2026-11-11.
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

/** `manual` = fato não lido (`null`) num ajuste que existe em todo Android: passo neutro, fora da contagem. */
export type ChecklistItemState = 'done' | 'pending' | 'manual'

export interface ChecklistItem {
  id: CheckId
  title: string
  instruction: string
  state: ChecklistItemState
}

export interface Checklist {
  items: ChecklistItem[]
  /** Só pendências MEDIDAS — `manual` não conta (não sabemos se falta). */
  pending: number
  tips: string[]
}

const known = (v: boolean | null | undefined): v is boolean => v !== null && v !== undefined

export function buildChecklist(family: OemFamily, facts: ChecklistFacts | null): Checklist {
  const copy = getChecklistCopy(family)
  const items: ChecklistItem[] = []
  const push = (id: CheckId, state: ChecklistItemState) => items.push({ id, ...copy.items[id], state })
  const measured = (ok: boolean): ChecklistItemState => (ok ? 'done' : 'pending')

  // `facts` null (leitura falhou) ⇒ tudo desconhecido: mesmos ramos, com todo fato `null`.
  const notifications = facts?.notificationsAllowed
  const restricted = facts?.backgroundRestricted
  const optimized = facts?.batteryOptimized
  const hibernation = facts?.hibernationEnabled

  // 1º notificações, sempre que lidas (PO 2026-11-11): pré-requisito de todo o resto. Desconhecido some.
  if (known(notifications)) push('notifications', measured(notifications))

  if (family === 'xiaomi') {
    // Segundo plano só com restrição acusada (modo do HyperOS é invisível — ver cabeçalho).
    if (restricted === true) push('background', 'pending')
    push('battery', known(optimized) ? measured(!optimized) : 'manual')
  } else if (family === 'samsung') {
    // Samsung: "Sem restrições" exigido (apps em suspensão da One UI matam app otimizado). A escolha
    // Restrito · Otimizado · Sem restrições é UMA só ⇒ um item, ✓ = não restrito E não otimizado.
    if (known(optimized)) push('battery', measured(restricted !== true && !optimized))
    else if (known(restricted)) push('background', measured(!restricted))
    else push('battery', 'manual')
  } else {
    // Android puro e Motorola: "Otimizado" basta ao alarme (082 T101: só RESTRITO prendeu o alarme);
    // "Sem restrições" fica escondido atrás do texto da linha do botão (smoke Pixel 2026-11-10) ⇒
    // o ajuste é só ligar o botão.
    push('background', known(restricted) ? measured(!restricted) : 'manual')
  }
  // Hibernação `null` some: pode ser FEATURE_NOT_AVAILABLE (Android antigo, ajuste inexistente) —
  // "confira" ali mandaria caçar tela fantasma (PO 2026-11-11).
  if (known(hibernation)) push('hibernation', measured(!hibernation))

  return { items, pending: items.filter((i) => i.state === 'pending').length, tips: copy.tips }
}

/** Estado resumido da checklist — fonte única da tela e da linha do Perfil (068 PR 2). */
export type ChecklistStatus = 'probing' | 'unknown' | 'manual' | 'done' | 'pending'

export interface ChecklistSummary {
  status: ChecklistStatus
  /** Rótulo curto ("Tudo certo" / "Falta 1 ajuste" / "Faltam N ajustes" / "Confira…"); `null` sondando. */
  label: string | null
}

export function pendingLabel(pending: number): string {
  return pending === 1 ? 'Falta 1 ajuste' : `Faltam ${pending} ajustes`
}

/**
 * `probing` = sonda ainda não respondeu. `pending` = ≥1 pendência medida (vence o manual). `manual` =
 * sem pendência medida mas ≥1 passo não conferível. `unknown` = nenhum item. "Tudo certo" SÓ com todos
 * os itens medidos ✓ — desconhecido não é ✓ (INV-7, G-1/G-2, PO 2026-11-11).
 */
export function summarizeChecklist(checklist: Checklist, probing: boolean): ChecklistSummary {
  if (probing) return { status: 'probing', label: null }
  if (checklist.items.length === 0) return { status: 'unknown', label: 'Confira os ajustes do aparelho' }
  if (checklist.pending > 0) return { status: 'pending', label: pendingLabel(checklist.pending) }
  if (checklist.items.some((i) => i.state === 'manual')) return { status: 'manual', label: 'Confira os ajustes de bateria' }
  return { status: 'done', label: 'Tudo certo' }
}
