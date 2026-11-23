// SetupCard — superfície SETUP da Hoje (spec 125 fatia 2 · hi-fi D-1/D-2/D-3 · RC2 DS-1..DS-9).
//
// Um card por vez (o hook escolhe): "Tratamento cadastrado" (AC6.1/AC6.2), "Falta 1 passo" (AC6.3) e
// "Confira" (AC6.4 dose · AC6.4b unidade · AC6.4d concentração fora do registro), e na 2a "Confira o
// remédio" (Vincular, AC8.1 — tom neutro, é suspeita) e "Confira a forma" (Corrigir forma, AC8.7 — aviso).
// O card só mostra e pergunta: nada muda sem toque (INV-2) e o app não propõe dose (INV-3). Sem
// possessivo (regra da UI). Os dois da 2a são os únicos setups com dispensa (TODAY_SURFACES §2.2).

import { useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
// TODO(040-strict): named imports do lucide-react-native batem em TS2305 sob nodenext
import * as LucideIcons from 'lucide-react-native'
import { formatNumberPtBR, normalizeText } from '@dosiq/core'
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
  /** Vincular: o item da lista que casa (o hook só manda o card com UM — C-2a-11). */
  linkMatches?: any[]
  onLink?: () => void
  onDismissLink?: () => void
  onFixForm?: () => void
  onKeepForm?: () => void
  /** Foco da Hoje (emenda PO 20/11): só o foco tem botão cheio; fora dele, contorno. */
  emphasis?: boolean
}

export default function SetupCard(props: SetupCardProps) {
  const { card } = props
  if (card.kind === 'falta') return <MissingStepCard {...props} />
  if (card.kind === 'confira') return <CheckCard {...props} />
  if (card.kind === 'vincular') return <LinkCard {...props} />
  if (card.kind === 'forma') return <FormCard {...props} />
  return <RegisteredCard {...props} />
}

// Emenda PO 20/11: card leve (borda fina neutra); Confira mantém a cor de aviso na borda e no sobretítulo.
/**
 * PO smoke 2a (22/11): concentração ao lado do nome, como no resto do app (widget, lista) — com vários
 * remédios de mesmo nome em titulação, só ela diz DE QUAL se trata. Sem concentração cadastrada, nada.
 */
function ConcentrationChip({ medicine }: { medicine: any }) {
  const label = concentrationLabel(medicine)
  if (!label) return null
  return <View style={styles.chip}><Text style={styles.chipText}>{label}</Text></View>
}

/** Botão principal do card: cheio só quando o card é o foco da Hoje. */
const { CircleAlert, ShieldCheck } = LucideIcons as any

const main = (emphasis?: boolean) => (emphasis ? 'primary' : 'outline')

function Shell({ tone, eyebrow, children, testID, emphasis }: { tone: 'primary' | 'warning' | 'link'; eyebrow: string; children: any; testID: string; emphasis?: boolean }) {
  const accent = tone === 'warning' ? colors.status.warning : colors.brand.primary
  // Emenda PO smoke 125 (20/11): Confira no foco ganha o fundo âmbar claro — puxa o olho acima dos avisos de baixo.
  // PO smoke 2a (22/11): Vincular é sugestão, não alerta — no foco pinta no tom da marca (mint + borda verde).
  const painted = tone === 'warning'
    ? [{ borderColor: accent }, emphasis && { backgroundColor: colors.status.warningLight }]
    : tone === 'link' && emphasis ? [{ borderColor: accent, backgroundColor: colors.brand.mint }] : []
  return (
    <View style={[styles.card, ...painted]} testID={testID}>
      {/* PO 20/11: Confira ganha ícone no sobretítulo — a cor não fica sozinha sinalizando o aviso. */}
      <View style={styles.eyebrowRow}>
        {tone !== 'primary' ? <CircleAlert size={14} color={accent} strokeWidth={2.5} /> : null}
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
        {/* Smoke 2a (PO 22/11): concentração primeiro, como nos outros cards; a forma depois. */}
        <ConcentrationChip medicine={medicine} />
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
        <View style={styles.titleRow}>
          <Text style={styles.title}>{name}</Text>
          <ConcentrationChip medicine={medicine} />
        </View>
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
      <View style={styles.titleRow}>
        <Text style={styles.title}>{name}</Text>
        <ConcentrationChip medicine={medicine} />
      </View>
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

// PO smoke 2a (22/11): fatos em tabela (rótulo | valor alinhados), sem fio nem painel — o agrupamento vem do
// alinhamento + espaçamento. A coluna do rótulo mede o MAIOR rótulo do card (onLayout), não uma largura fixa:
// 132 px sobrava em "Cadastrado:/Pelo nome:" e afastava demais as respostas.
function FactTable({ rows, children }: { rows: Array<[string, string]>; children?: any }) {
  const [widths, setWidths] = useState<Record<string, number>>({})
  // RC6 #973: mede só os rótulos ATUAIS — o mapa guarda os de cards anteriores (a fila troca o conteúdo sem remontar).
  const measured = rows.map(([label]) => widths[label]).filter((w): w is number => w !== undefined)
  const labelWidth = rows.length > 0 && measured.length === rows.length ? Math.ceil(Math.max(...measured)) : undefined
  return (
    <View style={styles.facts}>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.factRow}>
          <Text
            style={[styles.line, styles.bold, labelWidth ? { width: labelWidth } : null]}
            onLayout={widths[label] !== undefined ? undefined : (e) => {
              const w = e.nativeEvent.layout.width
              setWidths((prev) => (prev[label] === w ? prev : { ...prev, [label]: w }))
            }}
          >
            {label}
          </Text>
          <Text style={[styles.line, styles.factValue]}>{value}</Text>
        </View>
      ))}
      {children}
    </View>
  )
}

// PO 22/11 (Lipoless → Lipless, um fibrato): a pergunta vem com a FICHA do proposto — princípio ativo, para que
// serve (classe) e forma —, na gramática rótulo·valor dos outros Confira, para o "Sim" não passar batido.
function LinkCard({ medicine, linkMatches = [], onLink, onDismissLink, emphasis }: SetupCardProps) {
  const item = linkMatches[0] ?? null
  const saved = medicine?.name ?? 'Remédio'
  const sameName = !!item?.name && normalizeText(item.name).trim() === normalizeText(saved).trim()
  const forms = Array.isArray(item?.forms) ? item.forms.map((f: string) => formLabel(f)).filter(Boolean).join(', ') : ''
  const facts: Array<[string, string]> = [
    ['Princípio ativo:', item?.activeIngredient ?? ''],
    ['Para que serve:', item?.therapeuticClass ?? ''],
    ['Forma:', forms],
  ].filter(([, value]) => !!value) as Array<[string, string]>
  return (
    <Shell tone="link" eyebrow="Confira o remédio" testID="setup-card-vincular" emphasis={emphasis}>
      {/* PO smoke 2a: aspas só no nome cadastrado (texto livre) — o proposto é o título da ficha abaixo. */}
      {/* C-2a-16: com código e nome igual ao da lista ("“Tresiba” é o Tresiba?" soava estranho) ⇒ título afirmativo. */}
      {sameName ? (
        <View style={styles.head}>
          <Text style={styles.title} accessibilityRole="header">{`${item.name} na lista oficial`}</Text>
          <Text style={styles.muted}>Confira e vincule para corrigir a forma.</Text>
        </View>
      ) : (
        // Sem chip aqui: depois de "é o Mounjaro?" ele pareceria a concentração do PROPOSTO.
        // PO smoke 2a ("Dona Maria"): subtítulo aponta a ficha e pede a conferência (o selo ANVISA já diz a origem).
        <View style={styles.head}>
          <Text style={styles.title} accessibilityRole="header">{`“${saved}” é o ${item?.name ?? 'remédio da lista'}?`}</Text>
          <Text style={styles.muted}>Confira se os detalhes abaixo são do remédio que você usa:</Text>
        </View>
      )}
      {/* PO smoke 2a: a ficha do proposto num painel — os fatos agrupados, separados da pergunta e da decisão. */}
      <FactTable rows={facts}>
        <View style={styles.seal}>
          <ShieldCheck size={14} color={colors.primary[700]} strokeWidth={2.5} />
          <Text style={styles.sealText}>Base oficial da ANVISA</Text>
        </View>
      </FactTable>
      <View style={[styles.buttons, styles.decide]}>
        <Button kind={main(emphasis)} label="Sim, é esse" onPress={() => onLink?.()} testID="setup-link" />
        <Button kind="secondary" label="Não é" onPress={() => onDismissLink?.()} testID="setup-link-dismiss" />
      </View>
    </Shell>
  )
}

function FormCard({ card, medicine, onFixForm, onKeepForm, emphasis }: SetupCardProps) {
  if (card.kind !== 'forma') return null
  const name = medicine?.name ?? 'Remédio'
  const { proposed, reason } = card.mismatch
  // PO smoke 2a (22/11): o valor proposto é a decisão — linha simétrica ao "Cadastrado", valor em negrito,
  // e o botão leva o valor ("Mudar para líquido"). A frase corrida em cinza era o que menos aparecia.
  const source = reason === 'name' ? 'Pelo nome:' : 'Na lista oficial:'
  const target = proposed ? formLabel(proposed) : ''
  const saved = formLabel(medicine?.presentation)
  return (
    <Shell tone="warning" eyebrow="Confira a forma" testID="setup-card-forma" emphasis={emphasis}>
      {/* PO smoke 2a (22/11): 3 grupos por proximidade — o que é (título + pergunta) · os fatos (painel) · a decisão. */}
      <View style={styles.head}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{name}</Text>
          <ConcentrationChip medicine={medicine} />
        </View>
        <Text style={styles.muted}>{`A forma cadastrada não bate com ${reason === 'name' ? 'o nome' : 'a lista oficial'}. Qual é a certa?`}</Text>
      </View>
      {target ? (
        <FactTable rows={[['Cadastrado:', saved || 'sem forma'], [source, target]]} />
      ) : (
        <FactTable rows={[['Cadastrado:', saved || 'sem forma']]}>
          <Text style={styles.muted}>{`Na lista oficial, ${name} vem em outra forma.`}</Text>
        </FactTable>
      )}
      <View style={[styles.buttons, styles.decide]}>
        <Button kind={main(emphasis)} label={target ? `É ${target}` : 'Corrigir forma'} onPress={() => onFixForm?.()} testID="setup-fix-form" />
        <Button kind="secondary" label={target && saved ? `É ${saved}` : 'Está certo'} onPress={() => onKeepForm?.()} testID="setup-keep-form" />
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
  // Agrupamento por proximidade (smoke 2a): perto dentro do grupo, longe entre grupos.
  head: { gap: spacing[1] },
  facts: { gap: spacing[1], marginTop: spacing[1] },
  factRow: { flexDirection: 'row', gap: spacing[2] },
  factValue: { flex: 1 },
  decide: { marginTop: spacing[2] },
  seal: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  sealText: { fontSize: 13, fontWeight: '700', color: colors.primary[700] },
  link: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  linkText: { fontSize: 15, fontWeight: '700', color: colors.brand.primary },
})
