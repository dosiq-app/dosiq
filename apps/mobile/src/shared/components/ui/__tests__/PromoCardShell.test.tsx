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
