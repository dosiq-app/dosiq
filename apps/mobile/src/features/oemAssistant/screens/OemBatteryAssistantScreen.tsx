// OemBatteryAssistantScreen — checklist verificável (spec 068 FR-013 · §Revisão pós-smoke 2026-11-10,
// wireframes A–D). TELA, não modal (D-2): o fluxo sai para as Configurações do SO e volta; o hook re-sonda
// no foco e em `AppState` (D-3) e cada item vira ✓/○. Um CTA principal só (FR-004): no Android 12+ todos
// os itens verificáveis vivem em "Informações do app". O que o SO não expõe vai para "Para garantir"
// (sem estado, nunca bloqueia o "Pronto"). Dispensa só por "Não mostrar de novo" (D-4).

import React, { useCallback, useMemo, useState } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
// TODO(040-strict): named imports do lucide-react-native batem em TS2305 sob nodenext
import * as LucideIcons from 'lucide-react-native'
const { ChevronLeft, ChevronRight, CircleCheck, Circle, CircleDashed } = LucideIcons as any
import { useOemBatteryAssistant } from '@features/oemAssistant/hooks/useOemBatteryAssistant'
import { buildChecklist, pendingLabel, summarizeChecklist, type ChecklistItem } from '@features/oemAssistant/oemChecklist'
import { openAppDetailsSettings, openOemPowerSettings } from '@platform/device/oemBatterySettings'
import { colors, spacing, borderRadius, typography } from '@shared/styles/tokens'

// A linha inteira é tocável e leva à MESMA tela do CTA principal (decisão PO 2026-11-10): o ✓/○
// convida ao toque; quem tocar achando que marca o item já cai nas Configurações (voltar = 1 toque).
function ChecklistRow({ item, last, onPress }: { item: ChecklistItem; last: boolean; onPress: () => void }) {
  const done = item.state === 'done'
  const manual = item.state === 'manual'
  const label = done
    ? `${item.title}, feito`
    : manual
      ? `${item.title}, confira manualmente: ${item.instruction}`
      : `${item.title}, pendente: ${item.instruction}`
  return (
    <Pressable
      style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && styles.rowPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Abre as configurações do app"
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
        <Text style={done ? styles.rowTitleDone : styles.rowTitle}>{item.title}</Text>
        {manual && <Text style={styles.rowTag}>Confira manualmente</Text>}
        {!done && <Text style={styles.rowInstruction}>{item.instruction}</Text>}
      </View>
      {/* › só no que pede ação: sinaliza "leva a outra tela", não "marca" (PO 2026-11-10) */}
      {!done && <ChevronRight size={20} color={colors.text.secondary} style={styles.rowChevron} />}
    </Pressable>
  )
}

export default function OemBatteryAssistantScreen() {
  // 1. States
  const [visitedSettings, setVisitedSettings] = useState(false)

  // 2. Context
  const navigation = useNavigation<any>()
  const { family, facts, reason, powerManagerActivity, dismiss } = useOemBatteryAssistant()

  // 3. Memos / derivados
  // Sondando = sonda sem resposta (`reason` undefined). "Tudo certo" só com todo item medido ✓:
  // `manual`/`unknown` nunca viram (INV-7 · 068 PR 2 G-1/G-2 · PO 2026-11-11).
  const checklist = useMemo(() => buildChecklist(family, facts), [family, facts])
  const probing = reason === undefined
  const summary = useMemo(() => summarizeChecklist(checklist, probing), [checklist, probing])
  const allDone = summary.status === 'done'

  // 4. Handlers
  const goBack = useCallback(() => navigation.goBack(), [navigation])
  const openPower = useCallback(async () => {
    if (await openOemPowerSettings(powerManagerActivity)) setVisitedSettings(true)
  }, [powerManagerActivity])
  const openAppDetails = useCallback(async () => {
    if (await openAppDetailsSettings()) setVisitedSettings(true)
  }, [])
  const dismissForever = useCallback(() => {
    dismiss()
    navigation.goBack()
  }, [dismiss, navigation])

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={goBack} style={styles.headerBtn} hitSlop={8} accessibilityRole="button" accessibilityLabel="Voltar">
          <ChevronLeft size={24} color={colors.text.primary} />
        </Pressable>
        <Text style={styles.headerTitle} accessibilityRole="header">
          Alarme e bateria
        </Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {allDone ? (
          <View style={[styles.banner, styles.bannerSuccess]} accessibilityLiveRegion="polite">
            <Text style={styles.bannerTitle}>{visitedSettings ? 'Pronto' : 'Tudo certo'}</Text>
            <Text style={styles.bannerText}>Este aparelho não está segurando os alarmes do Dosiq.</Text>
          </View>
        ) : (
          !probing && (
            <View accessibilityLiveRegion="polite">
              <Text style={styles.title}>Para o alarme tocar na hora</Text>
              <Text style={styles.intro}>
                {summary.status === 'pending'
                  ? `${pendingLabel(checklist.pending)} · leva menos de 1 minuto`
                  : summary.status === 'manual'
                    ? 'Não conseguimos conferir estes ajustes neste aparelho. Siga os passos abaixo.'
                    : 'Este aparelho não informa os ajustes de bateria. Confira nas configurações do app.'}
              </Text>
            </View>
          )
        )}

        {checklist.items.length > 0 && (
          <View style={styles.list}>
            {checklist.items.map((item, i) => (
              <ChecklistRow key={item.id} item={item} last={i === checklist.items.length - 1} onPress={openAppDetails} />
            ))}
          </View>
        )}

        {!probing && checklist.tips.length > 0 && (
          <View style={styles.tips}>
            <Text style={styles.tipsTitle}>Para garantir</Text>
            {checklist.tips.map((tip) => (
              <View key={tip} style={styles.tipRow} accessible accessibilityLabel={tip}>
                <Text style={styles.tipBullet}>•</Text>
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {allDone ? (
          <Pressable
            style={({ pressed }) => [styles.ctaPrimary, pressed && styles.ctaPressed]}
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel="Concluir"
          >
            <Text style={styles.ctaPrimaryText}>Concluir</Text>
          </Pressable>
        ) : (
          <>
            <Pressable
              style={({ pressed }) => [styles.ctaPrimary, pressed && styles.ctaPressed]}
              onPress={openAppDetails}
              accessibilityRole="button"
              accessibilityLabel="Abrir configurações do app"
            >
              <Text style={styles.ctaPrimaryText}>Abrir configurações do app</Text>
            </Pressable>
            {!!powerManagerActivity && (
              <Pressable
                style={({ pressed }) => [styles.ctaNeutral, pressed && styles.ctaPressed]}
                onPress={openPower}
                accessibilityRole="button"
                accessibilityLabel="Abrir configurações de energia do aparelho"
              >
                <Text style={styles.ctaNeutralText}>Abrir configurações de energia</Text>
              </Pressable>
            )}
            <Pressable
              style={styles.link}
              onPress={dismissForever}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Não mostrar de novo o aviso de alarme e bateria"
            >
              <Text style={styles.linkText}>Não mostrar de novo</Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.screen },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  headerBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    fontFamily: typography.fontFamily.medium || 'System',
    color: colors.text.primary,
  },
  scroll: { padding: spacing[5], gap: spacing[4] },
  banner: { borderRadius: borderRadius.lg, padding: spacing[4], gap: 4 },
  bannerSuccess: { backgroundColor: colors.brand.mint },
  bannerTitle: { fontSize: 16, fontWeight: '700', color: colors.text.primary },
  bannerText: { fontSize: 14, lineHeight: 20, color: colors.text.primary },
  title: { fontSize: 20, fontWeight: '700', color: colors.text.primary },
  intro: { fontSize: 15, lineHeight: 22, color: colors.text.secondary },
  list: {
    backgroundColor: colors.bg.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  row: { flexDirection: 'row', gap: spacing[3], alignItems: 'flex-start', padding: spacing[4] },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border.default },
  rowPressed: { opacity: 0.6 },
  rowChevron: { alignSelf: 'center' },
  rowText: { flex: 1, gap: 4 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: colors.text.primary },
  rowTitleDone: { fontSize: 15, fontWeight: '600', color: colors.text.secondary },
  rowTag: { fontSize: 12, fontWeight: '600', color: colors.text.secondary },
  rowInstruction: { fontSize: 14, lineHeight: 20, color: colors.text.primary },
  tips: { gap: spacing[2] },
  tipsTitle: { fontSize: 15, fontWeight: '700', color: colors.text.primary },
  tipRow: { flexDirection: 'row', gap: spacing[2] },
  tipBullet: { fontSize: 14, lineHeight: 20, color: colors.text.secondary },
  tipText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.text.secondary },
  footer: { padding: spacing[5], gap: spacing[2] },
  ctaPrimary: {
    backgroundColor: colors.brand.primary,
    borderRadius: borderRadius.full,
    paddingVertical: spacing[3],
    alignItems: 'center',
  },
  ctaPrimaryText: { fontSize: 15, fontWeight: '700', color: colors.text.inverse },
  ctaNeutral: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: borderRadius.full,
    paddingVertical: spacing[3],
    alignItems: 'center',
  },
  ctaNeutralText: { fontSize: 15, fontWeight: '700', color: colors.text.primary },
  ctaPressed: { opacity: 0.85 },
  link: { alignItems: 'center', paddingVertical: spacing[2] },
  linkText: { fontSize: 14, fontWeight: '600', color: colors.text.secondary, textDecorationLine: 'underline' },
})
