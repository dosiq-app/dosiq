// Contexto do preparo de notificação (spec 120 E-3). Separado do provider (fast refresh).
import { createContext, useContext } from 'react'
import type { PermissionEntryPoint } from '@platform/analytics/analyticsEvents'
import type { PushPreview } from './PushPrimerSheet'

export type PrimerOutcome = 'granted' | 'not_granted' | 'dismissed'

export interface OpenPushPrimerArgs {
  entryPoint: PermissionEntryPoint
  preview?: PushPreview | null
  anchor?: string | null
  /**
   * Smoke 120: quem chama JÁ sabe que só os Ajustes resolvem (iOS negado, canal Android desligado,
   * Android que parou de perguntar). Força o modo Ajustes sem sondar o SO; `hint` = o passo a passo.
   * O CTA abre os Ajustes e fecha como `not_granted` (não houve decisão do SO ⇒ sem evento).
   */
  settings?: { hint: string; channelId?: string | null } | null
}

export type Ctx = { openPushPrimer: (args: OpenPushPrimerArgs) => Promise<PrimerOutcome> }

// Sem provider (teste, árvore fora da raiz): no-op que não lança.
export const PushPrimerContext = createContext<Ctx>({ openPushPrimer: async () => 'dismissed' })

export function usePushPrimer(): Ctx {
  return useContext(PushPrimerContext)
}

