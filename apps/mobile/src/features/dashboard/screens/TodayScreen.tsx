import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useFocusEffect, useScrollToTop } from '@react-navigation/native'
import {
  ScrollView,
  View,
  Text,
  RefreshControl,
  StyleSheet,
  LayoutAnimation,
  TouchableOpacity,
  Pressable
} from 'react-native'
import { ROUTES } from '../../../navigation/routes'
// TODO(040-strict): named imports do lucide-react-native batem em TS2305 sob nodenext
import * as LucideIcons from 'lucide-react-native'
const { Plus, CalendarClock, Pill, Ruler, ChevronRight } = LucideIcons as any
import { measuresRepo } from '@measures/services/measuresRepo'
import MeasureLogSheet from '@measures/components/MeasureLogSheet'
import MeasureCard from '@measures/components/MeasureCard'
import { useTodayData } from '@dashboard/hooks/useTodayData'
import ScreenContainer from '@shared/components/ui/ScreenContainer'
import LoadingState from '@shared/components/states/LoadingState'
import EmptyState from '@shared/components/states/EmptyState'
import ErrorState from '@shared/components/states/ErrorState'
import { getPeriodFromTime, getNow, getUserTime, parseISO, getTodayLocal, DEFAULT_TZ, summarizeWedgeProfile } from '@dosiq/core'
import { useTodayMeasures } from '@measures/hooks/useTodayMeasures'
import AdherenceDayCard from '@dashboard/components/AdherenceDayCard'
import TreatmentWeekModule from '@dashboard/components/TreatmentWeekModule'
import TimeBlockSeparator from '@dashboard/components/TimeBlockSeparator'
import DoseTimelineCard from '@dashboard/components/DoseTimelineCard'
import EvolutionSwitchSection from '@dashboard/components/EvolutionSwitchSection'
import HeroDoseCard from '@dashboard/components/HeroDoseCard'
import TodayAlertCard from '@dashboard/components/TodayAlertCard'
import TodayOtaCard from '@dashboard/components/TodayOtaCard'
import UnloggedDosesCard from '@dashboard/components/UnloggedDosesCard'
import { ENTRY_POINTS } from '@platform/analytics/analyticsEvents'
import DoseRegisterModal from '@dose/components/DoseRegisterModal'
import ChatEntryButton from '@features/chatbot/components/ChatEntryButton'
import { lightTap } from '@shared/utils/haptics'
import BulkDoseRegisterModal from '@dose/components/BulkDoseRegisterModal'
import StaleBanner from '@shared/components/feedback/StaleBanner'
import NudgeBanner from '@shared/components/ui/NudgeBanner'
import { useNudges } from '@profile/hooks/useNudges'
import { useOtaUpdate } from '@platform/updates/useOtaUpdate'
import { summarizeNextDose } from '@dashboard/utils/nextDoseSummary'
import { useAlarmScreenActive } from '@platform/versionGate/useAlarmScreenActive'
import { useStockTracking } from '@shared/hooks/useStockTracking'
import { useStock } from '@stock/hooks/useStock'
import { subscribePendingDose } from '@navigation/navigateToDose'
import { deriveStockAlerts, deriveSupplyNotices } from '@dashboard/hooks/_useTodayDerived'
import { navigateCrossTab } from '@navigation/navigateCrossTab'
import { useStockUpsell } from '@dashboard/hooks/useStockUpsell'
import { useOemBatteryAssistant } from '@features/oemAssistant/hooks/useOemBatteryAssistant'
import OemBatteryAssistantCard from '@features/oemAssistant/components/OemBatteryAssistantCard'
import { useTodaySurfaces } from '@dashboard/hooks/useTodaySurfaces'
import { useLateDoseActions } from '@dashboard/hooks/useLateDoseActions'
import { useTodaySurfaceSignal } from '@dashboard/hooks/useTodaySurfaceSignal'
import { groupUnloggedDoses } from '@dashboard/utils/unloggedDoses'
import { hasRemindableTreatment } from '@dashboard/utils/hasRemindableTreatment'
import TodayPushPermission from '@dashboard/components/TodayPushPermission'
import { useTodayPushPermission } from '@dashboard/hooks/useTodayPushPermission'
import StockUpsellCard from '@dashboard/components/StockUpsellCard'
import { colors, spacing, typography, borderRadius, shadows } from '@shared/styles/tokens'


// HH:MM local de uma medida (p/ posicionar no período da agenda).
function _measureTime(iso, tz) {
  const d = getUserTime(parseISO(iso), tz)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// Mescla itens-dose com medidas do dia, ordenado por horário (interleave da agenda — FR-011).
function _mergeTimelineWithMeasures(timeline, measures, tz) {
  if (!measures || measures.length === 0) return timeline
  const measureItems = measures.map((m) => ({
    id: `bio:${m.id}`,
    kind: 'measure',
    scheduledTime: _measureTime(m.measured_at, tz),
    measure: m,
  }))
  return [...timeline, ...measureItems].sort((a, b) =>
    (a.scheduledTime || '').localeCompare(b.scheduledTime || '')
  )
}

// Agrupa doses da timeline por turno e computa contadores
function _groupTimeline(timeline, isComplex) {
  const counts = {}
  const grouped = timeline.reduce((acc, item) => {
    const shift = getPeriodFromTime(item.scheduledTime)
    if (!acc[shift]) {
      acc[shift] = []
      counts[shift] = { total: 0, taken: 0 }
    }
    acc[shift].push(item)
    // Medida (biomarcador) entra no grupo p/ interleave, mas NÃO conta na adesão (não é dose).
    if (item.kind === 'measure') return acc
    counts[shift].total += 1
    if (item.isRegistered) counts[shift].taken += 1
    return acc
  }, {})

  const allShifts = ['Madrugada', 'Manhã', 'Tarde', 'Noite']
  const shifts = isComplex
    ? allShifts
    : allShifts.filter(s => grouped[s] && grouped[s].length > 0)

  return { groupedTimeline: grouped, shifts, countsByShift: counts }
}

// Calcula estado inicial de expansão dos turnos
function _computeInitialExpanded(shifts, groupedTimeline) {
  const now = getNow()
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const currentShift = getPeriodFromTime(timeStr)

  const initial = {}
  shifts.forEach(shift => {
    const doses = groupedTimeline[shift] || []
    const isCurrent = shift === currentShift
    const hasUrgent = doses.some(d => d.timelineStatus === 'ATRASADA' || d.timelineStatus === 'PROXIMA')
    initial[shift] = isCurrent || hasUrgent
  })
  return initial
}

// Renderiza conteúdo de um turno expandido (Complex mode). Itens podem ser dose ou medida.
function _renderShiftDoses(items, handleOpenRegister, onSkip = null, busyKey = null) {
  if (items.length === 0) {
    return (
      <View style={styles.emptyShiftContainer}>
        <Text style={styles.emptyShiftText}>Nenhum medicamento para este período</Text>
      </View>
    )
  }
  return items.map((item) =>
    item.kind === 'measure'
      ? <MeasureCard key={item.id} item={item.measure} variant="timeline" />
      : <DoseTimelineCard key={item.id} dose={item} onRegister={handleOpenRegister} onSkip={onSkip} busy={!!busyKey && busyKey === item.scheduledFor} />
  )
}

// Resolve o modal a abrir a partir dos params de deeplink
// 065 AD-8: TODO deeplink que abre modal vem de um lembrete (push de dose do servidor, "Registrar"
// da dose ativa no Android e na Live Activity do iOS — únicos produtores de `screen`). A dose
// registrada ali sai com `entry_point: 'reminder'`.
function _resolveDeeplinkModal(params, protocols, setBulkModal, setModalProtocol, setModalScheduledTime, setModalEntryPoint) {
  if (params.screen === 'bulk-plan' && params.planId) {
    setBulkModal({
      entryPoint: ENTRY_POINTS.REMINDER,
      mode: 'plan',
      planId: params.planId,
      scheduledTime: params.at ?? '',
      treatmentPlanName: params.treatmentPlanName,
    })
  } else if (params.screen === 'bulk-misc') {
    setBulkModal({
      entryPoint: ENTRY_POINTS.REMINDER,
      mode: 'misc',
      protocolIds: params.protocolIds ?? [],
      scheduledTime: params.at ?? '',
    })
  } else if (params.screen === 'dose-individual' && params.protocolId) {
    const protocol = protocols.find(p => p.id === params.protocolId)
    if (protocol) {
      setModalProtocol(protocol)
      setModalScheduledTime(params.at ?? null)
      setModalEntryPoint(ENTRY_POINTS.REMINDER)
    }
  }
}

// Resolve o nome do medicamento do protocolo selecionado
function _resolveMedicineName(modalProtocol, medicines) {
  if (!modalProtocol) return ''
  return medicines[modalProtocol.medicine_id]?.name ?? 'Medicamento'
}

// Extrai dados do header a partir dos dados do usuário
function _buildHeaderData(user) {
  const fullUserName = user?.name || user?.email?.split('@')[0] || 'Usuário'
  const firstName = fullUserName.trim().split(' ')[0]
  const todayFormatted = getNow().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  return { greeting: `Olá, ${firstName}`, todayFormatted }
}

// Conteúdo principal da tela (pós-carregamento) — extrai render para reduzir complexidade
// Entry-point IA top-right (spec 015 onda 2; PO-D1). O <DEV> migrou p/ o título do Perfil.
function TodayHeader({ greeting, todayFormatted }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <Text style={styles.greeting}>{greeting}</Text>
        <Text style={styles.date}>{todayFormatted}</Text>
      </View>
      <ChatEntryButton />
    </View>
  )
}

/**
 * Seção opcional de doses (carry-over ou look-ahead).
 *
 * 012 Fase B (FR-008b): `isCarryOver` ativa o rótulo relativo ("ontem · 10:00") nos
 * cards — necessário para doses semanais (GLP-1) cujo prazo de tolerância (5040min)
 * excede "ontem" e pode recuar até 3,5 dias.
 */
function OptionalDoseSection({ title, subtitle = null, doses = [], onRegister, keyPrefix, isCarryOver = false }) {
  if (doses.length === 0) return null
  return (
    <View style={styles.carryOverSection}>
      <View style={styles.agendaHeader}>
        <Text style={styles.agendaTitle}>{title}</Text>
        {subtitle ? <Text style={styles.agendaSubtitle}>{subtitle}</Text> : null}
      </View>
      {doses.map((dose) => (
        <DoseTimelineCard key={`${keyPrefix}-${dose.id}`} dose={dose} onRegister={onRegister} isCarryOver={isCarryOver} />
      ))}
    </View>
  )
}

function TodayModals({
  modalProtocol,
  modalScheduledTime,
  modalInstanceId,
  modalEntryPoint,
  medicineName,
  handleCloseRegister,
  handleRegisterSuccess,
  bulkModal,
  bulkMode,
  userId,
  isComplex,
  instancesByKey,
  setBulkModal,
  refresh,
  refreshTodayMeasures,
}) {
  return (
    <>
      <DoseRegisterModal
        visible={modalProtocol !== null}
        protocol={modalProtocol}
        scheduledTime={modalScheduledTime}
        instanceId={modalInstanceId}
        entryPoint={modalEntryPoint}
        medicineName={medicineName}
        onClose={handleCloseRegister}
        onSuccess={handleRegisterSuccess}
      />
      <BulkDoseRegisterModal
        visible={bulkModal !== null}
        mode={bulkMode}
        planId={bulkModal?.planId}
        protocolIds={bulkModal?.protocolIds}
        scheduledTime={bulkModal?.scheduledTime ?? ''}
        treatmentPlanName={bulkModal?.treatmentPlanName}
        userId={userId}
        isComplex={isComplex}
        instancesByKey={instancesByKey}
        instancedItems={bulkModal?.items ?? null}
        entryPoint={bulkModal?.entryPoint ?? null}
        initialTakenAt={bulkModal?.initialTakenAt ?? null}
        onClose={() => setBulkModal(null)}
        onSuccess={() => { setBulkModal(null); refresh(); refreshTodayMeasures?.() }}
      />
    </>
  )
}

function TodayLastMeasureSection({ lastTodayMeasure, openMeasuresHub, setMeasureLogOpen }) {
  return (
    <View style={styles.lastMeasureSection}>
      <Text style={styles.lastMeasureTitle}>Última medida</Text>
      {lastTodayMeasure ? (
        <MeasureCard
          item={lastTodayMeasure}
          showChevron
          onPress={() => openMeasuresHub(lastTodayMeasure.type)}
        />
      ) : (
        <Pressable
          onPress={() => { lightTap(); setMeasureLogOpen(true) }}
          style={({ pressed }) => [styles.measureNudge, pressed && styles.measureNudgePressed]}
          accessibilityRole="button"
          accessibilityLabel="Nenhuma medida hoje. Registrar a primeira"
        >
          <View style={styles.measureNudgeIcon}>
            <Ruler size={18} color={colors.status.info} strokeWidth={2} />
          </View>
          <Text style={styles.measureNudgeText}>Nenhuma medida hoje. Toque aqui e registre a primeira!</Text>
          <ChevronRight size={18} color={colors.text.muted} strokeWidth={2} />
        </Pressable>
      )}
    </View>
  )
}

function TodaySpeedDial({ protocols, speedDialOpen, setSpeedDialOpen, setMeasureLogOpen, handleOpenBulkDose }) {
  const handleFabPress = useCallback(() => {
    lightTap()
    setSpeedDialOpen((o) => !o)
  }, [setSpeedDialOpen])

  if (protocols.length === 0) return null

  return (
    <>
      {speedDialOpen && (
        <>
          <Pressable style={styles.speedDialBackdrop} onPress={() => setSpeedDialOpen(false)} accessibilityLabel="Fechar menu" />
          <View style={styles.speedDialActions}>
            <Pressable
              style={({ pressed }) => [styles.speedAction, pressed && styles.fabPressed]}
              onPress={() => { setSpeedDialOpen(false); setMeasureLogOpen(true) }}
              accessibilityRole="button"
              accessibilityLabel="Registrar medida"
            >
              <Text style={styles.speedActionText}>Registrar medida</Text>
              <View style={[styles.speedActionIcon, { backgroundColor: colors.status.info }]}>
                <Ruler size={20} color={colors.text.inverse} strokeWidth={2.5} />
              </View>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.speedAction, pressed && styles.fabPressed]}
              onPress={() => { setSpeedDialOpen(false); handleOpenBulkDose() }}
              accessibilityRole="button"
              accessibilityLabel="Registrar dose"
            >
              <Text style={styles.speedActionText}>Registrar dose</Text>
              <View style={styles.speedActionIcon}>
                <Pill size={20} color={colors.text.inverse} strokeWidth={2.5} />
              </View>
            </Pressable>
          </View>
        </>
      )}
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={handleFabPress}
        accessibilityRole="button"
        accessibilityLabel={speedDialOpen ? 'Fechar menu de registro' : 'Registrar dose ou medida'}
        accessibilityState={{ expanded: speedDialOpen }}
      >
        <Plus size={24} color="#FFF" strokeWidth={3} style={speedDialOpen ? styles.fabIconOpen : null} />
      </Pressable>
    </>
  )
}

// 090 D-5: o estoque da Hoje lê os itens da ABA ESTOQUE (INV-3 — uma fórmula de dias restantes).
// Componente próprio para o `useStock` só montar com o controle de estoque LIGADO (sem fetch à toa
// quando desligado); o snapshot `@dosiq/stock-snapshot` evita rede no 2º acesso. 120 C: não renderiza
// mais nada — entrega a elegibilidade (alertas + avisos de compra) ao árbitro da tela.
//
// `refreshKey` = `capturedAt` do Hoje: cada recarga do Hoje (inclusive a que segue um registro de
// dose) relê o estoque. Sem isto os dias congelavam no 1º render (achado no smoke 28/09).
function TodayStockSource({ refreshKey, onChange, protocols }) {
  const { data: stockData, refresh, loading: stockLoading } = useStock()
  const firstKey = useRef(refreshKey)
  const focusedOnce = useRef(false)
  const alerts = useMemo(() => deriveStockAlerts(stockData?.active), [stockData])
  // 105 G-B5: próxima compra (mensal / etapa de passagem), ≤ 7 dias.
  const supplyNotices = useMemo(
    () => deriveSupplyNotices(stockData?.active, stockData?.localDay ?? getTodayLocal(), protocols),
    [stockData, protocols],
  )
  useEffect(() => {
    if (refreshKey === firstKey.current) return
    refresh(true)
  }, [refreshKey, refresh])
  // S-19 (smoke 14/11): comprou na aba Estoque e voltou ⇒ o aviso tem de refletir já, sem puxar para
  // atualizar. 1º foco = montagem (o `useStock` já carregou); dali em diante relê a cada volta à aba.
  useFocusEffect(
    useCallback(() => {
      if (focusedOnce.current) refresh(true)
      focusedOnce.current = true
    }, [refresh]),
  )
  // Reporta só quando o CONTEÚDO muda: referência nova com os mesmos itens (refetch, cache) não pode
  // re-renderizar a tela pai — com o estado subindo, isso viraria laço de render.
  // S-23: `ready` = 1ª carga do estoque terminou (com dado ou erro). Antes disso o árbitro escolheria
  // sem o estoque e trocaria o card 1–2 s depois.
  const ready = !stockLoading || !!stockData
  const signature = JSON.stringify([alerts, supplyNotices, ready])
  useEffect(() => {
    onChange({ alerts, supplyNotices, ready })
  }, [signature, onChange]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onChange(EMPTY_STOCK), [onChange])
  return null
}

const EMPTY_STOCK = { alerts: [], supplyNotices: [], ready: false }

// 120 C · ADR-129: o slot de ALERTA renderiza só o que o árbitro escolheu (≤ 1).
function TodayAlertSlot(props: any) {
  // S-23: até 2 avisos (o 2º só no caso do árbitro: vermelho + técnico, sem hero).
  return (
    <>
      <TodayAlertView {...props} alert={props.surfaces.alert} />
      <TodayAlertView {...props} alert={props.surfaces.companion} />
    </>
  )
}

function TodayAlertView({ alert, surfaces, pushReach, remindableProtocols, oemReason, onOemAdjust, onOemDismiss, applyUpdate }: any) {
  if (!alert) return null
  switch (alert.kind) {
    case 'push':
      return <TodayPushPermission reach={pushReach} protocols={remindableProtocols} />
    case 'oem':
      return <OemBatteryAssistantCard reason={oemReason as 'restricted' | 'battery'} onAdjust={onOemAdjust} onDismiss={onOemDismiss} />
    case 'ota':
      return <TodayOtaCard onApply={applyUpdate} />
    default:
      return (
        <TodayAlertCard
          payload={alert.payload}
          stockCount={surfaces.stockCount}
          onDismiss={() => surfaces.dismissAlert(alert.key)}
        />
      )
  }
}

// 120 C (FR-013): bloco de doses — hero (com carry-over; a seção "Doses pendentes" saiu: repetia os
// mesmos itens, A-6) · troca de etapa · "doses de hoje sem registro" (só sem hero).
function TodayDosesBlock({ priorityDoses, heroItems, setBulkModal, timezone, evoRefreshTick, unloggedGroups, onSeeAgenda }: any) {
  return (
    <>
      {priorityDoses.length > 0 && (
        <HeroDoseCard doses={priorityDoses} onPress={() => setBulkModal({ mode: 'hero', items: heroItems })} />
      )}
      <EvolutionSwitchSection timezone={timezone} refreshToken={evoRefreshTick} />
      {priorityDoses.length === 0 && (
        <UnloggedDosesCard groups={unloggedGroups} onSeeAgenda={onSeeAgenda} />
      )}
    </>
  )
}

// 120 C · ADR-129: tudo que o árbitro decide (bloco de doses, alerta, promo) num lugar — a tela
// só passa dados. Elegibilidade de cada superfície continua nos hooks dela.
function TodayPrioritySection({
  data, protocols, scheduledProtocols, priorityDoses, heroItems, timeline, setBulkModal,
  otaIdle, nudgeApi, navigation, evoRefreshTick, onSeeAgenda, afterDoses = null,
}: any) {
  // States
  const [stockSource, setStockSource] = useState(EMPTY_STOCK)
  // Memos
  const unloggedGroups = useMemo(() => groupUnloggedDoses(timeline), [timeline])
  // Hooks de elegibilidade
  const { enabled: stockTrackingEnabled } = useStockTracking()
  const { visible: stockUpsellVisible, dismiss: dismissStockUpsell } = useStockUpsell(data?.timezone)
  // 120 E-7: alcance do push — fonte única do card de permissão e do gate do card de bateria (S-2).
  const { reach: pushReach, remindable: remindableProtocols } = useTodayPushPermission({ data, protocols, scheduledProtocols })
  const { eligible: oemEligible, dismissed: oemDismissed, reason: oemReason, dismiss: dismissOem } = useOemBatteryAssistant({ hasTreatment: hasRemindableTreatment(protocols), pushUsable: pushReach.usable })
  const { updateReady, applyUpdate } = useOtaUpdate()
  const surfaces = useTodaySurfaces({
    userId: data?.user?.id ?? null,
    hasHero: priorityDoses.length > 0,
    push: { usable: pushReach.usable, snoozed: pushReach.snoozed, remindable: hasRemindableTreatment(remindableProtocols) },
    oem: { eligible: oemEligible, dismissed: oemDismissed },
    // 120 C (C-4): OTA pronto é alerta TÉCNICO #7 (não mais nudge); espera ocioso como antes (E-8).
    otaReady: !!updateReady && otaIdle,
    stockUpsellVisible,
    nudge: nudgeApi.nudge,
    stockAlerts: stockTrackingEnabled ? stockSource.alerts : [],
    supplyNotices: stockTrackingEnabled ? stockSource.supplyNotices : [],
    protocols,
  })
  useTodaySurfaceSignal(surfaces)

  const dosesBlock = (
    <TodayDosesBlock
      priorityDoses={priorityDoses}
      heroItems={heroItems}
      setBulkModal={setBulkModal}
      timezone={data?.timezone}
      evoRefreshTick={evoRefreshTick}
      unloggedGroups={unloggedGroups}
      onSeeAgenda={onSeeAgenda}
    />
  )
  return (
    <>
      {stockTrackingEnabled && <TodayStockSource refreshKey={data?.capturedAt} onChange={setStockSource} protocols={protocols} />}
      {surfaces.dosesFirst && dosesBlock}
      {(!stockTrackingEnabled || stockSource.ready) && (
        <TodayAlertSlot
          surfaces={surfaces}
          pushReach={pushReach}
          remindableProtocols={remindableProtocols}
          oemReason={oemReason}
          onOemAdjust={() => navigation?.navigate?.(ROUTES.OEM_BATTERY_ASSISTANT)}
          onOemDismiss={dismissOem}
          applyUpdate={applyUpdate}
        />
      )}
      {!surfaces.dosesFirst && dosesBlock}
      {/* 121 A (H-2): superfície de dose/medida entre o bloco de doses e a promo — fora do árbitro (H-1). */}
      {afterDoses}
      {/* 120 C (D-8): no máximo 1 promo, entre o bloco de doses e a agenda; some com alerta técnico. */}
      {surfaces.promo === 'stock_upsell' && (
        <StockUpsellCard
          onActivate={() => navigation?.navigate?.(ROUTES.STOCK_INITIAL_BALANCE, { source: 'upsell' })}
          onDismiss={dismissStockUpsell}
        />
      )}
      {surfaces.promo === 'nudge' && (
        <NudgeBanner nudge={nudgeApi.nudge} onAction={nudgeApi.handleAction} onDismiss={nudgeApi.dismiss} />
      )}
    </>
  )
}

// 121 A: perfil (FR-001) → o que a Hoje mostra. `nenhum` ⇒ Hoje de sempre (INV-4). No wedge a Agenda
// fica enquanto há dose hoje (G-A2/H-4: caminho de correção do dia da 120 C).
function useTreatmentWeekSlot({ wedge, timeline, protocols, data }: any) {
  const profile = wedge?.profile ?? 'nenhum'
  const isWedge = profile === 'wedge'
  const hasDoseToday = timeline.some((item: any) => item.kind !== 'measure')
  const wedgeProtocol = wedge?.wedgeProtocolId ? protocols.find((p: any) => p.id === wedge.wedgeProtocolId) : null
  const weekModule = profile === 'nenhum' ? null : (
    <TreatmentWeekModule
      userId={data?.user?.id ?? null}
      profile={profile}
      medicineName={wedgeProtocol?.medicine?.name ?? null}
      treatmentStart={wedge?.wedgeStart ?? null}
      timezone={data?.timezone || DEFAULT_TZ}
      reloadKey={data?.capturedAt}
    />
  )
  return { isWedge, showAgenda: !isWedge || hasDoseToday, weekModule }
}

function TodayScreenContent({
  data, stale, loading, refresh,
  timeline, carryOver, lookAhead, protocols, scheduledProtocols, stats, hasAnyTreatment, nextDoseLabel,
  isComplex, shifts, groupedTimeline, countsByShift,
  expandedShifts, toggleShift,
  modalProtocol, modalScheduledTime, modalInstanceId, modalEntryPoint, medicineName, handleOpenRegister, handleRegisterSuccess, handleCloseRegister,
  bulkModal, setBulkModal,
  handleOpenBulkDose,
  refreshTodayMeasures,
  todayMeasures,
  navigation,
  wedge = null,
}: any) {
  const [evoRefreshTick, setEvoRefreshTick] = useState(0)
  const [speedDialOpen, setSpeedDialOpen] = useState(false)
  const [measureLogOpen, setMeasureLogOpen] = useState(false)
  const scrollRef = useRef<any>(null)
  const agendaY = useRef(0)
  // Smoke 14/11 (S-10): tocar na aba Hoje já ativa volta ao topo (padrão de tabs).
  useScrollToTop(scrollRef)
  const nudgeApi = useNudges('dashboard')
  const alarmScreenActive = useAlarmScreenActive()
  const isIdleForOtaBanner = modalProtocol === null && bulkModal === null
    && !measureLogOpen && !speedDialOpen && !alarmScreenActive

  const priorityDoses = useMemo(() => {
    const todayUrgent = timeline.filter((d: any) => d.timelineStatus === 'PROXIMA' || d.timelineStatus === 'ATRASADA')
    const aheadImminent = lookAhead.filter((d: any) => d.timelineStatus === 'PROXIMA')
    return [...carryOver, ...todayUrgent, ...aheadImminent]
      .sort((a: any, b: any) => (a.scheduledFor || '').localeCompare(b.scheduledFor || ''))
  }, [carryOver, timeline, lookAhead])

  const instancesByKey = useMemo(() => timeline.reduce((map: any, d: any) => {
    if (d.instanceId && d.protocol?.id && d.scheduledTime) {
      map[`${d.protocol.id}|${d.scheduledTime}`] = d.instanceId
    }
    return map
  }, {}), [timeline])

  const heroItems = useMemo(() => priorityDoses.map((d: any) => ({
    id: d.instanceId,
    protocol: d.protocol,
    scheduledTime: d.scheduledTime,
    plan: d.protocol?.treatment_plan,
    instanceId: d.instanceId,
  })), [priorityDoses])

  const { greeting, todayFormatted } = _buildHeaderData(data?.user)
  const adherenceTrend = stats.hasPreviousData
    ? `${stats.trend >= 0 ? '+' : ''}${stats.trend}% vs semana anterior`
    : ''
  const bulkMode = bulkModal?.mode ?? 'plan'
  const userId = data?.user?.id ?? ''
  const lastTodayMeasure = todayMeasures?.[0] ?? null

  const { isWedge, showAgenda, weekModule } = useTreatmentWeekSlot({ wedge, timeline, protocols, data })

  const late = useLateDoseActions({ setBulkModal, refresh })
  // SEM_REGISTRO na agenda ⇒ registro tardio (lote c/ hora prevista); na janela ⇒ modal de sempre.
  const agendaRegister = useCallback((protocol: any, scheduledTime: any, instanceId: any, dose: any) => {
    if (dose?.timelineStatus === 'SEM_REGISTRO') late.registerLate([dose])
    else handleOpenRegister(protocol, scheduledTime, instanceId)
  }, [late, handleOpenRegister])
  // "Ver na agenda" do card resumo: abre (modo complexo) o turno da 1ª dose sem registro e rola.
  const scrollToAgenda = useCallback(() => {
    const first = timeline.find((d: any) => d.timelineStatus === 'SEM_REGISTRO')
    const shift = first && isComplex ? shifts.find((s: any) => (groupedTimeline[s] || []).includes(first)) : null
    if (shift && !expandedShifts[shift]) toggleShift(shift)
    scrollRef.current?.scrollTo?.({ y: Math.max(0, agendaY.current - 8), animated: true })
  }, [timeline, isComplex, shifts, groupedTimeline, expandedShifts, toggleShift])

  const handleSaveMeasure = useCallback(async (payload: any) => {
    const created = await measuresRepo.create(payload)
    refreshTodayMeasures?.()
    return created
  }, [refreshTodayMeasures])

  const openMeasuresHub = useCallback((measureType: any) => {
    navigateCrossTab(ROUTES.PROFILE, ROUTES.MEASURES, { type: measureType })
  }, [])

  return (
    <ScreenContainer>
      {stale && <StaleBanner />}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={() => { refresh(); nudgeApi.refresh(); setEvoRefreshTick((t) => t + 1) }} tintColor={colors.status.success} />}
      >
        <TodayHeader greeting={greeting} todayFormatted={todayFormatted} />
        {/* 121 A (FR-003): wedge sem card de adesão. */}
        {!isWedge && <AdherenceDayCard score={stats.score} trend={adherenceTrend} />}
        <TodayPrioritySection
          data={data} protocols={protocols} scheduledProtocols={scheduledProtocols}
          priorityDoses={priorityDoses} heroItems={heroItems} timeline={timeline}
          setBulkModal={setBulkModal} otaIdle={isIdleForOtaBanner} nudgeApi={nudgeApi}
          navigation={navigation} evoRefreshTick={evoRefreshTick} onSeeAgenda={scrollToAgenda}
          afterDoses={weekModule}
        />
        {/* 121 A (G-A2/H-4): no wedge a Agenda fica enquanto há dose hoje — é o caminho de correção
            do dia da 120 C. Só o dia sem dose troca o vazio "Nenhuma dose hoje" pelo módulo. */}
        {showAgenda && (
          <>
            <View style={styles.agendaHeader} onLayout={(e) => { agendaY.current = e.nativeEvent.layout.y }}>
              <Text style={styles.agendaTitle}>Agenda de Hoje</Text>
            </View>
            <TodayAgendaContent
              protocols={protocols} hasAnyTreatment={hasAnyTreatment} nextDoseLabel={nextDoseLabel}
              isComplex={isComplex} timeline={timeline}
              shifts={shifts} groupedTimeline={groupedTimeline} countsByShift={countsByShift}
              expandedShifts={expandedShifts} toggleShift={toggleShift} handleOpenRegister={agendaRegister}
              onSkip={late.skipDose} busyKey={late.busyKey}
            />
          </>
        )}
        <OptionalDoseSection title="Em breve" doses={lookAhead} onRegister={handleOpenRegister} keyPrefix="ahead" />

        {!isWedge && (
          <TodayLastMeasureSection
            lastTodayMeasure={lastTodayMeasure}
            openMeasuresHub={openMeasuresHub}
            setMeasureLogOpen={setMeasureLogOpen}
          />
        )}
      </ScrollView>

      <TodaySpeedDial
        protocols={protocols}
        speedDialOpen={speedDialOpen}
        setSpeedDialOpen={setSpeedDialOpen}
        setMeasureLogOpen={setMeasureLogOpen}
        handleOpenBulkDose={handleOpenBulkDose}
      />

      <MeasureLogSheet
        open={measureLogOpen}
        onClose={() => setMeasureLogOpen(false)}
        onSaved={handleSaveMeasure}
      />
      <TodayModals
        modalProtocol={modalProtocol}
        modalScheduledTime={modalScheduledTime}
        modalInstanceId={modalInstanceId}
        modalEntryPoint={modalEntryPoint}
        medicineName={medicineName}
        handleCloseRegister={handleCloseRegister}
        handleRegisterSuccess={handleRegisterSuccess}
        bulkModal={bulkModal}
        bulkMode={bulkMode}
        userId={userId}
        isComplex={isComplex}
        instancesByKey={instancesByKey}
        setBulkModal={setBulkModal}
        refresh={refresh}
        refreshTodayMeasures={refreshTodayMeasures}
      />
    </ScreenContainer>
  )
}

// 086 D-13: há tratamento ativo, nenhuma dose hoje (começa no futuro, ou dia sem dose da cadência).
// Medidas do dia seguem visíveis abaixo — o estado é da AGENDA de doses, não do dia inteiro.
function NoDoseToday({ nextDoseLabel, measures = [] }) {
  return (
    <View>
      <EmptyState
        icon={<CalendarClock size={48} color={colors.primary[500]} strokeWidth={1.5} />}
        title="Nenhuma dose hoje"
        message={nextDoseLabel}
        action={{ label: 'Ver tratamentos', onPress: () => navigateCrossTab(ROUTES.TREATMENTS) }}
      />
      {measures.length > 0 ? (
        <View style={styles.simpleList}>
          {measures.map((item) => <MeasureCard key={item.id} item={item.measure} variant="timeline" />)}
        </View>
      ) : null}
    </View>
  )
}

// Renderiza a agenda de doses (Simple ou Complex mode)
function TodayAgendaContent({ protocols, hasAnyTreatment, nextDoseLabel, isComplex, timeline, shifts, groupedTimeline, countsByShift, expandedShifts, toggleShift, handleOpenRegister, onSkip = null, busyKey = null }: any) {
  // 086 D-13: primeiro uso = nenhum tratamento ativo, nem agendado. Quem TEM tratamento (que começa
  // no futuro, ou sem dose hoje) nunca é convidada a "criar o primeiro" — risco de cadastro duplicado.
  if (!hasAnyTreatment) {
    return (
      <EmptyState
        icon={<CalendarClock size={48} color={colors.primary[500]} strokeWidth={1.5} />}
        title="Comece seu primeiro tratamento"
        message="Configure doses e horários para receber lembretes e acompanhar a adesão."
        action={{
          label: '+ Criar primeiro tratamento',
          onPress: () => navigateCrossTab(ROUTES.TREATMENTS, ROUTES.PROTOCOL_FORM),
        }}
      />
    )
  }
  if (protocols.length === 0 || !timeline.some((item) => item.kind !== 'measure')) {
    return <NoDoseToday nextDoseLabel={nextDoseLabel} measures={timeline.filter((item) => item.kind === 'measure')} />
  }
  if (!isComplex) {
    return (
      <View style={styles.simpleList}>
        {timeline.map((item) =>
          item.kind === 'measure'
            ? <MeasureCard key={item.id} item={item.measure} variant="timeline" />
            : <DoseTimelineCard key={item.id} dose={item} onRegister={handleOpenRegister} onSkip={onSkip} busy={!!busyKey && busyKey === item.scheduledFor} />
        )}
      </View>
    )
  }
  return shifts.map(shift => {
    const doses = groupedTimeline[shift] || []
    const isExpanded = expandedShifts[shift]
    const shiftCounts = countsByShift[shift] || { total: 0, taken: 0 }
    return (
      <View key={shift} style={styles.shiftContainer}>
        <TimeBlockSeparator
          type={shift}
          isExpanded={isExpanded}
          onToggle={() => toggleShift(shift)}
          isDisabled={doses.length === 0}
          counts={shiftCounts.total > 0 ? shiftCounts : null}
        />
        {isExpanded && (
          <View style={styles.dosesList}>
            {_renderShiftDoses(doses, handleOpenRegister, onSkip, busyKey)}
          </View>
        )}
      </View>
    )
  })
}

function _extractTodayScreenData(data) {
  const {
    timeline = [],
    carryOver = [],
    lookAhead = [],
    protocols = [],
    scheduledProtocols = [],
    medicines = {},
    stats = { expected: 0, taken: 0, score: 0 },
    user = null,
    localDay = null,
    timezone = 'America/Sao_Paulo',
  } = data || {}

  return {
    timeline,
    carryOver,
    lookAhead,
    protocols,
    scheduledProtocols,
    medicines,
    stats,
    user,
    currentDay: localDay,
    timezone,
  }
}

export default function TodayScreen({ route, navigation }) {
  // States
  const [modalProtocol, setModalProtocol] = useState(null)
  const [modalScheduledTime, setModalScheduledTime] = useState(null)
  const [modalInstanceId, setModalInstanceId] = useState(null)
  // 065 AD-8: 'reminder' só enquanto a modal individual aberta por deeplink está na tela.
  const [modalEntryPoint, setModalEntryPoint] = useState(null)
  // null | { mode, planId?, protocolIds?, scheduledTime, treatmentPlanName? }
  const [bulkModal, setBulkModal] = useState(null)
  const [expandedShifts, setExpandedShifts] = useState({})
  const [lastHeuristicDay, setLastHeuristicDay] = useState(null)
  // 090 D-3: dose do lembrete recebida pelo canal (`subscribePendingDose`), consumida ao abrir a modal
  const [deliveredDose, setDeliveredDose] = useState(null)

  const { data, loading, error, stale, refresh } = useTodayData()

  // Pre-resolve optional chains do data para reduzir complexidade ciclomática
  const {
    timeline,
    carryOver,
    lookAhead,
    protocols,
    scheduledProtocols,
    medicines,
    stats,
    user,
    currentDay,
    timezone,
  } = useMemo(() => _extractTodayScreenData(data), [data])

  // 086 RC2 D-13: "Nenhuma dose hoje" × "primeiro uso". Agendados = ativos que ainda não começaram.
  const hasAnyTreatment = protocols.length > 0 || scheduledProtocols.length > 0
  // 121 A (FR-001): perfil sobre os tratamentos ATIVOS hoje (protocolos já trazem o medicamento com
  // `therapeutic_class_code`). Cache antigo sem a classe ⇒ `nenhum` = Hoje de sempre (INV-4).
  const wedge = useMemo(() => summarizeWedgeProfile(
    protocols.map((p: any) => ({ id: p.id, medicine_id: p.medicine_id, start_date: p.start_date })),
    Object.fromEntries(protocols.map((p: any) => [p.medicine_id, p.medicine?.therapeutic_class_code ?? null]))
  ), [protocols])
  const nextDoseLabel = useMemo(
    () => summarizeNextDose([...protocols, ...scheduledProtocols], getNow()),
    [protocols, scheduledProtocols]
  )

  // 1. Lógica de Persona: Threshold de complexidade adaptativa (Wave 10A)
  const complexityOverride = user?.complexity_override
  const isComplex = useMemo(() => {
    if (complexityOverride) return complexityOverride === 'complex'
    return Object.keys(medicines).length > 3
  }, [medicines, complexityOverride])

  // 012 Fase C — medidas do dia mescladas na agenda (interleave, FR-011).
  const { items: todayMeasures, refresh: refreshTodayMeasures } = useTodayMeasures(timezone)
  const timelineWithMeasures = useMemo(
    () => _mergeTimelineWithMeasures(timeline, todayMeasures, timezone),
    [timeline, todayMeasures, timezone]
  )

  // Carlos (isComplex) vê todos os turnos. Dona Maria vê apenas onde há doses.
  const { groupedTimeline, shifts, countsByShift } = useMemo(
    () => _groupTimeline(timelineWithMeasures, isComplex),
    [timelineWithMeasures, isComplex]
  )

  // Heurística de Expansão Inicial - Ajuste de Estado no Render (React 19 Pattern)
  if (currentDay && currentDay !== lastHeuristicDay) {
    setExpandedShifts(_computeInitialExpanded(shifts, groupedTimeline))
    setLastHeuristicDay(currentDay)
  }

  // Effects
  // Refresh ao focar: re-lê complexity_override alterado em Configurações
  // (e captura doses/tratamentos novos). Paridade com TreatmentsScreen.
  useFocusEffect(
    useCallback(() => {
      refresh()
      refreshTodayMeasures()
    }, [refresh, refreshTodayMeasures])
  )

  // 090 D-3: a dose chega por um canal assinado, não por params aninhados (que se perdiam no cold
  // start). Montado: recebe na hora; montando depois: recebe a pendente. Vira ESTADO desta tela, não
  // params: no cold start o Hoje monta com o navegador de abas ainda sem estado e o `setParams` feito
  // na montagem é descartado em silêncio (smoke 28/09 21:11, log: entregue, `route.params` undefined).
  useEffect(
    () => subscribePendingDose((dose) => setDeliveredDose(dose)),
    []
  )

  // 2. Deeplink de lembrete: dose entregue pelo canal ou params de rota (N1.4 → N1.5)
  const routeParams = deliveredDose ?? route?.params
  useEffect(() => {
    if (!routeParams?.screen) return
    // 090 C1.5 G-1: no cold start o deeplink chega antes dos tratamentos. Resolver agora não acha o
    // protocolo e o `setParams` abaixo apaga o pedido — a modal se perdia mesmo navegando certo.
    // Espera a carga; protocolo inexistente DEPOIS da carga limpa sem modal.
    const awaitingProtocol = routeParams.screen === 'dose-individual'
      && !protocols.some(p => p.id === routeParams.protocolId)
    if (awaitingProtocol && loading) return
    setTimeout(() => {
      _resolveDeeplinkModal(routeParams, protocols, setBulkModal, setModalProtocol, setModalScheduledTime, setModalEntryPoint)
      setDeliveredDose(null)
      navigation?.setParams({ screen: undefined, planId: undefined, protocolIds: undefined })
    }, 0)
  }, [routeParams, navigation, protocols, loading])

  // Handlers
  const toggleShift = useCallback((shift) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setExpandedShifts(prev => ({
      ...prev,
      [shift]: !prev[shift]
    }))
  }, [])

  const handleOpenBulkDose = useCallback(() => {
    lightTap()
    setBulkModal({
      mode: 'active',
      scheduledTime: '',
    })
  }, [])

  const medicineName = _resolveMedicineName(modalProtocol, medicines)

  const handleOpenRegister = useCallback((protocol, scheduledTime, instanceId = null) => {
    setModalProtocol(protocol)
    setModalScheduledTime(scheduledTime)
    setModalInstanceId(instanceId)
    setModalEntryPoint(null) // aberta pelo card, não por lembrete
  }, [])

  const handleCloseRegister = useCallback(() => {
    setModalProtocol(null)
    setModalScheduledTime(null)
    setModalInstanceId(null)
    setModalEntryPoint(null)
  }, [])

  const handleRegisterSuccess = useCallback(() => {
    setModalProtocol(null)
    setModalScheduledTime(null)
    setModalInstanceId(null)
    setModalEntryPoint(null)
    refresh()
    // 069 A2: o sheet da dose pode ter gravado peso (passo 2) — a agenda intercala medidas
    refreshTodayMeasures()
  }, [refresh, refreshTodayMeasures])

  if (loading && !data) return <LoadingState message="Carregando o seu dia..." />
  if (error && !data) return <ErrorState message={error} onRetry={refresh} />

  return (
    <TodayScreenContent
      data={data} stale={stale} loading={loading} refresh={refresh}
      timeline={timelineWithMeasures} carryOver={carryOver} lookAhead={lookAhead} protocols={protocols} scheduledProtocols={scheduledProtocols} stats={stats}
      hasAnyTreatment={hasAnyTreatment} nextDoseLabel={nextDoseLabel}
      refreshTodayMeasures={refreshTodayMeasures} todayMeasures={todayMeasures}
      isComplex={isComplex} shifts={shifts} groupedTimeline={groupedTimeline}
      countsByShift={countsByShift} expandedShifts={expandedShifts} toggleShift={toggleShift}
      modalProtocol={modalProtocol} modalScheduledTime={modalScheduledTime} modalInstanceId={modalInstanceId} modalEntryPoint={modalEntryPoint}
      medicineName={medicineName} handleOpenRegister={handleOpenRegister}
      handleRegisterSuccess={handleRegisterSuccess} handleCloseRegister={handleCloseRegister}
      bulkModal={bulkModal} setBulkModal={setBulkModal}
      handleOpenBulkDose={handleOpenBulkDose}
      navigation={navigation}
      wedge={wedge}
    />
  )
}

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: 40,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: -0.5,
    fontFamily: typography.fontFamily.bold || 'System',
  },
  date: {
    fontSize: 16,
    color: colors.text.secondary,
    textTransform: 'capitalize',
    marginTop: 4,
    fontFamily: typography.fontFamily.medium || 'System',
  },
  agendaHeader: {
    paddingHorizontal: 20,
    marginTop: spacing[6],
    marginBottom: spacing[3],
  },
  carryOverSection: {
    marginBottom: spacing[2],
  },
  agendaTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text.primary,
    fontFamily: typography.fontFamily.bold || 'System',
  },
  // 012 Fase B (FR-008b): subtítulo descritivo abaixo do título da seção carry-over
  agendaSubtitle: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 2,
    fontFamily: typography.fontFamily.regular || 'System',
  },
  shiftContainer: {
    marginBottom: spacing[4],
  },
  dosesList: {
    marginTop: 4,
  },
  simpleList: {},
  emptyShiftContainer: {
    paddingVertical: spacing[6],
    paddingHorizontal: spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyShiftText: {
    fontSize: 14,
    color: colors.text.secondary,
    fontStyle: 'italic',
    textAlign: 'center',
    opacity: 0.7,
  },
  fab: {
    position: 'absolute',
    bottom: spacing[6],
    right: spacing[5],
    width: 56,
    height: 56,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  fabPressed: {
    opacity: 0.9,
  },
  fabIconOpen: {
    transform: [{ rotate: '45deg' }],
  },
  lastMeasureSection: {
    marginTop: spacing[4],
    paddingHorizontal: spacing[4],
    gap: spacing[2],
  },
  lastMeasureTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  // Nudge "Nenhuma medida hoje" — tracejado p/ diferenciar de registro real (não é dado).
  measureNudge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderStyle: 'solid', // AP-163: RN só suporta 'solid'; 'dashed' dispara WARN (multiplica por frame)
    borderColor: colors.border.light,
    backgroundColor: colors.bg.card,
  },
  measureNudgePressed: { opacity: 0.7 },
  measureNudgeIcon: {
    width: 36, height: 36, borderRadius: borderRadius.full,
    backgroundColor: colors.status.infoLight, alignItems: 'center', justifyContent: 'center',
  },
  measureNudgeText: {
    flex: 1,
    fontSize: 14,
    color: colors.text.secondary,
  },
  speedDialBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg.overlay,
  },
  speedDialActions: {
    position: 'absolute',
    right: spacing[5],
    bottom: spacing[6] + 56 + spacing[3],
    gap: spacing[3],
    alignItems: 'flex-end',
  },
  speedAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  speedActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
    backgroundColor: colors.bg.card,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    ...shadows.sm,
  },
  speedActionIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
})
