// SetupMedHeader — remédio no topo das folhas de setup (spec 125 fatia 2 · PO smoke 20/11): nome + selo da
// forma, o mesmo título do card. A folha cobre o card e o paciente perdia de qual remédio se tratava.

import { View, Text, StyleSheet } from 'react-native'
import { formLabel } from '@dashboard/utils/setupCopy'
import { colors, spacing, borderRadius, typography } from '@shared/styles/tokens'

export default function SetupMedHeader({ protocol, medicine }: { protocol: any; medicine: any }) {
  const form = formLabel(medicine?.presentation)
  return (
    <View style={styles.row} testID="setup-med-header">
      <Text style={styles.name} numberOfLines={2}>{medicine?.name ?? protocol?.name ?? 'Remédio'}</Text>
      {form ? <View style={styles.chip}><Text style={styles.chipText}>{form}</Text></View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], flexWrap: 'wrap' },
  name: { fontSize: 18, fontWeight: '700', color: colors.text.primary, fontFamily: typography.fontFamily.bold, flexShrink: 1 },
  chip: { paddingHorizontal: spacing[2], paddingVertical: 2, borderRadius: borderRadius.xs, backgroundColor: colors.border.light, borderWidth: 1, borderColor: colors.border.default },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.text.secondary },
})
