// useApplicationDay — dia da aplicação do injetável não diário no form completo (spec 125 1b, AC5.3), a mesma
// pergunta do onboarding (AC2.5b). A âncora vem do core (`anchorFromApplication`).

import { useCallback, useMemo, useState } from 'react'
import { anchorFromApplication, getTodayLocal } from '@dosiq/core'
import { asksApplicationDay } from '@features/onboarding/utils/treatmentStepModel'

/** Dia da aplicação do injetável não diário, na criação (AC5.3); nada marcado por omissão. */
export function useApplicationDay({ form, presentation, disabled = false }: { form: any; presentation: string | null | undefined; disabled?: boolean }) {
  const [date, setDate] = useState<string | null>(null)
  const today = useMemo(() => getTodayLocal(), [])
  const asks = !disabled && asksApplicationDay(presentation, form.values.frequency)
  const anchorFor = useCallback(
    (d: string | null, frequency, intervalDays) =>
      d && !disabled && asksApplicationDay(presentation, frequency)
        ? anchorFromApplication({ applicationDate: d, frequency, intervalDays, today })
        : {},
    [disabled, presentation, today],
  )
  const choose = useCallback(
    (d: string) => {
      setDate(d)
      form.setValues({ ...form.values, ...anchorFor(d, form.values.frequency, form.values.interval_days) })
    },
    [form, anchorFor],
  )
  // Trocar a frequência depois de escolher o dia reancora (semanal ⇄ dias alternados ⇄ mensal).
  const reanchor = useCallback((patch) => ({ ...patch, ...anchorFor(date, patch.frequency, patch.interval_days) }), [anchorFor, date])
  return { asks, date, today, choose, reanchor }
}
