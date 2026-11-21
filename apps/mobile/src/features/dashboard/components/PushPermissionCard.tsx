import React from 'react'
// TODO(040-strict): named imports do lucide-react-native batem em TS2305 sob nodenext
import * as LucideIcons from 'lucide-react-native'
const { BellOff } = LucideIcons as any
import PromoCardShell from '@shared/components/ui/PromoCardShell'
import { colors } from '@shared/styles/tokens'
import type { ReachReason } from '@platform/notifications/usePushReachability'
import { PUSH_REACH_SNOOZE_MAX } from '@platform/notifications/usePushReachability'
import type { NextDoseReminder } from '@dashboard/utils/nextDoseReminder'
import { pushPermissionCopy, PUSH_PERMISSION_SETTINGS_HINT } from '@dashboard/utils/pushPermissionCopy'

/**
 * PushPermissionCard — "os lembretes não chegam" na faixa de alertas da Hoje (spec 120 US1, D-3/D-5).
 * Tom de aviso (casca da 068), nunca erro. Sem "protocolo" e sem possessivo (INV-3).
 */
interface PushPermissionCardProps {
  reason: ReachReason
  /** Próxima dose com lembrete (D-3); `null` ⇒ subtítulo genérico. */
  reminder: NextDoseReminder | null
  /** Mais de um tratamento com lembrete ⇒ "a próxima dose (X)". */
  multiple: boolean
  /** Adiamentos já feitos (D-5: no último o botão vira "Não mostrar de novo"). */
  snoozeCount: number
  /** D-5: voltou dos Ajustes sem conceder. */
  stillBlocked: boolean
  /** S-15: o canal bloqueado é o de doses críticas. */
  critical?: boolean
  loading: boolean
  onEnable: () => void
  onSnooze: () => void
  /** Foco da Hoje: fundo âmbar e botão cheio só quando é o foco (emenda PO 20/11). */
  emphasis?: boolean
}

export default function PushPermissionCard(props: PushPermissionCardProps) {
  const { snoozeCount, loading, onEnable, onSnooze } = props
  const copy = pushPermissionCopy(props)
  const lastChance = snoozeCount >= PUSH_REACH_SNOOZE_MAX - 1
  const subtitle = lastChance ? `${copy.subtitle} ${PUSH_PERMISSION_SETTINGS_HINT}` : copy.subtitle
  const secondaryLabel = lastChance ? 'Não mostrar de novo' : 'Agora não'
  return (
    <PromoCardShell
      emphasis={props.emphasis ?? true}
      testID="push-permission-card"
      icon={<BellOff size={22} color={colors.status.warning} strokeWidth={2} />}
      title={copy.title}
      subtitle={subtitle}
      primary={{ label: copy.cta, accessibilityLabel: copy.cta, onPress: onEnable, loading }}
      secondary={{ label: secondaryLabel, accessibilityLabel: `${secondaryLabel} o aviso de lembretes`, onPress: onSnooze }}
    />
  )
}
