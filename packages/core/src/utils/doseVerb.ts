/**
 * doseVerb — verbo da ação de uma dose pela apresentação do medicamento (spec 120, D-9).
 *
 * Fonte única do verbo para o texto do push (servidor, fatia B) e para a prévia do push /
 * card do onboarding no app (fatia A). Valor fora do enum `PRESENTATIONS` ⇒ "tomar"
 * (default histórico do copy), nunca lança.
 *
 * @module doseVerb
 */

export type DoseVerb = 'tomar' | 'aplicar' | 'usar'

const VERB_BY_PRESENTATION: Readonly<Record<string, DoseVerb>> = Object.freeze({
  comprimido: 'tomar',
  capsula: 'tomar',
  liquido: 'tomar',
  injetavel: 'aplicar',
  pomada: 'aplicar',
  spray: 'usar',
  outro: 'usar',
})

export function doseVerb(presentation: string | null | undefined): DoseVerb {
  if (!presentation) return 'tomar'
  // hasOwnProperty: 'constructor'/'toString' não podem escapar do fallback (RC6 #950).
  return Object.prototype.hasOwnProperty.call(VERB_BY_PRESENTATION, presentation) ? VERB_BY_PRESENTATION[presentation] : 'tomar'
}
