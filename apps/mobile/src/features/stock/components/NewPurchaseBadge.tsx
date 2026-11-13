import { View, Text, StyleSheet } from 'react-native'
// TODO(040-strict): named imports do lucide-react-native batem em TS2305 — ver TreatmentsScreen.tsx
import * as LucideIcons from 'lucide-react-native'
import { colors, spacing, borderRadius } from '@shared/styles/tokens'

const { Plus } = LucideIcons as any

/**
 * Pílula "+ Nova compra" — o CTA de item sem estoque registrado. Única fonte para a aba Estoque
 * (`StockItem`) e o card do detalhe do tratamento (`ProtocolStockCard`): mesma palavra, mesmo tom
 * (117 A, INV-5).
 *
 * `tone` (117 B, AC-4.5 / FR-013): `alert` (vermelho) quando a compra venceu ou é a 1ª; `neutral` quando
 * ainda dá tempo ("comprar até" no futuro). Quem decide é `stockItemView` — aqui só se pinta.
 */
export default function NewPurchaseBadge({ tone = 'alert' }: { tone?: 'alert' | 'neutral' }) {
  const neutral = tone === 'neutral'
  const fg = neutral ? colors.neutral[700] : colors.status.error
  return (
    <View style={[styles.badge, neutral && styles.badgeNeutral]} testID="new-purchase-badge" accessibilityHint={neutral ? undefined : 'Compra urgente'}>
      <Plus size={12} color={fg} strokeWidth={2.5} />
      <Text style={[styles.text, { color: fg }]} testID={`new-purchase-badge-${tone}`}>Nova compra</Text>
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
  badgeNeutral: {
    backgroundColor: colors.neutral[100],
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.status.error,
  },
})
