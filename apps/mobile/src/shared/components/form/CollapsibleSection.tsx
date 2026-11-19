// CollapsibleSection — "Mais opções" / "Mais detalhes" dos forms completos (spec 125, AC7.2/AC7.3/AC7.7).
//
// Nasce FECHADO (decisão PO no estudo de design). Abre sozinho quando um campo de dentro tem erro
// visível (`forceOpen`): campo obrigatório escondido num bloco fechado seria falha sem feedback.
// Fechado, mostra o resumo do que guarda (hi-fi T-1/R-1). `defaultOpen`: abre ao carregar (edição com
// dados preenchidos, smoke 1c).

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
// TODO(040-strict): namespace + cast — ver nota em ProtocolFormBody.tsx (resolução de tipos do lucide).
import * as LucideIcons from 'lucide-react-native'
import { colors, spacing, borderRadius } from '@shared/styles/tokens'

const { ChevronDown, ChevronUp } = LucideIcons as any

interface CollapsibleSectionProps {
  title: string
  summary?: string
  forceOpen?: boolean
  /**
   * Abre ao ficar true (ex.: edição com dados carregados depois do 1º render), enquanto a pessoa não
   * tocou no cabeçalho. Depois do toque, vale a escolha dela.
   */
  defaultOpen?: boolean
  testID?: string
  children: ReactNode
}

export default function CollapsibleSection({ title, summary, forceOpen = false, defaultOpen = false, testID, children }: CollapsibleSectionProps) {
  // States
  const [open, setOpen] = useState(defaultOpen)
  const toggled = useRef(false)

  // Effects
  useEffect(() => {
    if (defaultOpen && !toggled.current) setOpen(true)
  }, [defaultOpen])

  const expanded = open || forceOpen
  const Icon = expanded ? ChevronUp : ChevronDown
  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => {
          toggled.current = true
          setOpen(!expanded)
        }}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={title}
        testID={testID}
      >
        <View style={styles.text}>
          <Text style={styles.title}>{title}</Text>
          {!expanded && summary ? <Text style={styles.summary} numberOfLines={2}>{summary}</Text> : null}
        </View>
        <Icon size={20} color={colors.text.muted} />
      </Pressable>
      {expanded ? <View style={styles.body}>{children}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: spacing[3] },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minHeight: 56,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.light,
    backgroundColor: colors.bg.card,
  },
  pressed: { opacity: 0.85 },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '600', color: colors.text.primary },
  summary: { fontSize: 12, color: colors.text.muted },
  body: { gap: spacing[5] },
})
