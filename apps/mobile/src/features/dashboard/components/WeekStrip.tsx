// WeekStrip.tsx — faixa dos últimos 7 dias da L1 diária (spec 121 C · AC-17, FR-041/FR-046).
//
// Janela MÓVEL terminando hoje (hoje na ponta direita — decisão PO 17/11), rótulo pela letra do dia
// da semana. Fatos, não nota: cheio = doses vencidas registradas; meio-cheio na diagonal = parte
// registrada (mesmo desenho do PDF, `.c.partial`); neutro = vencida sem registro (nunca vermelho,
// nunca "perdeu"); vazio = hoje ainda por vir ou fora do que foi lido; traço = sem dose prevista.

import { View, Text, StyleSheet } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import type { DailyDayState, DailyWindowDay } from '@dosiq/core'
import { colors, spacing } from '@shared/styles/tokens'

const LETTERS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const SIZE = 22
const R = SIZE / 2

function a11y(d: DailyWindowDay, unit: string): string {
  const name = `${NAMES[d.weekday]}${d.isToday ? ' (hoje)' : ''}`
  const texts: Record<DailyDayState, string> = {
    full: 'registrado',
    partial: `${d.registered} de ${d.due} ${unit} registradas`,
    open: 'sem registro',
    pending: 'ainda por vir',
    off: 'sem dose prevista',
    unknown: 'sem dado carregado',
  }
  return `${name}: ${texts[d.state]}`
}

/** Meio-cheio na diagonal (canto superior esquerdo cheio), como o 135° do PDF. */
function PartialDot() {
  return (
    <Svg width={SIZE} height={SIZE} testID="week-strip-partial">
      <Circle cx={R} cy={R} r={R - 0.75} fill={colors.bg.card} stroke={colors.brand.primary} strokeWidth={1.5} />
      <Path d={`M ${R + R * Math.SQRT1_2} ${R - R * Math.SQRT1_2} A ${R} ${R} 0 0 0 ${R - R * Math.SQRT1_2} ${R + R * Math.SQRT1_2} Z`} fill={colors.brand.primary} />
    </Svg>
  )
}

export default function WeekStrip({ days, injectable = false }: { days: DailyWindowDay[]; injectable?: boolean }) {
  const unit = injectable ? 'aplicações' : 'doses'
  return (
    <View style={styles.row} testID="week-strip">
      {days.map((d) => (
        <View key={d.day} style={styles.col} accessible accessibilityLabel={a11y(d, unit)} testID={`week-strip-${d.day}-${d.state}`}>
          <Text style={styles.letter}>{LETTERS[d.weekday]}</Text>
          {d.state === 'off' ? (
            <View style={styles.offMark} />
          ) : d.state === 'partial' ? (
            <PartialDot />
          ) : (
            <View style={[styles.dot, d.state === 'full' && styles.dotFull, d.state === 'open' && styles.dotOpen]} />
          )}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing[2], paddingHorizontal: spacing[1] },
  col: { alignItems: 'center', gap: 6, minWidth: 32 },
  letter: { fontSize: 12, fontWeight: '600', color: colors.text.secondary },
  dot: { width: SIZE, height: SIZE, borderRadius: R, borderWidth: 1.5, borderColor: colors.border.light, backgroundColor: colors.bg.card },
  dotFull: { backgroundColor: colors.brand.primary, borderWidth: 0 },
  dotOpen: { backgroundColor: colors.neutral[100], borderColor: colors.neutral[300] },
  offMark: { width: 10, height: 2, borderRadius: 1, backgroundColor: colors.neutral[300], marginVertical: 10 },
})
