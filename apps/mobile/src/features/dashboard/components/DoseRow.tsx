// DoseRow.tsx — linha Dose (L1) do módulo "Semana do tratamento" (spec 121 B · FR-030..FR-033).
//
// Injetável de cadência ≥ 7 dias (G-B5). Estados: com local · sem local · lacuna · 1ª dose.
// Fechada: duas linhas neutras + "Já apliquei" quando há ocorrência FUTURA dentro da tolerância
// (ADR-130 — dose atrasada é do hero; os dois nunca coexistem no semanal). A ação nunca fica atrás
// do expandir (INV-1). Aberta (D14): frente e costas, só a ÚLTIMA marcada, sem números (INV-2/AC-14)
// + "Últimas 4 aplicações" com a data como âncora. Contagem de semanas saiu da L1 (D16 → Evolução).
// Identidade/local = a linha de FATO (`medicine_logs`, R-299).
//
// 121 C: vale para qualquer cadência conhecida (FR-040). Não injetável ⇒ verbo neutro e ícone de
// comprimido (FR-043). Diário (`daily`) ⇒ sem "Já apliquei" (FR-042) e aberta = faixa dos últimos 7 d
// (+ mapa só com local na última), SEM lista — não vaza do viewport (C-A5).

import { View, Text, Pressable, StyleSheet } from 'react-native'
// TODO(040-strict): named imports do lucide-react-native batem em TS2305 sob nodenext
import * as LucideIcons from 'lucide-react-native'
const { Syringe, Pill, ChevronDown, ChevronUp } = LucideIcons as any
import BodyMapView from '@shared/components/data/BodyMapView'
import { formatLocalDate, getKnownInjectionSiteLabel, getUserTime, parseISO, type DailyWindowSummary, type WeeklyDoseSummary } from '@dosiq/core'
import { colors, spacing, borderRadius } from '@shared/styles/tokens'
import WeekStrip from '@dashboard/components/WeekStrip'
import LoadingDots from '@shared/components/feedback/LoadingDots'
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
  /** FR-043: forma cadastrada injetável — muda só verbo/ícone, nunca a elegibilidade. */
  injectable?: boolean
  /** 121 C: L1 diária — semana resumida + copy pronta. Presente ⇒ variante diária. */
  daily?: { week: DailyWindowSummary; copy: { primary: string; secondary: string | null } } | null
  /**
   * 125 fatia 2 (PO smoke 20/11): antes da 1ª dose registrada o miolo mostra o tratamento como foi
   * cadastrado, com um CTA só — "Ajustar". Depois da 1ª dose volta a ser local + histórico.
   */
  setup?: { rows: Array<{ label: string; value: string }>; onAdjust: () => void } | null
  /** 124 A (FR-010): abre o sheet da dose na última registrada. Só cadência ≥ 7 d com registro. */
  onOpenHistory?: (() => void) | null
}

/** Lista das últimas (só semanal) — a da B, com o título pelo verbo. */
const LIST_MAX = 4

/** D14/D15: data = âncora; local abaixo (capitalizado), "última" na mais recente; sem local, só data. */
function recentItem(row: RecentApplicationRow, index: number, tz: string): { date: string; detail: string | null } {
  const date = weekdayDate(formatLocalDate(getUserTime(parseISO(row.taken_at), tz)))
  const label = getKnownInjectionSiteLabel(row.injection_site)
  const site = label ? siteShort(label) : null
  const parts = [site ? site.charAt(0).toUpperCase() + site.slice(1) : null, index === 0 ? 'última' : null].filter(Boolean)
  return { date, detail: parts.length ? parts.join(' · ') : null }
}

function rowCopy({ error, daily, summary, nextDoseLabel, injectable }: Pick<Props, 'error' | 'daily' | 'summary' | 'nextDoseLabel'> & { injectable: boolean }) {
  if (error) return null
  if (daily) return daily.copy
  return summary ? doseRowCopy(summary, nextDoseLabel, injectable) : null
}

function HeadAction({ error, onRetry, canRegisterEarly, onRegisterEarly, injectable }: {
  error: boolean; onRetry: () => void; canRegisterEarly: boolean; onRegisterEarly: () => void; injectable: boolean
}) {
  if (error) {
    return (
      <Pressable onPress={onRetry} style={styles.action} accessibilityRole="button" testID="dose-row-retry">
        <Text style={styles.actionText}>Tentar de novo</Text>
      </Pressable>
    )
  }
  if (!canRegisterEarly) return null
  return (
    <Pressable onPress={onRegisterEarly} style={styles.action} accessibilityRole="button" testID="dose-row-register-early">
      <Text style={styles.actionText}>{injectable ? 'Já apliquei' : 'Registrar'}</Text>
    </Pressable>
  )
}

function listTitle(n: number, injectable: boolean): string {
  if (n === 1) return injectable ? 'ÚLTIMA APLICAÇÃO' : 'ÚLTIMA DOSE'
  return injectable ? `ÚLTIMAS ${n} APLICAÇÕES` : `ÚLTIMAS ${n} DOSES`
}

function RecentList({ shown, timezone, injectable }: { shown: RecentApplicationRow[]; timezone: string; injectable: boolean }) {
  if (shown.length === 0) {
    return (
      <View style={styles.placeholder} testID="dose-row-empty">
        <Text style={styles.placeholderText}>
          {injectable
            ? 'Nenhuma aplicação registrada ainda. Com a primeira, o histórico e o local aparecem aqui.'
            : 'Nenhuma dose registrada ainda. Com a primeira, o histórico aparece aqui.'}
        </Text>
      </View>
    )
  }
  return (
    <View style={styles.listWrap}>
      <Text style={styles.listTitle}>{listTitle(shown.length, injectable)}</Text>
      <View style={styles.listCard}>
        {shown.map((r, i) => {
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
  )
}

/** Aberta: diário = faixa (+ mapa); semanal = mapa + lista (B). Mapa só com local na ÚLTIMA (RC5/INV-2). */
function SetupSummary({ setup, injectable }: { setup: NonNullable<Props['setup']>; injectable: boolean }) {
  return (
    <View style={styles.setupBox} testID="dose-row-setup">
      <Text style={[styles.listTitle, styles.setupEyebrow]}>CONFIRA O TRATAMENTO</Text>
      <Text style={styles.setupIntro}>{`Antes da 1ª ${injectable ? 'aplicação' : 'dose'}, veja se está como na receita.`}</Text>
      <View style={styles.setupRows}>
        {setup.rows.map((r) => (
          <View key={r.label} style={styles.setupRow} testID={`dose-row-setup-row-${r.label}`}>
            <Text style={styles.setupLabel}>{r.label}</Text>
            <Text style={styles.setupValue}>{r.value}</Text>
          </View>
        ))}
      </View>
      <Pressable onPress={setup.onAdjust} accessibilityRole="button" style={styles.setupLink} testID="dose-row-setup-adjust">
        <Text style={styles.actionText}>Ajustar</Text>
      </Pressable>
    </View>
  )
}

function HistoryLink({ injectable, onPress }: { injectable: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.historyLink} testID="dose-row-history">
      <Text style={styles.actionText}>{injectable ? 'Ver aplicações anteriores' : 'Ver doses anteriores'}</Text>
    </Pressable>
  )
}

function DoseRowBody({ daily, recent, timezone, injectable, setup, onOpenHistory }: {
  daily: Props['daily']; recent: RecentApplicationRow[]; timezone: string; injectable: boolean; setup: Props['setup']
  onOpenHistory: Props['onOpenHistory']
}) {
  if (setup && recent.length === 0) {
    return (
      <View style={styles.body} testID="dose-row-body">
        <SetupSummary setup={setup} injectable={injectable} />
      </View>
    )
  }
  const shown = recent.slice(0, LIST_MAX)
  const sites = shown.map((r) => r.injection_site)
  // 124 A (FR-009): local só no injetável — nas demais formas a L1 mostra só datas.
  const hasKnownSite = injectable && !!getKnownInjectionSiteLabel(sites[0] ?? null)
  return (
    <View style={styles.body} testID="dose-row-body">
      {daily ? <WeekStrip days={daily.week.days} injectable={injectable} /> : null}
      {hasKnownSite ? (
        <View style={styles.mapCard}>
          <BodyMapView recentSites={sites} />
        </View>
      ) : null}
      {daily ? null : <RecentList shown={shown} timezone={timezone} injectable={injectable} />}
      {!daily && onOpenHistory && shown.length > 0 ? <HistoryLink injectable={injectable} onPress={onOpenHistory} /> : null}
    </View>
  )
}

export default function DoseRow({
  open, onToggle, summary, recent, nextDoseLabel, timezone, loading, error, onRetry, canRegisterEarly, onRegisterEarly,
  injectable = true, daily = null, setup = null, onOpenHistory = null,
}: Props) {
  const isDaily = !!daily
  const ready = isDaily || !!summary
  const copy = rowCopy({ error, daily, summary, nextDoseLabel, injectable })
  const Icon = injectable ? Syringe : Pill

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
            <Icon size={18} color={colors.brand.primary} strokeWidth={2} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.title}>Dose</Text>
            {/* 124 A (smoke 23/11): 1ª carga sem cache = "Carregando…" animado, não barra cinza parada. */}
            {loading && !ready ? <LoadingDots testID="dose-row-loading" /> : null}
            {error ? <Text style={styles.neutral}>{`Não foi possível carregar ${injectable ? 'as aplicações' : 'as doses'}.`}</Text> : null}
            {copy?.primary ? <Text style={styles.value} testID="dose-row-primary">{copy.primary}</Text> : null}
            {copy?.secondary ? <Text style={styles.neutral} testID="dose-row-secondary">{copy.secondary}</Text> : null}
          </View>
          {open ? <ChevronUp size={18} color={colors.text.secondary} /> : <ChevronDown size={18} color={colors.text.secondary} />}
        </Pressable>
        <HeadAction error={!!error} onRetry={onRetry} canRegisterEarly={canRegisterEarly && !isDaily} onRegisterEarly={onRegisterEarly} injectable={injectable} />
      </View>
      {open && !error && ready ? <DoseRowBody daily={daily} recent={recent} timezone={timezone} injectable={injectable} setup={setup} onOpenHistory={onOpenHistory} /> : null}
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
  action: { minHeight: 40, paddingHorizontal: spacing[3], borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.brand.primary, justifyContent: 'center' },
  actionText: { fontSize: 14, fontWeight: '700', color: colors.brand.primary },
  body: { marginTop: spacing[3], gap: spacing[3] },
  placeholder: { minHeight: 96, borderRadius: borderRadius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border.light, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing[4] },
  // Sem borda (não é card dentro de card): fundo tingido, o mesmo da pergunta do card de setup.
  setupBox: { borderRadius: borderRadius.md, backgroundColor: colors.brand.mint, padding: spacing[3], gap: spacing[2] },
  setupIntro: { fontSize: 14, lineHeight: 20, color: colors.text.secondary },
  setupRows: { gap: spacing[1] },
  setupRow: { flexDirection: 'row', gap: spacing[3] },
  // PO smoke 20/11: sobretítulo no verde do card de setup; negrito no rótulo, valor regular.
  setupEyebrow: { color: colors.brand.primary },
  setupLabel: { width: 96, fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.text.primary },
  setupValue: { flex: 1, fontSize: 15, lineHeight: 20, color: colors.text.primary },
  historyLink: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  setupLink: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
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
