// 120 US1 / US3 / D-3 / D-5 — aviso de lembretes desligados na Hoje (PO-120-1, PO-120-4).
import React from 'react'
import { render, fireEvent, act } from '@testing-library/react-native'

const mockOpenPrimer = jest.fn()
jest.mock('@platform/notifications/pushPrimerContext', () => ({ usePushPrimer: () => ({ openPushPrimer: (...a: any[]) => mockOpenPrimer(...a) }) }))
const mockAskMode = jest.fn(async () => 'ask')
jest.mock('@platform/notifications/pushPermission', () => ({ getPushAskMode: () => mockAskMode() }))
const mockLogEvent = jest.fn()
jest.mock('@platform/analytics/productAnalytics', () => ({ logEvent: (...a: any[]) => mockLogEvent(...a) }))
jest.mock('@dosiq/core', () => ({
  ...jest.requireActual('@dosiq/core'),
  getNow: () => new Date(2026, 8, 30, 12, 0, 0),
}))

import TodayPushPermission from '../TodayPushPermission'
import { ANDROID_PUSH_CHANNEL } from '@dosiq/core'
import { isPushPermissionVisible } from '@dashboard/hooks/useTodayPushPermission'

const daily = (over: any = {}) => ({
  name: 'Losartana', active: true, frequency: 'diário', time_schedule: ['16:00'], start_date: '2026-09-01', end_date: null,
  dosage_per_intake: 1, medicine: { name: 'Losartana', presentation: 'comprimido', dosage_per_pill: 50, dosage_unit: 'mg' }, ...over,
})
const reach = (over: any = {}) => ({
  usable: false, reason: 'undetermined', snoozed: false, snoozeCount: 0, refresh: jest.fn(async () => ({ usable: true, reason: null })), snooze: jest.fn(), ...over,
})

afterEach(() => {
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('isPushPermissionVisible (PO-120-1 guard)', () => {
  it('aparece só com tratamento que gera lembrete + push não utilizável + sem adiamento', () => {
    expect(isPushPermissionVisible(reach(), [daily()])).toBe(true)
    expect(isPushPermissionVisible(reach({ usable: true }), [daily()])).toBe(false)
    expect(isPushPermissionVisible(reach({ usable: null }), [daily()])).toBe(false)
    expect(isPushPermissionVisible(reach({ snoozed: true }), [daily()])).toBe(false)
    expect(isPushPermissionVisible(reach({ snoozed: null }), [daily()])).toBe(false)
  })
  it('🔴 guard: sem tratamento ativo, só quando necessário ou todos pausados ⇒ sem aviso', () => {
    expect(isPushPermissionVisible(reach(), [])).toBe(false)
    expect(isPushPermissionVisible(reach(), [daily({ frequency: 'quando_necessário' })])).toBe(false)
    expect(isPushPermissionVisible(reach(), [daily({ active: false })])).toBe(false)
  })
})

describe('TodayPushPermission', () => {
  it('undetermined ⇒ texto da próxima dose e "Ligar lembretes" abre o preparo com a prévia (US3: lembrete desligado no onboarding cai aqui)', async () => {
    const r = reach()
    mockOpenPrimer.mockResolvedValue('granted')
    const { getByText, getByLabelText } = render(<TodayPushPermission reach={r as any} protocols={[daily()]} />)
    expect(getByText('Os lembretes estão desligados')).toBeTruthy()
    expect(getByText('Sem eles, a dose de Losartana de hoje às 16:00 não vai avisar.')).toBeTruthy()
    await act(async () => fireEvent.press(getByLabelText('Ligar lembretes')))
    expect(mockOpenPrimer).toHaveBeenCalledWith({
      entryPoint: 'today_banner',
      preview: expect.objectContaining({ title: 'Hora de tomar Losartana', medicineName: 'Losartana', verb: 'tomar' }),
      settings: null,
    })
    expect(r.refresh).toHaveBeenCalled()
  })

  it('S-14: canal CRÍTICO bloqueado ⇒ exemplo vem da próxima dose crítica, não da geral', () => {
    const crit = daily({ name: 'Varfarina', time_schedule: ['20:00'], critical_alarm: true, medicine: { name: 'Varfarina', presentation: 'comprimido' } })
    const r = reach({ reason: 'channel_blocked', blockedChannel: ANDROID_PUSH_CHANNEL.CRITICAL })
    const { queryByText } = render(<TodayPushPermission reach={r as any} protocols={[daily(), crit]} />)
    expect(queryByText(/Varfarina/)).toBeTruthy()
    expect(queryByText(/Losartana/)).toBeNull()
    expect(queryByText('Os lembretes de dose crítica estão desligados nos Ajustes')).toBeTruthy() // S-15
  })

  it('vários tratamentos ⇒ "a próxima dose (X)"', () => {
    const other = daily({ name: 'Metformina', time_schedule: ['20:00'], medicine: { name: 'Metformina', presentation: 'comprimido' } })
    const { getByText } = render(<TodayPushPermission reach={reach() as any} protocols={[daily(), other]} />)
    expect(getByText('Sem eles, a próxima dose (Losartana) de hoje às 16:00 não vai avisar.')).toBeTruthy()
  })

  it('denied ⇒ "Abrir Ajustes" abre o preparo em modo Ajustes com o passo a passo; volta sem conceder ⇒ "Continuam" curto', async () => {
    mockOpenPrimer.mockResolvedValueOnce('not_granted')
    const { getByText, getByLabelText } = render(<TodayPushPermission reach={reach({ reason: 'denied' }) as any} protocols={[daily()]} />)
    expect(getByText('As notificações estão bloqueadas')).toBeTruthy()
    await act(async () => fireEvent.press(getByLabelText('Abrir Ajustes')))
    expect(mockOpenPrimer).toHaveBeenCalledWith(expect.objectContaining({ settings: { hint: expect.stringMatching(/toque em Notificações e ative/) } }))
    expect(getByText(/^Continuam desligadas: a dose de Losartana de .+ não vai avisar\.$/)).toBeTruthy()
  })

  it('denied: fechou o preparo sem ir aos Ajustes ⇒ não diz "Continuam"', async () => {
    mockOpenPrimer.mockResolvedValueOnce('dismissed')
    const { getByLabelText, queryByText } = render(<TodayPushPermission reach={reach({ reason: 'denied' }) as any} protocols={[daily()]} />)
    await act(async () => fireEvent.press(getByLabelText('Abrir Ajustes')))
    expect(queryByText(/Continuam desligadas/)).toBeNull()
  })

  it('smoke 120 (3b): Android que parou de perguntar ⇒ card já diz "Abrir Ajustes"', async () => {
    mockAskMode.mockResolvedValue('settings')
    const { findByLabelText, getByText } = render(<TodayPushPermission reach={reach() as any} protocols={[daily()]} />)
    expect(await findByLabelText('Abrir Ajustes')).toBeTruthy()
    expect(getByText('As notificações estão bloqueadas')).toBeTruthy()
    mockAskMode.mockResolvedValue('ask')
  })

  it('smoke 120: concedeu e bloqueou de novo depois ⇒ não diz "Continuam"', async () => {
    mockOpenPrimer.mockResolvedValueOnce('not_granted')
    const p = [daily()]
    const { getByLabelText, queryByText, rerender } = render(<TodayPushPermission reach={reach({ reason: 'denied' }) as any} protocols={p} />)
    await act(async () => fireEvent.press(getByLabelText('Abrir Ajustes')))
    rerender(<TodayPushPermission reach={reach({ reason: null, usable: true }) as any} protocols={p} />)
    rerender(<TodayPushPermission reach={reach({ reason: 'denied' }) as any} protocols={p} />)
    expect(queryByText(/Continuam desligadas/)).toBeNull()
    expect(queryByText(/^A dose de Losartana de .+ não vai avisar\. Libere em Ajustes › Notificações\.$/)).toBeTruthy()
  })

  it('canal Android bloqueado ⇒ título do canal + Ajustes', () => {
    const { getByText } = render(<TodayPushPermission reach={reach({ reason: 'channel_blocked' }) as any} protocols={[daily()]} />)
    expect(getByText('Os lembretes de dose estão desligados nos Ajustes')).toBeTruthy()
    expect(getByText('Abrir Ajustes')).toBeTruthy()
  })

  it('"Agora não" adia; no 3º vira "Não mostrar de novo" com a dica de Perfil (D-5)', () => {
    const r = reach()
    const first = render(<TodayPushPermission reach={r as any} protocols={[daily()]} />)
    fireEvent.press(first.getByText('Agora não'))
    expect(r.snooze).toHaveBeenCalled()
    expect(mockLogEvent).toHaveBeenCalledWith('push_permission_card_snoozed', { surface: 'mobile', reason: 'undetermined', snooze_count: 1 })
    first.unmount()
    const last = render(<TodayPushPermission reach={reach({ snoozeCount: 2, reason: 'denied' }) as any} protocols={[daily()]} />)
    expect(last.getByText('Não mostrar de novo')).toBeTruthy()
    fireEvent.press(last.getByText('Não mostrar de novo'))
    expect(mockLogEvent).toHaveBeenLastCalledWith('push_permission_card_snoozed', { surface: 'mobile', reason: 'denied', snooze_count: 3 })
    expect(last.getByText(/Dá para ligar depois em Perfil › Notificações\./)).toBeTruthy()
  })

  it('concedido ⇒ nada renderizado', () => {
    const { queryByTestId } = render(<TodayPushPermission reach={reach({ usable: true, reason: null }) as any} protocols={[daily()]} />)
    expect(queryByTestId('push-permission-card')).toBeNull()
  })

  it('sem próxima dose calculável ⇒ subtítulo genérico', () => {
    const { getByText } = render(<TodayPushPermission reach={reach() as any} protocols={[daily({ medicine: null, name: '' })]} />)
    expect(getByText('Sem eles, nenhum lembrete de dose vai chegar.')).toBeTruthy()
  })
})
