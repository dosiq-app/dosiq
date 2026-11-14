import React, { useCallback, useEffect, useMemo, useState } from 'react'
import PushPermissionCard from '@dashboard/components/PushPermissionCard'
import { nextDoseReminder } from '@dashboard/utils/nextDoseReminder'
import { hasRemindableTreatment } from '@dashboard/utils/hasRemindableTreatment'
import { usePushPrimer } from '@platform/notifications/pushPrimerContext'
import { getPushAskMode } from '@platform/notifications/pushPermission'
import { pushSettingsHint } from '@dashboard/utils/pushPermissionCopy'
import type { PushReachability } from '@platform/notifications/usePushReachability'
import { isPushPermissionVisible } from '@dashboard/hooks/useTodayPushPermission'
import { EVENTS, PERMISSION_ENTRY_POINTS, SURFACES } from '@platform/analytics/analyticsEvents'
import { logEvent } from '@platform/analytics/productAnalytics'
import { getNow } from '@dosiq/core'

/**
 * TodayPushPermission — aviso de lembretes desligados na faixa de alertas da Hoje (spec 120 US1).
 * Visível só com tratamento que gera lembrete (em curso ou agendado) E push não utilizável E sem
 * adiamento vigente (FR-001/FR-003). "Ligar lembretes" abre o preparo (US2); bloqueado ⇒ Ajustes.
 * O sumiço ao conceder vem do `usePushReachability` (AppState active ⇒ refresh — cenário 4).
 */
interface Props {
  reach: PushReachability
  /** Tratamentos em curso + agendados (os agendados também vão precisar do lembrete). */
  protocols: any[]
}

export default function TodayPushPermission({ reach, protocols }: Props) {
  // States
  const [loading, setLoading] = useState(false)
  const [wentToSettings, setWentToSettings] = useState(false)
  // Smoke 120 (3b): Android que parou de perguntar ⇒ o card já diz "Abrir Ajustes" (o `reason` do
  // Android é sempre 'undetermined' — C-01; quem sabe é o `getPushAskMode`).
  const [osStopsAsking, setOsStopsAsking] = useState(false)
  const { openPushPrimer } = usePushPrimer()
  // Smoke 120: "foi aos Ajustes" vale só até liberar. Bloqueio NOVO depois de concedido não é "ainda".
  // Ajuste de estado no render (padrão React p/ derivar de prop), sem effect.
  if (wentToSettings && reach.usable) setWentToSettings(false)

  // Memos
  const reminder = useMemo(() => nextDoseReminder(protocols, getNow()), [protocols])
  const multiple = useMemo(() => protocols.filter((p) => hasRemindableTreatment([p])).length > 1, [protocols])

  // Effects
  useEffect(() => {
    // Fora do 'undetermined' o valor é ignorado (gate em `reason` abaixo) — sem setState síncrono aqui.
    if (reach.usable !== false || reach.reason !== 'undetermined') return
    let alive = true
    void getPushAskMode().then((mode) => {
      if (alive) setOsStopsAsking(mode === 'settings')
    })
    return () => {
      alive = false
    }
  }, [reach.usable, reach.reason, wentToSettings, loading])

  const reason = osStopsAsking && reach.reason === 'undetermined' ? 'denied' : reach.reason

  // Handlers
  const onEnable = useCallback(async () => {
    if (loading) return
    const settingsOnly = !!reason && reason !== 'undetermined'
    setLoading(true)
    try {
      // Negado/canal/SO parou de perguntar: o preparo abre em modo Ajustes, com o passo a passo
      // (INV-2: nunca repedir negado). Smoke 120: o card fica curto; a instrução mora no preparo.
      const outcome = await openPushPrimer({
        entryPoint: PERMISSION_ENTRY_POINTS.TODAY_BANNER,
        preview: reminder ? { title: reminder.title, body: reminder.body, medicineName: reminder.medicineName, verb: reminder.verb } : null,
        settings: settingsOnly && reason ? { hint: pushSettingsHint(reason) } : null,
      })
      if (settingsOnly && outcome !== 'dismissed') setWentToSettings(true)
      await reach.refresh()
    } finally {
      setLoading(false)
    }
  }, [loading, reach, reason, openPushPrimer, reminder])

  const onSnooze = useCallback(() => {
    // Sem esse rastro o sumiço do card (adiado) é indistinguível de bug no smoke e em produção.
    void logEvent(EVENTS.PUSH_PERMISSION_CARD_SNOOZED, {
      surface: SURFACES.MOBILE,
      reason: reach.reason,
      snooze_count: reach.snoozeCount + 1,
    })
    reach.snooze()
  }, [reach])

  if (!isPushPermissionVisible(reach, protocols) || !reason) return null

  return (
    <PushPermissionCard
      reason={reason}
      reminder={reminder}
      multiple={multiple}
      snoozeCount={reach.snoozeCount}
      stillBlocked={wentToSettings}
      loading={loading}
      onEnable={onEnable}
      onSnooze={onSnooze}
    />
  )
}
