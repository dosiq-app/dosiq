// MeasureRow — 124 B · PO-8: a L2 segue a medida do tratamento selecionado (peso · glicemia · PA · nenhum).
import { describe, it, expect, afterEach, beforeEach } from '@jest/globals'
import { fireEvent, render, waitFor } from '@testing-library/react-native'

const mockCreate = jest.fn()
const mockList = jest.fn()
jest.mock('@measures/services/measuresRepo', () => ({
  measuresRepo: { create: (...a: any[]) => mockCreate(...a), list: (...a: any[]) => mockList(...a) },
}))
jest.mock('@platform/analytics/productAnalytics', () => ({ logEvent: jest.fn() }))
jest.mock('@measures/components/WeightLineChart', () => () => null)
jest.mock('@measures/components/ScatterTrend', () => {
  const { Text } = jest.requireActual('react-native') as any
  return (p: any) => <Text testID="scatter">{`${p.unit}|${p.isPa ? 'pa' : 'single'}|${p.items.length}`}</Text>
})

import MeasureRow from '../MeasureRow'
import { biomarkerLastText } from '../BiomarkerRow'
import { formatLocalDate, getNow, shiftDay } from '@dosiq/core'

const TZ = 'America/Sao_Paulo'
const TODAY = formatLocalDate(getNow())
const weight: any = {
  open: false, onToggle: () => {}, points: [], last: null, lastDay: null, today: TODAY, yesterday: shiftDay(TODAY, -1),
  windowSel: '30d', onWindow: () => {}, windowFrom: shiftDay(TODAY, -29), loading: false, error: null, onRetry: () => {}, onSaved: () => {},
}
// meio-dia local de N dias atrás (dia local nunca vira em GMT-3)
const isoDaysAgo = (n: number) => `${shiftDay(TODAY, -n)}T15:00:00.000Z`

function renderRow(measure: any, open = true) {
  return render(<MeasureRow measure={measure} weight={weight} open={open} onToggle={() => {}} timezone={TZ} today={TODAY} />)
}

beforeEach(() => {
  mockList.mockResolvedValue([])
  mockCreate.mockResolvedValue({})
})

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('MeasureRow', () => {
  it('peso ⇒ linha de peso da 121, sem ler outra medida', () => {
    const { getByTestId } = renderRow('peso')
    expect(getByTestId('week-row-peso')).toBeTruthy()
    expect(mockList).not.toHaveBeenCalled()
  })

  it('nenhum ⇒ L2 some (C-4)', () => {
    expect(renderRow('nenhum').toJSON()).toBeNull()
  })

  it('glicemia com 3 dias na semana ⇒ dispersão do ScatterTrend (C-5)', async () => {
    mockList.mockResolvedValue([0, 1, 2].map((n) => ({ value: 110 + n, measured_at: isoDaysAgo(n) })))
    const { findByTestId, getByTestId } = renderRow('glicemia')
    expect((await findByTestId('scatter')).props.children).toBe('mg/dL|single|3')
    expect(getByTestId('biomarker-row-summary').props.children).toBe('110 mg/dL · hoje')
    expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ type: 'glicemia' }))
  })

  it('PA com 2 dias ⇒ 2 séries; resumo sistólica/diastólica', async () => {
    mockList.mockResolvedValue([{ value: 120, value_secondary: 80, measured_at: isoDaysAgo(1) }, { value: 125, value_secondary: 82, measured_at: isoDaysAgo(3) }])
    const { findByTestId, getByTestId } = renderRow('pressao_arterial')
    expect((await findByTestId('scatter')).props.children).toBe('mmHg|pa|2')
    expect(getByTestId('biomarker-row-summary').props.children).toBe('120/80 mmHg · ontem')
  })

  it('poucos dias ⇒ diz só o que falta, sem gráfico', async () => {
    mockList.mockResolvedValue([{ value: 100, measured_at: isoDaysAgo(0) }])
    const { findByTestId, queryByTestId } = renderRow('glicemia')
    expect(await findByTestId('biomarker-row-missing')).toBeTruthy()
    expect(queryByTestId('scatter')).toBeNull()
  })

  it('erro de leitura ⇒ erro com tentar de novo, nunca vazio', async () => {
    mockList.mockRejectedValue(new Error('x'))
    const { findByTestId, queryByText } = renderRow('glicemia')
    expect(await findByTestId('biomarker-row-error')).toBeTruthy()
    expect(queryByText('Nenhuma glicemia ainda')).toBeNull()
  })

  it('sem medida ⇒ campo direto; PA grava sistólica e diastólica pela casca com today_inline', async () => {
    const s = renderRow('pressao_arterial', false)
    await s.findByTestId('biomarker-row-field')
    fireEvent.changeText(s.getByLabelText('Sistólica em mmHg'), '120')
    fireEvent.changeText(s.getByLabelText('Diastólica em mmHg'), '80')
    fireEvent.press(s.getByTestId('biomarker-row-save'))
    await waitFor(() => expect(mockCreate).toHaveBeenCalled())
    const [record, meta] = mockCreate.mock.calls[0] as any[]
    expect(record).toEqual(expect.objectContaining({ type: 'pressao_arterial', value: 120, value_secondary: 80, unit: 'mmHg' }))
    expect(meta).toEqual({ entry_point: 'today_inline' })
  })

  it('glicemia zero ⇒ mensagem, nada gravado (só peso tem faixa no Zod do core)', async () => {
    const s = renderRow('glicemia', false)
    await s.findByTestId('biomarker-row-field')
    fireEvent.changeText(s.getByLabelText('Valor da medida em mg/dL'), '0')
    fireEvent.press(s.getByTestId('biomarker-row-save'))
    expect(await s.findByText('Digite um valor válido maior que zero.')).toBeTruthy()
    expect(mockCreate).not.toHaveBeenCalled()
  })
})

describe('BiomarkerRow — RC6 #977', () => {
  it('carga antiga que volta depois da recarga não sobrescreve a lista nova', async () => {
    let resolveOld: (v: any) => void = () => {}
    mockList.mockImplementationOnce(() => new Promise((r) => { resolveOld = r }))
    mockList.mockResolvedValueOnce([{ value: 130, measured_at: isoDaysAgo(0) }])
    const s = render(<MeasureRow measure="glicemia" weight={weight} open={false} onToggle={() => {}} timezone={TZ} today={TODAY} reloadKey={1} />)
    s.rerender(<MeasureRow measure="glicemia" weight={weight} open={false} onToggle={() => {}} timezone={TZ} today={TODAY} reloadKey={2} />)
    await waitFor(() => expect(s.getByTestId('biomarker-row-summary').props.children).toBe('130 mg/dL · hoje'))
    resolveOld([{ value: 90, measured_at: isoDaysAgo(3) }])
    await new Promise((r) => setTimeout(r, 0))
    expect(s.getByTestId('biomarker-row-summary').props.children).toBe('130 mg/dL · hoje')
  })
})

describe('biomarkerLastText', () => {
  it('null sem medida; vírgula decimal', () => {
    expect(biomarkerLastText('glicemia', null, TZ, TODAY)).toBeNull()
    expect(biomarkerLastText('glicemia', { value: 98.5, measured_at: isoDaysAgo(0) }, TZ, TODAY)).toBe('98,5 mg/dL · hoje')
  })
})
