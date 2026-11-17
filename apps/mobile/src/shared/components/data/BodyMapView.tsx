// BodyMapView.tsx — mapa do corpo SÓ LEITURA (spec 121 B, T022b / FR-032).
//
// Mesma geometria do core (ADR-096) e mesmo modelo de marcadores do PDF (`buildBodyMapMarkers`).
// Marca só o PASSADO e só a ÚLTIMA aplicação, sem números (121 D14: vários números = vários locais
// em destaque, risco de leitura como rodízio sugerido). Não existe
// estado "sugerido/próximo" — o app nunca indica onde aplicar (INV-2, AC-14; linha SaMD).
// Sem toque: não é seletor (o seletor é o `BodyMapSelector` da 071).

import { View, Text, StyleSheet } from 'react-native'
import { Svg, Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg'
import {
  BODY_MAP_FACES,
  BODY_MAP_SIDE_LETTERS,
  BODY_MAP_SILHOUETTE as S,
  INJECTION_BODY_MAP_VIEWBOX,
  buildBodyMapMarkers,
  getKnownInjectionSiteLabel,
  type BodyMapFace,
} from '@dosiq/core'
import { colors, spacing } from '@shared/styles/tokens'

const FACE_LABELS: Record<BodyMapFace, string> = { frente: 'Frente', costas: 'Costas' }

type Props = {
  /** Locais das últimas aplicações, MAIS RECENTE PRIMEIRO (null = sem local). */
  recentSites: (string | null | undefined)[]
  width?: number
}

function Face({ face, recentSites, width }: { face: BodyMapFace; recentSites: Props['recentSites']; width: number }) {
  const { width: vw, height: vh } = INJECTION_BODY_MAP_VIEWBOX
  const markers = buildBodyMapMarkers(face, { recentSites: recentSites.slice(0, 1) })
  return (
    <View style={styles.face}>
      <Svg width={width} height={(width * vh) / vw} viewBox={`0 0 ${vw} ${vh}`}>
        <SvgText x="10" y="13" fontSize="10" fontWeight="700" fill={colors.text.secondary} textAnchor="middle">
          {BODY_MAP_SIDE_LETTERS.left}
        </SvgText>
        <SvgText x={vw - 10} y="13" fontSize="10" fontWeight="700" fill={colors.text.secondary} textAnchor="middle">
          {BODY_MAP_SIDE_LETTERS.right}
        </SvgText>
        <G fill={colors.neutral[100]} stroke={colors.neutral[300]} strokeWidth="1">
          <Circle cx={S.head.cx} cy={S.head.cy} r={S.head.r} />
          <Rect x={S.neck.x} y={S.neck.y} width={S.neck.width} height={S.neck.height} rx={S.neck.rx} />
          {S.limbs.map((limb) => (
            <Path key={limb.d} d={limb.d} fill="none" stroke={colors.neutral[100]} strokeWidth={limb.strokeWidth} strokeLinecap="round" />
          ))}
          <Path d={S.torso} />
          {face === 'costas' && S.backDetails.map((d) => <Path key={d} d={d} fill="none" stroke={colors.neutral[300]} />)}
        </G>
        {markers.map(({ region, emphasis }) => {
          const latest = emphasis === 'latest'
          return (
            <G key={region.value} testID={`bodymap-view-${region.value}-${emphasis}`}>
              <Path
                d={region.path}
                fill={latest ? colors.brand.primary : colors.bg.card}
                stroke={latest ? colors.brand.primary : colors.neutral[300]}
                strokeWidth={latest ? 1.4 : 1}
                strokeDasharray={latest ? undefined : '2,1.5'}
              />
            </G>
          )
        })}
      </Svg>
      <Text style={styles.faceLabel}>{FACE_LABELS[face]}</Text>
    </View>
  )
}

export default function BodyMapView({ recentSites, width = 110 }: Props) {
  const latestLabel = getKnownInjectionSiteLabel(recentSites[0] ?? null)
  return (
    <View
      style={styles.root}
      accessible
      accessibilityLabel={latestLabel ? `Mapa da última aplicação: ${latestLabel}` : 'Mapa da última aplicação'}
      testID="bodymap-view"
    >
      {BODY_MAP_FACES.map((f) => (
        <Face key={f} face={f} recentSites={recentSites} width={width} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', justifyContent: 'center', gap: spacing[4] },
  face: { alignItems: 'center' },
  faceLabel: { fontSize: 12, color: colors.text.secondary, marginTop: spacing[1] },
})
