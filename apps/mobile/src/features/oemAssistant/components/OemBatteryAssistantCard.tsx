import React from 'react'
// TODO(040-strict): named imports do lucide-react-native batem em TS2305 sob nodenext
import * as LucideIcons from 'lucide-react-native'
const { TriangleAlert } = LucideIcons as any
import PromoCardShell from '@shared/components/ui/PromoCardShell'
import { colors } from '@shared/styles/tokens'
import type { AssistantReason } from '@features/oemAssistant/hooks/useOemBatteryAssistant'

/**
 * OemBatteryAssistantCard — aviso inline na Hoje (spec 068 T011). NÃO é modal (R-239).
 * Casca comum em `PromoCardShell` (120 D-2); rótulos honestos (D-4): "Ajustar" leva aos passos e
 * "Não mostrar de novo" é definitivo (AC-10) — "Agora não" é proibido aqui.
 */
interface OemBatteryAssistantCardProps {
  reason: Exclude<AssistantReason, null>
  onAdjust: () => void
  onDismiss: () => void
  /** Foco da Hoje: fundo âmbar e botão cheio só quando é o foco (emenda PO 20/11). */
  emphasis?: boolean
}

export default function OemBatteryAssistantCard({ reason, onAdjust, onDismiss, emphasis = true }: OemBatteryAssistantCardProps) {
  const subtitle =
    reason === 'restricted'
      ? 'O aparelho está segurando o Dosiq em segundo plano. Um ajuste rápido ajuda o alarme a tocar na hora.'
      : 'A economia de bateria deste aparelho pode adiar os alarmes. Um ajuste rápido ajuda a evitar isso.'
  return (
    <PromoCardShell
      emphasis={emphasis}
      icon={<TriangleAlert size={22} color={colors.status.warning} strokeWidth={2} />}
      title="O alarme pode não tocar neste aparelho"
      subtitle={subtitle}
      primary={{ label: 'Ajustar', accessibilityLabel: 'Ajustar o aparelho para o alarme tocar', onPress: onAdjust }}
      secondary={{
        label: 'Não mostrar de novo',
        accessibilityLabel: 'Não mostrar de novo o aviso de bateria',
        onPress: onDismiss,
      }}
    />
  )
}
