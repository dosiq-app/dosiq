// LoadingDots — "Carregando" + três pontos animados (spec 124 A, smoke 23/11).
// Só onde ainda NÃO há dado para mostrar (1ª carga sem cache): comunica trabalho em andamento no
// lugar da barra cinza parada, que parecia app quebrado. Respeita "reduzir movimento" (pontos fixos).

import { useEffect, useState } from 'react'
import { AccessibilityInfo, Animated, Text, View, StyleSheet } from 'react-native'
import { colors } from '@shared/styles/tokens'

const STEP_MS = 260

export default function LoadingDots({ label = 'Carregando', testID = 'loading-dots' }: { label?: string; testID?: string }) {
  // States
  const [reduceMotion, setReduceMotion] = useState(false)
  const [values] = useState(() => [0, 1, 2].map(() => new Animated.Value(0.25)))

  // Effects
  useEffect(() => {
    let alive = true
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((on) => { if (alive) setReduceMotion(!!on) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (reduceMotion) return undefined
    const pulse = (v: Animated.Value) => Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: STEP_MS, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0.25, duration: STEP_MS, useNativeDriver: true }),
    ])
    const loop = Animated.loop(Animated.stagger(STEP_MS / 2, values.map(pulse)))
    loop.start()
    return () => loop.stop()
  }, [reduceMotion, values])

  return (
    <View style={styles.row} testID={testID} accessible accessibilityRole="progressbar" accessibilityLabel={`${label}…`}>
      <Text style={styles.text}>{label}</Text>
      {values.map((v, i) => (
        <Animated.Text key={i} style={reduceMotion ? styles.text : [styles.text, { opacity: v }]}>.</Animated.Text>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', marginTop: 2 },
  text: { fontSize: 13, color: colors.text.secondary },
})
