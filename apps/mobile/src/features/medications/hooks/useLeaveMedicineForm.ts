// useLeaveMedicineForm — saída do form de remédio (smoke 125 1c, PO 19/11). Veio do "Cadastrar com os
// dados da caixa" da aba Estoque (`purchaseAfter`) ⇒ sair volta ao Estoque; com remédio (salvo ou "já
// tenho este") segue para a compra dele com a caixa lida. Senão, volta a quem abriu.

import { useCallback } from 'react'
import { ROUTES } from '@navigation/routes'
import { navigateCrossTab } from '@navigation/navigateCrossTab'

export function useLeaveMedicineForm(navigation: any, route: any) {
  const purchaseAfter = route.params?.purchaseAfter ?? null
  const scanDraft = route.params?.scanDraft
  return useCallback(
    (med?: any) => {
      navigation.goBack()
      if (!purchaseAfter) return
      if (!med?.id) {
        navigateCrossTab(ROUTES.STOCK, undefined, undefined)
        return
      }
      navigateCrossTab(ROUTES.STOCK, ROUTES.PURCHASE_FORM, {
        mode: 'create',
        medicineId: med.id,
        medicineName: med.name,
        medicine: med,
        scanDraft,
        scanEan: purchaseAfter.scanEan,
        scanConfirmed: true,
      })
    },
    [navigation, purchaseAfter, scanDraft],
  )
}
