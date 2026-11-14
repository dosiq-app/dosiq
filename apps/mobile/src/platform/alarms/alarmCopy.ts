// alarmCopy — texto do alarme LOCAL (notifee) da dose essencial (spec 120, T-A13c).
//
// Na dose essencial o push do servidor é suprimido pelo alarme nativo (082): o texto que a pessoa vê
// é ESTE. Espelha o push da fatia B (oráculo `copy-matrix-B.md` §2–4): mesmo verbo (`doseVerb`) e mesma
// dose (`formatDoseAmount`), ambos do core. Sem o local da última aplicação — o alarme local não lê
// `medicine_logs`. Sem possessivo (INV-3). Puro: testável sem o SO.
import { doseVerb, formatDoseAmount, formatDoseListItem, DOSE_DETAIL_SEP } from '@dosiq/core'

const MAX_SHOWN = 10

type AlarmDose = {
  medicineName?: string
  presentation?: string | null
  dosagePerIntake?: number | string | null
  dosagePerPill?: number | string | null
  dosageUnit?: string | null
  intakeUnit?: string | null
  treatmentPlanName?: string | null
}

/** Dados do alarme vão como string no notifee ('' = ausente). */
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

function _amount(d: AlarmDose): string | null {
  return formatDoseAmount(num(d.dosagePerIntake), num(d.dosagePerPill), str(d.dosageUnit), str(d.intakeUnit))
}

function _single(d: AlarmDose, time: string | null) {
  const name = str(d.medicineName)
  if (!name) return { title: '💊 Hora da dose', body: [time].filter(Boolean).join(DOSE_DETAIL_SEP) || 'Está na hora da dose.' }
  return {
    title: `💊 Essencial: ${doseVerb(str(d.presentation))} ${name}`,
    body: [_amount(d), time].filter(Boolean).join(DOSE_DETAIL_SEP),
  }
}

function _list(doses: AlarmDose[]): string {
  const shown = doses.slice(0, MAX_SHOWN)
  const items = shown.map((d) =>
    formatDoseListItem({
      medicineName: str(d.medicineName) ?? '',
      dosagePerIntake: num(d.dosagePerIntake),
      dosagePerPill: num(d.dosagePerPill),
      dosageUnit: str(d.dosageUnit),
      intakeUnit: str(d.intakeUnit),
    })
  )
  const extra = doses.length - shown.length
  return items.join(DOSE_DETAIL_SEP) + (extra > 0 ? `${DOSE_DETAIL_SEP}e mais ${extra}` : '')
}

function _grouped(doses: AlarmDose[], time: string | null) {
  if (doses.length === 0) return { title: '💊 Hora da dose', body: 'Está na hora da dose.' }
  if (doses.length === 1) return _single(doses[0], time)
  const plan = str(doses[0].treatmentPlanName)
  const samePlan = !!plan && doses.every((d) => d.treatmentPlanName === plan)
  if (samePlan) return { title: '📂 Plano essencial', body: [plan, time, _list(doses)].filter(Boolean).join(DOSE_DETAIL_SEP) }
  return { title: '📋 Doses essenciais', body: [time, _list(doses)].filter(Boolean).join(DOSE_DETAIL_SEP) }
}

export function getAlarmCopy({ medicineName, data }: { medicineName?: string; data?: Record<string, any> }): { title: string; body: string } {
  const time = str(data?.scheduledTime)
  if (data?.isGrouped === 'true') {
    let doses: AlarmDose[] = []
    try {
      const parsed = JSON.parse(data.groupedDoses || '[]')
      doses = Array.isArray(parsed) ? parsed : []
    } catch {
      doses = []
    }
    return _grouped(doses, time)
  }
  return _single(
    {
      medicineName: medicineName || data?.medicineName,
      presentation: data?.presentation,
      dosagePerIntake: data?.quantityTaken,
      dosagePerPill: data?.dosagePerPill,
      dosageUnit: data?.dosageUnit,
      intakeUnit: data?.intakeUnit,
    },
    time
  )
}
