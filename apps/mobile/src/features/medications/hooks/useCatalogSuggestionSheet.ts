// useCatalogSuggestionSheet — estado das sugestões do catálogo num formulário (spec 119 fatia B):
// qual campo está sugerindo, e com que item/busca o `MedicineAnvisaSheet` abre. Compartilhado pelo
// cadastro de medicamento e pelo "Digitar à mão" do onboarding (RC2 D-1: mesmo componente, mesmo
// resultado). A regra das sugestões é a do `useCatalogSuggestions` (core `suggestByName`).

import { useCallback, useState } from 'react'
import { useCatalogSuggestions } from '@medications/hooks/useCatalogSuggestions'

interface Options<F extends string> {
  /** Valores do form (lê o texto do campo ativo). */
  values: Record<string, unknown>
  /** Sugestão permitida (em edição: só medicamento sem código — D-5). */
  allowed?: boolean
}

export function useCatalogSuggestionSheet<F extends string>({ values, allowed = true }: Options<F>) {
  // States (R-010)
  const [field, setField] = useState<F | null>(null)
  const [sheetItem, setSheetItem] = useState<any>(null)
  const [sheetQuery, setSheetQuery] = useState<string | null>(null)
  // "Ver todos" com só "Você quis dizer…": a busca por prefixo do sheet não acha o texto digitado —
  // o sheet mostra as sugestões vistas (smoke iOS 119 B, "Metropolol").
  const [sheetResults, setSheetResults] = useState<any[] | null>(null)
  const suggestions = useCatalogSuggestions(field ? (values[field] as string) : '', { enabled: !!field && allowed })

  // Handlers
  /** Digitar no campo liga as sugestões dele. */
  const activate = useCallback((name: F) => setField(name), [])
  /** Fecha a lista (seleção feita, sheet aberto). */
  const deactivate = useCallback(() => setField(null), [])
  /** Tocar numa sugestão: o sheet abre na escolha da caixa daquele item. */
  const selectItem = useCallback((item) => {
    setField(null)
    setSheetQuery(null)
    setSheetItem(item)
  }, [])
  /** "Ver todos na lista ANVISA": o sheet abre na busca com o texto digitado. */
  const seeAll = useCallback(() => {
    setField(null)
    setSheetItem(null)
    setSheetQuery(suggestions.query)
    setSheetResults(suggestions.all())
  }, [suggestions])
  /** Sheet fechado ou usado: volta ao estado sem item/busca. */
  const clearSheet = useCallback(() => {
    setSheetItem(null)
    setSheetQuery(null)
    setSheetResults(null)
  }, [])

  /** onChange do campo: grava no form e liga as sugestões daquele campo. */
  const bindChange = useCallback(
    (handleChange: (name: string, value: unknown) => void) => (name: F, value: unknown) => {
      handleChange(name, value)
      setField(name)
    },
    []
  )

  return {
    field,
    bindChange,
    /** O sheet está aberto: pelo próprio form (`manualOpen`) ou por uma sugestão. */
    isOpen: (manualOpen = false) => manualOpen || !!sheetItem || !!sheetQuery,
    suggestions,
    sheetItem,
    sheetQuery,
    sheetResults,
    /** Sheet aberto por uma sugestão (item ou "Ver todos"). */
    fromSuggestion: !!sheetItem || !!sheetQuery,
    /** `entry_point` do `medicine_search_opened`: sugestão, ou o padrão de quem abriu o sheet. */
    entryPoint: (fallback: string) => (sheetItem || sheetQuery ? 'catalog_suggestion' : fallback),
    activate,
    deactivate,
    selectItem,
    seeAll,
    clearSheet,
  }
}
