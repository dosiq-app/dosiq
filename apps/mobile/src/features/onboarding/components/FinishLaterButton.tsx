// FinishLaterButton — "Terminar depois" abaixo do CTA (spec 125, AC1.0). Com remédio identificado é a
// única saída do onboarding; leva ao consentimento com dado (AC1.1), que grava o que está completo.

import { Pressable, Text, StyleSheet } from 'react-native'
import { colors, spacing } from '@shared/styles/tokens'

export const FINISH_LATER_LABEL = 'Terminar depois'

export default function FinishLaterButton({ onPress, disabled = false }: { onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      style={styles.btn}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={FINISH_LATER_LABEL}
      testID="finish-later"
    >
      <Text style={styles.text}>{FINISH_LATER_LABEL}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  btn: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginBottom: spacing[2] },
  text: { fontSize: 15, fontWeight: '600', color: colors.brand.primary },
})
