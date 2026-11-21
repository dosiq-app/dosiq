// usePresetMedicine — 125 fatia 2 (AC6.3 · C-2-3): "Definir agora" da Hoje abre a criação do tratamento já
// com o remédio, nunca o seletor vazio. Busca o remédio e o aplica UMA vez pelo `selectMedicine` do form
// (mesma regra de dose/nome da escolha manual). Remédio que sumiu (excluído) ⇒ o form fica como sempre.

import { useEffect, useState, startTransition } from 'react'
import { medicineService } from '@medications/services/medicineService'

export function usePresetMedicine(presetMedicineId: string | null, selectMedicine: (med: any) => void) {
  // States
  const [preset, setPreset] = useState<any>(null)

  // Effects
  useEffect(() => {
    if (!presetMedicineId) return
    let cancelled = false
    medicineService
      .getById(presetMedicineId)
      .then((med) => {
        if (!cancelled && med) setPreset(med)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [presetMedicineId])

  useEffect(() => {
    if (!preset) return
    startTransition(() => {
      selectMedicine(preset)
      setPreset(null)
    })
  }, [preset, selectMedicine])
}

export default usePresetMedicine
