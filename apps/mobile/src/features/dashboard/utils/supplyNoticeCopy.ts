import { formatSupplyDateShort } from '@stock/hooks/_stockDataTransformer'

/**
 * Título e dica do aviso de próxima compra (105 Fatia B, smoke 2026-11-06: mesmo tom do card da
 * titulação). Era do `SupplyNoticeInline`; a 120 C leva o aviso para a moldura única
 * (`TodayAlertCard`) e o texto validado no smoke fica aqui, inalterado.
 */
/**
 * S-17 (smoke 14/11): cadência no título, pela frequência do tratamento — 105 só previa o mensal.
 * Sem cadência reconhecível ⇒ "Próxima dose" (nunca afirma um período que não é o do tratamento).
 */
export function doseCadenceLabel(frequency?: string | null, intervalDays?: number | null): string {
  const n = Number(intervalDays)
  if (frequency === 'semanal' || n === 7) return 'Dose semanal'
  if (n === 14 || n === 15) return 'Dose quinzenal'
  if (n >= 28 && n <= 31) return 'Dose mensal'
  if (Number.isInteger(n) && n > 1) return `Dose a cada ${n} dias`
  return 'Próxima dose'
}

// S-21: perto da data, a palavra pesa mais que o número.
function _when(daysUntil, short) {
  if (daysUntil === 0) return 'hoje'
  if (daysUntil === 1) return 'amanhã'
  return `em ${short}`
}

export function supplyNoticeCopy(notice) {
  const short = formatSupplyDateShort(notice?.date)
  if (!notice || !short) return null
  if (notice.reason === 'step_switch') {
    return {
      title: `A próxima etapa usa ${notice.buyMedicineName ?? 'outro medicamento'}`,
      hint: `Garanta até ${short} — você ainda não tem estoque dela.`,
    }
  }
  return {
    title: `${doseCadenceLabel(notice.frequency, notice.intervalDays)} de ${notice.buyMedicineName ?? notice.medicineName} ${_when(notice.daysUntil, short)}`,
    hint: 'Você ainda não tem estoque para ela.',
  }
}
