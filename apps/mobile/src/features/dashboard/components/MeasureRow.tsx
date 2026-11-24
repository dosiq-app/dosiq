// MeasureRow.tsx — L2 do módulo da Hoje por medida do tratamento selecionado (spec 124 B · FR-016).
// `peso` = WeightRow da 121 (linha, ADR-125) sem mudança · `nenhum` = L2 some.

import type { ComponentProps } from 'react'
import WeightRow from '@dashboard/components/WeightRow'
import type { WidgetMeasure } from '@dashboard/utils/trackedSelection'

type WeightProps = ComponentProps<typeof WeightRow>

type Props = {
  measure: WidgetMeasure
  /** Props da linha de peso (só lidas quando `measure === 'peso'`). */
  weight: WeightProps
}

export default function MeasureRow({ measure, weight }: Props) {
  if (measure === 'peso') return <WeightRow {...weight} />
  return null
}
