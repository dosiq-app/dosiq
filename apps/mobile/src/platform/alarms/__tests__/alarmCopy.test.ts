// 120 T-A13c — texto do alarme local espelha o push da fatia B (copy-matrix-B §2–4).
import { getAlarmCopy } from '../alarmCopy'

const NBSP = ' '
const plain = (c: { title: string; body: string }) => ({ title: c.title, body: c.body.replaceAll(NBSP, ' ') })

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('getAlarmCopy (120 A)', () => {
  it('2.1 comprimido ⇒ "💊 Essencial: tomar X" / "50 mg · 08:00"', () => {
    const data = { scheduledTime: '08:00', presentation: 'comprimido', quantityTaken: '1', dosagePerPill: '50', dosageUnit: 'mg', intakeUnit: '' }
    expect(plain(getAlarmCopy({ medicineName: 'Losartana', data }))).toEqual({ title: '💊 Essencial: tomar Losartana', body: '50 mg · 08:00' })
  })

  it('2.2 injetável ⇒ "aplicar", líquido em UI', () => {
    const data = { scheduledTime: '22:00', presentation: 'injetavel', quantityTaken: '10', dosagePerPill: '100', dosageUnit: 'ui/ml', intakeUnit: 'UI' }
    expect(plain(getAlarmCopy({ medicineName: 'Insulina', data }))).toEqual({ title: '💊 Essencial: aplicar Insulina', body: '10 UI · 22:00' })
  })

  it('2.3 injetável semanal ⇒ sem o local (alarme local não lê medicine_logs)', () => {
    const data = { scheduledTime: '08:00', presentation: 'injetavel', quantityTaken: '1', dosagePerPill: '2.5', dosageUnit: 'mg' }
    const c = plain(getAlarmCopy({ medicineName: 'Mounjaro', data }))
    expect(c).toEqual({ title: '💊 Essencial: aplicar Mounjaro', body: '2,5 mg · 08:00' })
    expect(c.body).not.toMatch(/última/)
  })

  it('3.2 plano essencial ⇒ "📂 Plano essencial" / plano · hora · lista', () => {
    const groupedDoses = JSON.stringify([
      { medicineName: 'Losartana', dosagePerIntake: 1, dosagePerPill: 50, dosageUnit: 'mg', treatmentPlanName: 'Pressão' },
      { medicineName: 'Metformina', dosagePerIntake: 1, dosagePerPill: 500, dosageUnit: 'mg', treatmentPlanName: 'Pressão' },
    ])
    expect(plain(getAlarmCopy({ data: { isGrouped: 'true', groupedDoses, scheduledTime: '08:00' } }))).toEqual({
      title: '📂 Plano essencial',
      body: 'Pressão · 08:00 · Losartana 50 mg · Metformina 500 mg',
    })
  })

  it('várias doses sem plano comum ⇒ "📋 Doses essenciais" / hora · lista', () => {
    const groupedDoses = JSON.stringify([
      { medicineName: 'Losartana', dosagePerIntake: 1, dosagePerPill: 50, dosageUnit: 'mg' },
      { medicineName: 'Vitamina D', dosagePerIntake: 2, dosagePerPill: 25, dosageUnit: 'mcg' },
    ])
    expect(plain(getAlarmCopy({ data: { isGrouped: 'true', groupedDoses, scheduledTime: '08:00' } }))).toEqual({
      title: '📋 Doses essenciais',
      body: '08:00 · Losartana 50 mg · Vitamina D 2 × 25 mcg',
    })
  })

  it('grupo de 1 dose usa o verbo da apresentação', () => {
    const groupedDoses = JSON.stringify([{ medicineName: 'Mounjaro', presentation: 'injetavel', dosagePerIntake: 1, dosagePerPill: 2.5, dosageUnit: 'mg' }])
    expect(getAlarmCopy({ data: { isGrouped: 'true', groupedDoses, scheduledTime: '08:00' } }).title).toBe('💊 Essencial: aplicar Mounjaro')
  })

  it('mais de 10 ⇒ "e mais N"', () => {
    const groupedDoses = JSON.stringify(Array.from({ length: 12 }, (_, i) => ({ medicineName: `R${i}` })))
    expect(getAlarmCopy({ data: { isGrouped: 'true', groupedDoses, scheduledTime: '08:00' } }).body).toMatch(/ · e mais 2$/)
  })

  it('degenerados: sem nome, sem dose, JSON inválido, apresentação vazia ⇒ sem possessivo, verbo "tomar"', () => {
    expect(getAlarmCopy({ data: { scheduledTime: '08:00' } })).toEqual({ title: '💊 Hora da dose', body: '08:00' })
    expect(getAlarmCopy({ data: { isGrouped: 'true', groupedDoses: '{bad', scheduledTime: '08:00' } })).toEqual({ title: '💊 Hora da dose', body: 'Está na hora da dose.' })
    expect(getAlarmCopy({ medicineName: 'X', data: { presentation: '', quantityTaken: '', dosagePerPill: '' } })).toEqual({ title: '💊 Essencial: tomar X', body: '' })
    for (const c of [getAlarmCopy({}), getAlarmCopy({ data: { isGrouped: 'true', groupedDoses: '[]' } })]) {
      expect(`${c.title} ${c.body}`).not.toMatch(/\bseu\b|\bsua\b|\bsuas\b|\bseus\b/i)
    }
  })
})
