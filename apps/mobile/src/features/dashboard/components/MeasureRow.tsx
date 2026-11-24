// MeasureRow.tsx — L2 do módulo da Hoje por medida do tratamento selecionado (spec 124 B · FR-016).
// `peso` = WeightRow da 121 (linha, ADR-125) sem mudança · `glicemia`/`pressao_arterial` = BiomarkerRow
// (gráfico da área de Medidas) · `nenhum` = L2 some.

import type { ComponentProps } from 'react'
import WeightRow from '@dashboard/components/WeightRow'
import BiomarkerRow from '@dashboard/components/BiomarkerRow'
import type { WidgetMeasure } from '@dashboard/utils/trackedSelection'

type WeightProps = ComponentProps<typeof WeightRow>

type Props = {
  measure: WidgetMeasure
  /** Props da linha de peso (só lidas quando `measure === 'peso'`). */
  weight: WeightProps
  /** Aberto/fechado e toque da linha para glicemia/PA (peso usa os de `weight`). */
  open: boolean
  onToggle: () => void
  timezone: string
  today: string
  reloadKey?: unknown
}

export default function MeasureRow({ measure, weight, open, onToggle, timezone, today, reloadKey }: Props) {
  if (measure === 'peso') return <WeightRow {...weight} />
  if (measure === 'glicemia' || measure === 'pressao_arterial') {
    return <BiomarkerRow key={measure} measure={measure} open={open} onToggle={onToggle} timezone={timezone} today={today} reloadKey={reloadKey} />
  }
  return null
}
