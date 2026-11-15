import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { colors, spacing, borderRadius, typography } from '@shared/styles/tokens'
import type { UnloggedGroup } from '@dashboard/utils/unloggedDoses'
// TODO(040-strict): named imports do lucide-react-native batem em TS2305 sob nodenext
import * as LucideIcons from 'lucide-react-native'

const { ClipboardCheck } = LucideIcons as any

/**
 * UnloggedDosesCard — RESUMO "N doses de hoje sem registro" no bloco de doses (spec 120 C · US9).
 * Smoke 14/11 (PO, C-02): o card repetia as ações da agenda logo abaixo. Agora só avisa acima da
 * dobra e leva à agenda, que é o ÚNICO ponto de ação ([Registrar] [Pular]). Tom neutro (DC-3).
 */
interface Props {
  groups: UnloggedGroup[]
  onSeeAgenda: () => void
}

export default function UnloggedDosesCard({ groups, onSeeAgenda }: Props) {
  if (!groups || groups.length === 0) return null
  const total = groups.reduce((n, g) => n + g.doses.length, 0)
  const title = total === 1 ? '1 dose de hoje sem registro' : `${total} doses de hoje sem registro`
  const times = groups.map((g) => g.scheduledTime).join(', ')

  return (
    <View style={styles.card} testID="unlogged-doses-card">
      <View style={styles.header} accessible accessibilityLabel={`${title}: ${times}`}>
        <View style={styles.iconWrap}>
          <ClipboardCheck size={20} color={colors.text.secondary} />
        </View>
        <View style={styles.text}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.times} numberOfLines={2}>{times}</Text>
        </View>
      </View>
      <Pressable
        onPress={onSeeAgenda}
        style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
        hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
        accessibilityRole="button"
        accessibilityLabel="Ver na agenda e registrar"
        testID="unlogged-see-agenda"
      >
        <Text style={styles.ctaText}>Ver na agenda</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: borderRadius.lg,
    padding: spacing[4],
    marginHorizontal: 20,
    marginBottom: spacing[4],
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    backgroundColor: colors.border.light,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1 },
  title: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: typography.fontFamily.medium || 'System',
    color: colors.text.primary,
  },
  times: { fontSize: 14, color: colors.text.secondary, marginTop: 2 },
  cta: {
    alignSelf: 'flex-start',
    marginTop: spacing[3],
    marginLeft: 48,
    borderWidth: 1.5,
    borderColor: colors.brand.primary,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing[4],
    paddingVertical: 6,
  },
  pressed: { opacity: 0.7 },
  ctaText: { fontSize: 13, fontWeight: '700', color: colors.brand.primary },
})
