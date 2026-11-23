// DoseNavSheet — 124 A · PO-1 (qualquer idade, fim limpo), PO-2 (local da própria linha), E-16.
import { describe, it, expect, afterEach, beforeEach } from '@jest/globals'
import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'

jest.mock('lucide-react-native', () => new Proxy({}, { get: (_t, name) => () => { const { Text } = require('react-native'); return <Text testID={`icon-${String(name)}`} /> } }))
jest.mock('@shared/components/data/BodyMapView', () => (props: any) => {
  const { Text } = require('react-native')
  return <Text testID="bodymap-view-mock">{JSON.stringify(props.recentSites)}</Text>
})
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native')
  return { SafeAreaView: ({ children, ...p }: any) => <View {...p}>{children}</View> }
})
const mockList = jest.fn()
jest.mock('@dose/services/doseService', () => ({ listRecentApplications: (...a: any[]) => mockList(...a) }))

import DoseNavSheet from '../DoseNavSheet'
import { doseHeading } from '@dose/utils/doseHeading'

const TZ = 'America/Sao_Paulo'
const P = 'p1'
// Mais recente primeiro; a do meio tem 40+ dias (AC-1) e cada uma um local (AC-2).
const DOSES = [
  { id: 'c', taken_at: '2026-11-01T12:20:00.123456+00:00', injection_site: 'gluteo_d', medicine_id: 'm1', protocol_id: P },
  { id: 'b', taken_at: '2026-10-02T12:05:00+00:00', injection_site: 'gluteo_e', medicine_id: 'm1', protocol_id: P },
  { id: 'a', taken_at: '2026-07-02T12:00:00+00:00', injection_site: null, medicine_id: 'm1', protocol_id: P },
]

/** Fake do serviço: vizinho por posição na lista, conferindo que o cursor é a string CRUA (E-8). */
function neighborImpl({ before, after }: any) {
  const cur = before ?? after
  const i = DOSES.findIndex((d) => d.id === cur.id)
  if (i < 0 || DOSES[i].taken_at !== cur.takenAt) throw new Error('cursor alterado')
  const j = before ? i + 1 : i - 1
  return Promise.resolve(DOSES[j] ? [DOSES[j]] : [])
}

const base = { visible: true, onClose: jest.fn(), protocolId: P, medicineId: 'm1', medicineName: 'Contracep', injectable: true, timezone: TZ }

beforeEach(() => mockList.mockImplementation(neighborImpl))
afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('doseHeading', () => {
  it('data/hora local e "há N dias" (R-020)', () => {
    expect(doseHeading('2026-10-02T12:05:00+00:00', TZ, '2026-11-13')).toEqual({ date: 'sex, 02/10 · 09:05', ago: 'há 42 dias' })
    expect(doseHeading('2026-11-13T02:30:00Z', TZ, '2026-11-13')).toEqual({ date: 'qui, 12/11 · 23:30', ago: 'ontem' })
  })
})

describe('DoseNavSheet', () => {
  it('abre na última; consulta vizinhos com limit 1 e cursor cru (PO-3, E-8)', async () => {
    const s = render(<DoseNavSheet {...base} initial={DOSES[0]} />)
    await waitFor(() => expect(s.getByTestId('dose-nav-prev').props.accessibilityState.disabled).toBe(false))
    expect(mockList).toHaveBeenCalledWith({ protocolId: P, medicineId: 'm1', limit: 1, before: { takenAt: DOSES[0].taken_at, id: 'c' } })
    expect(mockList).toHaveBeenCalledWith({ protocolId: P, medicineId: 'm1', limit: 1, after: { takenAt: DOSES[0].taken_at, id: 'c' } })
    expect(s.getByText('Glúteo (direito)')).toBeTruthy()
    expect(s.getByTestId('bodymap-view-mock').props.children).toBe('["gluteo_d"]')
    expect(s.getByTestId('dose-nav-next').props.accessibilityState.disabled).toBe(true)
    expect(s.getByTestId('dose-nav-ago').props.children).toMatch(/ · registrada$/)
  })

  it('navega para trás e cada dose mostra o SEU local (PO-2); dose de 40+ dias alcançada (AC-1)', async () => {
    const s = render(<DoseNavSheet {...base} initial={DOSES[0]} />)
    await waitFor(() => expect(s.getByTestId('dose-nav-prev').props.accessibilityState.disabled).toBe(false))
    fireEvent.press(s.getByTestId('dose-nav-prev'))
    await waitFor(() => expect(s.getByText('Glúteo (esquerdo)')).toBeTruthy())
    expect(s.getByTestId('bodymap-view-mock').props.children).toBe('["gluteo_e"]')
    expect(s.getByTestId('dose-nav-date').props.children).toBe('sex, 02/10 · 09:05')
    await waitFor(() => expect(s.getByTestId('dose-nav-prev').props.accessibilityState.disabled).toBe(false))
    fireEvent.press(s.getByTestId('dose-nav-prev'))
    // Mais antiga: sem local e sem anterior — termina limpo (AC-3).
    await waitFor(() => expect(s.getByTestId('dose-nav-first')).toBeTruthy())
    expect(s.getByText('Local não informado nesta dose.')).toBeTruthy()
    expect(s.queryByTestId('bodymap-view-mock')).toBeNull()
    expect(s.getByTestId('dose-nav-prev').props.accessibilityState.disabled).toBe(true)
    expect(s.getByTestId('dose-nav-next').props.accessibilityState.disabled).toBe(false)
    fireEvent.press(s.getByTestId('dose-nav-next'))
    await waitFor(() => expect(s.getByText('Glúteo (esquerdo)')).toBeTruthy())
  })

  it('erro ⇒ mensagem + tentar de novo; dose atual fica (nunca some)', async () => {
    mockList.mockImplementation(() => Promise.reject(new Error('offline')))
    const s = render(<DoseNavSheet {...base} initial={DOSES[0]} />)
    await waitFor(() => expect(s.getByTestId('dose-nav-error')).toBeTruthy())
    expect(s.getByText('Glúteo (direito)')).toBeTruthy()
    expect(s.queryByTestId('dose-nav-first')).toBeNull()
    mockList.mockImplementation(neighborImpl)
    fireEvent.press(s.getByTestId('dose-nav-retry'))
    await waitFor(() => expect(s.queryByTestId('dose-nav-error')).toBeNull())
    expect(s.getByTestId('dose-nav-prev').props.accessibilityState.disabled).toBe(false)
  })

  it('E-16: botões desabilitados durante a busca; resposta antiga descartada', async () => {
    const pending: Array<(v: any) => void> = []
    mockList.mockImplementation(() => new Promise((r) => pending.push(r)))
    const s = render(<DoseNavSheet {...base} initial={DOSES[0]} />)
    expect(s.getByTestId('dose-nav-prev').props.accessibilityState.disabled).toBe(true)
    // Sheet reaberto em outra dose antes da 1ª resposta: a resposta velha não pode vencer.
    s.rerender(<DoseNavSheet {...base} initial={DOSES[1]} />)
    await act(async () => {
      pending[2]([DOSES[2]]) // before de b (novo)
      pending[3]([DOSES[0]]) // after de b (novo)
    })
    await act(async () => {
      pending[0]([]) // before de c (antigo) — "sem anterior" falso
      pending[1]([])
    })
    expect(s.queryByTestId('dose-nav-first')).toBeNull()
    expect(s.getByTestId('dose-nav-prev').props.accessibilityState.disabled).toBe(false)
  })

  it('não injetável: sem local, rótulo "dose" (FR-009, PO 23/11)', async () => {
    const s = render(<DoseNavSheet {...base} injectable={false} medicineName="Vitamina D" initial={DOSES[0]} />)
    await waitFor(() => expect(s.getByTestId('dose-nav-prev').props.accessibilityState.disabled).toBe(false))
    expect(s.getByText('VITAMINA D · DOSE')).toBeTruthy()
    expect(s.queryByTestId('dose-nav-site')).toBeNull()
    expect(s.queryByTestId('dose-nav-nosite')).toBeNull()
  })
})
