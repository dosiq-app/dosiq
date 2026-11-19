// FormChangeSheet — "A dose de {tratamento} pode ter mudado" (spec 125, AC7.5 · AC7.10 · hi-fi R-4).
//
// Abre depois de salvar a edição de um remédio, um tratamento por vez (fila em `formChangeReview`).
// "Revisar tratamento" abre o form desse tratamento; "Agora não" fecha sem mudar nada. Nada muda na
// dose daqui (INV-2). Avisos de dose pela regra única do core, não bloqueiam (INV-5).
// Padrão visual: OnboardingRefuseSheet (Modal + folha na base).

import { View, Text, Modal, Pressable, StyleSheet, Platform, StatusBar } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { formChangeBody, type FormChangeReviewItem } from '@medications/utils/formChangeReview'
import { colors, spacing, borderRadius, typography } from '@shared/styles/tokens'

interface FormChangeSheetProps {
  item: FormChangeReviewItem | null
  onReview: () => void
  onDismiss: () => void
}

export default function FormChangeSheet({ item, onReview, onDismiss }: FormChangeSheetProps) {
  if (!item) return null
  const name = item.protocol?.name || 'o tratamento'
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onDismiss} statusBarTranslucent>
      {Platform.OS === 'android' ? <View style={{ height: StatusBar.currentHeight ?? 0 }} /> : null}
      <Pressable style={styles.backdrop} onPress={onDismiss} accessibilityLabel="Agora não" />
      <SafeAreaView edges={['bottom']} style={styles.sheet} testID="form-change-sheet">
        <View style={styles.handle} />
        <Text style={styles.title} accessibilityRole="header">{`A dose de ${name} pode ter mudado`}</Text>
        <Text style={styles.body}>{formChangeBody(item)}</Text>
        {item.warnings.map((w) => (
          <Text key={w.kind} style={styles.warning} testID={`form-change-warning-${w.kind}`}>{w.message}</Text>
        ))}
        <Pressable style={styles.primary} onPress={onReview} accessibilityRole="button" testID="form-change-review">
          <Text style={styles.primaryText}>Revisar tratamento</Text>
        </Pressable>
        <Pressable style={styles.link} onPress={onDismiss} accessibilityRole="button" testID="form-change-dismiss">
          <Text style={styles.linkText}>Agora não</Text>
        </Pressable>
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.bg.overlay },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: spacing[3],
    backgroundColor: colors.bg.card,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[2],
    paddingBottom: spacing[6],
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.neutral[300], alignSelf: 'center', marginBottom: spacing[2] },
  title: { fontSize: 18, fontWeight: '700', color: colors.text.primary, fontFamily: typography.fontFamily.bold },
  body: { fontSize: 15, lineHeight: 22, color: colors.text.secondary },
  warning: { fontSize: 14, lineHeight: 20, color: colors.status.warning },
  primary: { minHeight: 52, borderRadius: borderRadius.lg, backgroundColor: colors.brand.primary, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 16, fontWeight: '700', color: colors.text.inverse },
  link: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  linkText: { fontSize: 15, fontWeight: '600', color: colors.text.primary },
})
