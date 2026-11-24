// DoseNavSheet.tsx — sheet da dose (spec 124 A · FR-001/FR-002/FR-010, PO-1/PO-2).
//
// Só leitura. Navega POR EVENTO (dose registrada anterior / seguinte) do mesmo tratamento — chave C
// da L1: `protocol_id` OU `medicine_id` (`listRecentApplications`, core). Sem janela de data e sem
// varredura: cada vizinho é 1 consulta keyset com `limit 1` (AP-186). Cursor = `taken_at` CRU do
// banco + `id` (E-8). O local exibido é o da PRÓPRIA linha (R-299/INV-1); o mapa marca só ela
// (INV-2). Sem quantidade: a quantidade da linha é em comprimidos e mg viria do tratamento vivo (C-A3).
// E-16: Anterior/Seguinte desabilitados durante a busca; resposta de pedido antigo é descartada.
// Entrada única: link no rodapé da L1 aberta (FR-010).

import { useCallback, useEffect, useState } from 'react'
import { Modal, View, Text, Pressable, StyleSheet, Platform, StatusBar } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
// TODO(040-strict): named imports do lucide-react-native batem em TS2305 sob nodenext
import * as LucideIcons from 'lucide-react-native'
const { Syringe, Pill, ChevronLeft, ChevronRight, X } = LucideIcons as any
import BodyMapView from '@shared/components/data/BodyMapView'
import { getKnownInjectionSiteLabel, getTodayLocal } from '@dosiq/core'
import { listRecentApplications } from '@dose/services/doseService'
import { doseHeading } from '@dose/utils/doseHeading'
import { colors, spacing, borderRadius } from '@shared/styles/tokens'

export type NavDose = {
  id: string
  taken_at: string
  injection_site: string | null
  medicine_id?: string | null
  protocol_id?: string | null
}

type Props = {
  visible: boolean
  onClose: () => void
  /** Dose em que o sheet abre (a última da L1). */
  initial: NavDose | null
  protocolId: string | null
  medicineId: string | null
  medicineName: string | null
  injectable: boolean
  timezone: string
}

type Neighbors = { status: 'loading' | 'ready' | 'error'; prev: NavDose | null; next: NavDose | null }

const LOADING: Neighbors = { status: 'loading', prev: null, next: null }

function useNeighbors(current: NavDose | null, protocolId: string | null, medicineId: string | null, enabled: boolean) {
  // States — resultado CARIMBADO com o pedido (E-16): resposta de dose/pedido antigo nunca vence, e
  // "carregando" é derivado (carimbo ≠ chave atual), sem setState síncrono no effect.
  const [tick, setTick] = useState(0)
  // RC6 #976: cada abertura é um pedido novo — reabrir na mesma dose não reaproveita resultado/erro antigo.
  const [prevEnabled, setPrevEnabled] = useState(enabled)
  if (enabled !== prevEnabled) {
    setPrevEnabled(enabled)
    if (enabled) setTick((t) => t + 1)
  }
  const key = enabled && current ? `${current.id}|${current.taken_at}|${tick}` : null
  const [stamped, setStamped] = useState<{ key: string | null; value: Neighbors }>({ key: null, value: LOADING })
  const state = stamped.key === key ? stamped.value : LOADING

  // Effects
  useEffect(() => {
    if (!key || !current) return undefined
    let alive = true
    const cursor = { takenAt: current.taken_at, id: current.id }
    Promise.all([
      listRecentApplications({ protocolId, medicineId, limit: 1, before: cursor }),
      listRecentApplications({ protocolId, medicineId, limit: 1, after: cursor }),
    ]).then(
      ([prev, next]) => {
        if (alive) setStamped({ key, value: { status: 'ready', prev: (prev?.[0] as NavDose) ?? null, next: (next?.[0] as NavDose) ?? null } })
      },
      () => {
        if (alive) setStamped({ key, value: { status: 'error', prev: null, next: null } })
      }
    )
    return () => {
      alive = false
    }
  }, [key, current, protocolId, medicineId])

  // Handlers
  const retry = useCallback(() => setTick((t) => t + 1), [])
  return { ...state, retry }
}

function NavButton({ dir, target, disabled, onPress }: { dir: 'prev' | 'next'; target: NavDose | null; disabled: boolean; onPress: (d: NavDose) => void }) {
  const hidden = !target
  const label = dir === 'prev' ? 'Anterior' : 'Seguinte'
  return (
    <Pressable
      onPress={() => target && onPress(target)}
      disabled={disabled || hidden}
      accessibilityRole="button"
      accessibilityLabel={dir === 'prev' ? 'Dose anterior' : 'Dose seguinte'}
      accessibilityState={{ disabled: disabled || hidden }}
      style={[styles.nav, hidden && styles.navHidden, disabled && !hidden && styles.navDisabled]}
      testID={`dose-nav-${dir}`}
    >
      {dir === 'prev' ? <ChevronLeft size={18} color={colors.brand.primary} /> : null}
      <Text style={styles.navText}>{label}</Text>
      {dir === 'next' ? <ChevronRight size={18} color={colors.brand.primary} /> : null}
    </Pressable>
  )
}

function SiteBox({ site }: { site: string | null }) {
  const label = getKnownInjectionSiteLabel(site)
  if (!label) {
    return (
      <View style={styles.siteBox} testID="dose-nav-nosite">
        <Text style={styles.muted}>Local não informado nesta dose.</Text>
      </View>
    )
  }
  return (
    <View style={[styles.siteBox, styles.siteRow]} testID="dose-nav-site">
      <BodyMapView recentSites={[site]} width={92} />
      <View style={styles.flex}>
        <Text style={styles.caption}>Local registrado nesta dose</Text>
        <Text style={styles.siteLabel}>{label}</Text>
      </View>
    </View>
  )
}

export default function DoseNavSheet({ visible, onClose, initial, protocolId, medicineId, medicineName, injectable, timezone }: Props) {
  // States — reabrir sempre volta à dose inicial (a última da L1).
  const [picked, setPicked] = useState<{ from: NavDose | null; dose: NavDose | null }>({ from: null, dose: null })
  const current = picked.from === initial && picked.dose ? picked.dose : initial
  // Memos
  const neighbors = useNeighbors(current, protocolId, medicineId, visible)
  const today = getTodayLocal(timezone)
  const head = current ? doseHeading(current.taken_at, timezone, today) : null
  const busy = neighbors.status === 'loading'
  const Icon = injectable ? Syringe : Pill

  // Handlers
  function go(d: NavDose) {
    if (busy) return
    setPicked({ from: initial, dose: d })
  }
  function close() {
    setPicked({ from: null, dose: null })
    onClose()
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View style={styles.root}>
        {Platform.OS === 'android' ? <View style={{ height: StatusBar.currentHeight ?? 0 }} /> : null}
        <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Fechar" />
        <SafeAreaView edges={['bottom']} style={styles.sheet} testID="dose-nav-sheet">
          <View style={styles.handle} />
          <View style={styles.headRow}>
            <View style={styles.icon}>
              <Icon size={18} color={colors.brand.primary} strokeWidth={2} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.eyebrow}>{`${medicineName ?? 'Tratamento'} · ${injectable ? 'aplicação' : 'dose'}`.toUpperCase()}</Text>
              {head ? <Text style={styles.title} testID="dose-nav-date">{head.date}</Text> : null}
              {head ? <Text style={styles.muted} testID="dose-nav-ago">{`${head.ago} · registrada`}</Text> : null}
            </View>
            <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Fechar" style={styles.close} testID="dose-nav-close">
              <X size={22} color={colors.text.secondary} />
            </Pressable>
          </View>

          {current && injectable ? <SiteBox site={current.injection_site} /> : null}

          {neighbors.status === 'error' ? (
            <View style={styles.errorRow} testID="dose-nav-error">
              <Text style={styles.muted}>{`Não foi possível carregar ${injectable ? 'as aplicações' : 'as doses'}.`}</Text>
              <Pressable onPress={neighbors.retry} accessibilityRole="button" style={styles.retry} testID="dose-nav-retry">
                <Text style={styles.retryText}>Tentar de novo</Text>
              </Pressable>
            </View>
          ) : null}

          {neighbors.status === 'ready' && !neighbors.prev ? (
            <Text style={[styles.muted, styles.center]} testID="dose-nav-first">Primeira dose registrada deste tratamento.</Text>
          ) : null}

          <View style={styles.navRow}>
            <NavButton dir="prev" target={busy ? current : neighbors.prev} disabled={busy} onPress={go} />
            <NavButton dir="next" target={busy ? current : neighbors.next} disabled={busy} onPress={go} />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.bg.overlay },
  sheet: {
    backgroundColor: colors.bg.card,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[2],
    paddingBottom: spacing[6],
    gap: spacing[3],
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: borderRadius.full, backgroundColor: colors.neutral[300], marginBottom: spacing[1] },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  icon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  eyebrow: { fontSize: 11, fontWeight: '700', color: colors.text.muted, letterSpacing: 0.4 },
  title: { fontSize: 19, lineHeight: 24, fontWeight: '800', color: colors.text.primary, marginTop: 2 },
  muted: { fontSize: 14, color: colors.text.secondary },
  center: { textAlign: 'center' },
  caption: { fontSize: 12, fontWeight: '600', color: colors.text.secondary },
  siteLabel: { fontSize: 16, fontWeight: '700', color: colors.text.primary, marginTop: 2 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -spacing[2] },
  siteBox: { backgroundColor: colors.bg.screen, borderRadius: borderRadius.md, padding: spacing[3] },
  siteRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  errorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[2] },
  retry: { minHeight: 40, paddingHorizontal: spacing[3], borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.brand.primary, justifyContent: 'center' },
  retryText: { fontSize: 14, fontWeight: '700', color: colors.brand.primary },
  navRow: { flexDirection: 'row', gap: spacing[3] },
  nav: {
    flex: 1, minHeight: 48, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border.light,
    backgroundColor: colors.bg.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[1],
  },
  navHidden: { opacity: 0 },
  navDisabled: { opacity: 0.5 },
  navText: { fontSize: 14, fontWeight: '700', color: colors.brand.primary },
})
