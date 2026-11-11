// OemAssistantProfileRow — entrada fixa "Alarme e bateria" no Perfil → Avisos & Lembretes (spec 068 PR 2,
// US5/FR-008 revisada pelo PO 2026-11-11). Única volta ao assistente depois do dismiss definitivo do card:
// aparece SEMPRE no Android, independente de dismiss e do gate (AC-11). iOS: nada.
// Resumo lido da MESMA checklist da tela (`summarizeChecklist`) — zero fato novo. Pendência em âmbar,
// nunca bolinha vermelha (o vermelho com número é o contador da caixa de avisos).

import React, { useMemo } from 'react'
import { Platform, View, Text, TouchableOpacity, StyleSheet } from 'react-native'
// TODO(040-strict): named imports do lucide-react-native batem em TS2305 sob nodenext
import * as LucideIcons from 'lucide-react-native'
const { AlarmClock, ChevronRight } = LucideIcons as any
import { useOemBatteryAssistant } from '@features/oemAssistant/hooks/useOemBatteryAssistant'
import { buildChecklist, summarizeChecklist } from '@features/oemAssistant/oemChecklist'
import { colors, spacing } from '@shared/styles/tokens'

interface Props {
  onPress: () => void
}

function OemAssistantProfileRowAndroid({ onPress }: Props) {
  const { family, facts, reason } = useOemBatteryAssistant()
  const summary = useMemo(
    () => summarizeChecklist(buildChecklist(family, facts), reason === undefined),
    [family, facts, reason]
  )
  const subtitle = summary.label ?? 'Confira os ajustes do aparelho'
  const pending = summary.status === 'pending'

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Alarme e bateria, ${subtitle}`}
    >
      <AlarmClock size={20} color={colors.brand.primary} strokeWidth={1.5} />
      <View style={styles.textGroup}>
        <Text style={styles.label}>Alarme e bateria</Text>
        <Text style={pending ? styles.subtitlePending : styles.subtitle}>{subtitle}</Text>
      </View>
      <ChevronRight size={18} color={colors.text.secondary} strokeWidth={1.5} />
    </TouchableOpacity>
  )
}

export default function OemAssistantProfileRow(props: Props) {
  // Hook só monta no Android: no iOS não há sonda nem linha.
  if (Platform.OS !== 'android') return null
  return <OemAssistantProfileRowAndroid {...props} />
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[4],
    borderTopWidth: 1,
    borderTopColor: colors.border.light,
  },
  textGroup: { flex: 1, gap: 2 },
  label: { fontSize: 16, color: colors.text.primary, fontWeight: '500' },
  subtitle: { fontSize: 12, color: colors.text.secondary },
  subtitlePending: { fontSize: 12, color: colors.status.warning, fontWeight: '600' },
})
