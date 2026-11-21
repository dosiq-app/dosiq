// SetupScheduleSheet — "Quando é a aplicação?" (spec 125 fatia 2 · AC6.2 · hi-fi D-2 folha).
//
// Só embrulha peças existentes: `WeekdaySelector` (semanal) e `FormTimePicker` (horário do lembrete), as
// mesmas do onboarding e do form. Reagenda só com [Salvar] (INV-2, PO-125-13); demais cadências mudam só o
// horário (dia de início é do form — "Ajustar").

import { useState } from 'react'
import { View, Text, Modal, Pressable, StyleSheet, Platform, StatusBar } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import WeekdaySelector from '@treatments/components/WeekdaySelector'
import FormTimePicker from '@shared/components/form/FormTimePicker'
import { getRawNow } from '@dosiq/core'
import { replaceFirstTime } from '@dashboard/utils/setupCopy'
import SetupMedHeader from '@dashboard/components/SetupMedHeader'
import { colors, spacing, borderRadius, typography } from '@shared/styles/tokens'

export interface ScheduleChange {
  weekdays?: string[]
  time_schedule: string[]
}

interface SetupScheduleSheetProps {
  protocol: any
  busy: boolean
  onClose: () => void
  onSave: (change: ScheduleChange) => void
}

function toDate(hhmm: string | null | undefined): Date {
  // Só a hora do dia importa (o picker devolve HH:MM); a data base é irrelevante.
  const d = getRawNow()
  const [h, m] = String(hhmm ?? '08:00').split(':').map(Number)
  d.setHours(Number.isFinite(h) ? h : 8, Number.isFinite(m) ? m : 0, 0, 0)
  return d
}

function toHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}


export default function SetupScheduleSheet({ protocol, busy, onClose, onSave }: SetupScheduleSheetProps) {
  const weekly = protocol?.frequency === 'semanal'
  const firstTime = Array.isArray(protocol?.time_schedule) ? [...protocol.time_schedule].sort()[0] : null
  // States
  const [days, setDays] = useState<string[]>(Array.isArray(protocol?.weekdays) ? protocol.weekdays : [])
  const [time, setTime] = useState<Date>(() => toDate(firstTime))
  // Handlers
  const invalid = weekly && days.length === 0
  const save = () => {
    if (invalid) return
    const change: ScheduleChange = { time_schedule: replaceFirstTime(protocol?.time_schedule, toHHMM(time)) }
    if (weekly) change.weekdays = days
    onSave(change)
  }
  const noun = protocol?.medicine?.presentation === 'injetavel' ? 'a aplicação' : 'a dose'
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {Platform.OS === 'android' ? <View style={{ height: StatusBar.currentHeight ?? 0 }} /> : null}
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fechar" />
      <SafeAreaView edges={['bottom']} style={styles.sheet} testID="setup-schedule-sheet">
        <View style={styles.handle} />
        <SetupMedHeader protocol={protocol} medicine={protocol?.medicine} />
        <Text style={styles.title} accessibilityRole="header">{`Quando é ${noun}?`}</Text>
        {weekly ? <WeekdaySelector value={days} onChange={setDays} error={invalid ? 'Escolha pelo menos um dia.' : null} /> : null}
        <FormTimePicker name="time" label="Horário do lembrete" value={time} onChange={(_n, v) => setTime(v)} />
        <Pressable
          style={[styles.primary, (busy || invalid) && styles.disabled]}
          disabled={busy || invalid}
          onPress={save}
          accessibilityRole="button"
          testID="setup-schedule-save"
        >
          <Text style={styles.primaryText}>Salvar</Text>
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
    gap: spacing[4],
    backgroundColor: colors.bg.card,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[2],
    paddingBottom: spacing[6],
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.neutral[300], alignSelf: 'center', marginBottom: spacing[2] },
  title: { fontSize: 18, fontWeight: '700', color: colors.text.primary, fontFamily: typography.fontFamily.bold },
  primary: { minHeight: 52, borderRadius: borderRadius.lg, backgroundColor: colors.brand.primary, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 16, fontWeight: '700', color: colors.text.inverse },
  disabled: { opacity: 0.5 },
})
