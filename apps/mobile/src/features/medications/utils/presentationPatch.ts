// presentationPatch — o que muda junto com a forma no form do remédio (spec 125 · AC7.4 · C-3 · smoke 1c).
// Extraído da tela na 2a para o chip "Como é" e a forma proposta pelo card "Confira a forma" da Hoje
// (AC8.8) aplicarem a MESMA regra.

import { setupDefaults } from '@dosiq/core'

/** AC7.4: validade depois de aberto só para injetável e líquido (R-295: 0/193 sólidos com valor, prod 17/11). */
export const SHELF_LIFE_FORMS = new Set(['injetavel', 'liquido'])

/**
 * O que muda junto com a forma (chip "Como é" e forma proposta pelo card "Confira a forma" da Hoje —
 * 125 2a, AC8.8). 125 (C-3) / smoke 1c: pomada/spray/outro só têm 'un'; voltar a uma forma com força
 * limpa o 'un'. Injetável sem validade ⇒ 28 dias; fora de injetável/líquido a validade some (AC7.4,
 * Gemini #658).
 */
export function presentationPatch(values: Record<string, any>, presentation: string): Record<string, any> {
  const patch: Record<string, any> = { presentation }
  const defaults = setupDefaults(presentation)
  if (defaults.strengthOptional) patch.dosage_unit = defaults.fixedDosageUnit
  else if (values.dosage_unit && !defaults.strengthUnits.includes(String(values.dosage_unit))) patch.dosage_unit = undefined
  const shelf = values.shelf_life_days
  if (presentation === 'injetavel') {
    if (shelf === '' || shelf === null || shelf === undefined) patch.shelf_life_days = '28'
  } else if (!SHELF_LIFE_FORMS.has(presentation)) {
    patch.shelf_life_days = ''
  }
  return patch
}
