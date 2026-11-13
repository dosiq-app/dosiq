// stockSections — seções e contagens da aba Estoque (spec 117 Fatia B, W-2 / FR-011).
// Puro: a seção de cada item já vem da classificação do core (`classifyStockMedicines`); aqui só se agrupa.

// 117 B (W-2): títulos das três seções da classificação do core.
const SECTION_TITLES = {
  active: 'Estoque em uso',
  scheduled: 'Programado',
  inactive: 'Sem tratamentos ativos',
}

/** Contagens dos chips: Crítico/Baixo só sobre Em uso; Programado = itens da seção (FR-011). */
export function calculateCounts(active, scheduled, inactive) {
  return {
    todos: active.length + scheduled.length + inactive.length,
    critico: active.filter((m) => m.status === 'CRITICAL').length,
    baixo: active.filter((m) => m.status === 'LOW').length,
    programado: scheduled.length,
    sem_tratamento: inactive.length,
  }
}

export function getFilteredSections(data, filter, active, scheduled, inactive) {
  if (!data) return []
  const section = (key, items) => (items.length > 0 ? [{ title: SECTION_TITLES[key], key, data: items }] : [])

  if (filter === 'sem_tratamento') return section('inactive', inactive)
  if (filter === 'programado') return section('scheduled', scheduled)
  if (filter === 'critico' || filter === 'baixo') {
    const status = filter === 'critico' ? 'CRITICAL' : 'LOW'
    return section('active', active.filter((m) => m.status === status))
  }
  return [...section('active', active), ...section('scheduled', scheduled), ...section('inactive', inactive)]
}
