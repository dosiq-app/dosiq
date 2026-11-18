// OtpCodeField.test.tsx — spec 123 §Campo do código (PO-123-3).
// O `maxLength` nativo corta o texto ANTES do `onChangeText` (no aparelho; o RNTL não reproduz isso
// no `changeText`/`paste`). `deliver` aplica esse corte para que o teste veja o que o aparelho vê.

import React, { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import OtpCodeField, { normalizeOtp } from '../OtpCodeField'

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

function Harness({ onComplete }: { onComplete: (code: string) => void }) {
  const [value, setValue] = useState('')
  return <OtpCodeField value={value} onChange={setValue} onComplete={onComplete} />
}

function field() {
  return screen.getByLabelText('Código de 8 dígitos')
}

/** Entrega o texto como o aparelho entregaria: com o corte do `maxLength`, se houver. */
function deliver(text: string) {
  const el = field()
  const max = el.props.maxLength as number | undefined
  fireEvent.changeText(el, max === undefined ? text : text.slice(0, max))
}

describe('OtpCodeField — colar', () => {
  it.each([
    ['19971511', '19971511'],
    ['1997 1511', '19971511'],
    [' 19971511\n', '19971511'],
    ['Ou digite este código no app: 19971511', '19971511'],
    ['199715119', '19971511'],
  ])('%j ⇒ %s e dispara uma vez', (pasted, expected) => {
    const onComplete = jest.fn()
    render(<Harness onComplete={onComplete} />)
    deliver(pasted)
    expect(field().props.value).toBe(expected)
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledWith(expected)
  })

  it('colar 4 dígitos preenche e não dispara', () => {
    const onComplete = jest.fn()
    render(<Harness onComplete={onComplete} />)
    deliver('1997')
    expect(field().props.value).toBe('1997')
    expect(onComplete).not.toHaveBeenCalled()
  })
})

describe('OtpCodeField — digitar', () => {
  it('um a um até 8 não dispara (espera o botão)', () => {
    const onComplete = jest.fn()
    render(<Harness onComplete={onComplete} />)
    let typed = ''
    for (const d of '19971511') {
      typed += d
      deliver(typed)
    }
    expect(field().props.value).toBe('19971511')
    expect(onComplete).not.toHaveBeenCalled()
  })
})

describe('OtpCodeField — contrato', () => {
  it('um campo só, com dica de código de uso único e teclado numérico', () => {
    render(<Harness onComplete={jest.fn()} />)
    const el = field()
    expect(el.props.maxLength).toBeUndefined()
    expect(el.props.textContentType).toBe('oneTimeCode')
    expect(el.props.autoComplete).toBe('one-time-code')
    expect(el.props.keyboardType).toBe('number-pad')
    expect(screen.getAllByLabelText('Código de 8 dígitos')).toHaveLength(1)
  })

  it('normalizeOtp: só dígitos, 8 primeiros, entrada vazia segura', () => {
    expect(normalizeOtp('abc')).toBe('')
    expect(normalizeOtp('')).toBe('')
    expect(normalizeOtp('12a34 56-78 90')).toBe('12345678')
  })
})
