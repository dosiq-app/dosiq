import React from 'react'
import { View, StyleSheet } from 'react-native'
import { colors } from '@shared/styles/tokens'
import { SIGNAL_DOT_SIZE } from '@dashboard/state/todaySurfaceSignal'

/**
 * Ponto do sinal discreto (spec 120 C · D-6 · RC2-C DC-8): 8 dp, `status.warning` (suprimido ≠
 * urgente — nunca vermelho), sem número, sem animação. O rótulo para leitor de tela fica no
 * elemento que o contém ("…, novo aviso") — o ponto em si é decorativo.
 */
export default function SignalDot({ testID }: { testID?: string }) {
  return <View style={styles.dot} accessible={false} importantForAccessibility="no" testID={testID} />
}

const styles = StyleSheet.create({
  dot: {
    width: SIGNAL_DOT_SIZE,
    height: SIGNAL_DOT_SIZE,
    borderRadius: SIGNAL_DOT_SIZE / 2,
    backgroundColor: colors.status.warning,
  },
})
