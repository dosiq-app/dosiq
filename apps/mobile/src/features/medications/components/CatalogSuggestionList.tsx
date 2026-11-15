// CatalogSuggestionList — sugestões da lista oficial abaixo dos campos Nome / Princípio Ativo
// (spec 119 fatia B · RC2 D-3/D-6/D-7). Colada sob o campo, rola junto com o formulário (não é
// overlay). Sem resultado ⇒ não renderiza nada: o usuário segue digitando à mão.
// Tocar só abre a escolha da caixa; nada é preenchido sem o toque (INV-1). Componente puro.

import { View, Text, Pressable, StyleSheet } from 'react-native'
import { MedicineSearchResultItem } from '@medications/components/MedicineSearchResultItem'
import { MedicineAnvisaSheet } from '@medications/components/MedicineAnvisaSheet'
import { suggestionLabel } from '@medications/utils/catalogMatch'
import { colors, spacing } from '@shared/styles/tokens'

interface CatalogSuggestionListProps {
  exact: any[]
  approx: any[]
  onSelect: (item: any, rank: number) => void
  onSeeAll: () => void
}

export function CatalogSuggestionList({ exact, approx, onSelect, onSeeAll }: CatalogSuggestionListProps) {
  const total = exact.length + approx.length
  if (total === 0) return null

  return (
    <View style={styles.root} testID="catalog-suggestions">
      {/* D-7: o leitor de tela anuncia a quantidade quando a lista aparece ou muda. */}
      <Text style={styles.count} accessibilityLiveRegion="polite" accessibilityRole="text">
        {total === 1 ? '1 sugestão da lista oficial' : `${total} sugestões da lista oficial`}
      </Text>
      {exact.map((item, idx) => (
        <MedicineSearchResultItem
          key={`e-${item.name}-${idx}`}
          item={item}
          accessibilityLabel={suggestionLabel(item)}
          onPress={() => onSelect(item, idx)}
        />
      ))}
      {approx.length > 0 ? (
        <>
          <Text style={styles.header} accessibilityRole="header">
            Você quis dizer…
          </Text>
          {approx.map((item, idx) => (
            <MedicineSearchResultItem
              key={`a-${item.name}-${idx}`}
              item={item}
              accessibilityLabel={suggestionLabel(item)}
              onPress={() => onSelect(item, exact.length + idx)}
            />
          ))}
        </>
      ) : null}
      <Pressable
        style={({ pressed }) => [styles.seeAll, pressed && styles.seeAllPressed]}
        onPress={onSeeAll}
        accessibilityRole="button"
        accessibilityLabel="Ver todos na lista ANVISA"
      >
        <Text style={styles.seeAllText}>Ver todos na lista ANVISA</Text>
      </Pressable>
    </View>
  )
}

/**
 * A lista sob um campo do form: só aparece no campo em que a pessoa está digitando. Com
 * `onSheetSelect` (onboarding, sem banner), traz junto o sheet aberto pela sugestão.
 */
export function CatalogFieldSuggestions({
  catalog,
  field,
  onSheetSelect,
}: {
  catalog: any
  field: string
  onSheetSelect?: (selection: any) => void
}) {
  return (
    <>
      {catalog.field === field ? (
        <CatalogSuggestionList
          exact={catalog.suggestions.exact}
          approx={catalog.suggestions.approx}
          onSelect={catalog.selectItem}
          onSeeAll={catalog.seeAll}
        />
      ) : null}
      {onSheetSelect ? <CatalogSuggestionSheet catalog={catalog} onSelect={onSheetSelect} /> : null}
    </>
  )
}

/** Sheet aberto só por sugestão (onboarding, que não tem o banner): fecha e limpa ao escolher. */
export function CatalogSuggestionSheet({ catalog, onSelect }: { catalog: any; onSelect: (selection: any) => void }) {
  return (
    <MedicineAnvisaSheet
      open={catalog.fromSuggestion}
      onClose={catalog.clearSheet}
      onSelect={(selection) => {
        catalog.clearSheet()
        onSelect(selection)
      }}
      initialItem={catalog.sheetItem}
      initialQuery={catalog.sheetQuery}
      initialResults={catalog.sheetResults}
      entryPoint="catalog_suggestion"
    />
  )
}

export default CatalogSuggestionList

const styles = StyleSheet.create({
  root: {
    marginTop: -spacing[2],
    marginBottom: spacing[3],
  },
  count: {
    fontSize: 12,
    color: colors.text.muted,
    marginBottom: spacing[2],
  },
  header: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
    marginTop: spacing[1],
    marginBottom: spacing[2],
  },
  seeAll: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
  },
  seeAllPressed: {
    opacity: 0.6,
  },
  seeAllText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary[700],
  },
})
