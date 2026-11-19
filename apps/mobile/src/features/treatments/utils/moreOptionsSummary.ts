// moreOptionsSummary — o que "Mais opções" do form de tratamento guarda de PREENCHIDO (smoke 1c, PO 19/11).
//
// Fechado, o bloco mostra o que tem (ex.: "Plano Diabetes · Receita até 30/12 · Notas") em vez da lista
// fixa; na EDIÇÃO, ter algo preenchido abre o bloco ao carregar. O nome do tratamento não conta: é
// obrigatório e sempre tem valor. A data de início também não (sempre tem valor) — só a de fim.

import { inferMeasure } from '@dosiq/core'
import { TRACKED_MEASURE_OPTIONS } from '@treatments/utils/trackedMeasureField'

export const MORE_OPTIONS_EMPTY_SUMMARY = 'Acompanhar · Evolução · Receita médica · Nome · Plano · Notas'

interface Input {
  values: { tracked_measure?: string | null; frequency?: string | null; end_date?: string | null; notes?: string | null }
  medicine: { therapeutic_class_code?: string | null } | null | undefined
  titrationStepCount?: number
  plans?: Array<{ id: string; name: string; emoji?: string | null }>
  planField?: { mode?: string; planId?: string | null; inline?: { name?: string } | null } | null
}

function formatDayMonth(iso: string): string {
  const [, m, d] = iso.split('-')
  return d && m ? `${d}/${m}` : iso
}

function trackedItem({ values, medicine }: Input): string | null {
  const chosen = values.tracked_measure
  const inferred = inferMeasure({ classCode: medicine?.therapeutic_class_code, frequency: values.frequency } as any)
  if (chosen == null || chosen === inferred) return null
  if (chosen === 'nenhum') return 'Sem acompanhar'
  const label = TRACKED_MEASURE_OPTIONS.find((o) => o.value === chosen)?.label ?? chosen
  return `Acompanhar ${label.toLowerCase()}`
}

function titrationItem(count: number): string | null {
  if (count <= 0) return null
  return count === 1 ? 'Evolução: 1 etapa' : `Evolução: ${count} etapas`
}

function planItem({ plans = [], planField }: Input): string | null {
  const inlineName = planField?.mode === 'inline' ? planField.inline?.name?.trim() : ''
  if (inlineName) return `Plano ${inlineName}`
  if (!planField?.planId) return null
  const plan = plans.find((p) => p.id === planField.planId)
  return plan ? `Plano ${plan.name}` : 'Plano'
}

/** Itens preenchidos, na ordem do bloco. Vazio = nada customizado. */
export function moreOptionsFilled(input: Input): string[] {
  const { values, titrationStepCount = 0 } = input
  return [
    trackedItem(input),
    titrationItem(titrationStepCount),
    values.end_date ? `Receita até ${formatDayMonth(values.end_date)}` : null,
    planItem(input),
    values.notes?.trim() ? 'Notas' : null,
  ].filter((item): item is string => !!item)
}
