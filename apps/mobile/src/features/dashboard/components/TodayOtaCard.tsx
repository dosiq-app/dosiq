import React from 'react'
import PromoCardShell from '@shared/components/ui/PromoCardShell'
import { colors } from '@shared/styles/tokens'
// TODO(040-strict): named imports do lucide-react-native batem em TS2305 sob nodenext
import * as LucideIcons from 'lucide-react-native'

const { RefreshCw } = LucideIcons as any

/**
 * Atualização pronta (OTA) como alerta TÉCNICO #7 da régua (spec 120 C · C1.5 C-4). Antes ocupava o
 * slot do nudge; agora usa a casca única do slot de alerta, tom neutro, sem dispensa (não some: o
 * app aplica sozinho no próximo início frio). Texto inalterado do banner anterior.
 */
export default function TodayOtaCard({ onApply }: { onApply: () => void }) {
  return (
    <PromoCardShell
      testID="today-ota-card"
      tone="neutral"
      icon={<RefreshCw size={22} color={colors.text.secondary} />}
      title="Atualização no Dosiq"
      subtitle="Uma nova atualização de segurança no app foi baixada e está pronta para uso."
      primary={{ label: 'Reiniciar o aplicativo', accessibilityLabel: 'Reiniciar o aplicativo para atualizar', onPress: onApply }}
    />
  )
}
