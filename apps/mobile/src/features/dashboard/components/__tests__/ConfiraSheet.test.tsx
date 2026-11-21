import { render, fireEvent } from '@testing-library/react-native'
import { classifyCoherence } from '@dosiq/core'
import ConfiraSheet from '../ConfiraSheet'
import { boxLabel, entryLabel, labelText, isCurrentBox } from '@dashboard/utils/setupCopy'

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native')
  return { SafeAreaView: View }
})

const TODAY = '2026-11-19'
const MOUNJARO = [5, 10, 15].map((d) => ({ d, u: 'mg/ml', lv: 0.5, dd: [] as number[], amb: false, ds: null, f: null, c: null, l: null, r: '112600202', iu: 'mg' }))
const OZEMPIC = [{ d: 1.34, u: 'mg/ml', lv: null, dd: [0.25, 0.5, 1] }]
const mj = { id: 'm1', name: 'Mounjaro', presentation: 'injetavel', dosage_per_pill: 5, dosage_unit: 'mg/ml', concentration_volume_ml: 0.5 }
const proto = (dose: number) => ({ id: 'p1', frequency: 'semanal', weekdays: ['terça'], time_schedule: ['08:00'], dosage_per_intake: dose, intake_unit: 'mg', start_date: TODAY })
const handlers = () => ({ onClose: jest.fn(), onKeep: jest.fn(), onApplyDose: jest.fn(), onPickBox: jest.fn(), onEditTreatment: jest.fn() })
const sheet = (dose: number, med: any = mj, entries: any = MOUNJARO, extra: any = {}) => {
  const p = proto(dose)
  const h = handlers()
  const r = render(
    <ConfiraSheet open protocol={p} medicine={med} verdict={classifyCoherence(p, med, entries)} entries={entries} otherTreatments={0} today={TODAY} busy={false} {...h} {...extra} />,
  )
  return { ...r, h }
}
const rowOrder = (r: any) => r.getAllByTestId(/^confira-row-/).map((n: any) => n.props.testID)

afterEach(() => jest.clearAllMocks())

describe('ConfiraSheet (AC6.4 · RC2)', () => {
  it('caixa maior que a dose ⇒ "A caixa" primeiro; remédio, fato lado a lado e pergunta pela receita/rótulo (PO 20/11)', () => {
    const r = sheet(1)
    expect(r.getByText('Mounjaro')).toBeTruthy()
    expect(r.getByText('A dose do tratamento não bate com a caixa.')).toBeTruthy()
    expect(r.getByText('2,5 mg por aplicação')).toBeTruthy()
    expect(r.getByText('0,5 mL, dose única')).toBeTruthy()
    expect(r.getByText('1 mg por aplicação')).toBeTruthy()
    expect(r.getByText('O que precisa ajustar?')).toBeTruthy()
    expect(r.getByText('Confira a receita e o rótulo da caixa.')).toBeTruthy()
    expect(rowOrder(r)).toEqual(['confira-row-box', 'confira-row-dose', 'confira-row-keep'])
    expect(r.getByText('Escolher pelo rótulo da caixa.\nAjusta o cadastro do remédio.')).toBeTruthy()
    expect(r.getByText('A receita diz 2,5 mg, a dose do rótulo.\nAjusta o tratamento.')).toBeTruthy()
    expect(r.getByText('Nada, está certo')).toBeTruthy()
    expect(r.getByText('A receita diz 1 mg mesmo.')).toBeTruthy()
  })

  it('caixa menor que a dose ⇒ "Aplico X mesmo" primeiro (DS-3)', () => {
    expect(rowOrder(sheet(5))).toEqual(['confira-row-keep', 'confira-row-box', 'confira-row-dose'])
  })

  it('"Aplico X mesmo" e "Editar o tratamento"', () => {
    const r = sheet(1)
    fireEvent.press(r.getByTestId('confira-row-keep'))
    fireEvent.press(r.getByTestId('confira-edit'))
    expect(r.h.onKeep).toHaveBeenCalled()
    expect(r.h.onEditTreatment).toHaveBeenCalled()
  })

  it('"Aplico 2,5 mg" passa pela frase de conferência antes de gravar', () => {
    const r = sheet(1)
    fireEvent.press(r.getByTestId('confira-row-dose'))
    expect(r.h.onApplyDose).not.toHaveBeenCalled()
    expect(r.getByText('A dose do tratamento passa a ser:')).toBeTruthy()
    expect(r.getByText('1 mg  →  2,5 mg por aplicação')).toBeTruthy()
    expect(r.getByText('toda terça às 08:00')).toBeTruthy()
    expect(r.getByText('A dose única inteira (0,5 mL) em cada aplicação.')).toBeTruthy()
    expect(r.getByText('Usar 2,5 mg')).toBeTruthy()
    fireEvent.press(r.getByTestId('confira-dose-confirm'))
    expect(r.h.onApplyDose).toHaveBeenCalledTimes(1)
  })

  it('"A caixa é outra": escolhe concentração do registro; só Confirmar grava (Q-1)', () => {
    const r = sheet(1, mj, MOUNJARO, { otherTreatments: 2 })
    fireEvent.press(r.getByTestId('confira-row-box'))
    expect(r.getByText('2,5 mg / 0,5 mL')).toBeTruthy()
    expect(r.getByText('Ajusta o cadastro do remédio.')).toBeTruthy()
    expect(r.getByText('Vale para todos os tratamentos deste remédio.')).toBeTruthy()
    fireEvent.press(r.getByTestId('confira-box-confirm'))
    expect(r.h.onPickBox).not.toHaveBeenCalled()
    fireEvent.press(r.getByTestId('confira-box-2'))
    fireEvent.press(r.getByTestId('confira-box-confirm'))
    expect(r.h.onPickBox).toHaveBeenCalledWith(expect.objectContaining({ d: 15, lv: 0.5 }))
  })

  it('multidose: 2ª linha vira "Corrigir a dose" e abre o form (DS-5)', () => {
    const oz = { ...mj, name: 'Ozempic', dosage_per_pill: 1.34 }
    const r = sheet(2, oz, OZEMPIC)
    expect(r.getByText('0,25 · 0,5 · 1 mg')).toBeTruthy()
    expect(r.getByText('doses da caneta')).toBeTruthy()
    fireEvent.press(r.getByTestId('confira-row-dose'))
    expect(r.h.onEditTreatment).toHaveBeenCalled()
  })

  it('uma concentração só ⇒ já marcada; ainda exige Confirmar', () => {
    const OZIVY = [{ d: 1.34, u: 'mg/ml', lv: null, dd: [] }]
    const r = sheet(0.25, { ...mj, name: 'Ozivy', dosage_per_pill: 0.4467 }, OZIVY, { initialStep: 'box' })
    expect(r.getByTestId('confira-box-0').props.accessibilityState).toEqual({ selected: true })
    expect(r.h.onPickBox).not.toHaveBeenCalled()
    fireEvent.press(r.getByTestId('confira-box-confirm'))
    expect(r.h.onPickBox).toHaveBeenCalledWith(expect.objectContaining({ d: 1.34 }))
  })

  it('registro com uma caixa só, já a cadastrada ⇒ sem "A caixa" (smoke 20/11, P6)', () => {
    const one = [{ d: 1.34, u: 'mg/ml', lv: null, dd: [0.25, 0.5, 1] }]
    const r = sheet(2.5, { ...mj, name: 'P6', dosage_per_pill: 1.34, concentration_volume_ml: null }, one)
    // Multidose: "A dose" primeiro (dose fora do mostrador é o erro provável).
    expect(rowOrder(r)).toEqual(['confira-row-dose', 'confira-row-keep'])
    // "A dose" já abre o tratamento ⇒ sem o link do rodapé.
    expect(r.queryByTestId('confira-edit')).toBeNull()
  })

  it('conc_fora: passo da caixa diz o cadastrado fora da lista (PO 20/11)', () => {
    const r = sheet(1, { ...mj, dosage_per_pill: 7, concentration_volume_ml: null }, MOUNJARO, { initialStep: 'box', verdict: { reason: 'conc_fora' } })
    expect(r.getByTestId('confira-box-current')).toBeTruthy()
    expect(r.getByText(/não está na lista/)).toBeTruthy()
  })

  it('conc_fora abre direto no passo da caixa; Voltar fecha', () => {
    const r = sheet(1, { ...mj, dosage_per_pill: 7 }, MOUNJARO, { initialStep: 'box' })
    expect(r.getByText('Qual está escrito no rótulo?')).toBeTruthy()
    fireEvent.press(r.getByTestId('confira-back'))
    expect(r.h.onClose).toHaveBeenCalled()
  })

  it('linhas acessíveis com a frase inteira; sem possessivo', () => {
    const r = sheet(1)
    expect(r.getByTestId('confira-row-box').props.accessibilityLabel).toBe('A caixa. Escolher pelo rótulo da caixa.\nAjusta o cadastro do remédio.')
    expect(JSON.stringify(r.toJSON())).not.toMatch(/\b(seu|sua|meu|minha)\b/i)
  })
})

describe('rótulos', () => {
  it('boxLabel e entryLabel', () => {
    expect(boxLabel(null)).toBe('')
    expect(entryLabel({ d: 1.34, u: 'mg/ml', lv: null } as any)).toBe('1,34 mg/mL')
  })
  it('labelText = como no rótulo; isCurrentBox marca o cadastro atual', () => {
    expect(labelText({ d: 5, u: 'mg/ml', lv: 0.5 } as any)).toBe('2,5 mg / 0,5 mL')
    expect(labelText({ d: 1.34, u: 'mg/ml', lv: null } as any)).toBe('1,34 mg/mL')
    expect(isCurrentBox({ d: 5, u: 'mg/ml', lv: 0.5 } as any, { dosage_per_pill: 5, concentration_volume_ml: 0.5 })).toBe(true)
    expect(isCurrentBox({ d: 10, u: 'mg/ml', lv: 0.5 } as any, { dosage_per_pill: 5, concentration_volume_ml: 0.5 })).toBe(false)
  })
})
