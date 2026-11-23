// DoseWarnings — avisos suaves de plausibilidade da dose (spec 125, AC3.2/AC3.3, hi-fi `StWarn`; INV-5:
// nunca bloqueia). Título em negrito = 1ª frase da mensagem do core; "Usar X mesmo assim" esconde o aviso.

// TODO(040-strict): named imports do lucide-react-native batem em TS2305 sob nodenext
import * as LucideIcons from 'lucide-react-native'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import type { DosePlausibilityWarning } from '@dosiq/core'
import { colors, spacing, borderRadius } from '@shared/styles/tokens'

const { AlertTriangle } = LucideIcons as any

interface Props {
  warnings: DosePlausibilityWarning[]
  confirmLabel: string
  onConfirm: () => void
}

// "0,6 parece mL. A dose é em mg? …" ⇒ ["0,6 parece mL.", "A dose é em mg? …"]
function splitTitle(message: string): [string, string] {
  const i = message.indexOf('. ')
  return i < 0 ? [message, ''] : [message.slice(0, i + 1), message.slice(i + 2)]
}

export default function DoseWarnings({ warnings, confirmLabel, onConfirm }: Props) {
  if (!warnings.length) return null
  return (
    <View style={styles.box} testID="dose-warnings" accessibilityLiveRegion="polite">
      <AlertTriangle size={18} color={colors.status.warning} strokeWidth={2} />
      <View style={styles.body}>
        {warnings.map((w) => {
          const [title, rest] = splitTitle(w.message)
          return (
            <Text key={w.kind} style={styles.text}>
              <Text style={styles.title}>{title}</Text>
              {rest ? `\n${rest}` : ''}
            </Text>
          )
        })}
        <Pressable onPress={onConfirm} accessibilityRole="button" accessibilityLabel={confirmLabel} hitSlop={8}>
          <Text style={styles.link}>{confirmLabel}</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', gap: spacing[2], paddingVertical: spacing[3], paddingHorizontal: spacing[3], borderRadius: borderRadius.md, backgroundColor: colors.status.warningLight },
  body: { flex: 1, gap: spacing[1] },
  text: { fontSize: 14, color: colors.status.warning, lineHeight: 20 },
  title: { fontWeight: '700' },
  link: { fontSize: 14, fontWeight: '600', color: colors.brand.primary },
})
