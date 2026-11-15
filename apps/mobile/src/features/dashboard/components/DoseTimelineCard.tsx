import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
// TODO(040-strict): named imports do lucide-react-native batem em TS2305 sob nodenext
import * as LucideIcons from 'lucide-react-native'
const { Check, Clock, XCircle } = LucideIcons as any
import { colors, typography, shadows } from '@shared/styles/tokens'
import { formatIntakeDose, daysAgoLabel, getRawNow, DEFAULT_TZ } from '@dosiq/core'

/** Ícone de status da dose (helper de módulo — não conta p/ complexidade do componente). */
function StatusIcon({ timelineStatus }) {
  if (timelineStatus === 'TOMADA') return <Check size={18} color={colors.status.success} />
  if (timelineStatus === 'PERDIDA') return <XCircle size={18} color={colors.status.error} />
  // 120 C DC-3: sem registro = relógio em tom secundário (ainda corrigível), nunca o X vermelho.
  if (timelineStatus === 'SEM_REGISTRO') return <Clock size={18} color={colors.text.secondary} />
  return <Clock size={18} color={colors.neutral[300]} />
}

/**
 * 012 Fase B (FR-008b): monta o texto do horário para doses carry-over.
 * Para doses não registradas, prefixo relativo: "ontem · 10:00" | "há 2 dias · 10:00".
 * Registradas/perdidas retornam apenas o horário simples.
 * @returns {{ displayTime: string, hasLabel: boolean }}
 */
function resolveDisplayTime(scheduledTime, scheduledFor, isCarryOver, isTaken) {
  if (!isCarryOver || isTaken || !scheduledFor) return { displayTime: scheduledTime, hasLabel: false }
  const label = daysAgoLabel(scheduledFor, getRawNow(), DEFAULT_TZ)
  if (!label) return { displayTime: scheduledTime, hasLabel: false }
  return { displayTime: `${label} · ${scheduledTime}`, hasLabel: true }
}

/** Alvo de toque ≥ 44 com botão de 32 (DC-7). */
const HIT_SLOP = { top: 6, bottom: 6, left: 4, right: 4 }

/** 120 C DC-4/DC-5/DC-7: ações na 2ª linha — Tomar/Registrar primário, Pular texto (peso menor). */
function DoseTimelineActions({ isInWindow, name, dose, busy, wide, onRegister, onSkip }) {
  const verb = isInWindow ? 'Tomar' : 'Registrar'
  return (
    <View style={[styles.actions, wide && styles.actionsWide]}>
      <TouchableOpacity
        style={[isInWindow ? styles.ctaFilled : styles.ctaOutline, busy && styles.ctaBusy]}
        onPress={onRegister}
        disabled={busy}
        hitSlop={HIT_SLOP}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${verb} dose de ${name} das ${dose.scheduledTime}`}
        accessibilityState={{ disabled: busy, busy }}
        testID={`dose-${isInWindow ? 'take' : 'register'}-${dose.instanceId}`}
      >
        <Text style={isInWindow ? styles.ctaFilledText : styles.ctaOutlineText}>{verb}</Text>
      </TouchableOpacity>
      {onSkip && (
        <TouchableOpacity
          style={styles.ctaText}
          onPress={onSkip}
          disabled={busy}
          hitSlop={HIT_SLOP}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Pular dose de ${name} das ${dose.scheduledTime}`}
          accessibilityState={{ disabled: busy, busy }}
          testID={`dose-skip-${dose.instanceId}`}
        >
          {busy ? <ActivityIndicator size="small" color={colors.text.secondary} /> : <Text style={styles.ctaTextLabel}>Pular</Text>}
        </TouchableOpacity>
      )}
    </View>
  )
}

/**
 * Estado → flags de exibição. Muted só para TOMADA/PERDIDA (SEM_REGISTRO NÃO — DC-3); ações para a
 * janela (Tomar) e SEM_REGISTRO (Registrar).
 */
function statusFlags(timelineStatus) {
  const isTaken = timelineStatus === 'TOMADA'
  const isInWindow = timelineStatus === 'ATRASADA' || timelineStatus === 'PROXIMA'
  return {
    isTaken,
    isMuted: isTaken || timelineStatus === 'PERDIDA',
    isInWindow,
    isActionable: isInWindow || timelineStatus === 'SEM_REGISTRO',
  }
}

/** R-299: identidade congelada na ocorrência (`medicineName` do core); o tratamento é fallback. */
function doseDisplayName(dose) {
  return dose.medicineName || dose.medicine?.name || dose.protocol?.name || 'Medicamento'
}

/**
 * DoseTimelineCard - Item de dose para a Timeline (Epic 2)
 *
 * 120 C (US9 · RC2-C DC-3/DC-4/DC-5/DC-7):
 * - na janela (PROXIMA/ATRASADA) ⇒ [Tomar] + [Pular];
 * - SEM_REGISTRO (fora da tolerância, antes do cron) ⇒ [Registrar] + [Pular], estado NEUTRO (sem
 *   muted, sem vermelho: "ainda dá tempo", não "falhou");
 * - PERDIDA (`missed`, dia fechado) ⇒ sem ação; TOMADA ⇒ sem ação. Pulada nem aparece (core).
 * As ações ficam numa 2ª linha (o nome do remédio mantém a largura toda) e [Pular] tem peso menor.
 *
 * @param {Object} props.dose - dose com timelineStatus
 * @param {Function} props.onRegister - (protocol, scheduledTime, instanceId, dose) ⇒ registrar
 * @param {Function} [props.onSkip] - (dose) ⇒ pular; ausente ⇒ sem [Pular]
 * @param {boolean} [props.busy] - ação em voo nesta linha (DC-5: desabilita, evita RPC dupla)
 * @param {boolean} [props.isCarryOver] - 012 Fase B (FR-008b): rótulo relativo no horário
 */
export default function DoseTimelineCard({ dose, onRegister, onSkip = null, busy = false, isCarryOver = false }: any) {
  const { timelineStatus, scheduledTime, scheduledFor, medicine, protocol } = dose
  const { isTaken, isMuted, isInWindow, isActionable } = statusFlags(timelineStatus)
  const { displayTime, hasLabel } = resolveDisplayTime(scheduledTime, scheduledFor, isCarryOver, isTaken)
  const name = doseDisplayName(dose)
  const register = () => onRegister?.(protocol, scheduledTime, dose.instanceId, dose)

  return (
    <View style={[styles.card, isMuted && styles.cardMuted]}>
      <View style={styles.row}>
        <View style={[styles.timeLineContainer, hasLabel && styles.timeLineContainerWide]}>
          <Text style={[styles.timeText, isMuted && styles.mutedText, hasLabel && styles.timeTextSmall]}>{displayTime}</Text>
        </View>

        <View style={styles.info}>
          <Text
            style={[styles.name, isTaken && styles.strikethrough, isMuted && styles.mutedText]}
            numberOfLines={2}
          >
            {name}
          </Text>
          <Text style={[styles.dosage, isMuted && styles.mutedText]}>
            {formatIntakeDose(protocol?.dosage_per_intake ?? 1, protocol?.intake_unit, medicine)}
          </Text>
        </View>

        {!isInWindow && (
          <View style={styles.statusIcon}>
            <StatusIcon timelineStatus={timelineStatus} />
          </View>
        )}
      </View>

      {isActionable && (
        <DoseTimelineActions
          isInWindow={isInWindow}
          name={name}
          dose={dose}
          busy={busy}
          wide={hasLabel}
          onRegister={register}
          onSkip={onSkip && scheduledFor ? () => onSkip(dose) : null}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bg.card,
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    // Sombra sutil
    ...shadows.xs,
  },
  cardMuted: {
    backgroundColor: colors.border.light,
    opacity: 0.6,
  },
  timeLineContainer: {
    width: 60,
  },
  // 012 Fase B (FR-008b): container mais largo quando exibe rótulo relativo ("ontem · 10:00")
  timeLineContainerWide: {
    width: 110,
  },
  timeText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
    fontFamily: typography.fontFamily.bold || 'System',
  },
  // 012 Fase B (FR-008b): fonte levemente menor p/ caber o rótulo relativo sem quebra
  timeTextSmall: {
    fontSize: 13,
  },
  info: {
    flex: 1,
    paddingLeft: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    fontFamily: typography.fontFamily.bold || 'System',
  },
  strikethrough: {
    textDecorationLine: 'line-through',
  },
  dosage: {
    fontSize: 13,
    color: colors.text.secondary,
    fontFamily: typography.fontFamily.regular || 'System',
  },
  mutedText: {
    color: colors.text.muted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIcon: {
    width: 32,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  // DC-4: ações na 2ª linha, alinhadas à coluna do nome (60 = coluna do horário + 4 do info).
  // Smoke 14/11 (C-01): compactas — 32 dp visíveis, alvo ≥ 44 pelo hitSlop (DC-7).
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    marginLeft: 64,
  },
  actionsWide: {
    marginLeft: 114,
  },
  ctaFilled: {
    backgroundColor: colors.brand.primary,
    paddingHorizontal: 14,
    height: 32,
    justifyContent: 'center',
    borderRadius: 16,
  },
  ctaFilledText: {
    color: colors.text.inverse,
    fontSize: 13,
    fontWeight: '700',
    fontFamily: typography.fontFamily.bold || 'System',
  },
  ctaOutline: {
    borderWidth: 1.5,
    borderColor: colors.brand.primary,
    paddingHorizontal: 14,
    height: 32,
    justifyContent: 'center',
    borderRadius: 16,
  },
  ctaOutlineText: {
    color: colors.brand.primary,
    fontSize: 13,
    fontWeight: '700',
    fontFamily: typography.fontFamily.bold || 'System',
  },
  // Pular: botão de texto, peso menor que Tomar/Registrar (DC-4).
  ctaText: {
    paddingHorizontal: 12,
    height: 32,
    justifyContent: 'center',
  },
  ctaTextLabel: {
    color: colors.text.secondary,
    fontSize: 13,
    fontWeight: '600',
    fontFamily: typography.fontFamily.medium || 'System',
  },
  ctaBusy: {
    opacity: 0.5,
  },
})
