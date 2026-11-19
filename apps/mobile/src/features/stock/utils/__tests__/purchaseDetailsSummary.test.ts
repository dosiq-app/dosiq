import { purchaseDetailsSummary, PURCHASE_DETAILS_EMPTY_SUMMARY } from '@stock/utils/purchaseDetailsSummary'

describe('purchaseDetailsSummary (smoke 1c)', () => {
  it('vazio ⇒ lista fixa', () => {
    expect(purchaseDetailsSummary({ pharmacy: ' ', ean: '' })).toBe(PURCHASE_DETAILS_EMPTY_SUMMARY)
  })
  it('preenchidos, na ordem do bloco', () => {
    expect(
      purchaseDetailsSummary({ expiration_date: '2027-03-31', pharmacy: 'Drogasil', laboratory: 'Lilly', ean: '789', notes: 'x' })
    ).toBe('Validade 31/03/2027 · Drogasil · Lilly · Código de barras · Observações')
  })
})
