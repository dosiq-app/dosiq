// pickPromoCard — no máximo 1 card promocional acima da agenda da Hoje (spec 068 D-5/E-7 · INV-3).
// Precedência: nudge (acionado por intenção; só aparece sem hero — espelha `TodayBannersSection`)
// > upsell de estoque > assistente de bateria (o passivo cede).
// 120 E-9: o aviso de permissão de push vai na faixa de alertas (fora daqui); com ele visível, o de
// bateria sai — sem push utilizável, ajustar a bateria não adianta.

export type PromoCard = 'nudge' | 'stock' | 'oem' | null

interface PromoInputs {
  hasHero: boolean
  nudge: unknown
  stockVisible: boolean
  oemVisible: boolean
  permissionVisible?: boolean
}

export function pickPromoCard({ hasHero, nudge, stockVisible, oemVisible, permissionVisible = false }: PromoInputs): PromoCard {
  if (!hasHero && nudge) return 'nudge'
  if (stockVisible) return 'stock'
  if (oemVisible && !permissionVisible) return 'oem'
  return null
}
