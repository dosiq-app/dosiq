// WeightLineOverlay.tsx — a LINHA do gráfico de peso (spec 121 A · ADR-125 §1).
// Segmentos retos entre os pontos presentes, na ordem do tempo: sem suavização, sem tendência
// projetada, sem média. Uma cor (info), a mesma para ganho e perda (ADR-062 / INV-3).
// Compartilhado por WeightStepChart (detalhe), ScatterTrend (peso, tela Medidas) e
// WeightLineChart (Hoje): os três pontos de uso do peso desenham a mesma linha.

import { StyleSheet } from 'react-native'
import { Svg, Polyline } from 'react-native-svg'
import { colors } from '@shared/styles/tokens'

export interface LinePoint {
  x: number
  y: number
}

export default function WeightLineOverlay({ points, width, height }: { points: LinePoint[]; width: number; height: number }) {
  // < 2 pontos não há linha (ADR-125 §3: 1 pesagem = só o número).
  if (points.length < 2 || width <= 0) return null
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none" testID="weight-line">
      <Polyline
        points={points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
        fill="none"
        stroke={colors.status.info}
        strokeOpacity={0.6}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </Svg>
  )
}
