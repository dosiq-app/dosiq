import { View, Text, StyleSheet } from 'react-native'
// TODO(040-strict): named imports do lucide-react-native batem em TS2305 — ver TreatmentsScreen.tsx
import * as LucideIcons from 'lucide-react-native'
import { colors, spacing, borderRadius } from '@shared/styles/tokens'

const { Plus } = LucideIcons as any

/**
 * Pílula "+ Nova compra" — o CTA de item sem estoque registrado. Única fonte para a aba Estoque
 * (`StockItem`) e o card do detalhe do tratamento (`ProtocolStockCard`): mesma palavra, mesmo tom
 * (117 A, INV-5). O tom por data do Programado (AC-4.5) entra aqui na Fatia B.
 */
export default function NewPurchaseBadge() {
  return (
    <View style={styles.badge} testID="new-purchase-badge">
      <Plus size={12} color={colors.status.error} strokeWidth={2.5} />
      <Text style={styles.text}>Nova compra</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing[2],
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.status.errorLight,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.status.error,
  },
})
