// upcomingDoseParity.test.ts — 117 PO-1/PO-2 (core): as próximas doses do detalhe são as que o
// gerador de instâncias materializa — data, horário E dose da etapa. Oráculo = `generateInstances`
// real (boundary da PO-1: nunca comparar o helper com ele mesmo nem escrever a lista à mão).
// Fuso do processo no gerador e fixtures locais (AP-270), como em upcomingDoseDates.test.ts.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { generateInstances } from '../doseInstanceGenerator'
import { listUpcomingDoses } from '../upcomingDoses'
import { formatLocalDate } from '../dateUtils'
import { consumptionLabel } from '../../schemas/protocolSchema'

afterEach(() => {
  vi.clearAllMocks()
  vi.clearAllTimers()
})

const PROC_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone
const NOW = new Date(2026, 10, 13, 14, 0, 0, 0) // sex, 13/nov/2026 14:00 local
const day = (offset: number) => formatLocalDate(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + offset))
const localParts = (iso: string) => {
  const d = new Date(iso)
  return {
    date: formatLocalDate(d),
    time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  }
}

function base(over: Record<string, unknown>) {
  return {
    id: 'p-1',
    user_id: 'u-1',
    medicine_id: 'm-1',
    time_schedule: ['20:00'],
    dosage_per_intake: 0.25,
    start_date: day(-40),
    end_date: null,
    active: true,
    weekdays: [],
    ...over,
  }
}

/** Oráculo: primeiras `count` instâncias do gerador de `now` em diante. */
function fromGenerator(protocol: ReturnType<typeof base>, steps: unknown[] | null = null, count = 3) {
  const horizon = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + 400, 23, 59)
  return generateInstances(protocol as never, NOW, horizon, PROC_TZ, steps as never)
    .slice(0, count)
    .map((i) => ({ ...localParts(i.scheduled_for), dose: i.expected_dose }))
}

const CADENCES: Array<[string, Record<string, unknown>]> = [
  ['semanal (sexta)', { frequency: 'semanal', weekdays: ['sexta'] }],
  ['mensal (a cada 30 dias)', { frequency: 'intervalo_dias', interval_days: 30 }],
  ['a cada 10 dias', { frequency: 'intervalo_dias', interval_days: 10 }],
  ['dias alternados', { frequency: 'dias_alternados' }],
]

describe('117 PO-1 — próximas doses = instâncias do gerador', () => {
  for (const [label, over] of CADENCES) {
    it(label, () => {
      const p = base(over)
      const expected = fromGenerator(p)
      expect(expected).toHaveLength(3) // oráculo não pode vir vazio
      const got = listUpcomingDoses(p, 3, NOW).map(({ date, time, dose }) => ({ date, time, dose }))
      expect(got).toEqual(expected)
    })
  }

  it('término corta a série (menos de 3)', () => {
    const first = fromGenerator(base({ frequency: 'semanal', weekdays: ['sexta'] }))[0]
    const p = base({ frequency: 'semanal', weekdays: ['sexta'], end_date: first.date })
    expect(listUpcomingDoses(p, 3, NOW)).toHaveLength(1)
  })

  it('PRN e protocolo sem horário → vazio', () => {
    expect(listUpcomingDoses(base({ frequency: 'quando_necessário' }), 3, NOW)).toEqual([])
    expect(listUpcomingDoses(base({ frequency: 'semanal', weekdays: ['sexta'], time_schedule: [] }), 3, NOW)).toEqual([])
    expect(listUpcomingDoses(null, 3, NOW)).toEqual([])
  })
})

describe('117 PO-2 (core) — ocorrência em etapa nova traz a dose da etapa', () => {
  // Etapa 1 (0,25) começou há 21 dias com 28 de duração ⇒ vira etapa 2 (0,5) daqui a 7 dias:
  // a 1ª sexta (hoje 20:00) é etapa 1; as duas seguintes caem na etapa 2.
  const startedAt = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 21, 0, 0).toISOString()
  const steps = [
    { position: 1, dose: 0.25, duration_days: 28, status: 'current', started_at: startedAt, medicine_id: 'm-1' },
    { position: 2, dose: 0.5, duration_days: 28, status: 'upcoming', started_at: null, medicine_id: 'm-1' },
    { position: 3, dose: 1, duration_days: null, status: 'upcoming', started_at: null, medicine_id: 'm-1' },
  ]

  it('dose e etapa por ocorrência, iguais ao gerador', () => {
    const p = { ...base({ frequency: 'semanal', weekdays: ['sexta'] }), titration_steps: steps }
    const expected = fromGenerator(p, steps)
    const got = listUpcomingDoses(p, 3, NOW)
    expect(got.map(({ date, time, dose }) => ({ date, time, dose }))).toEqual(expected)
    expect(got.map((o) => o.dose)).toEqual([0.25, 0.5, 0.5]) // a premissa do teste vale
    expect(got.map((o) => o.stageNumber)).toEqual([1, 2, 2])
  })

  it('não atravessa troca de medicamento (fica na dose vigente, como o gerador)', () => {
    const switching = steps.map((s) => (s.position === 2 ? { ...s, medicine_id: 'm-2' } : s))
    const p = { ...base({ frequency: 'semanal', weekdays: ['sexta'] }), titration_steps: switching }
    const got = listUpcomingDoses(p, 3, NOW)
    expect(got.map((o) => o.dose)).toEqual(fromGenerator(p, switching).map((o) => o.dose))
    expect(got.every((o) => o.stageNumber === 1)).toBe(true)
  })

  it('sem escada → dose do protocolo, sem etapa', () => {
    const got = listUpcomingDoses(base({ frequency: 'semanal', weekdays: ['sexta'] }), 3, NOW)
    expect(got.every((o) => o.dose === 0.25 && o.stageNumber === null)).toBe(true)
  })
})

describe('117 PO-4 — consumptionLabel pela cadência', () => {
  it.each([
    ['diário', null, 0, 'Consumo diário'],
    ['semanal', null, 1, 'Consumo semanal'],
    ['semanal', null, 2, 'Consumo por dia de dose'],
    ['personalizado', null, 1, 'Consumo semanal'],
    ['intervalo_dias', 30, 0, 'Consumo a cada 30 dias'],
    ['intervalo_dias', 7, 0, 'Consumo a cada 7 dias'],
    ['intervalo_dias', null, 0, 'Consumo por dia de dose'],
    ['intervalo_dias', 1, 0, 'Consumo por dia de dose'],
    ['dias_alternados', null, 0, 'Consumo a cada 2 dias'],
    ['quando_necessário', null, 0, 'Consumo diário'],
    [null, null, 0, 'Consumo diário'],
  ])('%s · N=%s · dias=%s → %s', (freq, n, days, expected) => {
    expect(consumptionLabel(freq as string | null, n as number | null, days as number)).toBe(expected)
  })
})
