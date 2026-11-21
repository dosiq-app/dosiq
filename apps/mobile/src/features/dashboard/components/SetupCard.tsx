// SetupCard — superfície SETUP da Hoje (spec 125 fatia 2 · hi-fi D-1/D-2/D-3 · RC2 DS-1..DS-9).
//
// Um card por vez (o hook escolhe): "Tratamento cadastrado" (AC6.1/AC6.2), "Falta 1 passo" (AC6.3) e
// "Confira" (AC6.4 dose · AC6.4b unidade · AC6.4d concentração fora do registro). O card só mostra e
// pergunta: nada muda sem toque (INV-2) e o app não propõe dose (INV-3). Sem possessivo (regra da UI).

import { View, Text, Pressable, StyleSheet } from 'react-native'
// TODO(040-strict): named imports do lucide-react-native batem em TS2305 sob nodenext
import * as LucideIcons from 'lucide-react-native'
import { formatNumberPtBR } from '@dosiq/core'
import { boxText, treatmentDoseText, scheduleQuestion, formLabel, treatmentSetupLine, concentrationLabel } from '@dashboard/utils/setupCopy'
import type { SetupCardPick } from '@dosiq/core'
import { colors, spacing, borderRadius, typography } from '@shared/styles/tokens'



interface SetupCardProps {
  card: SetupCardPick
  protocol: any | null
  medicine: any | null
  scheduleConfirmed: boolean
  today: string
  nowTime: string
  onAdjust: () => void
  onDefine: () => void
  onConfirmSchedule: () => void
  onChangeSchedule: () => void
  onCheck: () => void
  onUseUnit: () => void
  onPickBox: () => void
  /** Foco da Hoje (emenda PO 20/11): só o foco tem botão cheio; fora dele, contorno. */
  emphasis?: boolean
}

export default function SetupCard(props: SetupCardProps) {
  const { card } = props
  if (card.kind === 'falta') return <MissingStepCard {...props} />
  if (card.kind === 'confira') return <CheckCard {...props} />
  return <RegisteredCard {...props} />
}

// Emenda PO 20/11: card leve (borda fina neutra); Confira mantém a cor de aviso na borda e no sobretítulo.
/** Botão principal do card: cheio só quando o card é o foco da Hoje. */
const { CircleAlert } = LucideIcons as any

const main = (emphasis?: boolean) => (emphasis ? 'primary' : 'outline')

function Shell({ tone, eyebrow, children, testID, emphasis }: { tone: 'primary' | 'warning'; eyebrow: string; children: any; testID: string; emphasis?: boolean }) {
  const accent = tone === 'warning' ? colors.status.warning : colors.brand.primary
  // Emenda PO smoke 125 (20/11): Confira no foco ganha o fundo âmbar claro — puxa o olho acima dos avisos de baixo.
  return (
    <View style={[styles.card, tone === 'warning' && { borderColor: accent }, tone === 'warning' && emphasis && { backgroundColor: colors.status.warningLight }]} testID={testID}>
      {/* PO 20/11: Confira ganha ícone no sobretítulo — a cor não fica sozinha sinalizando o aviso. */}
      <View style={styles.eyebrowRow}>
        {tone === 'warning' ? <CircleAlert size={14} color={accent} strokeWidth={2.5} /> : null}
        <Text style={[styles.eyebrow, { color: accent }]}>{eyebrow}</Text>
      </View>
      {children}
    </View>
  )
}

function Button({ label, onPress, kind = 'primary', testID }: { label: string; onPress: () => void; kind?: 'primary' | 'outline' | 'secondary'; testID: string }) {
  const primary = kind === 'primary'
  const outline = kind === 'outline'
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [styles.button, primary ? styles.buttonPrimary : outline ? styles.buttonOutline : styles.buttonSecondary, pressed && styles.pressed]}
    >
      <Text style={primary ? styles.buttonPrimaryText : outline ? styles.buttonOutlineText : styles.buttonSecondaryText}>{label}</Text>
    </Pressable>
  )
}

function RegisteredCard({ protocol, medicine, scheduleConfirmed, today, nowTime, onAdjust, onConfirmSchedule, onChangeSchedule, emphasis }: SetupCardProps) {
  // A frase da conferência sem o nome; a forma vai no selo (D-1).
  const { line, next } = treatmentSetupLine(protocol, medicine, today, nowTime)
  const daily = protocol?.frequency === 'diário' || protocol?.frequency === 'quando_necessário'
  const question = !daily && !scheduleConfirmed ? scheduleQuestion(protocol, next) : null
  return (
    <Shell tone="primary" eyebrow="Confira o tratamento" testID="setup-card-cadastrado">
      <View style={styles.titleRow}>
        <Text style={styles.title}>{medicine?.name ?? protocol?.name}</Text>
        <View style={styles.chip}><Text style={styles.chipText}>{formLabel(medicine?.presentation)}</Text></View>
      </View>
      {line ? <Text style={styles.line}>{line}</Text> : null}
      {question ? (
        <View style={styles.ask}>
          <Text style={styles.askText}>{question}</Text>
          <View style={styles.buttons}>
            <Button kind={main(emphasis)} label="Sim" onPress={onConfirmSchedule} testID="setup-schedule-yes" />
            <Button label="Mudar" kind="secondary" onPress={onChangeSchedule} testID="setup-schedule-change" />
          </View>
        </View>
      ) : (
        <>
          {next ? <Text style={styles.muted}>{next}</Text> : null}
          <Pressable onPress={onAdjust} accessibilityRole="button" style={styles.link} testID="setup-adjust">
            <Text style={styles.linkText}>Ajustar</Text>
          </Pressable>
        </>
      )}
    </Shell>
  )
}

function MissingStepCard({ medicine, onDefine, emphasis }: SetupCardProps) {
  return (
    <Shell tone="primary" eyebrow="Falta 1 passo" testID="setup-card-falta">
      {/* PO smoke 20/11: injetável se aplica; o resto se toma. */}
      <Text style={styles.title}>{`${medicine?.name ?? 'Remédio'}: quando ${medicine?.presentation === 'injetavel' ? 'aplicar' : 'tomar'}?`}</Text>
      <Text style={styles.muted}>O remédio está cadastrado. Falta definir quando e quanto você usa.</Text>
      <View style={styles.buttons}>
        <Button kind={main(emphasis)} label="Definir agora" onPress={onDefine} testID="setup-define" />
      </View>
    </Shell>
  )
}

function CheckCard({ card, protocol, medicine, onAdjust, onCheck, onUseUnit, onPickBox, emphasis }: SetupCardProps) {
  if (card.kind !== 'confira') return null
  const v = card.verdict
  const name = medicine?.name ?? protocol?.name ?? 'Remédio'
  // PO smoke 20/11: mesmo padrão do Confira a dose — objeto em negrito, o fato dito e a ação nomeada.
  if (v.reason === 'conc_fora') {
    return (
      <Shell tone="warning" eyebrow="Confira a caixa" testID="setup-card-conc" emphasis={emphasis}>
        <Text style={styles.title}>{name}</Text>
        <Text style={styles.line}>
          <Text style={styles.bold}>Cadastrado:</Text>{` ${concentrationLabel(medicine)}`}
        </Text>
        <Text style={styles.muted}>{`Essa concentração não está na lista da ANVISA para ${name}.`}</Text>
        <View style={styles.buttons}>
          <Button kind={main(emphasis)} label="Escolher pelo rótulo" onPress={onPickBox} testID="setup-pick-box" />
        </View>
      </Shell>
    )
  }
  if (v.reason === 'unidade') {
    const useLabel = `Usar ${formatNumberPtBR(Number(protocol?.dosage_per_intake))} ${v.box?.unit ?? 'mg'}`
    return (
      <Shell tone="warning" eyebrow="Confira a unidade" testID="setup-card-unidade" emphasis={emphasis}>
        <Text style={styles.title}>{name}</Text>
        <Text style={styles.line}>
          <Text style={styles.bold}>No tratamento:</Text>{` ${treatmentDoseText(protocol)} por aplicação`}
        </Text>
        {/* "Usar X mg" só troca a unidade e mantém o número — certo só se a receita diz isso (não é conversão). */}
        <Text style={styles.muted}>Injetável não se mede em gotas. Confira a receita.</Text>
        <View style={styles.buttons}>
          {v.fixAvailable ? <Button kind={main(emphasis)} label={useLabel} onPress={onUseUnit} testID="setup-use-unit" /> : null}
          <Button label="Ajustar tudo" kind={v.fixAvailable ? 'secondary' : main(emphasis)} onPress={onAdjust} testID="setup-adjust-all" />
        </View>
      </Shell>
    )
  }
  return (
    <Shell tone="warning" eyebrow="Confira a dose" testID="setup-card-confira" emphasis={emphasis}>
      <Text style={styles.title}>{name}</Text>
      <Text style={styles.line}>
        <Text style={styles.bold}>{v.multidose ? 'Doses da caneta:' : 'Na caixa:'}</Text>
        {v.multidose ? ` ${boxText(v.box)}` : ` ${boxText(v.box)} por aplicação`}
      </Text>
      <Text style={styles.line}>
        <Text style={styles.bold}>No tratamento:</Text>{` ${treatmentDoseText(protocol)} por aplicação`}
      </Text>
      <View style={styles.buttons}>
        <Button kind={main(emphasis)} label="Conferir" onPress={onCheck} testID="setup-check" />
      </View>
    </Shell>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: borderRadius.lg,
    padding: spacing[4],
    gap: spacing[2],
    // Mesmas margens da casca dos avisos (PromoCardShell): o card encostava na borda da tela (smoke 20/11).
    marginHorizontal: 20,
    marginBottom: spacing[4],
  },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bold: { fontWeight: '700' },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], flexWrap: 'wrap' },
  title: { fontSize: 18, fontWeight: '700', color: colors.text.primary, fontFamily: typography.fontFamily.bold },
  chip: {
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.xs,
    backgroundColor: colors.border.light,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.text.secondary },
  line: { fontSize: 15, lineHeight: 22, color: colors.text.primary },
  muted: { fontSize: 14, lineHeight: 20, color: colors.text.secondary },
  ask: { backgroundColor: colors.brand.mint, borderRadius: borderRadius.md, padding: spacing[3], gap: spacing[3], marginTop: spacing[1] },
  askText: { fontSize: 16, fontWeight: '700', color: colors.text.primary },
  buttons: { flexDirection: 'row', gap: spacing[2], marginTop: spacing[1] },
  button: { flex: 1, minHeight: 48, borderRadius: borderRadius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing[3] },
  buttonPrimary: { backgroundColor: colors.brand.primary },
  buttonSecondary: { backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.default },
  buttonOutline: { backgroundColor: colors.bg.card, borderWidth: 1.5, borderColor: colors.brand.primary },
  buttonPrimaryText: { fontSize: 15, fontWeight: '700', color: colors.text.inverse },
  buttonSecondaryText: { fontSize: 15, fontWeight: '600', color: colors.text.primary },
  buttonOutlineText: { fontSize: 15, fontWeight: '700', color: colors.brand.primary },
  pressed: { opacity: 0.85 },
  link: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  linkText: { fontSize: 15, fontWeight: '700', color: colors.brand.primary },
})
