import { useState } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native'
// TODO(040-strict): named imports do lucide-react-native batem em TS2305 (ver TreatmentsScreen.tsx)
import * as LucideIcons from 'lucide-react-native'
import { formatStrength, PRESENTATION_LABELS, type PickerConcentration } from '@dosiq/core'
import { selectionTap } from '@shared/utils/haptics'
import type { LinkConfirmView } from '@medications/hooks/useMedicineSearchFlow'
import { colors, spacing, borderRadius } from '@shared/styles/tokens'

const { ChevronLeft } = LucideIcons as any

// Passo 2 da busca 2C (spec 066 Slice C · DESIGN_DECISOES C5.2, revisto pelo PO no smoke 2026-10-13).
// Pergunta só a concentração (+ forma): a quantidade não muda o cadastro e volta no estoque (D2).
// Marca com 2+ fabricantes na concentração abre um 2º nível de laboratório (o registro muda).
// "‹" volta um nível (laboratório → concentração → busca); "Minha embalagem não está aqui" sempre
// disponível (INV-3).
// 125 2a (AC8.2 · RC2 R5-1 · RC3 E-R5-1): no vínculo (`confirmFor`), tocar numa caixa que muda o remédio
// só a SELECIONA e mostra, embaixo dela, o que muda (Nome/Forma/Dosagem) e o estoque; quem grava é o
// [Usar …]. Voltar não grava nada. Sem `confirmFor` (ou caixa que nada muda), o toque escolhe direto.

interface CmedPresentationStepProps {
  title: string
  options: PickerConcentration[]
  preparing?: boolean
  onPick: (rowIdx: number) => void
  onSkip: () => void
  onBack: () => void
  confirmFor?: ((rowIdx: number) => LinkConfirmView | null) | null
}

// Spec 113 (FR-004): com volume do rótulo (`lv`), a leitura da caixa ("2,5 mg / 0,5 mL").
export function concentrationLabel(
  option: Pick<PickerConcentration, 'strength' | 'dose' | 'unit'> & { volumeMl?: number | null },
): string {
  return formatStrength(option.strength, option.dose, option.unit, option.volumeMl ?? null) ?? 'Concentração não informada'
}

export function formLabel(form: string | null): string | null {
  if (!form) return null
  return (PRESENTATION_LABELS as Record<string, string>)[form]?.toLowerCase() ?? null
}

/** "Rótulo: valor" ⇒ linha de tabela (rótulo em negrito, coluna medida pelo maior rótulo). */
function ChangeTable({ lines }: { lines: string[] }) {
  const rows = lines.map((line) => {
    const at = line.indexOf(': ')
    return at < 0 ? ['', line] : [line.slice(0, at), line.slice(at + 2)]
  })
  const [widths, setWidths] = useState<Record<string, number>>({})
  const labelWidth = Object.keys(widths).length === rows.length ? Math.ceil(Math.max(...Object.values(widths))) : undefined
  return (
    <View style={styles.changeTable}>
      {rows.map(([label, value]) => (
        <View key={label + value} style={styles.changeRow}>
          <Text
            style={[styles.confirmLine, styles.changeLabel, labelWidth ? { width: labelWidth } : null]}
            onLayout={labelWidth ? undefined : (e) => {
              const w = e.nativeEvent.layout.width
              setWidths((prev) => (prev[label] === w ? prev : { ...prev, [label]: w }))
            }}
          >
            {label}
          </Text>
          <Text style={[styles.confirmLine, styles.changeValue]}>{value}</Text>
        </View>
      ))}
    </View>
  )
}

export function CmedPresentationStep({
  title,
  options,
  preparing = false,
  onPick,
  onSkip,
  onBack,
  confirmFor = null,
}: CmedPresentationStepProps) {
  // States
  // Concentração única com 2+ fabricantes já abre no nível do laboratório.
  const [selected, setSelected] = useState<PickerConcentration | null>(() =>
    options.length === 1 && options[0].laboratories.length >= 2 ? options[0] : null,
  )
  // Caixa selecionada à espera do [Usar …] (só no vínculo).
  // PO smoke 2a (22/11, Ozivy): caixa ÚNICA (um fabricante) já abre selecionada — a conferência e o [Usar …]
  // aparecem direto; escolher a única opção era um toque sem decisão. Nada grava sem o [Usar …].
  const [pending, setPending] = useState<{ rowIdx: number; view: LinkConfirmView } | null>(() => {
    if (!confirmFor || options.length !== 1 || options[0].laboratories.length >= 2) return null
    const view = confirmFor(options[0].rowIdx)
    return view ? { rowIdx: options[0].rowIdx, view } : null
  })
  const onLabLevel = !!selected && selected.laboratories.length >= 2
  // Caixa única já selecionada: nada a escolher — o passo vira "Confira a embalagem" (PO smoke 2a).
  const single = !!pending && !!confirmFor && options.length === 1 && options[0].laboratories.length < 2

  // Handlers
  function handleBack() {
    if (pending) setPending(null)
    else if (onLabLevel && options.length > 1) setSelected(null)
    else onBack()
  }

  function choose(rowIdx: number) {
    const view = confirmFor?.(rowIdx) ?? null
    if (view) setPending({ rowIdx, view })
    else onPick(rowIdx)
  }

  function handleConcentration(option: PickerConcentration) {
    selectionTap()
    // RC6 #973: descer ao laboratório limpa a conferência pendente (senão o 1º "‹" só a apagava, invisível).
    if (option.laboratories.length >= 2) {
      setPending(null)
      setSelected(option)
    } else choose(option.rowIdx)
  }

  function handleLab(rowIdx: number) {
    selectionTap()
    choose(rowIdx)
  }

  function renderConfirm(rowIdx: number, label: string) {
    if (pending?.rowIdx !== rowIdx) return null
    const useLabel = single ? 'Usar esta embalagem' : `Usar ${label}`
    const button = (
      <Pressable
        style={({ pressed }) => [styles.confirmButton, single && styles.confirmButtonSingle, pressed && styles.rowPressed]}
        onPress={() => onPick(rowIdx)}
        accessibilityRole="button"
        accessibilityLabel={useLabel}
        testID="link-confirm-use"
      >
        <Text style={styles.confirmButtonText}>{useLabel}</Text>
      </Pressable>
    )
    // Smoke 2a (PO 22/11): na caixa única o título vira eyebrow fora da caixa e o CTA sai dela
    // (ação da tela, par com "Manter como está"); com várias, segue embutido na linha escolhida.
    return (
      <>
        {single ? <Text style={[styles.confirmTitle, styles.eyebrow]}>O que muda no remédio</Text> : null}
        <View style={[styles.confirm, single ? styles.confirmSingle : styles.confirmAttached]} testID="link-confirm">
          {single ? null : <Text style={styles.confirmTitle}>O que muda no remédio</Text>}
          {/* Smoke 2a (PO 22/11): tabela rótulo | valor alinhada, como nos cards de setup. */}
          <ChangeTable lines={pending.view.lines} />
          {pending.view.stockLine ? <Text style={styles.confirmStock}>{pending.view.stockLine}</Text> : null}
          {single ? null : button}
        </View>
        {single ? button : null}
      </>
    )
  }

  function renderBody() {
    if (preparing) {
      return (
        <View style={styles.preparing} accessibilityRole="progressbar" accessibilityLabel="Buscando as embalagens">
          <ActivityIndicator color={colors.primary[500]} />
          <Text style={styles.preparingText}>Buscando na lista completa de embalagens da ANVISA...</Text>
        </View>
      )
    }
    if (onLabLevel && selected) {
      const form = formLabel(selected.form)
      return (
        <>
          <Text style={styles.subheading}>{concentrationLabel(selected)}{form ? ` · ${form}` : ''}</Text>
          <Text style={styles.body}>Qual laboratório está escrito na sua embalagem?</Text>
          {selected.laboratories.map((lab) => (
            <View key={`l-${lab.rowIdx}`}>
              <Pressable
                style={({ pressed }) => [styles.row, (pressed || pending?.rowIdx === lab.rowIdx) && styles.rowPressed, pending?.rowIdx === lab.rowIdx && styles.rowAttached]}
                onPress={() => handleLab(lab.rowIdx)}
                accessibilityRole="button"
                accessibilityLabel={lab.laboratory ?? 'Laboratório não informado'}
                accessibilityState={{ selected: pending?.rowIdx === lab.rowIdx }}
              >
                <Text style={styles.rowTitle}>{lab.laboratory ?? 'Laboratório não informado'}</Text>
              </Pressable>
              {renderConfirm(lab.rowIdx, concentrationLabel(selected))}
            </View>
          ))}
        </>
      )
    }
    if (single) {
      const option = options[0]
      const form = formLabel(option.form)
      return (
        <>
          <Text style={styles.body}>
            {`Na lista oficial da ANVISA, o ${title} vem assim: `}
            <Text style={styles.bodyStrong}>{`${concentrationLabel(option)}${form ? ` · ${form}` : ''}`}</Text>
          </Text>
          {renderConfirm(option.rowIdx, concentrationLabel(option))}
        </>
      )
    }
    return (
      <>
        <Text style={styles.body}>Escolha a concentração escrita na embalagem ou na receita.</Text>
        {options.map((option) => {
          const label = concentrationLabel(option)
          const form = formLabel(option.form)
          return (
            <View key={`c-${option.rowIdx}`}>
              <Pressable
                style={({ pressed }) => [styles.row, (pressed || pending?.rowIdx === option.rowIdx) && styles.rowPressed, pending?.rowIdx === option.rowIdx && styles.rowAttached]}
                onPress={() => handleConcentration(option)}
                accessibilityRole="button"
                accessibilityLabel={form ? `${label}, ${form}` : label}
                accessibilityState={{ selected: pending?.rowIdx === option.rowIdx }}
              >
                <Text style={styles.rowTitle}>{label}</Text>
                {form ? <Text style={styles.rowSubtitle}>{form}</Text> : null}
              </Pressable>
              {renderConfirm(option.rowIdx, label)}
            </View>
          )
        })}
      </>
    )
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable
          onPress={handleBack}
          hitSlop={8}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <ChevronLeft size={22} color={colors.text.primary} strokeWidth={2} />
        </Pressable>
        <Text style={styles.heading}>{single ? 'Confira a embalagem' : 'Qual embalagem você tem?'}</Text>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {single ? null : <Text style={styles.product}>{title}</Text>}
        {renderBody()}
      </ScrollView>
      <Pressable onPress={onSkip} style={styles.skip} accessibilityRole="button" hitSlop={8}>
        <Text style={styles.skipText}>{single ? 'Manter como está' : 'Minha embalagem não está aqui'}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  changeTable: { gap: spacing[1] },
  changeRow: { flexDirection: 'row', gap: spacing[2] },
  changeLabel: { fontWeight: '700' },
  changeValue: { flex: 1 },
  bodyStrong: { fontWeight: '700', color: colors.text.primary },
  root: {
    flexShrink: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  back: {
    marginLeft: -spacing[1],
  },
  heading: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.primary,
  },
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: spacing[4],
    gap: spacing[2],
  },
  product: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  subheading: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text.primary,
  },
  body: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: spacing[1],
  },
  row: {
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    backgroundColor: colors.bg.card,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  rowPressed: {
    backgroundColor: colors.primary[50],
    borderColor: colors.primary[200],
  },
  rowTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text.primary,
  },
  rowSubtitle: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 2,
  },
  preparing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[4],
  },
  preparingText: {
    flex: 1,
    fontSize: 14,
    color: colors.text.secondary,
  },
  confirm: {
    marginTop: spacing[2],
    padding: spacing[3],
    gap: spacing[1],
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary[50],
  },
  confirmSingle: { marginTop: spacing[1] },
  eyebrow: { marginTop: spacing[4] },
  confirmButtonSingle: { marginTop: spacing[5] },
  // Smoke 2a (PO 22/11): eyebrow no padrão dos cards da Hoje.
  confirmTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.brand.primary,
    marginBottom: spacing[1],
  },
  // Linha escolhida + conferência = um bloco só (a caixa abre a partir da opção tocada).
  rowAttached: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
  },
  confirmAttached: {
    marginTop: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderWidth: 1,
    borderTopWidth: 0,
    paddingHorizontal: spacing[4],
    borderColor: colors.primary[200],
  },
  confirmLine: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.text.primary,
  },
  confirmStock: {
    fontSize: 13,
    color: colors.text.secondary,
  },
  confirmButton: {
    marginTop: spacing[2],
    minHeight: 48,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.primary,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.inverse,
  },
  skip: {
    alignSelf: 'center',
    paddingVertical: spacing[3],
  },
  skipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary[500],
  },
})

export default CmedPresentationStep
