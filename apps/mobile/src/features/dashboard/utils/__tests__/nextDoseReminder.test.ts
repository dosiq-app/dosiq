// 120 D-3/D-4/D-9 — próxima dose com lembrete e o texto do push dela. Relógio: qua, 30 set 2026, 12:00.
import { nextDoseReminder } from '../nextDoseReminder'

const NOW = new Date(2026, 8, 30, 12, 0, 0)
const NBSP = ' '
const plain = (s: string) => s.replaceAll(NBSP, ' ')

const daily = (over: any = {}) => ({
  name: 'Losartana', active: true, frequency: 'diário', time_schedule: ['16:00'], start_date: '2026-09-01', end_date: null,
  dosage_per_intake: 1, intake_unit: null,
  medicine: { name: 'Losartana', presentation: 'comprimido', dosage_per_pill: 50, dosage_unit: 'mg' },
  ...over,
})
const weeklyInj = (over: any = {}) => ({
  name: 'Mounjaro', active: true, frequency: 'semanal', weekdays: ['friday'], time_schedule: ['08:00'], start_date: '2026-09-01', end_date: null,
  dosage_per_intake: 1, intake_unit: null,
  medicine: { name: 'Mounjaro', presentation: 'injetavel', dosage_per_pill: 2.5, dosage_unit: 'mg' },
  ...over,
})

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('nextDoseReminder (120)', () => {
  it('diário comprimido ⇒ "Hora de tomar" + dose · hora', () => {
    const r = nextDoseReminder([daily()], NOW)!
    expect(r.title).toBe('Hora de tomar Losartana')
    expect(plain(r.body)).toBe('50 mg · 16:00')
    expect(r.when).toBe('hoje')
  })

  it('injetável semanal ⇒ "Dia da aplicação de", sem o local', () => {
    const r = nextDoseReminder([weeklyInj()], NOW)!
    expect(r.title).toBe('Dia da aplicação de Mounjaro')
    expect(plain(r.body)).toBe('2,5 mg · 08:00')
    expect(r.body).not.toMatch(/última/)
  })

  it('essencial ⇒ "💊 Essencial: aplicar"', () => {
    expect(nextDoseReminder([weeklyInj({ critical_alarm: true })], NOW)!.title).toBe('💊 Essencial: aplicar Mounjaro')
  })

  it('escolhe a mais cedo e ignora quem não gera lembrete', () => {
    const prn = daily({ name: 'Dipirona', frequency: 'quando_necessário', medicine: { name: 'Dipirona' } })
    const paused = daily({ active: false, medicine: { name: 'Pausado' } })
    expect(nextDoseReminder([weeklyInj(), prn, paused, daily()], NOW)!.medicineName).toBe('Losartana')
  })

  it('apresentação ausente ⇒ "tomar"; sem dose ⇒ corpo só com a hora', () => {
    const r = nextDoseReminder([daily({ dosage_per_intake: null, medicine: { name: 'X' } })], NOW)!
    expect(r.title).toBe('Hora de tomar X')
    expect(r.body).toBe('16:00')
  })

  it('nada com lembrete ⇒ null', () => {
    expect(nextDoseReminder([], NOW)).toBeNull()
    expect(nextDoseReminder(null, NOW)).toBeNull()
    expect(nextDoseReminder([daily({ time_schedule: [] })], NOW)).toBeNull()
  })
})
