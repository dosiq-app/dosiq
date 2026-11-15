// useCatalogSuggestions — sugestões da base ANVISA para os campos Nome / Princípio Ativo (spec 119
// fatia B · FR-007 · RC2 D-2/D-3). A regra é a do core (`suggestByName`, CON-045); aqui só debounce,
// estado e montagem preguiçosa do índice.
//
// C-B1: roda sobre a base ANVISA (os itens do passo 1 do "Buscar pelo nome"), nunca sobre o índice
// CMED — carregar o CMED ao digitar travava a digitação no LG K8 (066 C-C5). O CMED só carrega
// depois do toque numa sugestão, dentro do sheet, como hoje.
// INV-5: base carregando ou indisponível ⇒ lista vazia, sem spinner nem erro. Nada aqui bloqueia o campo.

import { useEffect, useMemo, useState } from 'react'
import { buildNameSuggestionIndex, suggestByName, SUGGEST_MIN_CHARS } from '@dosiq/core'
import { useMedicineDatabase } from '@shared/hooks/useMedicineDatabase'

export const SUGGESTION_DEBOUNCE_MS = 150
export const SUGGESTION_LIMIT = 5

export type CatalogSuggestionState = 'idle' | 'loading' | 'unavailable' | 'empty' | 'results'

interface Options {
  /** Liga a sugestão (campo em uso e, em edição, medicamento sem código). Desligado ⇒ nada. */
  enabled: boolean
}

// Mesmo teto da busca do sheet (`search(trimmed, 40)` em useMedicineSearchFlow).
const SHEET_LIMIT = 40

export function useCatalogSuggestions(query: string | null | undefined, { enabled }: Options) {
  // States (R-010)
  const [debounced, setDebounced] = useState('')
  const { items, isLoading } = useMedicineDatabase()

  // Memos
  const trimmed = enabled ? String(query ?? '').trim() : ''
  const wantsIndex = trimmed.length >= SUGGEST_MIN_CHARS
  // Índice montado só quando alguém digita o bastante (não no mount da tela).
  const index = useMemo(() => (wantsIndex && items ? buildNameSuggestionIndex(items) : null), [wantsIndex, items])
  const result = useMemo(
    () => (index && debounced.length >= SUGGEST_MIN_CHARS ? suggestByName(index, debounced, SUGGESTION_LIMIT) : null),
    [index, debounced]
  )

  // Effects
  useEffect(() => {
    // Curto: nada a agendar — `visible` exige debounced === trimmed, então a lista antiga não aparece.
    if (trimmed.length < SUGGEST_MIN_CHARS) return undefined
    const timer = setTimeout(() => setDebounced(trimmed), SUGGESTION_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [trimmed])

  let state: CatalogSuggestionState = 'idle'
  if (wantsIndex) {
    if (!items) state = isLoading ? 'loading' : 'unavailable'
    else if (result && result.exact.length + result.approx.length > 0) state = 'results'
    else if (result) state = 'empty'
  }

  const visible = state === 'results' && debounced === trimmed
  /** Lista completa para o sheet ("Ver todos"): o limite de 5 é do campo, não da busca. */
  const all = (limit = SHEET_LIMIT) => (index && trimmed ? (({ exact, approx }) => [...exact, ...approx])(suggestByName(index, trimmed, limit)) : [])
  return {
    all,
    state,
    query: trimmed,
    exact: visible && result ? result.exact : [],
    approx: visible && result ? result.approx : [],
  }
}
