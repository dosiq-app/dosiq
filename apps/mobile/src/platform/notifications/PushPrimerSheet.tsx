import React, { useEffect, useRef } from 'react'
import { View, Text, Pressable, Modal, StyleSheet, Platform, StatusBar, AccessibilityInfo, findNodeHandle, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
// TODO(040-strict): named imports do lucide-react-native batem em TS2305 sob nodenext
import * as LucideIcons from 'lucide-react-native'
const { Bell } = LucideIcons as any
import { colors, spacing, borderRadius, typography } from '@shared/styles/tokens'

/**
 * PushPrimerSheet — preparo ANTES do diálogo do SO (spec 120 US2, D-4/D-6/D-7). O iOS pergunta uma
 * vez só: "Agora não" não gasta o diálogo. Mostra a PRÉVIA do push real (o resultado de permitir),
 * não bullets de benefício genéricos.
 */
export interface PushPreview {
  title: string
  body: string
  medicineName: string
  /** "tomar" | "aplicar" | "usar" — para o título do sheet. */
  verb: string
}

type AskMode = 'ask' | 'settings' | 'unknown'

// O que o CTA vai fazer, dito antes (smoke 120: a cópia prometia um diálogo que não vinha).
const ASK_COPY: Record<AskMode, { hint: string; cta: string }> = {
  ask: { hint: 'Na próxima tela o sistema vai perguntar. Toque em Permitir.', cta: 'Ligar lembretes' },
  settings: { hint: 'As notificações estão desligadas nos Ajustes. Vamos abrir lá: toque em Notificações e ligue.', cta: 'Abrir Ajustes' },
  unknown: { hint: 'O sistema pode perguntar: toque em Permitir. Se abrir os Ajustes, toque em Notificações e ligue.', cta: 'Ligar lembretes' },
}

interface PushPrimerSheetProps {
  visible: boolean
  preview: PushPreview | null
  /** D-6: "Tratamento salvo" quando aberto ao fim do formulário. */
  anchor?: string | null
  loading: boolean
  /** O que o CTA fará — muda a instrução e o rótulo. Default 'ask'. */
  askMode?: AskMode
  /** Smoke 120: passo a passo dos Ajustes vindo de quem abriu (substitui a instrução do modo Ajustes). */
  settingsHint?: string | null
  onAccept: () => void
  onDismiss: () => void
}

export default function PushPrimerSheet({ visible, preview, anchor, loading, askMode = 'ask', settingsHint = null, onAccept, onDismiss }: PushPrimerSheetProps) {
  const titleRef = useRef<Text>(null)
  const base = ASK_COPY[askMode]
  const copy = askMode === 'settings' && settingsHint ? { ...base, hint: settingsHint } : base
  const heading = preview ? `Avisar na hora de ${preview.verb} ${preview.medicineName}` : 'Avisar na hora das doses'

  // D-7: foco inicial no título quando o sheet abre.
  useEffect(() => {
    if (!visible) return
    const t = setTimeout(() => {
      const node = titleRef.current ? findNodeHandle(titleRef.current) : null
      if (node) AccessibilityInfo.setAccessibilityFocus(node)
    }, 300)
    return () => clearTimeout(t)
  }, [visible])

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss} statusBarTranslucent>
      <View style={styles.overlay}>
        {/* Toque fora fecha = "Agora não" (smoke 120). */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessible={false} testID="push-primer-backdrop" />
        {/* R-233: espaçador da status bar no Android (statusBarTranslucent) + SafeArea embaixo. */}
        {Platform.OS === 'android' ? <View style={{ height: StatusBar.currentHeight ?? 0 }} /> : null}
        <SafeAreaView edges={['bottom']} style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.grabber} />
          {anchor ? <Text style={styles.anchor}>{anchor}</Text> : null}
          <Text ref={titleRef} style={styles.title} accessibilityRole="header">
            {heading}
          </Text>
          {preview ? <Text style={styles.previewLabel}>Exemplo de como o lembrete chega:</Text> : null}
          {preview ? (
            <View
              style={styles.preview}
              accessible
              accessibilityLabel={`Exemplo de lembrete: ${preview.title}. ${preview.body}`}
              testID="push-primer-preview"
            >
              <View style={styles.previewIcon}>
                <Bell size={16} color={colors.brand.primary} strokeWidth={2} />
              </View>
              <View style={styles.previewText}>
                <Text style={styles.previewApp}>dosiq · na hora da dose</Text>
                <Text style={styles.previewTitle} numberOfLines={1}>{preview.title}</Text>
                <Text style={styles.previewBody} numberOfLines={2}>{preview.body}</Text>
              </View>
            </View>
          ) : null}
          <Text style={styles.body}>{copy.hint}</Text>
          <Pressable
            style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
            onPress={onAccept}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={copy.cta}
            accessibilityState={{ disabled: loading, busy: loading }}
          >
            {loading ? <ActivityIndicator size="small" color={colors.text.inverse} /> : <Text style={styles.ctaText}>{copy.cta}</Text>}
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}
            onPress={onDismiss}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Agora não"
          >
            <Text style={styles.dismissText}>Agora não</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.bg.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg.card,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    padding: spacing[5],
    paddingBottom: spacing[6],
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border.default,
    marginBottom: spacing[4],
  },
  anchor: { fontSize: 13, fontWeight: '700', color: colors.brand.primary, marginBottom: spacing[1] },
  title: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: typography.fontFamily.medium || 'System',
    color: colors.text.primary,
    marginBottom: spacing[4],
  },
  preview: {
    flexDirection: 'row',
    gap: spacing[3],
    backgroundColor: colors.neutral[50],
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: spacing[3],
    marginBottom: spacing[4],
  },
  previewLabel: { fontSize: 13, color: colors.text.secondary, marginBottom: spacing[2] },
  previewIcon: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.md,
    backgroundColor: colors.bg.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewText: { flex: 1 },
  previewApp: { fontSize: 12, color: colors.text.secondary, marginBottom: 2 },
  previewTitle: { fontSize: 15, fontWeight: '700', color: colors.text.primary },
  previewBody: { fontSize: 14, color: colors.text.secondary, lineHeight: 19 },
  body: { fontSize: 15, color: colors.text.secondary, lineHeight: 21 },
  cta: {
    backgroundColor: colors.brand.primary,
    borderRadius: borderRadius.full,
    paddingVertical: spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    marginTop: spacing[5],
  },
  ctaText: { fontSize: 15, fontWeight: '700', color: colors.text.inverse },
  dismiss: { paddingVertical: spacing[3], alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  dismissText: { fontSize: 15, fontWeight: '600', color: colors.text.secondary },
  pressed: { opacity: 0.85 },
})
