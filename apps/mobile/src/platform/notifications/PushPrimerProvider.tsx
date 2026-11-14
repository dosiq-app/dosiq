// PushPrimerProvider — o preparo de notificação, hospedado na RAIZ (spec 120 E-3 / FR-002).
//
// Formulário e card da Hoje abrem o MESMO sheet. Na raiz porque o formulário navega antes de pedir
// (`mutation.create(..., { goBack })` desmonta a tela) — um sheet ali montaria numa tela saindo.
// Abre só por chamada explícita (`openPushPrimer`), nunca sozinho: não aparece sobre o onboarding
// nem sobre o alarme crítico (risco do RC3).
//
// O pedido ao SO sai num ponto só: `requestPushOrOpenSettings` (iOS: só pede se dá; Android: pede
// sempre, < 400 ms ⇒ Ajustes — 054 C-33/C-01). INV-1: o diálogo do SO só depois de "Ligar lembretes".

import React, { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { AccessibilityInfo, Linking } from 'react-native'
import PushPrimerSheet from './PushPrimerSheet'
import { requestPushOrOpenSettings, getPushAskMode, type PushAskMode } from './pushPermission'
import { supabase } from '@platform/supabase/nativeSupabaseClient'
import { logEvent } from '@platform/analytics/productAnalytics'
import { EVENTS, SURFACES } from '@platform/analytics/analyticsEvents'
import { useToast } from '@shared/components/feedback/Toast'

import { PushPrimerContext, type Ctx, type OpenPushPrimerArgs, type PrimerOutcome } from './pushPrimerContext'

export function PushPrimerProvider({ children }: { children: ReactNode }) {
  // States
  const [open, setOpen] = useState<OpenPushPrimerArgs | null>(null)
  const [loading, setLoading] = useState(false)
  const [askMode, setAskMode] = useState<PushAskMode>('ask')
  const resolver = useRef<((o: PrimerOutcome) => void) | null>(null)
  const { show } = useToast()

  // Memos (R-010: antes dos handlers) — identidade estável: só usa setters e a ref do resolver.
  const value = useMemo<Ctx>(
    () => ({
      openPushPrimer: (args) => {
        // Chamado com o sheet já aberto: a promessa anterior fecha como dispensada.
        resolver.current?.('dismissed')
        return new Promise<PrimerOutcome>((resolve) => {
          resolver.current = resolve
          setLoading(false)
          if (args.settings) {
            setAskMode('settings')
            setOpen(args)
            return
          }
          // A cópia depende do que o SO fará (smoke 120: negado ⇒ Ajustes, não "o sistema vai perguntar").
          void getPushAskMode().then((mode) => {
            if (resolver.current !== resolve) return // já fechado/substituído
            setAskMode(mode)
            setOpen(args)
          })
        })
      },
    }),
    []
  )

  // Handlers
  const settle = useCallback((outcome: PrimerOutcome) => {
    const r = resolver.current
    resolver.current = null
    setOpen(null)
    setLoading(false)
    r?.(outcome)
  }, [])

  const onDismiss = useCallback(() => {
    if (!open || loading) return
    void logEvent(EVENTS.NOTIFICATION_PERMISSION_PRIMER_DISMISSED, { surface: SURFACES.MOBILE, entry_point: open.entryPoint })
    settle('dismissed')
  }, [open, loading, settle])

  const onAccept = useCallback(async () => {
    if (!open || loading) return
    if (open.settings) {
      Linking.openSettings()
      settle('not_granted')
      return
    }
    setLoading(true)
    let granted = false
    try {
      granted = await requestPushOrOpenSettings({ supabase, entryPoint: open.entryPoint })
    } catch {
      granted = false
    }
    // D-5: concedido ⇒ toast curto + anúncio ao leitor de tela (o Toast não tem live region).
    if (granted) {
      show('Lembretes ligados', { variant: 'success', duration: 2000 })
      AccessibilityInfo.announceForAccessibility('Lembretes ligados')
    }
    settle(granted ? 'granted' : 'not_granted')
  }, [open, loading, settle, show])

  return (
    <PushPrimerContext.Provider value={value}>
      {children}
      <PushPrimerSheet
        visible={!!open}
        preview={open?.preview ?? null}
        anchor={open?.anchor ?? null}
        loading={loading}
        askMode={askMode}
        settingsHint={open?.settings?.hint ?? null}
        onAccept={onAccept}
        onDismiss={onDismiss}
      />
    </PushPrimerContext.Provider>
  )
}
