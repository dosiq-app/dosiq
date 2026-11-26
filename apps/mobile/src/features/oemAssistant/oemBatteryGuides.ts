// oemBatteryGuides.ts — DONO ÚNICO da copy por fabricante (spec 068 E-4).
// Dois conjuntos: (1) checklist do assistente (itens verificáveis + dicas); (2) sheet de tela cheia do alarme
// crítico (`FullScreenGuideSheet`, 128 A — antes texto corrido no `CriticalAlertPrimerSheet`).
// D-1: nenhuma marcação crua (`*ênfase*`, `<botão>`) — `<Text>` do RN não renderiza markdown.
// D-6: um nó por item/passo no componente.
// FR-010: a copy informa ("pode não tocar", "ajuda"), nunca garante.

import type { OemFamily } from '@platform/device/oemFamily'

/** Itens que o app VERIFICA no aparelho (spec 068 FR-013 · §Revisão pós-smoke 2026-11-10). */
export type CheckId = 'notifications' | 'background' | 'battery' | 'hibernation' | 'fullScreen' | 'lockScreen'

export interface CheckCopy {
  /** Estado alcançado, exibido no ✓ ("Bateria sem restrição"). */
  title: string
  /**
   * Título de ação, exibido no ○ e no manual ("Tirar a restrição de bateria"). Smoke g06 2026-11-24: lido
   * rápido, o título de estado no ○ parecia "já feito" e o círculo vazio, um bullet.
   */
  action: string
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
  action: 'Ligar as notificações',
  instruction: 'Em "Notificações", ative as notificações do Dosiq.',
}
const BACKGROUND: CheckCopy = {
  title: 'Uso em segundo plano liberado',
  action: 'Liberar o uso em segundo plano',
  instruction: 'Em "Uso da bateria pelo app", ative "Permitir o uso em segundo plano".',
}
// Android puro/Motorola: o item de bateria NÃO é exibido (oemChecklist) — "Otimizado" basta e
// "Sem restrições" fica escondido atrás do texto da linha do botão (smoke Pixel 2026-11-10).
const AOSP_BATTERY: CheckCopy = {
  title: 'Bateria sem restrições',
  action: 'Tirar as restrições de bateria',
  instruction: 'Em "Uso da bateria pelo app", toque no nome "Permitir o uso em segundo plano" e escolha "Sem restrições".',
}
// 128 A (RC2 D-9): "Notificações em tela cheia" é AOSP (Android 14+) em todas as famílias.
const FULL_SCREEN: CheckCopy = {
  title: 'Alarme em tela cheia liberado',
  action: 'Liberar o alarme em tela cheia',
  instruction: 'Nas notificações do app, ative "Permitir notificações em tela cheia".',
}
// 128 C-6 (matriz POCO 2026-11-26): no HyperOS a tela cheia depende de duas chaves de "Outras permissões",
// ambas legíveis — "Abrir novas janelas…" (o HyperOS a liga à permissão de tela cheia do Android) e
// "Mostrar na Tela de bloqueio" (MIUIOP 10020). Fora do Xiaomi `lockScreen` nunca entra (fato null).
const FULL_SCREEN_XIAOMI: CheckCopy = {
  title: 'Alarme em tela cheia liberado',
  action: 'Liberar o alarme em tela cheia',
  instruction: 'Em "Outras permissões", marque "Sempre permitir" em "Abrir novas janelas enquanto executa em segundo plano".',
}
const LOCK_SCREEN_XIAOMI: CheckCopy = {
  title: 'Alarme na tela de bloqueio liberado',
  action: 'Mostrar o alarme na tela de bloqueio',
  instruction: 'Em "Outras permissões", marque "Sempre permitir" em "Mostrar na Tela de bloqueio".',
}
const HIBERNATION_AOSP: CheckCopy = {
  title: 'Pausa por falta de uso desligada',
  action: 'Desligar a pausa por falta de uso',
  instruction: 'Desative "Gerenciar o app fora de uso".',
}

export const CHECKLISTS: Record<OemFamily, OemChecklistCopy> = {
  // HyperOS 3 / Android 16 (POCO, smoke 2026-11-09/10): "Nenhuma restrição" ⇔ app na exceção de bateria
  // (adb, ida e volta); "Início automático" e cadeado são invisíveis ao SO ⇒ dicas.
  xiaomi: {
    items: {
      notifications: NOTIFICATIONS,
      background: BACKGROUND,
      battery: {
        title: 'Bateria sem restrição',
        action: 'Tirar a restrição de bateria',
        instruction: 'Em "Energia", escolha "Nenhuma restrição".',
      },
      hibernation: {
        title: 'Pausa por falta de uso desligada',
        action: 'Desligar a pausa por falta de uso',
        instruction: 'Desative "Pausar atividade do app quando sem uso".',
      },
      fullScreen: FULL_SCREEN_XIAOMI,
      lockScreen: LOCK_SCREEN_XIAOMI,
    },
    tips: [
      'Nas notificações do app, deixe "Notificações na Tela de bloqueio" ativada — sem ela o alarme pode abrir sem som com o celular bloqueado.',
      'Se aparecer "Início automático", ative.',
      'Nos apps recentes, segure o card do Dosiq e toque no cadeado.',
    ],
  },
  samsung: {
    items: {
      notifications: NOTIFICATIONS,
      background: BACKGROUND,
      battery: {
        title: 'Bateria sem restrições',
        action: 'Tirar as restrições de bateria',
        instruction: 'Em "Bateria", escolha "Sem restrições".',
      },
      hibernation: HIBERNATION_AOSP,
      fullScreen: FULL_SCREEN,
      lockScreen: LOCK_SCREEN_XIAOMI,
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
      fullScreen: FULL_SCREEN,
      lockScreen: LOCK_SCREEN_XIAOMI,
    },
    tips: [],
  },
  generic: {
    items: {
      notifications: NOTIFICATIONS,
      background: BACKGROUND,
      battery: AOSP_BATTERY,
      hibernation: HIBERNATION_AOSP,
      fullScreen: FULL_SCREEN,
      lockScreen: LOCK_SCREEN_XIAOMI,
    },
    tips: [],
  },
}

/** Copy da checklist da família; desconhecido cai no genérico — nunca `undefined`. */
export function getChecklistCopy(family: OemFamily | null | undefined): OemChecklistCopy {
  return (family && CHECKLISTS[family]) || CHECKLISTS.generic
}

/**
 * Sheet de tela cheia do alarme crítico (128 A · RC2 D-1/D-3). Sem possessivo, sem "pode fechar esta
 * janela": o resultado é medido na volta dos Ajustes e dito na tela.
 */
export const FULL_SCREEN_COPY = {
  title: 'Alarme na tela bloqueada',
  body: 'Com o celular bloqueado, a dose crítica aparece na tela inteira, como um despertador. Falta liberar isso nas configurações.',
  bodyManual: 'Com o celular bloqueado, a dose crítica aparece na tela inteira, como um despertador. Confira estes ajustes nas configurações.',
  granted: 'Pronto — o alarme aparece na tela bloqueada.',
  stillPending: 'Ainda falta ativar "Permitir notificações em tela cheia".',
  cta: 'Abrir configurações',
  dismiss: 'Agora não',
  close: 'Fechar',
} as const
