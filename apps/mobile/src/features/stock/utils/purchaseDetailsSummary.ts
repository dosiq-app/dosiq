// purchaseDetailsSummary — "Mais detalhes" fechado no form de compra mostra o que está preenchido (smoke 125 1c,
// PO 19/11 — mesma lógica do form de remédio). Vazio ⇒ lista fixa do que o bloco guarda.

export const PURCHASE_DETAILS_EMPTY_SUMMARY = 'Validade · Farmácia · Laboratório · Código de barras · Observações'

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

export function purchaseDetailsSummary(values: Record<string, unknown>): string {
  const items = [
    text(values.expiration_date) ? `Validade ${formatDate(text(values.expiration_date))}` : '',
    text(values.pharmacy),
    text(values.laboratory),
    text(values.ean) ? 'Código de barras' : '',
    text(values.notes) ? 'Observações' : '',
  ].filter(Boolean)
  return items.length ? items.join(' · ') : PURCHASE_DETAILS_EMPTY_SUMMARY
}
