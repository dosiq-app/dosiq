// DoseRow — 121 B · PO-10 (fato do log), PO-11 (estados + "Já apliquei" pelo sheet), PO-12 (mapa só passado).
import { describe, it, expect, afterEach } from '@jest/globals'
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'

jest.mock('lucide-react-native', () => new Proxy({}, { get: (_t, name) => () => { const { Text } = require('react-native'); return <Text testID={`icon-${String(name)}`} /> } }))
jest.mock('@shared/components/data/BodyMapView', () => (props: any) => {
  const { Text } = require('react-native')
  return <Text testID="bodymap-view-mock">{JSON.stringify(props.recentSites)}</Text>
})

jest.mock('react-native-svg', () => {
  const { View } = require('react-native')
  const Svg = ({ children, testID }: any) => <View testID={testID}>{children}</View>
  return { __esModule: true, default: Svg, Svg, Circle: () => null, Path: () => null }
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

  it('125 fatia 2: antes da 1ª dose o miolo mostra o setup com só "Ajustar"', () => {
    const onAdjust = jest.fn()
    const s = render(<DoseRow {...base} open summary={{ ...summary, state: 'first_dose', last: null }} recent={[]} setup={{ rows: [{ label: 'Dose', value: '0,5 mg por aplicação' }, { label: 'Quando', value: 'toda segunda às 15:00' }], onAdjust }} />)
    expect(s.getByText('CONFIRA O TRATAMENTO')).toBeTruthy()
    expect(s.getByText('Antes da 1ª aplicação, veja se está como na receita.')).toBeTruthy()
    expect(s.getByText('toda segunda às 15:00')).toBeTruthy()
    expect(s.queryByTestId('dose-row-empty')).toBeNull()
    fireEvent.press(s.getByTestId('dose-row-setup-adjust'))
    expect(onAdjust).toHaveBeenCalledTimes(1)
  })

  it('125 fatia 2: com dose registrada o setup sai e volta o histórico', () => {
    const s = render(<DoseRow {...base} open recent={recent} setup={{ rows: [{ label: 'Dose', value: 'x' }], onAdjust: jest.fn() }} />)
    expect(s.queryByTestId('dose-row-setup')).toBeNull()
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

  // ─── 121 C ───────────────────────────────────────────────────────────────────
  // Janela móvel terminando hoje (qua 18/11): qui 12 … qua 18. Contrave 08:00/20:00.
  const d = (day: string, weekday: number, state: string, registered: number, due: number, isToday = false) =>
    ({ day, weekday, state, registered, scheduled: 2, due, isToday })
  const week = {
    days: [
      d('2026-11-12', 4, 'full', 2, 2), d('2026-11-13', 5, 'full', 2, 2), d('2026-11-14', 6, 'open', 0, 2),
      d('2026-11-15', 0, 'partial', 1, 2), d('2026-11-16', 1, 'full', 2, 2), d('2026-11-17', 2, 'full', 2, 2),
      d('2026-11-18', 3, 'full', 1, 1, true),
    ] as any,
    taken: 10, due: 13, since: null, todayLast: { time: '08:05' },
  }
  const daily = { week, copy: { primary: 'Tomado hoje · 08:05', secondary: '10 de 13 doses nos últimos 7 dias' } }
  const oral = [
    { id: 'o1', taken_at: '2026-11-18T11:05:00.000Z', injection_site: null, medicine_id: 'm', protocol_id: 'p' },
    { id: 'o2', taken_at: '2026-11-16T11:00:00.000Z', injection_site: null, medicine_id: 'm', protocol_id: 'p' },
  ]

  it('PO-16: diário fechado mostra a copy diária e NUNCA "Já apliquei" (FR-042)', () => {
    const s = render(<DoseRow {...base} summary={null} recent={oral} injectable={false} daily={daily} canRegisterEarly />)
    expect(s.getByText('Tomado hoje · 08:05')).toBeTruthy()
    expect(s.getByText('10 de 13 doses nos últimos 7 dias')).toBeTruthy()
    expect(s.queryByTestId('dose-row-register-early')).toBeNull()
    expect(s.getByTestId('icon-Pill')).toBeTruthy()
  })

  it('PO-17/C-A5: diário aberto = faixa móvel (hoje na ponta), parcial na diagonal, neutro sem registro; sem lista', () => {
    const s = render(<DoseRow {...base} open summary={null} recent={oral} injectable={false} daily={daily} />)
    expect(s.getByTestId('week-strip')).toBeTruthy()
    expect(s.getByTestId('week-strip-2026-11-14-open').props.accessibilityLabel).toBe('sábado: sem registro')
    expect(s.getByTestId('week-strip-2026-11-15-partial').props.accessibilityLabel).toBe('domingo: 1 de 2 doses registradas')
    expect(s.getByTestId('week-strip-partial')).toBeTruthy()
    expect(s.getByTestId('week-strip-2026-11-18-full').props.accessibilityLabel).toBe('quarta (hoje): registrado')
    expect(s.queryByText(/ÚLTIM/)).toBeNull()
    expect(s.queryByTestId('bodymap-view-mock')).toBeNull()
    expect(JSON.stringify(s.toJSON())).not.toMatch(/perd|%|parab/i)
  })

  it('PO-17/INV-2: injetável diário com local na última ⇒ mapa (só o passado) junto da faixa', () => {
    const inj = [{ ...oral[0], injection_site: 'abdomen_d' }, oral[1]]
    const s = render(<DoseRow {...base} open summary={null} recent={inj} daily={daily} />)
    expect(s.getByTestId('week-strip')).toBeTruthy()
    expect(s.getByTestId('bodymap-view-mock').props.children).toBe(JSON.stringify(['abdomen_d', null]))
  })

  it('PO-18: semanal "comprimido" ⇒ verbo neutro, ícone de comprimido, sem mapa, "Registrar" no lugar de "Já apliquei"', () => {
    const noSite = { ...summary, last: { ...summary.last, site: null, siteLabel: null } }
    const recentNo = recent.map((r) => ({ ...r, injection_site: null }))
    const s = render(<DoseRow {...base} open summary={noSite} recent={recentNo} injectable={false} canRegisterEarly />)
    expect(s.getByText('Registrada há 3 dias · sex, 13/11')).toBeTruthy()
    expect(s.getByText('Registrar')).toBeTruthy()
    expect(s.queryByText('Já apliquei')).toBeNull()
    expect(s.getByText('ÚLTIMAS 2 DOSES')).toBeTruthy()
    expect(s.queryByTestId('bodymap-view-mock')).toBeNull()
  })
})

describe('DoseRow — 124 A (FR-009/FR-010, PO-4)', () => {
  it('semanal aberto com registro: link "Ver todas as aplicações" abre o sheet', () => {
    const onOpenHistory = jest.fn()
    const s = render(<DoseRow {...base} open onOpenHistory={onOpenHistory} />)
    fireEvent.press(s.getByText('Ver todas as aplicações'))
    expect(onOpenHistory).toHaveBeenCalledTimes(1)
  })

  it('não injetável: "Ver todas as doses" e nenhum mapa mesmo com local gravado', () => {
    const s = render(<DoseRow {...base} open injectable={false} onOpenHistory={jest.fn()} />)
    expect(s.getByText('Ver todas as doses')).toBeTruthy()
    expect(s.queryByTestId('bodymap-view-mock')).toBeNull()
  })

  it('sem link: fechada, sem registro (setup/vazio), diário, ou sem handler', () => {
    expect(render(<DoseRow {...base} onOpenHistory={jest.fn()} />).queryByTestId('dose-row-history')).toBeNull()
    expect(render(<DoseRow {...base} open recent={[]} onOpenHistory={jest.fn()} />).queryByTestId('dose-row-history')).toBeNull()
    expect(render(<DoseRow {...base} open />).queryByTestId('dose-row-history')).toBeNull()
    const week = { days: [], taken: 0, due: 0, since: null, todayLast: null }
    const daily = { week, copy: { primary: 'x', secondary: null } }
    expect(render(<DoseRow {...base} open summary={null} daily={daily} onOpenHistory={jest.fn()} />).queryByTestId('dose-row-history')).toBeNull()
  })
})
