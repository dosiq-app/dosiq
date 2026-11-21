import { render, fireEvent } from '@testing-library/react-native'
import { classifyCoherence } from '@dosiq/core'
import SetupCard from '../SetupCard'
import { scheduleQuestion } from '@dashboard/utils/setupCopy'

const TODAY = '2026-11-19' // quinta
const MOUNJARO = [5, 10, 15, 20, 25, 30].map((d) => ({ d, u: 'mg/ml', lv: 0.5, dd: [] as number[] }))
const OZEMPIC = [{ d: 1.34, u: 'mg/ml', lv: null, dd: [0.25, 0.5, 1] }]
const mj = { id: 'm1', name: 'Mounjaro', presentation: 'injetavel', dosage_per_pill: 5, dosage_unit: 'mg/ml', concentration_volume_ml: 0.5 }
const weekly = { id: 'p1', medicine_id: 'm1', frequency: 'semanal', weekdays: ['terça'], time_schedule: ['08:00'], dosage_per_intake: 2.5, intake_unit: 'mg', start_date: TODAY, medicine: mj }
const handlers = () => ({
  onAdjust: jest.fn(), onDefine: jest.fn(), onConfirmSchedule: jest.fn(), onChangeSchedule: jest.fn(),
  onCheck: jest.fn(), onUseUnit: jest.fn(), onPickBox: jest.fn(),
})
const base = { today: TODAY, nowTime: '10:00', scheduleConfirmed: false }
const POSSESSIVE = /\b(seu|sua|seus|suas|meu|minha)\b/i

afterEach(() => jest.clearAllMocks())

describe('SetupCard', () => {
  it('cadastrado semanal pergunta dia/hora; Sim e Mudar chamam (AC6.2)', () => {
    const h = handlers()
    const { getByText, getByTestId, queryByText } = render(
      <SetupCard card={{ kind: 'cadastrado', protocolId: 'p1' }} protocol={weekly} medicine={mj} {...base} {...h} />,
    )
    expect(getByText('Confira o tratamento')).toBeTruthy()
    expect(getByText('injetável')).toBeTruthy()
    expect(getByText('A aplicação é toda terça às 08:00?')).toBeTruthy()
    expect(queryByText('Ajustar')).toBeNull()
    fireEvent.press(getByTestId('setup-schedule-yes'))
    fireEvent.press(getByTestId('setup-schedule-change'))
    expect(h.onConfirmSchedule).toHaveBeenCalledTimes(1)
    expect(h.onChangeSchedule).toHaveBeenCalledTimes(1)
  })

  it('confirmado ⇒ "Próxima: …" e Ajustar (AC6.1)', () => {
    const h = handlers()
    const { getByText, getByTestId } = render(
      <SetupCard card={{ kind: 'cadastrado', protocolId: 'p1' }} protocol={weekly} medicine={mj} {...base} scheduleConfirmed {...h} />,
    )
    expect(getByText('2,5 mg por aplicação · toda terça às 08:00')).toBeTruthy()
    expect(getByText('Próxima: terça, 24/11 às 08:00')).toBeTruthy()
    fireEvent.press(getByTestId('setup-adjust'))
    expect(h.onAdjust).toHaveBeenCalled()
  })

  it('diário não pergunta dia/hora', () => {
    const daily = { ...weekly, frequency: 'diário', weekdays: [] }
    const { queryByTestId, getByTestId } = render(
      <SetupCard card={{ kind: 'cadastrado', protocolId: 'p1' }} protocol={daily} medicine={mj} {...base} {...handlers()} />,
    )
    expect(queryByTestId('setup-schedule-yes')).toBeNull()
    expect(getByTestId('setup-adjust')).toBeTruthy()
  })

  it('falta 1 passo abre o passo do tratamento (AC6.3)', () => {
    const h = handlers()
    const { getByText, getByTestId } = render(
      <SetupCard card={{ kind: 'falta', medicineId: 'm9' }} protocol={null} medicine={{ id: 'm9', name: 'Losartana' }} {...base} {...h} />,
    )
    expect(getByText('Losartana: quando tomar?')).toBeTruthy()
    expect(getByText('O remédio está cadastrado. Falta definir quando e quanto você usa.')).toBeTruthy()
    fireEvent.press(getByTestId('setup-define'))
    expect(h.onDefine).toHaveBeenCalled()
  })

  it('falta 1 passo de injetável diz "aplicar"', () => {
    const { getByText } = render(
      <SetupCard card={{ kind: 'falta', medicineId: 'm9' }} protocol={null} medicine={{ id: 'm9', name: 'Wegovy', presentation: 'injetavel' }} {...base} {...handlers()} />,
    )
    expect(getByText('Wegovy: quando aplicar?')).toBeTruthy()
  })

  it('confira dose: os dois números e [Conferir] (AC6.4)', () => {
    const p = { ...weekly, dosage_per_intake: 1 }
    const v = classifyCoherence(p, mj, MOUNJARO) as any
    const h = handlers()
    const { getByText, getByTestId, toJSON } = render(
      <SetupCard card={{ kind: 'confira', protocolId: 'p1', verdict: v }} protocol={p} medicine={mj} {...base} {...h} />,
    )
    expect(getByText('Na caixa: 2,5 mg por aplicação')).toBeTruthy()
    expect(getByText('No tratamento: 1 mg por aplicação')).toBeTruthy()
    fireEvent.press(getByTestId('setup-check'))
    expect(h.onCheck).toHaveBeenCalled()
    expect(JSON.stringify(toJSON())).not.toMatch(POSSESSIVE)
  })

  it('multidose mostra as doses da caneta (DS-5)', () => {
    const oz = { ...mj, name: 'Ozempic', dosage_per_pill: 1.34 }
    const p = { ...weekly, dosage_per_intake: 2 }
    const v = classifyCoherence(p, oz, OZEMPIC) as any
    const { getByText } = render(<SetupCard card={{ kind: 'confira', protocolId: 'p1', verdict: v }} protocol={p} medicine={oz} {...base} {...handlers()} />)
    expect(getByText('Doses da caneta: 0,25 · 0,5 · 1 mg')).toBeTruthy()
  })

  it('unidade: [Usar 2,5 mg] só quando coerente; sempre [Ajustar tudo] (AC6.4b)', () => {
    const ok = { ...weekly, intake_unit: 'gotas' }
    const h = handlers()
    const r1 = render(<SetupCard card={{ kind: 'confira', protocolId: 'p1', verdict: classifyCoherence(ok, mj, MOUNJARO) as any }} protocol={ok} medicine={mj} {...base} {...h} />)
    expect(r1.getByText('Injetável não se mede em gotas. Confira a receita.')).toBeTruthy()
    fireEvent.press(r1.getByText('Usar 2,5 mg'))
    expect(h.onUseUnit).toHaveBeenCalled()
    const bad = { ...weekly, dosage_per_intake: 7, intake_unit: 'gotas' }
    const r2 = render(<SetupCard card={{ kind: 'confira', protocolId: 'p1', verdict: classifyCoherence(bad, mj, MOUNJARO) as any }} protocol={bad} medicine={mj} {...base} {...handlers()} />)
    expect(r2.queryByTestId('setup-use-unit')).toBeNull()
    expect(r2.getByTestId('setup-adjust-all')).toBeTruthy()
  })

  it('concentração fora do registro: um botão só (AC6.4d)', () => {
    const oz = { ...mj, name: 'Ozempic', dosage_per_pill: 15, concentration_volume_ml: null }
    const v = classifyCoherence(weekly, oz, OZEMPIC) as any
    const h = handlers()
    const { getByText, getByTestId, queryByTestId } = render(<SetupCard card={{ kind: 'confira', protocolId: 'p1', verdict: v }} protocol={weekly} medicine={oz} {...base} {...h} />)
    expect(getByText('Cadastrado: 15 mg/mL')).toBeTruthy()
    expect(getByText('Essa concentração não está na lista da ANVISA para Ozempic.')).toBeTruthy()
    expect(getByText('Escolher pelo rótulo')).toBeTruthy()
    expect(queryByTestId('setup-check')).toBeNull()
    fireEvent.press(getByTestId('setup-pick-box'))
    expect(h.onPickBox).toHaveBeenCalled()
  })
})

describe('scheduleQuestion', () => {
  it('sábado/domingo masculino; comprimido diz "A dose"; outras cadências pela próxima', () => {
    expect(scheduleQuestion({ ...weekly, weekdays: ['sábado'] }, null)).toBe('A aplicação é todo sábado às 08:00?')
    expect(scheduleQuestion({ ...weekly, medicine: { presentation: 'comprimido' } }, null)).toBe('A dose é toda terça às 08:00?')
    expect(scheduleQuestion({ ...weekly, frequency: 'dias_alternados' }, 'Próxima: amanhã às 08:00')).toBe('A próxima é amanhã às 08:00?')
    expect(scheduleQuestion({ ...weekly, frequency: 'intervalo_dias' }, null)).toBeNull()
  })
})
