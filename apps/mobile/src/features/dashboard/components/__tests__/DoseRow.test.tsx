// DoseRow — 121 B · PO-10 (fato do log), PO-11 (estados + "Já apliquei" pelo sheet), PO-12 (mapa só passado).
import { describe, it, expect, afterEach } from '@jest/globals'
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'

jest.mock('lucide-react-native', () => new Proxy({}, { get: (_t, name) => () => { const { Text } = require('react-native'); return <Text testID={`icon-${String(name)}`} /> } }))
jest.mock('@shared/components/data/BodyMapView', () => (props: any) => {
  const { Text } = require('react-native')
  return <Text testID="bodymap-view-mock">{JSON.stringify(props.recentSites)}</Text>
})

import DoseRow from '../DoseRow'

const TZ = 'America/Sao_Paulo'
const summary = {
  state: 'on_track' as const, intervalDays: 7,
  last: { day: '2026-11-13', time: '08:10', daysSince: 3, site: 'abdomen_d', siteLabel: 'Abdômen (direito)' },
  next: { day: '2026-11-20', daysUntil: 4 },
}
const recent = [
  { id: 'l1', taken_at: '2026-11-13T11:10:00.000Z', injection_site: 'abdomen_d', medicine_id: 'med-da-dose', protocol_id: 'p1' },
  { id: 'l2', taken_at: '2026-11-06T11:10:00.000Z', injection_site: 'coxa_e', medicine_id: 'med-da-dose', protocol_id: 'p1' },
]
const base = {
  open: false, onToggle: jest.fn(), summary, recent, nextDoseLabel: '10 mg', timezone: TZ,
  loading: false, error: null, onRetry: jest.fn(), canRegisterEarly: false, onRegisterEarly: jest.fn(),
}

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('DoseRow', () => {
  it('fechada com local (AC-11)', () => {
    const s = render(<DoseRow {...base} />)
    expect(s.getByText('Aplicada há 3 dias · abdômen direito')).toBeTruthy()
    expect(s.getByText('Próxima em 4 dias · sex, 20/11')).toBeTruthy()
    expect(s.queryByTestId('dose-row-register-early')).toBeNull()
  })

  it('aberta (D14/D16): mapa recebe só o passado + lista com data como âncora; sem contagem (PO-12)', () => {
    const s = render(<DoseRow {...base} open />)
    expect(s.getByTestId('bodymap-view-mock').props.children).toBe(JSON.stringify(['abdomen_d', 'coxa_e']))
    expect(s.getByText('ÚLTIMAS 2 APLICAÇÕES')).toBeTruthy()
    expect(s.getByText('sex, 13/11')).toBeTruthy()
    expect(s.getByText('Abdômen direito · última')).toBeTruthy()
    expect(s.getByText('Coxa esquerda')).toBeTruthy()
    expect(s.queryByText(/Semanas da etapa/)).toBeNull()
  })

  it('sem local (AC-12): sem mapa', () => {
    const noSite = recent.map((r) => ({ ...r, injection_site: null }))
    const s = render(<DoseRow {...base} open recent={noSite} summary={{ ...summary, last: { ...summary.last, site: null, siteLabel: null } }} />)
    expect(s.queryByTestId('bodymap-view-mock')).toBeNull()
    expect(s.getByText('Aplicada há 3 dias · sex, 13/11')).toBeTruthy()
    expect(s.getByText('última')).toBeTruthy()
    expect(s.getByText('sex, 06/11')).toBeTruthy()
  })

  it('PO-11: "Já apliquei" aparece com âncora e dispara o sheet', () => {
    const onRegisterEarly = jest.fn()
    const s = render(<DoseRow {...base} canRegisterEarly onRegisterEarly={onRegisterEarly} summary={{ ...summary, state: 'first_dose', last: null }} recent={[]} />)
    expect(s.getByText('Primeira aplicação · sex, 20/11')).toBeTruthy()
    fireEvent.press(s.getByTestId('dose-row-register-early'))
    expect(onRegisterEarly).toHaveBeenCalledTimes(1)
  })

  it('RC5: última sem local (anterior com local) ⇒ sem mapa vazio', () => {
    const mixed = [{ ...recent[0], injection_site: null }, recent[1]]
    const s = render(<DoseRow {...base} open recent={mixed} />)
    expect(s.queryByTestId('bodymap-view-mock')).toBeNull()
  })

  it('uma aplicação só: título no singular', () => {
    const s = render(<DoseRow {...base} open recent={recent.slice(0, 1)} />)
    expect(s.getByText('ÚLTIMA APLICAÇÃO')).toBeTruthy()
  })

  it('1ª aplicação aberta: quadro tracejado de vazio (mesmo padrão da L2)', () => {
    const s = render(<DoseRow {...base} open summary={{ ...summary, state: 'first_dose', last: null }} recent={[]} />)
    expect(s.getByTestId('dose-row-empty')).toBeTruthy()
    expect(s.queryByTestId('bodymap-view-mock')).toBeNull()
  })

  it('erro de carga: nunca mostra "Primeira aplicação" (falso vazio)', () => {
    const s = render(<DoseRow {...base} summary={null} recent={[]} error="network" />)
    expect(s.queryByText(/Primeira aplicação/)).toBeNull()
    expect(s.getByTestId('dose-row-retry')).toBeTruthy()
  })
})
