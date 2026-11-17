// DoseRow.tsx — linha Dose (L1) do módulo "Semana do tratamento" (spec 121 B · FR-030..FR-033).
//
// Injetável de cadência ≥ 7 dias (G-B5). Estados: com local · sem local · lacuna · 1ª dose.
// Fechada: duas linhas neutras + "Já apliquei" quando há ocorrência FUTURA dentro da tolerância
// (ADR-130 — dose atrasada é do hero; os dois nunca coexistem no semanal). A ação nunca fica atrás
// do expandir (INV-1). Aberta (D14): frente e costas, só a ÚLTIMA marcada, sem números (INV-2/AC-14)
// + "Últimas 4 aplicações" com a data como âncora. Contagem de semanas saiu da L1 (D16 → Evolução).
// Identidade/local = a linha de FATO (`medicine_logs`, R-299).

import { View, Text, Pressable, StyleSheet } from 'react-native'
// TODO(040-strict): named imports do lucide-react-native batem em TS2305 sob nodenext
import * as LucideIcons from 'lucide-react-native'
const { Syringe, ChevronDown, ChevronUp } = LucideIcons as any
import BodyMapView from '@shared/components/data/BodyMapView'
import { formatLocalDate, getKnownInjectionSiteLabel, getUserTime, parseISO, type WeeklyDoseSummary } from '@dosiq/core'
import { colors, spacing, borderRadius } from '@shared/styles/tokens'
import { doseRowCopy, siteShort, weekdayDate } from '@dashboard/utils/treatmentWeek'
import type { RecentApplicationRow } from '@dashboard/hooks/useTreatmentWeekDose'

type Props = {
  open: boolean
  onToggle: () => void
  summary: WeeklyDoseSummary | null
  recent: RecentApplicationRow[]
  nextDoseLabel: string | null
  timezone: string
  loading: boolean
  error: 'network' | 'other' | null
  onRetry: () => void
  canRegisterEarly: boolean
  onRegisterEarly: () => void
}

/** D14/D15: data = âncora; local abaixo (capitalizado), "última" na mais recente; sem local, só data. */
function recentItem(row: RecentApplicationRow, index: number, tz: string): { date: string; detail: string | null } {
  const date = weekdayDate(formatLocalDate(getUserTime(parseISO(row.taken_at), tz)))
  const label = getKnownInjectionSiteLabel(row.injection_site)
  const site = label ? siteShort(label) : null
  const parts = [site ? site.charAt(0).toUpperCase() + site.slice(1) : null, index === 0 ? 'última' : null].filter(Boolean)
  return { date, detail: parts.length ? parts.join(' · ') : null }
}

export default function DoseRow({
  open, onToggle, summary, recent, nextDoseLabel, timezone, loading, error, onRetry, canRegisterEarly, onRegisterEarly,
}: Props) {
  const copy = summary && !error ? doseRowCopy(summary, nextDoseLabel) : null
  const sites = recent.map((r) => r.injection_site)
  // RC5: o mapa marca só a ÚLTIMA — sem local nela, não há o que mostrar.
  const hasKnownSite = !!getKnownInjectionSiteLabel(sites[0] ?? null)

  return (
    <View style={styles.root} testID="week-row-dose">
      <View style={styles.head}>
        <Pressable
          onPress={onToggle}
          style={styles.headMain}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel="Dose"
          testID="week-row-dose-toggle"
        >
          <View style={styles.icon}>
            <Syringe size={18} color={colors.brand.primary} strokeWidth={2} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.title}>Dose</Text>
            {loading && !summary ? <View style={styles.skeletonLine} testID="dose-row-loading" /> : null}
            {error ? <Text style={styles.neutral}>Não foi possível carregar as aplicações.</Text> : null}
            {copy ? <Text style={styles.value} testID="dose-row-primary">{copy.primary}</Text> : null}
            {copy?.secondary ? <Text style={styles.neutral} testID="dose-row-secondary">{copy.secondary}</Text> : null}
          </View>
          {open ? <ChevronUp size={18} color={colors.text.secondary} /> : <ChevronDown size={18} color={colors.text.secondary} />}
        </Pressable>
        {error ? (
          <Pressable onPress={onRetry} style={styles.action} accessibilityRole="button" testID="dose-row-retry">
            <Text style={styles.actionText}>Tentar de novo</Text>
          </Pressable>
        ) : canRegisterEarly ? (
          <Pressable onPress={onRegisterEarly} style={styles.action} accessibilityRole="button" testID="dose-row-register-early">
            <Text style={styles.actionText}>Já apliquei</Text>
          </Pressable>
        ) : null}
      </View>
      {open && !error && summary ? (
        <View style={styles.body} testID="dose-row-body">
          {hasKnownSite ? (
            <View style={styles.mapCard}>
              <BodyMapView recentSites={sites} />
            </View>
          ) : null}
          {recent.length > 0 ? (
            <View style={styles.listWrap}>
              <Text style={styles.listTitle}>{recent.length === 1 ? 'ÚLTIMA APLICAÇÃO' : `ÚLTIMAS ${recent.length} APLICAÇÕES`}</Text>
              <View style={styles.listCard}>
                {recent.map((r, i) => {
                  const item = recentItem(r, i, timezone)
                  return (
                    <View key={r.id} style={[styles.item, i > 0 && styles.itemDivider]} testID={`dose-row-recent-${i + 1}`}>
                      <View style={[styles.dot, i === 0 ? styles.dotLatest : styles.dotPast]} />
                      <View style={styles.flex}>
                        <Text style={[styles.itemDate, i === 0 && styles.itemDateLatest]}>{item.date}</Text>
                        {item.detail ? <Text style={styles.itemDetail}>{item.detail}</Text> : null}
                      </View>
                    </View>
                  )
                })}
              </View>
            </View>
          ) : (
            <View style={styles.placeholder} testID="dose-row-empty">
              <Text style={styles.placeholderText}>Nenhuma aplicação registrada ainda. Com a primeira, o histórico e o local aparecem aqui.</Text>
            </View>
          )}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { paddingVertical: spacing[3], borderBottomWidth: 1, borderBottomColor: colors.border.light },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  headMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[3], minHeight: 48 },
  icon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  title: { fontSize: 13, fontWeight: '700', color: colors.text.secondary },
  value: { fontSize: 16, fontWeight: '700', color: colors.text.primary, marginTop: 2 },
  neutral: { fontSize: 13, color: colors.text.secondary, marginTop: 2 },
  skeletonLine: { height: 16, width: 160, borderRadius: 4, backgroundColor: colors.bg.screen, marginTop: 4 },
  action: { minHeight: 40, paddingHorizontal: spacing[3], borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.brand.primary, justifyContent: 'center' },
  actionText: { fontSize: 14, fontWeight: '700', color: colors.brand.primary },
  body: { marginTop: spacing[3], gap: spacing[3] },
  placeholder: { minHeight: 96, borderRadius: borderRadius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border.light, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing[4] },
  placeholderText: { fontSize: 14, color: colors.text.secondary, textAlign: 'center' },
  mapCard: { borderWidth: 1, borderColor: colors.border.light, borderRadius: borderRadius.md, paddingVertical: spacing[2], backgroundColor: colors.bg.card },
  listWrap: { gap: spacing[1] },
  listTitle: { fontSize: 11, fontWeight: '700', color: colors.text.muted, letterSpacing: 0.4 },
  listCard: { borderWidth: 1, borderColor: colors.border.light, borderRadius: borderRadius.md, paddingHorizontal: spacing[3], backgroundColor: colors.bg.card },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[2] },
  itemDivider: { borderTopWidth: 1, borderTopColor: colors.border.light },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotLatest: { backgroundColor: colors.brand.primary },
  dotPast: { backgroundColor: colors.neutral[300] },
  itemDate: { fontSize: 14, fontWeight: '500', color: colors.text.primary },
  itemDateLatest: { fontWeight: '700' },
  itemDetail: { fontSize: 12, color: colors.text.secondary, marginTop: 1 },
})
