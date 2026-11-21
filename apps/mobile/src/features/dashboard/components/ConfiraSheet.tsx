// ConfiraSheet — "O que precisa ajustar?" (spec 125 fatia 2 · AC6.4 · RC2 DS-1/DS-3/DS-5/DS-7/DS-8/DS-9 · copy PO 20/11).
//
// Uma folha só, em passos (sem folha sobre folha no iOS):
//   ask   → 3 linhas iguais, nenhuma primária, na ordem do erro provável (`probableSide`) + rodapé
//           "Editar o tratamento";
//   box   → "A caixa"/"Escolher a caixa" (Q-1, PO 19/11): concentrações do MESMO registro no
//           sidecar; só [Confirmar] grava no remédio;
//   dose  → "A dose" (receita = rótulo): frase de conferência da 1a antes de gravar a dose.
// O app não propõe dose (INV-3): a única dose oferecida é a da caixa de dose única, com origem dita.

import { useState } from 'react'
import { View, Text, Modal, Pressable, StyleSheet, Platform, StatusBar, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { describeTreatment, formatDose } from '@dosiq/core'
import type { StrengthEntry } from '@dosiq/core'
import SetupMedHeader from '@dashboard/components/SetupMedHeader'
import { boxText, treatmentDoseText, labelText, isCurrentBox, concentrationLabel } from '@dashboard/utils/setupCopy'
import { colors, spacing, borderRadius, typography } from '@shared/styles/tokens'

type Step = 'ask' | 'box' | 'dose'

interface ConfiraSheetProps {
  open: boolean
  /** `conc_fora` abre direto no passo da caixa (AC6.4d). */
  initialStep?: Step
  protocol: any
  medicine: any
  verdict: any
  entries: StrengthEntry[]
  /** Outros tratamentos ativos do mesmo remédio (a troca da caixa vale para eles também). */
  otherTreatments: number
  today: string
  busy: boolean
  onClose: () => void
  onKeep: () => void
  onApplyDose: () => void
  onPickBox: (entry: StrengthEntry) => void
  onEditTreatment: () => void
}




export default function ConfiraSheet(props: ConfiraSheetProps) {
  const { open, initialStep = 'ask', onClose } = props
  // States
  const [step, setStep] = useState<Step>(initialStep)
  // Uma opção só ⇒ já marcada (smoke 20/11); a gravação continua exigindo [Confirmar] (INV-2).
  const [choice, setPicked] = useState<number | null>(null)
  // RC6 #971: derivado a cada render (não no inicializador) — lista que muda com a folha aberta não deixa
  // seleção velha nem perde o "uma opção só ⇒ já marcada". A gravação segue exigindo o botão (INV-2).
  const validCount = props.entries.filter((e) => typeof e.d === 'number' && (e.d as number) > 0).length
  const picked = choice !== null && choice < validCount ? choice : validCount === 1 ? 0 : null
  if (!open) return null
  const close = () => {
    setStep(initialStep)
    onClose()
  }
  return (
    <Modal visible transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      {Platform.OS === 'android' ? <View style={{ height: StatusBar.currentHeight ?? 0 }} /> : null}
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Fechar" />
      <SafeAreaView edges={['bottom']} style={styles.sheet} testID="confira-sheet">
        <View style={styles.handle} />
        {step === 'ask' ? <AskStep {...props} onStep={setStep} /> : null}
        {step === 'box' ? <BoxStep {...props} picked={picked} onPick={setPicked} onBack={initialStep === 'box' ? close : () => setStep('ask')} /> : null}
        {step === 'dose' ? <DoseStep {...props} onBack={() => setStep('ask')} /> : null}
      </SafeAreaView>
    </Modal>
  )
}

function Row({ title, sub, onPress, testID }: { title: string; sub: string; onPress: () => void; testID: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${sub}`}
      testID={testID}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Text style={styles.rowTitle}>{title}</Text>
      <Text style={styles.rowSub}>{sub}</Text>
    </Pressable>
  )
}

// PO smoke 20/11: a folha "mastiga" a decisão — remédio no topo, o problema como fato lado a lado (mesma
// unidade dos dois lados) e a pergunta ancorada nos dois documentos que o paciente tem: receita e rótulo.
function AskStep({ protocol, medicine, verdict, entries, onKeep, onEditTreatment, onStep }: ConfiraSheetProps & { onStep: (s: Step) => void }) {
  const box = verdict?.box
  const single = box?.dose !== null && box?.dose !== undefined
  const treat = treatmentDoseText(protocol)
  const caixa = <Row key="box" title="A caixa" sub={"Escolher pelo rótulo da caixa.\nAjusta o cadastro do remédio."} onPress={() => onStep('box')} testID="confira-row-box" />
  const dose = single
    ? <Row key="dose" title="A dose" sub={`A receita diz ${boxText(box)}, a dose do rótulo.\nAjusta o tratamento.`} onPress={() => onStep('dose')} testID="confira-row-dose" />
    : <Row key="dose" title="A dose" sub={"A receita diz outra dose.\nAbre o tratamento para corrigir."} onPress={onEditTreatment} testID="confira-row-dose" />
  const keep = <Row key="keep" title="Nada, está certo" sub={`A receita diz ${treat} mesmo.`} onPress={onKeep} testID="confira-row-keep" />
  // Smoke 20/11 (P6): "A caixa" só quando a lista tem OUTRA caixa além da cadastrada — registro com uma
  // concentração só (ou lista indisponível) levava a uma escolha sem escolha. Aí a dúvida é só a dose.
  const hasOtherBox = (entries ?? []).some((e) => typeof e.d === 'number' && (e.d as number) > 0 && !isCurrentBox(e, medicine))
  // DS-3: caixa maior que a dose ⇒ a caixa é o erro provável; menor ⇒ pode ser microdose intencional.
  // Multidose (smoke 20/11, P6): a caneta só marca as doses do mostrador — dose fora dele é o erro provável
  // (`probableSide: 'dose'` no core) ⇒ "A dose" primeiro. Antes caía na ordem da dose única ("Nada" 1º).
  let ordered = [keep, caixa, dose]
  if (verdict?.probableSide === 'caixa') ordered = [caixa, dose, keep]
  else if (verdict?.multidose) ordered = [dose, caixa, keep]
  const rows = hasOtherBox ? ordered : ordered.filter((r) => r !== caixa)
  return (
    <>
      <SetupMedHeader protocol={protocol} medicine={medicine} />
      <Text style={styles.body}>A dose do tratamento não bate com a caixa.</Text>
      <View style={styles.compare}>
        <View style={styles.side} testID="confira-side-box">
          <Text style={styles.sideLabel}>NA CAIXA</Text>
          <Text style={styles.sideValue}>{single ? `${boxText(box)} por aplicação` : `${boxText(box)}`}</Text>
          <Text style={styles.sideNote}>{single ? `${formatDose(box.volumeMl, 'ml')}, dose única` : 'doses da caneta'}</Text>
        </View>
        <View style={styles.side} testID="confira-side-treatment">
          <Text style={styles.sideLabel}>NO TRATAMENTO</Text>
          <Text style={styles.sideValue}>{`${treat} por aplicação`}</Text>
        </View>
      </View>
      <View style={styles.ask}>
        <Text style={styles.title} accessibilityRole="header">O que precisa ajustar?</Text>
        <Text style={styles.body}>Confira a receita e o rótulo da caixa.</Text>
      </View>
      <View style={styles.rows}>{rows}</View>
      {/* Dose única: a receita pode dizer um 3º valor e "A dose" só oferece a do rótulo (INV-3) ⇒ o link cobre.
          Multidose: "A dose" já abre o tratamento — o link repetia a opção (PO smoke 20/11). */}
      {single ? (
        <Pressable style={styles.link} onPress={onEditTreatment} accessibilityRole="button" testID="confira-edit">
          <Text style={styles.linkText}>A receita diz outra dose? <Text style={styles.linkAction}>Editar o tratamento</Text></Text>
        </Pressable>
      ) : (
        // Sem o link a última opção encostava na barra do sistema (smoke 20/11): respiro no lugar dele.
        <View style={styles.endSpacer} />
      )}
    </>
  )
}

function BackLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={styles.link} onPress={onPress} accessibilityRole="button" testID="confira-back">
      <Text style={[styles.linkText, styles.linkAction]}>Voltar</Text>
    </Pressable>
  )
}

// Passo da caixa (PO smoke 20/11): opção escrita como no rótulo, o cadastro atual marcado, a consequência
// antes do botão e o botão dizendo o que faz.
function BoxStep({ protocol, verdict, entries, medicine, otherTreatments, busy, picked, onPick, onPickBox, onBack }: ConfiraSheetProps & { picked: number | null; onPick: (i: number) => void; onBack: () => void }) {
  const options = entries.filter((e) => typeof e.d === 'number' && (e.d as number) > 0)
  const chosen = picked !== null ? options[picked] : null
  return (
    <>
      <SetupMedHeader protocol={protocol} medicine={medicine} />
      <View style={styles.ask}>
        <Text style={styles.title} accessibilityRole="header">Qual está escrito no rótulo?</Text>
        <Text style={styles.body}>{`Caixas de ${medicine?.name ?? 'este remédio'} na lista da ANVISA.`}</Text>
      </View>
      {/* Concentração fora da lista: a opção atual não aparece para receber o selo — o fato vai escrito. */}
      {verdict?.reason === 'conc_fora' ? (
        <Text style={styles.body} testID="confira-box-current">
          <Text style={styles.bold}>Cadastrado:</Text>{` ${concentrationLabel(medicine)} — não está na lista.`}
        </Text>
      ) : null}
      <ScrollView style={styles.options} contentContainerStyle={styles.rows}>
        {options.map((e, i) => {
          const current = isCurrentBox(e, medicine)
          return (
            <Pressable
              key={`${e.d}-${e.u}-${i}`}
              onPress={() => onPick(i)}
              accessibilityRole="radio"
              accessibilityState={{ selected: picked === i }}
              accessibilityLabel={current ? `${labelText(e)}, cadastrado` : labelText(e)}
              testID={`confira-box-${i}`}
              style={[styles.row, styles.optionRow, picked === i && styles.rowSelected]}
            >
              <Text style={styles.rowTitle}>{labelText(e)}</Text>
              {current ? <Text style={styles.tag}>cadastrado</Text> : null}
            </Pressable>
          )
        })}
      </ScrollView>
      <View style={styles.ask}>
        <Text style={styles.body}>Ajusta o cadastro do remédio.</Text>
        {otherTreatments > 0 ? <Text style={styles.warning}>Vale para todos os tratamentos deste remédio.</Text> : null}
      </View>
      <Pressable
        style={[styles.primary, (!chosen || busy) && styles.disabled]}
        disabled={!chosen || busy}
        onPress={() => chosen && onPickBox(chosen)}
        accessibilityRole="button"
        testID="confira-box-confirm"
      >
        <Text style={styles.primaryText}>{chosen ? `Usar ${labelText(chosen)}` : 'Usar'}</Text>
      </Pressable>
      <BackLink onPress={onBack} />
    </>
  )
}

// Passo da dose (PO smoke 20/11): antes → depois, a agenda embaixo (só a dose muda) e o botão dizendo o que faz.
function DoseStep({ protocol, medicine, verdict, today, busy, onApplyDose, onBack }: ConfiraSheetProps & { onBack: () => void }) {
  const box = verdict?.box
  const desc = describeTreatment({
    medicineName: null,
    presentation: medicine?.presentation,
    dose: box?.dose,
    intakeUnit: box?.unit,
    frequency: protocol?.frequency,
    weekdays: protocol?.weekdays,
    timeSchedule: protocol?.time_schedule,
    intervalDays: protocol?.interval_days,
    startDate: protocol?.start_date,
    today,
  })
  return (
    <>
      <SetupMedHeader protocol={protocol} medicine={medicine} />
      <Text style={styles.title} accessibilityRole="header">A dose do tratamento passa a ser:</Text>
      <View style={styles.side} testID="confira-sentence">
        <Text style={styles.sideValue}>{`${treatmentDoseText(protocol)}  →  ${boxText(box)} por aplicação`}</Text>
        {desc.frequency ? <Text style={styles.sideNote}>{desc.frequency}</Text> : null}
      </View>
      <Text style={styles.body}>{`A dose única inteira (${formatDose(box?.volumeMl, 'ml')}) em cada aplicação.`}</Text>
      <Pressable style={[styles.primary, busy && styles.disabled]} disabled={busy} onPress={onApplyDose} accessibilityRole="button" testID="confira-dose-confirm">
        <Text style={styles.primaryText}>{`Usar ${boxText(box)}`}</Text>
      </Pressable>
      <BackLink onPress={onBack} />
    </>
  )
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.bg.overlay },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '90%',
    gap: spacing[3],
    backgroundColor: colors.bg.card,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[2],
    paddingBottom: spacing[2], // PO smoke 20/11: o link de 48 + a área segura já dão o respiro
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.neutral[300], alignSelf: 'center', marginBottom: spacing[2] },
  title: { fontSize: 18, fontWeight: '700', color: colors.text.primary, fontFamily: typography.fontFamily.bold },
  body: { fontSize: 15, lineHeight: 22, color: colors.text.secondary },
  warning: { fontSize: 14, lineHeight: 20, color: colors.status.warning },
  rows: { gap: spacing[2] },
  endSpacer: { height: spacing[4] },
  linkAction: { color: colors.brand.primary, fontWeight: '700' },
  ask: { gap: 2, marginTop: spacing[1] },
  compare: { flexDirection: 'row', gap: spacing[2] },
  side: { flex: 1, borderWidth: 1, borderColor: colors.border.default, borderRadius: borderRadius.md, padding: spacing[3], gap: 2 },
  sideLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4, color: colors.text.muted },
  sideValue: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: colors.text.primary },
  sideNote: { fontSize: 13, lineHeight: 18, color: colors.text.secondary },
  options: { maxHeight: 320 },
  row: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    justifyContent: 'center',
    backgroundColor: colors.bg.card,
  },
  bold: { fontWeight: '700', color: colors.text.primary },
  optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tag: { fontSize: 12, fontWeight: '600', color: colors.text.secondary },
  rowSelected: { borderColor: colors.brand.primary, borderWidth: 2 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: colors.text.primary },
  rowSub: { fontSize: 14, lineHeight: 20, color: colors.text.secondary, marginTop: 2 },
  pressed: { opacity: 0.85 },
  primary: { minHeight: 52, borderRadius: borderRadius.lg, backgroundColor: colors.brand.primary, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 16, fontWeight: '700', color: colors.text.inverse },
  disabled: { opacity: 0.5 },
  link: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  linkText: { fontSize: 15, fontWeight: '600', color: colors.text.primary },
})
