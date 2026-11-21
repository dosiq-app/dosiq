// spec 120 D-2/D-5/D-7 — casca dos avisos da Hoje (extraída do card da 068).
import React from 'react'
import { Text } from 'react-native'
import { render, fireEvent } from '@testing-library/react-native'
import PromoCardShell from '../PromoCardShell'
import OemBatteryAssistantCard from '@features/oemAssistant/components/OemBatteryAssistantCard'

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

function renderShell(loading = false) {
  const onPrimary = jest.fn()
  const onSecondary = jest.fn()
  const utils = render(
    <PromoCardShell
      icon={<Text>i</Text>}
      title="Título"
      subtitle="Subtítulo"
      primary={{ label: 'Ligar', accessibilityLabel: 'Ligar lembretes', onPress: onPrimary, loading }}
      secondary={{ label: 'Agora não', accessibilityLabel: 'Agora não', onPress: onSecondary }}
    />
  )
  return { ...utils, onPrimary, onSecondary }
}

describe('PromoCardShell', () => {
  it('rótulo único título + subtítulo para o leitor de tela (D-7)', () => {
    const { getByLabelText } = renderShell()
    expect(getByLabelText('Título. Subtítulo')).toBeTruthy()
  })

  it('aciona as duas ações', () => {
    const { getByLabelText, onPrimary, onSecondary } = renderShell()
    fireEvent.press(getByLabelText('Ligar lembretes'))
    fireEvent.press(getByLabelText('Agora não'))
    expect(onPrimary).toHaveBeenCalledTimes(1)
    expect(onSecondary).toHaveBeenCalledTimes(1)
  })

  it('carregando ⇒ CTA sem rótulo e desabilitado (D-5)', () => {
    const { getByLabelText, queryByText, onPrimary } = renderShell(true)
    expect(queryByText('Ligar')).toBeNull()
    fireEvent.press(getByLabelText('Ligar lembretes'))
    expect(onPrimary).not.toHaveBeenCalled()
  })
})

// 120 C · RC2-C DC-1/DC-2: uma casca no slot de alerta — tom por situação, dispensa por ícone.
describe('PromoCardShell — tom e dispensa (DC-1/DC-2)', () => {
  const { colors } = jest.requireActual('@shared/styles/tokens')
  const bgOf = (el: any) => [].concat(el.props.style).reduce((acc: any, s: any) => ({ ...acc, ...(s || {}) }), {}).backgroundColor

  it.each([
    [undefined, colors.status.warningLight],
    ['warning', colors.status.warningLight],
    ['error', colors.status.errorLight],
    ['neutral', colors.bg.card],
  ])('tone=%s ⇒ fundo %s (mesma casca)', (tone, bg) => {
    const { getByTestId } = render(
      <PromoCardShell testID="shell" tone={tone as any} icon={<Text>i</Text>} title="T" subtitle="S"
        primary={{ label: 'A', accessibilityLabel: 'A', onPress: jest.fn() }} />
    )
    expect(bgOf(getByTestId('shell'))).toBe(bg)
  })

  it('sem secundário: só o CTA primário', () => {
    const { queryByText } = render(
      <PromoCardShell icon={<Text>i</Text>} title="T" subtitle="S"
        primary={{ label: 'Registrar compra', accessibilityLabel: 'Registrar compra', onPress: jest.fn() }} />
    )
    expect(queryByText('Registrar compra')).toBeTruthy()
    expect(queryByText('Agora não')).toBeNull()
  })

  it('dispensa por ícone com rótulo próprio', () => {
    const onDismiss = jest.fn()
    const { getByLabelText } = render(
      <PromoCardShell icon={<Text>i</Text>} title="T" subtitle="S"
        primary={{ label: 'A', accessibilityLabel: 'A', onPress: jest.fn() }}
        dismiss={{ accessibilityLabel: 'Dispensar aviso de estoque de Glifage', onPress: onDismiss }} />
    )
    fireEvent.press(getByLabelText('Dispensar aviso de estoque de Glifage'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})

describe('OemBatteryAssistantCard sobre a casca (guard PO-120-9)', () => {
  it('mantém título, subtítulos e os dois botões da 068', () => {
    const onAdjust = jest.fn()
    const onDismiss = jest.fn()
    const { getByText, rerender } = render(<OemBatteryAssistantCard reason="restricted" onAdjust={onAdjust} onDismiss={onDismiss} />)
    expect(getByText('O alarme pode não tocar neste aparelho')).toBeTruthy()
    expect(getByText(/segurando o Dosiq em segundo plano/)).toBeTruthy()
    fireEvent.press(getByText('Ajustar'))
    fireEvent.press(getByText('Não mostrar de novo'))
    expect(onAdjust).toHaveBeenCalled()
    expect(onDismiss).toHaveBeenCalled()
    rerender(<OemBatteryAssistantCard reason="battery" onAdjust={onAdjust} onDismiss={onDismiss} />)
    expect(getByText(/economia de bateria/)).toBeTruthy()
  })
})

describe('foco da Hoje (emenda PO smoke 125, 20/11)', () => {
  const bgOf = (el: any) => Object.assign({}, ...[el.props.style].flat(Infinity).filter(Boolean)).backgroundColor
  const shell = (props: any) => render(<PromoCardShell testID="s" icon={<Text>i</Text>} title="t" subtitle="s" primary={{ label: 'a', accessibilityLabel: 'a', onPress: jest.fn() }} {...props} />)
  it('fora do foco: aviso fica branco (tom vai para a borda)', () => {
    const { colors } = jest.requireActual('@shared/styles/tokens')
    expect(bgOf(shell({ tone: 'warning', emphasis: false }).getByTestId('s'))).toBe(colors.bg.card)
    expect(bgOf(shell({ tone: 'warning', emphasis: true }).getByTestId('s'))).toBe(colors.status.warningLight)
  })
  it('erro mantém o fundo mesmo fora do foco', () => {
    const { colors } = jest.requireActual('@shared/styles/tokens')
    expect(bgOf(shell({ tone: 'error', emphasis: false }).getByTestId('s'))).toBe(colors.status.errorLight)
  })
})

describe('botão fora do foco segue o tom (PO 20/11)', () => {
  it('aviso: contorno âmbar; neutro: verde', () => {
    const { colors } = jest.requireActual('@shared/styles/tokens')
    const flat = (el: any) => Object.assign({}, ...[el.props.style].flat(Infinity).filter(Boolean))
    const mk = (tone: any) => render(<PromoCardShell icon={<Text>i</Text>} title="t" subtitle="s" tone={tone} emphasis={false} primary={{ label: 'Registrar compra', accessibilityLabel: 'a', onPress: jest.fn() }} />)
    expect(flat(mk('warning').getByText('Registrar compra')).color).toBe(colors.status.warning)
    expect(flat(mk('neutral').getByText('Registrar compra')).color).toBe(colors.brand.primary)
  })
})
