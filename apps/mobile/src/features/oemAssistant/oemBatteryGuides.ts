// oemBatteryGuides.ts — DONO ÚNICO da copy por fabricante (spec 068 E-4).
// Dois conjuntos: (1) checklist do assistente (itens verificáveis + dicas); (2) tela cheia do alarme crítico —
// consumido pelo `ProtocolFormBody` (antes `XIAOMI_MSG`/`GENERIC_MSG` inline).
// D-1: nenhuma marcação crua (`*ênfase*`, `<botão>`) — `<Text>` do RN não renderiza markdown.
// D-6: um nó por item/passo no componente.
// FR-010: a copy informa ("pode não tocar", "ajuda"), nunca garante.

import type { OemFamily } from '@platform/device/oemFamily'

export interface OemGuide {
  title: string
  intro: string
  steps: string[]
}

/** Itens que o app VERIFICA no aparelho (spec 068 FR-013 · §Revisão pós-smoke 2026-11-10). */
export type CheckId = 'notifications' | 'background' | 'battery' | 'hibernation'

export interface CheckCopy {
  /** Estado desejado, lido igual em ✓ e ○ ("Bateria sem restrição"). */
  title: string
  /** O que fazer quando pendente — rótulos verbatim das telas do SO. */
  instruction: string
}

export interface OemChecklistCopy {
  items: Record<CheckId, CheckCopy>
  /** "Para garantir": o que o SO não expõe (sem estado, nunca bloqueia o "Pronto"). */
  tips: string[]
}

const NOTIFICATIONS: CheckCopy = {
  title: 'Notificações ligadas',
  instruction: 'Em "Notificações", ative as notificações do Dosiq.',
}
const BACKGROUND: CheckCopy = {
  title: 'Uso em segundo plano liberado',
  instruction: 'Em "Uso da bateria pelo app", ative "Permitir o uso em segundo plano".',
}
// Android puro/Motorola: o item de bateria NÃO é exibido (oemChecklist) — "Otimizado" basta e
// "Sem restrições" fica escondido atrás do texto da linha do botão (smoke Pixel 2026-11-10).
const AOSP_BATTERY: CheckCopy = {
  title: 'Bateria sem restrições',
  instruction: 'Em "Uso da bateria pelo app", toque no nome "Permitir o uso em segundo plano" e escolha "Sem restrições".',
}
const HIBERNATION_AOSP: CheckCopy = {
  title: 'Pausa por falta de uso desligada',
  instruction: 'Desative "Gerenciar o app fora de uso".',
}

export const CHECKLISTS: Record<OemFamily, OemChecklistCopy> = {
  // HyperOS 3 / Android 16 (POCO, smoke 2026-11-09/10): "Nenhuma restrição" ⇔ app na exceção de bateria
  // (adb, ida e volta); "Início automático" e cadeado são invisíveis ao SO ⇒ dicas.
  xiaomi: {
    items: {
      notifications: NOTIFICATIONS,
      background: BACKGROUND,
      battery: { title: 'Bateria sem restrição', instruction: 'Em "Energia", escolha "Nenhuma restrição".' },
      hibernation: {
        title: 'Pausa por falta de uso desligada',
        instruction: 'Desative "Pausar atividade do app quando sem uso".',
      },
    },
    tips: [
      'Se aparecer "Início automático", ative.',
      'Nos apps recentes, segure o card do Dosiq e toque no cadeado.',
    ],
  },
  samsung: {
    items: {
      notifications: NOTIFICATIONS,
      background: BACKGROUND,
      battery: { title: 'Bateria sem restrições', instruction: 'Em "Bateria", escolha "Sem restrições".' },
      hibernation: HIBERNATION_AOSP,
    },
    tips: [
      'Em Cuidados com o dispositivo, abra "Bateria" e, em "Limites de uso em segundo plano", adicione o Dosiq a "Aplicativos nunca suspensos".',
    ],
  },
  // Android 15 (moto, smoke 2026-11-09).
  motorola: {
    items: {
      notifications: NOTIFICATIONS,
      background: BACKGROUND,
      battery: AOSP_BATTERY,
      hibernation: HIBERNATION_AOSP,
    },
    tips: [],
  },
  generic: {
    items: {
      notifications: NOTIFICATIONS,
      background: BACKGROUND,
      battery: AOSP_BATTERY,
      hibernation: HIBERNATION_AOSP,
    },
    tips: [],
  },
}

/** Copy da checklist da família; desconhecido cai no genérico — nunca `undefined`. */
export function getChecklistCopy(family: OemFamily | null | undefined): OemChecklistCopy {
  return (family && CHECKLISTS[family]) || CHECKLISTS.generic
}

/** Guias de tela cheia do alarme crítico (`ProtocolFormBody`), por família. */
export const FULL_SCREEN_GUIDES: Record<'xiaomi' | 'generic', OemGuide> = {
  xiaomi: {
    title: 'Alarme na tela bloqueada',
    intro: 'Há uma etapa extra para o alarme funcionar na tela bloqueada. Abra as configurações abaixo e:',
    steps: [
      'Escolha "Outras permissões".',
      'Marque "Sempre permitir" em "Mostrar na Tela de bloqueio".',
      'Marque "Sempre permitir" em "Abrir novas janelas enquanto executa em segundo plano".',
      'Marque "Sempre permitir" em "Exibir janelas pop-up".',
      'Quando terminar, pode fechar esta janela.',
    ],
  },
  generic: {
    title: 'Alarme na tela bloqueada',
    intro: 'Para o alarme funcionar na tela bloqueada:',
    steps: ['Toque em "Abrir configurações" abaixo.', 'Ligue "Notificações em tela cheia".'],
  },
}

/** Guia de tela cheia: só Xiaomi tem roteiro próprio. */
export function getFullScreenGuide(family: OemFamily | null | undefined): OemGuide {
  return family === 'xiaomi' ? FULL_SCREEN_GUIDES.xiaomi : FULL_SCREEN_GUIDES.generic
}

/** Texto corrido numerado, para superfícies que só aceitam string (sheet de tela cheia). */
export function guideToPlainText(guide: OemGuide): string {
  return `${guide.intro}\n\n${guide.steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}`
}
