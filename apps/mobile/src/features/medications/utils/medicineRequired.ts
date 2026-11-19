import { setupDefaults } from '@dosiq/core'

// medicineRequired — obrigatórios do form de remédio fora do Zod (smoke 125 1c, PO 19/11): forma sempre;
// dosagem onde a forma tem força no rótulo. Pomada/spray/outro seguem sem (só 'un', dosagem opcional).

export const DOSAGE_REQUIRED_FORMS = new Set(['comprimido', 'capsula', 'liquido', 'injetavel'])

export function missingRequired(values: Record<string, unknown>) {
  const presentation = String(values.presentation ?? '')
  return {
    presentationMissing: !presentation,
    dosageMissing: DOSAGE_REQUIRED_FORMS.has(presentation) && String(values.dosage_per_pill ?? '').trim() === '',
  }
}

/** O que o form mostra para os obrigatórios fora do Zod (erro só depois de tentar salvar). */
export function requiredUi(values: Record<string, unknown>, submitAttempted: boolean) {
  const presentation = String(values.presentation ?? '')
  const { presentationMissing, dosageMissing } = missingRequired(values)
  return {
    presentationError: submitAttempted && presentationMissing ? 'Escolha como é o remédio' : null,
    dosageError: submitAttempted && dosageMissing ? 'Informe a concentração' : null,
    dosageRequired: DOSAGE_REQUIRED_FORMS.has(presentation),
    dosageOptional: !!presentation && setupDefaults(presentation).strengthOptional,
  }
}
