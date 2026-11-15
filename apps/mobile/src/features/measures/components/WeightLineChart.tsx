// WeightLineChart.tsx — gráfico de peso em linha da Hoje (spec 121 A · FR-011 · ADR-125).
// Eixo X = dias da janela (from → to), eixo Y = escala "nice" do chartScale. Pontos `info` ligados
// pela WeightLineOverlay: sem suavização, tendência ou média; mesma cor para ganho e perda (INV-3).
// 1 ponto ⇒ não monta (quem chama mostra só o número — ADR-125 §3).

import { useMemo, useState } from 'react'
import { View, Text, StyleSheet, type LayoutChangeEvent } from 'react-native'
import { daysBetween } from '@dosiq/core'
import { buildScale, fmtTick } from '@measures/utils/chartScale'
import WeightLineOverlay from '@measures/components/WeightLineOverlay'
import { colors, spacing } from '@shared/styles/tokens'
import { formatShortDay } from '@treatments/utils/formatMeasureSeriesA11y'

const CHART_H = 120
const Y_AXIS_W = 34
const POINT_R = 3.5

export default function WeightLineChart({ points, from, to }: { points: { day: string; kg: number }[]; from: string; to: string }) {
  // States
  const [width, setWidth] = useState(0)
  // Memos
  const scale = useMemo(() => {
    const kgs = points.map((p) => p.kg)
    return kgs.length ? buildScale(Math.min(...kgs), Math.max(...kgs)) : buildScale(NaN, NaN)
  }, [points])
  const span = Math.max(1, daysBetween(from, to))
  const ySpan = scale.hi - scale.lo || 1
  const xFor = (day: string) => POINT_R + ((width - 2 * POINT_R) * Math.min(span, Math.max(0, daysBetween(from, day)))) / span
  const yFor = (kg: number) => POINT_R + (CHART_H - 2 * POINT_R) * (1 - (kg - scale.lo) / ySpan)

  if (points.length < 2) return null
  const a11y = `Peso de ${formatShortDay(points[0].day)} a ${formatShortDay(points[points.length - 1].day)}, ${points.length} pesagens`

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={a11y} testID="weight-line-chart">
      <View style={styles.row}>
        <View style={[styles.yAxis, { height: CHART_H }]}>
          {scale.ticks.map((t, i) => (
            <Text key={i} style={[styles.yLabel, { top: yFor(t) - 7 }]}>{fmtTick(t)}</Text>
          ))}
        </View>
        <View style={[styles.plot, { height: CHART_H }]} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} testID="weight-line-plot">
          {scale.ticks.map((t, i) => (
            <View key={`g${i}`} style={[styles.gridline, { top: yFor(t) }]} />
          ))}
          <WeightLineOverlay points={points.map((p) => ({ x: xFor(p.day), y: yFor(p.kg) }))} width={width} height={CHART_H} />
          {width > 0 &&
            points.map((p) => (
              <View key={p.day} testID="weight-line-point" style={[styles.point, { left: xFor(p.day) - POINT_R, top: yFor(p.kg) - POINT_R }]} />
            ))}
        </View>
      </View>
      <View style={styles.xAxis}>
        <Text style={styles.xLabel}>{formatShortDay(from)}</Text>
        <Text style={styles.xLabel}>{formatShortDay(to)}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  yAxis: { width: Y_AXIS_W, position: 'relative' },
  yLabel: { position: 'absolute', right: spacing[2], fontSize: 10, color: colors.text.muted },
  plot: { flex: 1, position: 'relative' },
  gridline: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.border.light },
  point: { position: 'absolute', width: POINT_R * 2, height: POINT_R * 2, borderRadius: POINT_R, backgroundColor: colors.status.info },
  xAxis: { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: Y_AXIS_W, marginTop: spacing[1] },
  xLabel: { fontSize: 10, color: colors.text.muted },
})
