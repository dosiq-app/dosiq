// spec 120 C · US9 (PO-120-16/17) · RC2-C DC-3/DC-4/DC-5/DC-7 — ações da agenda por estado.
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import DoseTimelineCard from '../DoseTimelineCard'

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

const dose = (timelineStatus: string, over: any = {}) => ({
  instanceId: 'i1', timelineStatus, scheduledTime: '08:00', scheduledFor: '2026-11-14T11:00:00Z',
  medicineName: 'Glifage', medicine: { name: 'Nome Vivo' }, protocol: { id: 'p1', dosage_per_intake: 1 }, ...over,
})

describe('DoseTimelineCard — ações por estado', () => {
  it('na janela ⇒ Tomar + Pular', () => {
    const onRegister = jest.fn(); const onSkip = jest.fn()
    const { getByLabelText } = render(<DoseTimelineCard dose={dose('PROXIMA')} onRegister={onRegister} onSkip={onSkip} />)
    fireEvent.press(getByLabelText('Tomar dose de Glifage das 08:00'))
    fireEvent.press(getByLabelText('Pular dose de Glifage das 08:00'))
    expect(onRegister).toHaveBeenCalledWith({ id: 'p1', dosage_per_intake: 1 }, '08:00', 'i1', expect.objectContaining({ instanceId: 'i1' }))
    expect(onSkip).toHaveBeenCalledWith(expect.objectContaining({ instanceId: 'i1' }))
  })

  it('SEM_REGISTRO ⇒ Registrar + Pular, sem o X vermelho', () => {
    const { getByLabelText, getByText } = render(<DoseTimelineCard dose={dose('SEM_REGISTRO')} onRegister={jest.fn()} onSkip={jest.fn()} />)
    expect(getByText('Registrar')).toBeTruthy()
    expect(getByLabelText('Pular dose de Glifage das 08:00')).toBeTruthy()
  })

  it.each(['PERDIDA', 'TOMADA', 'PLANEJADA'])('%s ⇒ sem ação', (st) => {
    const { queryByText } = render(<DoseTimelineCard dose={dose(st)} onRegister={jest.fn()} onSkip={jest.fn()} />)
    expect(queryByText('Registrar')).toBeNull()
    expect(queryByText('Tomar')).toBeNull()
    expect(queryByText('Pular')).toBeNull()
  })

  it('sem onSkip ou sem scheduledFor ⇒ sem Pular', () => {
    const { queryByText, rerender } = render(<DoseTimelineCard dose={dose('SEM_REGISTRO')} onRegister={jest.fn()} />)
    expect(queryByText('Pular')).toBeNull()
    rerender(<DoseTimelineCard dose={dose('SEM_REGISTRO', { scheduledFor: null })} onRegister={jest.fn()} onSkip={jest.fn()} />)
    expect(queryByText('Pular')).toBeNull()
  })

  it('busy ⇒ desabilita as duas ações (DC-5)', () => {
    const onRegister = jest.fn(); const onSkip = jest.fn()
    const { getByLabelText } = render(<DoseTimelineCard dose={dose('SEM_REGISTRO')} onRegister={onRegister} onSkip={onSkip} busy />)
    fireEvent.press(getByLabelText('Registrar dose de Glifage das 08:00'))
    fireEvent.press(getByLabelText('Pular dose de Glifage das 08:00'))
    expect(onRegister).not.toHaveBeenCalled()
    expect(onSkip).not.toHaveBeenCalled()
  })

  it('R-299: exibe o nome congelado na ocorrência, não o do tratamento vivo', () => {
    const { getByText, queryByText } = render(<DoseTimelineCard dose={dose('TOMADA')} onRegister={jest.fn()} />)
    expect(getByText('Glifage')).toBeTruthy()
    expect(queryByText('Nome Vivo')).toBeNull()
  })
})
