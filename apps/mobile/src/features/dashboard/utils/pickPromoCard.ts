// pickPromoCard — no máximo 1 card promocional acima da agenda da Hoje (spec 068 D-5/E-7 · INV-3).
// Precedência: nudge (acionado por intenção; só aparece sem hero — espelha `TodayBannersSection`)
// > upsell de estoque > assistente de bateria (o passivo cede).

export type PromoCard = 'nudge' | 'stock' | 'oem' | null

interface PromoInputs {
  hasHero: boolean
  nudge: unknown
  stockVisible: boolean
  oemVisible: boolean
}

export function pickPromoCard({ hasHero, nudge, stockVisible, oemVisible }: PromoInputs): PromoCard {
  if (!hasHero && nudge) return 'nudge'
  if (stockVisible) return 'stock'
  if (oemVisible) return 'oem'
  return null
}
