// ChecklistRow — linha verificável (✓ feito · ○ falta · tracejado = confira manualmente) da checklist de
// ajustes do aparelho. Dono único (128 A, extraído da OemBatteryAssistantScreen da 068): a tela da 068 e o
// sheet de tela cheia do alarme crítico usam a mesma linha. O estado vai no rótulo de acessibilidade, não só
// no ícone (RC2 D-8).

import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
// TODO(040-strict): named imports do lucide-react-native batem em TS2305 sob nodenext
import * as LucideIcons from 'lucide-react-native'
const { ChevronRight, CircleCheck, Circle, CircleDashed } = LucideIcons as any
import type { ChecklistItem } from '@features/oemAssistant/oemChecklist'
import { colors, spacing } from '@shared/styles/tokens'

// A linha inteira é tocável e leva à MESMA tela do CTA principal (decisão PO 2026-11-10): o ✓/○
// convida ao toque; quem tocar achando que marca o item já cai nas Configurações (voltar = 1 toque).
export default function ChecklistRow({
  item,
  last,
  onPress,
  accessibilityHint = 'Abre as configurações do app',
}: {
  item: Pick<ChecklistItem, 'title' | 'action' | 'instruction' | 'state'>
  last: boolean
  onPress: () => void
  accessibilityHint?: string
}) {
  const done = item.state === 'done'
  const manual = item.state === 'manual'
  // ✓ mostra o estado alcançado; ○ e manual, a ação que falta (smoke g06 2026-11-24).
  const heading = done ? item.title : item.action
  const label = done
    ? `${heading}, feito`
    : manual
      ? `${heading}, confira manualmente: ${item.instruction}`
      : `${heading}, pendente: ${item.instruction}`
  return (
    <Pressable
      style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && styles.rowPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
    >
      {done ? (
        <CircleCheck size={22} color={colors.brand.primary} strokeWidth={2} />
      ) : manual ? (
        // Manual: nem ✓ nem ○ — o app não leu o ajuste (INV-7 · PO 2026-11-11).
        <CircleDashed size={22} color={colors.text.secondary} strokeWidth={2} />
      ) : (
        <Circle size={22} color={colors.text.secondary} strokeWidth={2} />
      )}
      <View style={styles.rowText}>
        <Text style={done ? styles.rowTitleDone : styles.rowTitle}>{heading}</Text>
        {manual && <Text style={styles.rowTag}>Confira manualmente</Text>}
        {!done && <Text style={styles.rowInstruction}>{item.instruction}</Text>}
      </View>
      {/* › só no que pede ação: sinaliza "leva a outra tela", não "marca" (PO 2026-11-10) */}
      {!done && <ChevronRight size={20} color={colors.text.secondary} style={styles.rowChevron} />}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing[3], alignItems: 'flex-start', padding: spacing[4] },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border.default },
  rowPressed: { opacity: 0.6 },
  rowChevron: { alignSelf: 'center' },
  rowText: { flex: 1, gap: 4 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.text.primary },
  rowTitleDone: { fontSize: 15, fontWeight: '600', color: colors.text.secondary },
  rowTag: { fontSize: 12, fontWeight: '600', color: colors.text.secondary },
  rowInstruction: { fontSize: 14, lineHeight: 20, color: colors.text.primary },
})
