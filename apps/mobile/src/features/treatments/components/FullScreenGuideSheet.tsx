import React from 'react'
import { View, Text, Pressable, Modal, StyleSheet, Platform, StatusBar } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
// TODO(040-strict): named imports do lucide-react-native batem em TS2305 sob nodenext
import * as LucideIcons from 'lucide-react-native'
const { BellRing } = LucideIcons as any
import ChecklistRow from '@features/oemAssistant/components/ChecklistRow'
import { getChecklistCopy, FULL_SCREEN_COPY } from '@features/oemAssistant/oemBatteryGuides'
import type { FullScreenRecheck, FullScreenRow } from '@treatments/hooks/useFullScreenCheck'
import type { OemFamily } from '@platform/device/oemFamily'
import { colors, spacing, borderRadius, typography } from '@shared/styles/tokens'

/**
 * FullScreenGuideSheet — "Alarme na tela bloqueada" ao ligar o alarme crítico no Android (spec 128 A ·
 * RC2 D-1..D-8 · C-6). Só as chaves que FALTAM, com estado medido: ✓ feito · ○ falta · tracejado =
 * manual (fato não lido). Texto e destino da marca (no Xiaomi, "Outras permissões"). Na volta dos
 * Ajustes: "Pronto…" (todas liberadas) ou "Ainda falta…", anunciado (D-8).
 * Casca Android-safe dos sheets da casa (R-233 / AP-165).
 */
interface FullScreenGuideSheetProps {
  visible: boolean
  family: OemFamily
  rows: FullScreenRow[]
  recheckResult: FullScreenRecheck
  onOpenSettings: () => void
  onDismiss: () => void
}

export default function FullScreenGuideSheet({
  visible,
  family,
  rows,
  recheckResult,
  onOpenSettings,
  onDismiss,
}: FullScreenGuideSheetProps) {
  const granted = recheckResult === 'granted'
  const copy = getChecklistCopy(family).items
  const body = rows.some((r) => r.state === 'manual') ? FULL_SCREEN_COPY.bodyManual : FULL_SCREEN_COPY.body
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss} statusBarTranslucent>
      <View style={styles.overlay}>
        {/* Toque fora fecha (padrão dos sheets da casa — PushPrimerSheet); 128 C-10, smoke POCO */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessible={false} testID="full-screen-backdrop" />
        {Platform.OS === 'android' ? <View style={{ height: StatusBar.currentHeight ?? 0 }} /> : null}
        <SafeAreaView edges={['bottom']} style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.grabber} />
          <View style={styles.icon}>
            <BellRing size={24} color={colors.brand.primary} strokeWidth={2} />
          </View>
          <Text style={styles.title} accessibilityRole="header">
            {FULL_SCREEN_COPY.title}
          </Text>
          {recheckResult ? (
            <View
              style={[styles.result, granted ? styles.resultOk : styles.resultPending]}
              accessibilityLiveRegion="polite"
              testID="full-screen-result"
            >
              <Text style={styles.resultText}>{granted ? FULL_SCREEN_COPY.granted : FULL_SCREEN_COPY.stillPending}</Text>
            </View>
          ) : (
            <Text style={styles.body}>{body}</Text>
          )}
          <View style={styles.list}>
            {rows.map((r, i) => (
              <ChecklistRow
                key={r.id}
                item={{ ...copy[r.id], state: r.state }}
                last={i === rows.length - 1}
                onPress={onOpenSettings}
                accessibilityHint="Abre as configurações de tela cheia"
              />
            ))}
          </View>
          {!granted && (
            <Pressable
              style={({ pressed }) => [styles.cta, pressed && styles.pressed]}
              onPress={onOpenSettings}
              accessibilityRole="button"
              accessibilityLabel={FULL_SCREEN_COPY.cta}
            >
              <Text style={styles.ctaText}>{FULL_SCREEN_COPY.cta}</Text>
            </Pressable>
          )}
          <Pressable
            style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel={granted ? FULL_SCREEN_COPY.close : FULL_SCREEN_COPY.dismiss}
          >
            <Text style={styles.dismissText}>{granted ? FULL_SCREEN_COPY.close : FULL_SCREEN_COPY.dismiss}</Text>
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
  icon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    backgroundColor: colors.neutral[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[3],
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: typography.fontFamily.medium || 'System',
    color: colors.text.primary,
    marginBottom: spacing[3],
  },
  body: { fontSize: 15, color: colors.text.secondary, lineHeight: 21 },
  result: { borderRadius: borderRadius.md, padding: spacing[3] },
  resultOk: { backgroundColor: colors.brand.mint },
  resultPending: { backgroundColor: colors.neutral[50] },
  resultText: { fontSize: 15, fontWeight: '600', color: colors.text.primary, lineHeight: 21 },
  list: {
    marginTop: spacing[4],
    backgroundColor: colors.bg.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
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
  dismiss: { paddingVertical: spacing[3], alignItems: 'center', justifyContent: 'center', minHeight: 44, marginTop: spacing[1] },
  dismissText: { fontSize: 14, fontWeight: '600', color: colors.text.secondary },
  pressed: { opacity: 0.85 },
})
