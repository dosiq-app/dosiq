// TrackPickerSheet.tsx — sheet "Acompanhar" do módulo da Hoje (spec 124 B · FR-012 · mock C-2).
// Uma linha por tratamento elegível: ícone da forma, nome · concentração e estado NEUTRO
// (`trackedStatusLine`). Selecionado = fundo tingido + ✓. A escolha vale só na sessão (FR-014).
// Mesmo padrão de Modal slide do sheet da dose (124 A).

import { Modal, View, Text, Pressable, ScrollView, StyleSheet, Platform, StatusBar } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
// TODO(040-strict): named imports do lucide-react-native batem em TS2305 sob nodenext
import * as LucideIcons from 'lucide-react-native'
const { Syringe, Pill, Check, X } = LucideIcons as any
import { colors, spacing, borderRadius } from '@shared/styles/tokens'

export type TrackPickerItem = {
  id: string
  name: string
  concentration: string | null
  statusLine: string
  injectable: boolean
}

type Props = {
  visible: boolean
  items: readonly TrackPickerItem[]
  selectedId: string | null
  onSelect: (id: string) => void
  onClose: () => void
}

export default function TrackPickerSheet({ visible, items, selectedId, onSelect, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        {Platform.OS === 'android' ? <View style={{ height: StatusBar.currentHeight ?? 0 }} /> : null}
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fechar" />
        <SafeAreaView edges={['bottom']} style={styles.sheet} testID="track-picker-sheet">
          <View style={styles.handle} />
          <View style={styles.headRow}>
            <Text style={styles.title} accessibilityRole="header">Acompanhar</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Fechar" style={styles.close} testID="track-picker-close">
              <X size={22} color={colors.text.secondary} />
            </Pressable>
          </View>
          {/* RC6 #977: lista rola dentro de um sheet limitado (fonte grande / muitos tratamentos). */}
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          {items.map((it) => {
            const on = it.id === selectedId
            const Icon = it.injectable ? Syringe : Pill
            return (
              <Pressable
                key={it.id}
                onPress={() => { onSelect(it.id); onClose() }}
                style={[styles.row, on ? styles.rowOn : styles.rowOff]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${it.name}${it.concentration ? `, ${it.concentration}` : ''}. ${it.statusLine}`}
                testID={`track-picker-row-${it.id}`}
              >
                <View style={styles.icon}><Icon size={18} color={colors.brand.primary} strokeWidth={2} /></View>
                <View style={styles.flex}>
                  <Text style={styles.name} numberOfLines={1}>
                    {it.name}
                    {it.concentration ? <Text style={styles.conc}>{` · ${it.concentration}`}</Text> : null}
                  </Text>
                  {it.statusLine ? <Text style={styles.status} testID={`track-picker-status-${it.id}`}>{it.statusLine}</Text> : null}
                </View>
                {on ? <Check size={20} color={colors.brand.primary} strokeWidth={2.6} testID="track-picker-check" /> : null}
              </Pressable>
            )
          })}
          </ScrollView>
          <Text style={styles.footnote}>A escolha vale até fechar o app.</Text>
        </SafeAreaView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.bg.overlay },
  sheet: {
    backgroundColor: colors.bg.card,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[2],
    paddingBottom: spacing[6],
    gap: spacing[2],
    maxHeight: '85%',
  },
  list: { flexGrow: 0 },
  listContent: { gap: spacing[2] },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: borderRadius.full, backgroundColor: colors.neutral[300], marginBottom: spacing[1] },
  headRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  title: { flex: 1, fontSize: 19, lineHeight: 24, fontWeight: '800', color: colors.text.primary },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -spacing[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], minHeight: 60, paddingVertical: spacing[2], paddingHorizontal: spacing[3], borderRadius: borderRadius.lg, borderWidth: 1 },
  rowOn: { backgroundColor: colors.brand.mint, borderColor: 'transparent' },
  rowOff: { backgroundColor: colors.bg.card, borderColor: colors.border.light },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg.screen, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text.primary },
  conc: { fontSize: 12, fontWeight: '600', color: colors.text.muted },
  status: { fontSize: 13, color: colors.text.secondary, marginTop: 2 },
  footnote: { fontSize: 12, color: colors.text.muted, textAlign: 'center', marginTop: spacing[1] },
})
