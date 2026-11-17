// evolutionSwitchCover.ts — quando o card da 029 cede lugar à L3 da Semana do tratamento (spec 121 B).

/**
 * Smoke 121 B: a linha neutra (§3.2, sem botões) repete a L3 "Evolução" da Semana do tratamento e leva
 * ao mesmo detalhe. Quando o módulo cobre a escada do mesmo tratamento, ela sai da Hoje. O card com
 * `[Iniciar etapa]` (dia 0, `showCta`) FICA: é a única ação da troca na Hoje (AC-15).
 */
export function isCoveredByWeekModule(view: { showCta: boolean; currentStep: any; pendingStep: any } | null, coveredProtocolId?: string | null): boolean {
  if (!view || view.showCta || !coveredProtocolId) return false
  return view.currentStep?.protocol_id === coveredProtocolId || view.pendingStep?.protocol_id === coveredProtocolId
}

