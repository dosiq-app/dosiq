// FullScreenGuideSheet — 128 A · PO-A5 · C-6: só as chaves que faltam, com estado; texto da marca; copy sem possessivo.
import React from 'react'
import { describe, it, expect, afterEach } from '@jest/globals'
import { render, fireEvent } from '@testing-library/react-native'
import FullScreenGuideSheet from '../FullScreenGuideSheet'

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

const props = (over = {}) => ({
  visible: true,
  family: 'generic' as const,
  rows: [{ id: 'fullScreen' as const, state: 'pending' as const }],
  recheckResult: null,
  onOpenSettings: jest.fn(),
  onDismiss: jest.fn(),
  ...over,
})

describe('FullScreenGuideSheet', () => {
  it('pendente: título de ação, CTA abre os Ajustes, "Agora não" dispensa', () => {
    const p = props()
    const { getByText, getByLabelText } = render(<FullScreenGuideSheet {...p} />)
    expect(getByText('Alarme na tela bloqueada')).toBeTruthy()
    expect(getByLabelText(/Liberar o alarme em tela cheia, pendente: Nas notificações do app/)).toBeTruthy()
    fireEvent.press(getByLabelText('Abrir configurações'))
    expect(p.onOpenSettings).toHaveBeenCalled()
    fireEvent.press(getByLabelText('Agora não'))
    expect(p.onDismiss).toHaveBeenCalled()
  })

  it('🔴 C-10: toque fora do sheet dispensa (como "Agora não")', () => {
    const p = props()
    const { getByTestId } = render(<FullScreenGuideSheet {...p} />)
    fireEvent.press(getByTestId('full-screen-backdrop', { includeHiddenElements: true }))
    expect(p.onDismiss).toHaveBeenCalledTimes(1)
  })

  it('manual (null): nem ✓ nem ○ — rótulo "confira manualmente" (boundary PO-A5)', () => {
    const { getByLabelText, queryByLabelText, getByText } = render(
      <FullScreenGuideSheet {...props({ rows: [{ id: 'fullScreen', state: 'manual' }] })} />
    )
    expect(getByLabelText(/Liberar o alarme em tela cheia, confira manualmente/)).toBeTruthy()
    expect(queryByLabelText(/, pendente/)).toBeNull()
    expect(getByText(/Confira estes ajustes/)).toBeTruthy()
  })

  it('concedido na volta: "Pronto…" anunciado, item feito, sem CTA, "Fechar"', () => {
    const { getByText, getByLabelText, queryByLabelText, getByTestId } = render(
      <FullScreenGuideSheet {...props({ rows: [{ id: 'fullScreen', state: 'done' }], recheckResult: 'granted' })} />
    )
    expect(getByText('Pronto — o alarme aparece na tela bloqueada.')).toBeTruthy()
    expect(getByTestId('full-screen-result').props.accessibilityLiveRegion).toBe('polite')
    expect(getByLabelText('Alarme em tela cheia liberado, feito')).toBeTruthy()
    expect(queryByLabelText('Abrir configurações')).toBeNull()
    expect(getByLabelText('Fechar')).toBeTruthy()
  })

  it('ainda pendente na volta: diz o que falta e mantém o CTA', () => {
    const { getByText, getByLabelText } = render(<FullScreenGuideSheet {...props({ recheckResult: 'still_pending' })} />)
    expect(getByText('Ainda falta liberar o item marcado abaixo.')).toBeTruthy()
    expect(getByLabelText('Abrir configurações')).toBeTruthy()
  })

  it('🔴 C-6 Xiaomi: só as chaves que faltam, com o texto de "Outras permissões"', () => {
    const { getByLabelText, queryByLabelText } = render(
      <FullScreenGuideSheet {...props({ family: 'xiaomi', rows: [{ id: 'lockScreen', state: 'pending' }] })} />
    )
    expect(getByLabelText(/Mostrar o alarme na tela de bloqueio, pendente: Em "Outras permissões"/)).toBeTruthy()
    // tela cheia ✓ não aparece; pop-up e "uma vez por aparelho" não existem mais
    expect(queryByLabelText(/tela cheia/)).toBeNull()
    expect(queryByLabelText(/pop-up/i)).toBeNull()
  })

  it('copy sem possessivo, sem "protocolo", sem "fechar esta janela"', () => {
    const { toJSON } = render(
      <FullScreenGuideSheet
        {...props({ family: 'xiaomi', rows: [{ id: 'fullScreen', state: 'pending' }, { id: 'lockScreen', state: 'pending' }] })}
      />
    )
    const text = JSON.stringify(toJSON())
    expect(text).not.toMatch(/\bseu\b|\bsua\b|protocolo|fechar esta janela/i)
  })
})
