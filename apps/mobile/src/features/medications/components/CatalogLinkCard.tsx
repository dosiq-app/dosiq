// CatalogLinkCard — convite único para vincular um cadastro manual à lista oficial (spec 119 US4 ·
// FR-010/011 · RC2 D-8). Cartão discreto no topo do detalhe, no estilo do AnvisaBanner; não é modal.
//
// Só monta para medicamento SEM código de classe (C-B7: a base ANVISA só é lida nesse caso). Casa o
// nome (ou o princípio ativo) pela regra do core (`suggestByName`, CON-045). "Sim, é esse" abre a
// escolha da caixa (um item ⇒ direto nele; vários ⇒ busca com o nome) e grava só código de classe e
// registro no MESMO medicamento (INV-6, R-231 — `update` do repositório; doses intactas, R-299).
// "Não é este", ou vínculo feito, dispensa para aquele id (AsyncStorage, PO-119-9).
// Nada é gravado sem o toque na caixa (INV-1). Caixa sem código ⇒ nada gravado, o convite fica.

import { useEffect, useMemo, useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
// TODO(040-strict): named imports do lucide-react-native batem em TS2305 (ver TreatmentsScreen.tsx)
import * as LucideIcons from 'lucide-react-native'
import { useMedicineDatabase } from '@shared/hooks/useMedicineDatabase'
import { useToast } from '@shared/components/feedback/Toast'
import { MedicineAnvisaSheet } from '@medications/components/MedicineAnvisaSheet'
import { useMedicineMutation } from '@medications/hooks/useMedicineMutation'
import { dismissCatalogLink, isCatalogLinkDismissed } from '@medications/services/catalogLinkStore'
import { catalogLinkPayload, catalogMatchesFor } from '@medications/utils/catalogMatch'
import { colors, spacing, borderRadius } from '@shared/styles/tokens'

const { ShieldCheck } = LucideIcons as any

interface CatalogLinkCardProps {
  medicine: { id: string; name?: string | null; active_ingredient?: string | null; therapeutic_class_code?: string | null; dosage_per_pill?: number | string | null; dosage_unit?: string | null; presentation?: string | null }
  onLinked?: () => void
}

export function CatalogLinkCard({ medicine, onLinked }: CatalogLinkCardProps) {
  // States (R-010)
  const [dismissed, setDismissed] = useState<boolean | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  // Caixa de outra concentração: reabre direto no passo das caixas do mesmo remédio (smoke 119 B).
  const [retryItem, setRetryItem] = useState<any>(null)
  const { items } = useMedicineDatabase()
  const { update } = useMedicineMutation()
  const { show } = useToast()

  // Memos
  const matches = useMemo(
    () => catalogMatchesFor(items, medicine.name, medicine.active_ingredient),
    [items, medicine.name, medicine.active_ingredient]
  )
  const single = matches.length === 1 ? matches[0] : null
  // O cartão decide com 5; o sheet ("Escolher o meu") lista como a busca, até 40 (PO 2026-11-15).
  const sheetMatches = useMemo(
    () => (sheetOpen && !single ? catalogMatchesFor(items, medicine.name, medicine.active_ingredient, 40) : matches),
    [sheetOpen, single, items, medicine.name, medicine.active_ingredient, matches]
  )

  // Effects
  useEffect(() => {
    let canceled = false
    isCatalogLinkDismissed(medicine.id).then((value) => {
      if (!canceled) setDismissed(value)
    })
    return () => {
      canceled = true
    }
  }, [medicine.id])

  // Handlers
  function handleDismiss() {
    setDismissed(true)
    dismissCatalogLink(medicine.id)
  }

  function closeSheet() {
    setSheetOpen(false)
    setRetryItem(null)
  }

  async function handleSelect({ anvisaItem, cmedDraft }: { anvisaItem: any; cmedDraft?: any }) {
    closeSheet()
    if (!cmedDraft?.therapeutic_class_code) {
      show('Escolha a embalagem para vincular.', { variant: 'info' })
      return
    }
    const payload = catalogLinkPayload(medicine, cmedDraft)
    if (!payload) {
      // Já reaberto neste item e de novo outra força: o item não tem a caixa da dose (uma caixa só é
      // escolhida sozinha) — parar, senão reabre/escolhe/avisa em loop (smoke iOS 119 B, Selozok Fix).
      if (retryItem) {
        show('Esse remédio não tem caixa com a mesma dose do seu. Nada foi alterado.', { variant: 'info' })
        return
      }
      show('Essa caixa tem outra concentração. Escolha a caixa da mesma dose do seu remédio.', { variant: 'info' })
      // Vários remédios: volta à lista (nunca direto num item). Um só: reabre nas caixas dele, uma vez.
      if (single) setRetryItem(anvisaItem)
      // Espera o Modal terminar de fechar (iOS ignora abrir outro durante a animação).
      setTimeout(() => setSheetOpen(true), 400)
      return
    }
    const result = await update(medicine.id, payload)
    if (result) {
      handleDismiss()
      onLinked?.()
    }
  }

  if (medicine.therapeutic_class_code || dismissed !== false || matches.length === 0) return null

  // Copy para a "dona Maria" (PO 2026-11-15): uma pergunta, o nome em destaque, benefício genérico;
  // a assinatura da base oficial fica no rodapé, como credencial da sugestão.
  const ingredient = single?.activeIngredient ? String(single.activeIngredient).toLowerCase() : null

  return (
    <View style={styles.card} testID="catalog-link-card">
      <View style={styles.seal}>
        <ShieldCheck size={14} color={colors.primary[700]} strokeWidth={2.5} />
        <Text style={styles.sealText}>Base oficial da ANVISA</Text>
      </View>
      {single ? (
        <>
          <Text style={styles.title} accessibilityRole="header">
            Seu remédio é o {single.name}?
          </Text>
          {ingredient ? <Text style={styles.subtitle}>({ingredient})</Text> : null}
          <Text style={styles.body}>Confirmando, o dosiq entende melhor o seu tratamento e te ajuda mais no futuro.</Text>
        </>
      ) : (
        <>
          <Text style={styles.title} accessibilityRole="header">
            Achamos remédios com nome parecido com “{medicine.name}”
          </Text>
          <Text style={styles.body}>Escolha o seu para o dosiq entender melhor o seu tratamento.</Text>
        </>
      )}
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          onPress={() => setSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={single ? 'Sim, é esse' : 'Escolher o meu'}
        >
          <Text style={styles.primaryText}>{single ? 'Sim, é esse' : 'Escolher o meu'}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
          onPress={handleDismiss}
          accessibilityRole="button"
          accessibilityLabel={single ? 'Não é' : 'Nenhum desses'}
        >
          <Text style={styles.secondaryText}>{single ? 'Não é' : 'Nenhum desses'}</Text>
        </Pressable>
      </View>
      <MedicineAnvisaSheet
        open={sheetOpen}
        onClose={closeSheet}
        onSelect={handleSelect}
        initialItem={retryItem ?? single}
        initialQuery={retryItem || single ? null : (medicine.name ?? null)}
        initialResults={retryItem || single ? null : sheetMatches}
        entryPoint="catalog_link"
      />
    </View>
  )
}

export default CatalogLinkCard

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primary[50],
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.primary[200],
    padding: spacing[4],
    marginBottom: spacing[4],
    gap: spacing[2],
  },
  // Assinatura no topo como cabeçalho, centralizada e separada por linha fina (PO 2026-11-15).
  seal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
    marginTop: -spacing[2],
    paddingBottom: spacing[2],
    marginBottom: spacing[1],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.primary[200],
  },
  sealText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary[700],
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.primary,
  },
  subtitle: {
    fontSize: 15,
    color: colors.text.secondary,
    marginTop: -spacing[1],
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.text.primary,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[1],
  },
  primary: {
    minHeight: 44,
    paddingHorizontal: spacing[4],
    justifyContent: 'center',
    borderRadius: borderRadius.md,
    backgroundColor: colors.brand.primary,
  },
  primaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.inverse,
  },
  secondary: {
    minHeight: 44,
    paddingHorizontal: spacing[4],
    justifyContent: 'center',
  },
  secondaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary[700],
  },
  pressed: {
    opacity: 0.7,
  },
})
