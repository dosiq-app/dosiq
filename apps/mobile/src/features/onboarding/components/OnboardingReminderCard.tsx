// OnboardingReminderCard — "Me avise a hora de {verbo}" (120 D-4; 125: mora na conferência "Está certo?",
// PO smoke 18/11 — o passo "quando" ficou denso). Só registra a intenção: a permissão é pedida no
// consentimento, junto da gravação (pedir antes e falhar queimaria a permissão à toa).

import { View, Text, Switch, StyleSheet } from 'react-native'
// TODO(040-strict): named imports do lucide-react-native batem em TS2305 sob nodenext
import * as LucideIcons from 'lucide-react-native'
import { colors, spacing, borderRadius } from '@shared/styles/tokens'

const { Clock } = LucideIcons as any

interface Props {
  remind: boolean
  setRemind: (v: boolean) => void
  /** 120 D-4: verbo pela apresentação ("aplicar" para injetável), sem possessivo (INV-3). */
  verb?: string
}

export default function OnboardingReminderCard({ remind, setRemind, verb = 'tomar' }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.icon}>
        <Clock size={18} color={colors.primary[700]} strokeWidth={2} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>{`Me avise a hora de ${verb}`}</Text>
        <Text style={styles.sub}>Notificação no celular. O sistema vai pedir autorização: toque em Permitir.</Text>
      </View>
      <Switch
        value={remind}
        onValueChange={setRemind}
        accessibilityLabel={`Me avise a hora de ${verb}`}
        testID="reminder-switch"
        trackColor={{ true: colors.brand.primary, false: colors.border.default }}
        thumbColor={colors.bg.card}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[4], borderRadius: borderRadius.lg,
    borderWidth: 1.5, borderColor: colors.primary[200] || colors.primary[100], backgroundColor: colors.bg.card,
  },
  icon: { width: 36, height: 36, borderRadius: borderRadius.sm, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600', color: colors.text.primary },
  sub: { fontSize: 12, color: colors.text.muted, marginTop: 2, lineHeight: 16 },
})
