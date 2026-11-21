// TodaySetupSlot — superfície SETUP (spec 125 fatia 2 · FR-023 · ADR-129 emenda · TODAY_SURFACES §2).
//
// Recebe o estado de `useTodaySetup` (chamado na tela, que também esconde a Adesão — AC6.7) e liga o card
// às gravações. Toda gravação é um toque explícito (INV-2) e recarrega a Hoje: a regra julga de novo
// (AC6.4a) e o próximo card da fila entra na hora (AC6.6). Grava pelas MESMAS mutações dos forms
// (`useProtocolMutation`/`useMedicineMutation`): invalidam caches e reagendam alarmes (FR-006) — o
// serviço cru pularia isso (RC5). Erro ⇒ toast da mutação e o card fica.

import { useCallback, useRef, useState } from 'react'
import type { StrengthEntry } from '@dosiq/core'
import SetupCard from '@dashboard/components/SetupCard'
import ConfiraSheet from '@dashboard/components/ConfiraSheet'
import SetupScheduleSheet, { type ScheduleChange } from '@dashboard/components/SetupScheduleSheet'
import type { TodaySetupState } from '@dashboard/hooks/useTodaySetup'
import { useProtocolMutation } from '@treatments/hooks/useProtocolMutation'
import { useMedicineMutation } from '@medications/hooks/useMedicineMutation'
import { openTreatmentEdit, openTreatmentCreate } from '@dashboard/utils/setupCopy'



interface TodaySetupSlotProps {
  setup: TodaySetupState
  /** Tratamentos ativos (em uso + agendados) — conta os outros do mesmo remédio. */
  protocols: any[]
  today: string
  nowTime: string
  refresh: () => void
  /** Foco da Hoje (composição): botão cheio só aqui. */
  emphasis?: boolean
}

export default function TodaySetupSlot({ setup, protocols, today, nowTime, refresh, emphasis = false }: TodaySetupSlotProps) {
  // States
  const [sheet, setSheet] = useState<null | 'confira' | 'box' | 'schedule'>(null)
  const [busy, setBusy] = useState(false)
  // RC6 #971: trava síncrona — `busy` (estado) só chega no próximo render e o "Usar 2,5 mg" do card não o lê.
  const inFlight = useRef(false)
  const protocolMutation = useProtocolMutation()
  const medicineMutation = useMedicineMutation()
  const { card, protocol, medicine } = setup

  // Handlers
  // `undefined` = a mutação falhou (já mostrou o toast): a folha e o card ficam.
  const run = useCallback(async (work: () => Promise<unknown>) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try {
      const result = await work()
      if (result === undefined) return
      setSheet(null)
      refresh()
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }, [refresh])

  if (!card) return null
  const verdict = card.kind === 'confira' ? card.verdict : null
  const otherTreatments = medicine?.id
    ? protocols.filter((p) => p?.medicine_id === medicine.id && p.id !== protocol?.id).length
    : 0

  const applyBoxDose = () => run(() => protocolMutation.update(
    protocol.id,
    { dosage_per_intake: verdict?.box?.dose, intake_unit: verdict?.box?.unit },
    { previous: protocol },
  ))
  // AC6.4b: troca SÓ a unidade (o número fica) — oferecido só quando o resultado é coerente.
  const useUnit = () => run(() => protocolMutation.update(protocol.id, { intake_unit: verdict?.box?.unit }, { previous: protocol }))
  // Q-1: a caixa do mesmo registro, escolhida na folha. Volume = o do rótulo curado quando há.
  const pickBox = (entry: StrengthEntry) => run(() => medicineMutation.update(medicine.id, {
    dosage_per_pill: entry.d,
    dosage_unit: entry.u,
    // RC6 #971: a entrada do registro é a fonte — sem volume (multidose) limpa o da caixa anterior.
    concentration_volume_ml: entry.lv ?? null,
  }))
  const saveSchedule = (change: ScheduleChange) => run(async () => {
    const row = await protocolMutation.update(protocol.id, change, { previous: protocol })
    if (row !== undefined) await setup.confirmSchedule(change)
    return row
  })
  const keep = () => run(async () => {
    await setup.confirmCoherence()
    return true
  })

  return (
    <>
      <SetupCard
        card={card}
        protocol={protocol}
        medicine={medicine}
        scheduleConfirmed={setup.scheduleConfirmed}
        emphasis={emphasis}
        today={today}
        nowTime={nowTime}
        onAdjust={() => protocol && openTreatmentEdit(protocol.id)}
        onDefine={() => medicine && openTreatmentCreate(medicine.id)}
        onConfirmSchedule={() => { void setup.confirmSchedule() }}
        onChangeSchedule={() => setSheet('schedule')}
        onCheck={() => setSheet('confira')}
        onUseUnit={useUnit}
        onPickBox={() => setSheet('box')}
      />
      {sheet === 'confira' || sheet === 'box' ? (
        <ConfiraSheet
          // RC6 #971 (R-273/AP-222): outra entidade ⇒ folha nova, sem passo/seleção da anterior.
          key={`${sheet}:${protocol?.id ?? medicine?.id}`}
          open
          initialStep={sheet === 'box' ? 'box' : 'ask'}
          protocol={protocol}
          medicine={medicine}
          verdict={verdict}
          entries={setup.entries}
          otherTreatments={otherTreatments}
          today={today}
          busy={busy}
          onClose={() => setSheet(null)}
          onKeep={keep}
          onApplyDose={applyBoxDose}
          onPickBox={pickBox}
          onEditTreatment={() => {
            setSheet(null)
            if (protocol) openTreatmentEdit(protocol.id)
          }}
        />
      ) : null}
      {sheet === 'schedule' && protocol ? (
        <SetupScheduleSheet key={protocol.id} protocol={protocol} busy={busy} onClose={() => setSheet(null)} onSave={saveSchedule} />
      ) : null}
    </>
  )
}
