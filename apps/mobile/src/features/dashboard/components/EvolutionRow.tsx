// EvolutionRow.tsx — linha Evolução (L3) do módulo "Semana do tratamento" (spec 121 B · FR-034, B-2).
//
// Estado da escada da 029. "Em evolução" e "Estável" ABREM no lugar (revisão PO 16/11): doses da etapa
// vigente (calendário da etapa, D7/D16) + escada completa — no estável, a visão de todo o caminho.
// "Aguardando" NÃO abre: chevron leva ao detalhe do tratamento, onde moram a explicação e o
// "Iniciar etapa" (AC-15 — a linha nunca tem ação de etapa). Escada = COMPLETA por `titration_id` (AP-311).

import { View, Text, Pressable, StyleSheet } from 'react-native'
// TODO(040-strict): named imports do lucide-react-native batem em TS2305 sob nodenext
import * as LucideIcons from 'lucide-react-native'
const { TrendingUp, ChevronRight, ChevronDown, ChevronUp } = LucideIcons as any
import { colors, spacing, borderRadius } from '@shared/styles/tokens'
import { type EvolutionCopy, type EvolutionDetail } from '@dashboard/utils/treatmentWeek'

type Props = {
  copy: EvolutionCopy
  detail: EvolutionDetail | null
  open: boolean
  onToggle: () => void
  onOpen: () => void
}

function StepBar({ done, total }: { done: number; total: number }) {
  return (
    <View style={styles.bar} testID="evolution-row-bar">
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[styles.barSeg, i < done && styles.barSegDone]} />
      ))}
    </View>
  )
}

function StageDoses({ d }: { d: NonNullable<EvolutionDetail['stageDoses']> }) {
  return (
    <View style={styles.card} testID="evolution-row-stage-doses">
      <Text style={styles.cardTitle}>Doses desta etapa</Text>
      <View style={styles.dosesRow}>
        {Array.from({ length: d.total }).map((_, i) => {
          const n = i + 1
          const done = n <= d.done
          const next = n === d.nextOrdinal
          return (
            <View key={n} style={[styles.doseDot, done && styles.doseDotDone, next && styles.doseDotNext]} testID={`evolution-dose-${n}-${done ? 'done' : next ? 'next' : 'later'}`}>
              <Text style={[styles.doseNum, done && styles.doseNumDone, next && styles.doseNumNext]}>{n}</Text>
            </View>
          )
        })}
        {d.nextText ? <Text style={styles.nextNote} testID="evolution-row-next">{d.nextText}</Text> : null}
      </View>
    </View>
  )
}

function CurrentDose({ c }: { c: NonNullable<EvolutionDetail['currentDose']> }) {
  return (
    <View style={styles.card} testID="evolution-row-current-dose">
      <View style={styles.dosesRow}>
        <View style={styles.flex}>
          <Text style={styles.cardTitle}>Dose atual</Text>
          <Text style={styles.currentDose}>{[c.dose, c.since].filter(Boolean).join(' · ')}</Text>
        </View>
        {c.nextText ? <Text style={styles.nextNote}>{c.nextText}</Text> : null}
      </View>
    </View>
  )
}

function Ladder({ steps }: { steps: EvolutionDetail['steps'] }) {
  return (
    <View testID="evolution-row-ladder">
      {steps.map((s) => (
        <View key={s.position} style={styles.stepRow}>
          <View style={[styles.stepDot, styles[`stepDot_${s.state}`]]} />
          <Text style={[styles.stepLabel, s.state === 'now' && styles.stepLabelNow]}>{s.label}</Text>
          {s.note ? <Text style={styles.stepNote}>{s.note}</Text> : null}
        </View>
      ))}
    </View>
  )
}

export default function EvolutionRow({ copy, detail, open, onToggle, onOpen }: Props) {
  const expandable = copy.key !== 'aguardando' && !!detail
  const isOpen = expandable && open
  const Chevron = !expandable ? ChevronRight : isOpen ? ChevronUp : ChevronDown
  const showBar = expandable && copy.key === 'em_evolucao' && !isOpen && detail
  return (
    <View style={styles.root}>
      <Pressable
        onPress={expandable ? onToggle : onOpen}
        style={styles.head}
        accessibilityRole="button"
        accessibilityState={expandable ? { expanded: isOpen } : undefined}
        accessibilityLabel={`Evolução. ${copy.primary}. ${copy.secondary}`}
        testID="week-row-evolucao"
      >
        <View style={styles.icon}>
          <TrendingUp size={18} color={colors.text.secondary} strokeWidth={2} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.title}>Evolução</Text>
          <Text style={styles.value} testID="evolution-row-primary">{copy.primary}</Text>
          {showBar ? (
            <StepBar done={detail.bar.done} total={detail.bar.total} />
          ) : (
            <Text style={styles.neutral} testID={`evolution-row-${copy.key}`}>{copy.secondary}</Text>
          )}
        </View>
        <Chevron size={18} color={colors.text.secondary} />
      </Pressable>
      {isOpen && detail ? (
        <View style={styles.body} testID="evolution-row-body">
          {copy.key === 'em_evolucao' && detail.stageDoses ? <StageDoses d={detail.stageDoses} /> : null}
          {copy.key === 'estavel' && detail.currentDose ? <CurrentDose c={detail.currentDose} /> : null}
          <Ladder steps={detail.steps} />
          <Pressable onPress={onOpen} style={styles.link} accessibilityRole="link" testID="evolution-row-open-treatment">
            <Text style={styles.linkText}>Ver tratamento</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { borderTopWidth: 1, borderTopColor: colors.border.light, paddingVertical: spacing[3] },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], minHeight: 48 },
  icon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bg.screen, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  title: { fontSize: 13, fontWeight: '700', color: colors.text.secondary },
  value: { fontSize: 16, fontWeight: '700', color: colors.text.primary, marginTop: 2 },
  neutral: { fontSize: 13, color: colors.text.secondary, marginTop: 2 },
  bar: { flexDirection: 'row', gap: 4, marginTop: 6 },
  barSeg: { width: 22, height: 6, borderRadius: 3, backgroundColor: colors.border.light },
  barSegDone: { backgroundColor: colors.brand.primary },
  body: { marginTop: spacing[3], gap: spacing[3] },
  card: { borderWidth: 1, borderColor: colors.border.light, borderRadius: borderRadius.md, padding: spacing[3], gap: spacing[2], backgroundColor: colors.bg.card },
  cardTitle: { fontSize: 13, color: colors.text.secondary },
  dosesRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  doseDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border.light, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg.card },
  doseDotDone: { backgroundColor: colors.brand.primary, borderWidth: 0 },
  doseDotNext: { borderStyle: 'dashed', borderColor: colors.brand.primary },
  doseNum: { fontSize: 13, fontWeight: '700', color: colors.text.secondary },
  doseNumDone: { color: colors.text.inverse },
  doseNumNext: { color: colors.brand.primary },
  nextNote: { flex: 1, textAlign: 'right', fontSize: 12, color: colors.text.secondary },
  currentDose: { fontSize: 15, fontWeight: '700', color: colors.text.primary, marginTop: 2 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], minHeight: 30 },
  stepDot: { width: 14, height: 14, borderRadius: 7 },
  stepDot_done: { backgroundColor: colors.brand.primary },
  stepDot_now: { borderWidth: 3, borderColor: colors.brand.primary, backgroundColor: colors.bg.card },
  stepDot_next: { borderWidth: 1.5, borderColor: colors.neutral[300], backgroundColor: colors.bg.card },
  stepDot_later: { borderWidth: 1.5, borderColor: colors.neutral[300], backgroundColor: colors.bg.card },
  stepLabel: { flex: 1, fontSize: 13, color: colors.text.secondary },
  stepLabelNow: { fontSize: 14, fontWeight: '700', color: colors.text.primary },
  stepNote: { fontSize: 12, color: colors.text.secondary },
  link: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center' },
  linkText: { fontSize: 14, fontWeight: '700', color: colors.brand.primary },
})
