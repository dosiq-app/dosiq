// 120 US2 / E-3 / D-4..D-7 — preparo na raiz (PO-120-3, PO-120-5).
import React from 'react'
import { Linking, Pressable, Text } from 'react-native'
import { render, fireEvent, act, waitFor } from '@testing-library/react-native'

const mockRequest = jest.fn()
const mockAskMode = jest.fn(async () => 'ask')
jest.mock('../pushPermission', () => ({
  requestPushOrOpenSettings: (...a: any[]) => mockRequest(...a),
  getPushAskMode: () => mockAskMode(),
}))
jest.mock('@platform/supabase/nativeSupabaseClient', () => ({ supabase: { tag: 'sb' } }))
const mockLogEvent = jest.fn()
jest.mock('@platform/analytics/productAnalytics', () => ({ logEvent: (...a: any[]) => mockLogEvent(...a) }))
const mockShow = jest.fn()
jest.mock('@shared/components/feedback/Toast', () => ({ useToast: () => ({ show: mockShow }) }))

import { PushPrimerProvider } from '../PushPrimerProvider'
import { usePushPrimer, type PrimerOutcome } from '../pushPrimerContext'

const PREVIEW = { title: 'Dia da aplicação de Mounjaro', body: '2,5 mg · 08:00', medicineName: 'Mounjaro', verb: 'aplicar' }
let outcomes: PrimerOutcome[] = []

function Opener({ anchor, settings }: { anchor?: string; settings?: { hint: string } }) {
  const { openPushPrimer } = usePushPrimer()
  return (
    <Pressable onPress={() => openPushPrimer({ entryPoint: 'treatment_form', preview: PREVIEW, anchor, settings }).then((o) => outcomes.push(o))}>
      <Text>abrir</Text>
    </Pressable>
  )
}

function setup(anchor?: string) {
  return render(
    <PushPrimerProvider>
      <Opener anchor={anchor} />
    </PushPrimerProvider>
  )
}

afterEach(() => {
  outcomes = []
  jest.clearAllMocks()
  jest.clearAllTimers()
})

describe('PushPrimerProvider (PO-120-3)', () => {
  it('🔴 INV-1: abrir NÃO chama o SO; só "Ligar lembretes" chama', async () => {
    mockRequest.mockResolvedValue(true)
    const { getByText, getByLabelText } = setup()
    fireEvent.press(getByText('abrir'))
    await waitFor(() => expect(mockAskMode).toHaveBeenCalled())
    await act(async () => {})
    expect(getByText('Avisar na hora de aplicar Mounjaro')).toBeTruthy()
    expect(mockRequest).not.toHaveBeenCalled()
    await act(async () => fireEvent.press(getByLabelText('Ligar lembretes')))
    expect(mockRequest).toHaveBeenCalledWith({ supabase: { tag: 'sb' }, entryPoint: 'treatment_form' })
    expect(outcomes).toEqual(['granted'])
    expect(mockShow).toHaveBeenCalledWith('Lembretes ligados', expect.objectContaining({ variant: 'success' }))
  })

  it('"Agora não" ⇒ não chama o SO, emite primer_dismissed com entry_point', async () => {
    const { getByText, getByLabelText } = setup()
    fireEvent.press(getByText('abrir'))
    await waitFor(() => expect(mockAskMode).toHaveBeenCalled())
    await act(async () => {})
    await act(async () => fireEvent.press(getByLabelText('Agora não')))
    expect(mockRequest).not.toHaveBeenCalled()
    expect(mockLogEvent).toHaveBeenCalledWith('notification_permission_primer_dismissed', { surface: 'mobile', entry_point: 'treatment_form' })
    expect(outcomes).toEqual(['dismissed'])
  })

  it('prévia do push com rótulo de exemplo (D-4/D-7) e âncora do formulário (D-6)', async () => {
    const { getByText, getByLabelText } = setup('Tratamento salvo')
    fireEvent.press(getByText('abrir'))
    await waitFor(() => expect(mockAskMode).toHaveBeenCalled())
    await act(async () => {})
    expect(getByText('Tratamento salvo')).toBeTruthy()
    expect(getByLabelText('Exemplo de lembrete: Dia da aplicação de Mounjaro. 2,5 mg · 08:00')).toBeTruthy()
    // smoke 120: a prévia não pode parecer a dose de agora.
    expect(getByText('Exemplo de como o lembrete chega:')).toBeTruthy()
    expect(getByText('dosiq · na hora da dose')).toBeTruthy()
  })

  it('smoke 120: toque fora do sheet = "Agora não"', async () => {
    const { getByText, getByTestId } = setup()
    fireEvent.press(getByText('abrir'))
    await waitFor(() => expect(mockAskMode).toHaveBeenCalled())
    await act(async () => {})
    await act(async () => fireEvent.press(getByTestId('push-primer-backdrop', { includeHiddenElements: true })))
    expect(mockRequest).not.toHaveBeenCalled()
    expect(outcomes).toEqual(['dismissed'])
  })

  it('smoke 120: SO já bloqueou ⇒ cópia de Ajustes, sem prometer diálogo', async () => {
    mockAskMode.mockResolvedValueOnce('settings')
    mockRequest.mockResolvedValue(false)
    const { getByText, getByLabelText, queryByText } = setup()
    fireEvent.press(getByText('abrir'))
    await waitFor(() => expect(mockAskMode).toHaveBeenCalled())
    await act(async () => {})
    expect(queryByText(/o sistema vai perguntar/)).toBeNull()
    expect(getByText(/toque em Notificações e ligue/)).toBeTruthy()
    await act(async () => fireEvent.press(getByLabelText('Abrir Ajustes')))
    expect(mockRequest).toHaveBeenCalledTimes(1)
  })

  it('smoke 120: aberto em modo Ajustes ⇒ passo a passo de quem chamou; CTA abre Ajustes sem pedir ao SO', async () => {
    const spy = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined as any)
    const { getByText, getByLabelText } = render(
      <PushPrimerProvider>
        <Opener settings={{ hint: 'Passo a passo X.' }} />
      </PushPrimerProvider>
    )
    fireEvent.press(getByText('abrir'))
    await act(async () => {})
    expect(getByText('Passo a passo X.', { includeHiddenElements: true })).toBeTruthy()
    expect(mockAskMode).not.toHaveBeenCalled()
    fireEvent.press(getByLabelText('Abrir Ajustes'))
    await act(async () => {})
    expect(spy).toHaveBeenCalled()
    expect(mockRequest).not.toHaveBeenCalled()
    expect(mockLogEvent).not.toHaveBeenCalled()
    expect(outcomes).toEqual(['not_granted'])
  })

  it('não concedido ⇒ not_granted, sem toast', async () => {
    mockRequest.mockResolvedValue(false)
    const { getByText, getByLabelText } = setup()
    fireEvent.press(getByText('abrir'))
    await waitFor(() => expect(mockAskMode).toHaveBeenCalled())
    await act(async () => {})
    await act(async () => fireEvent.press(getByLabelText('Ligar lembretes')))
    expect(outcomes).toEqual(['not_granted'])
    expect(mockShow).not.toHaveBeenCalled()
  })

  it('duplo toque em "Ligar" ⇒ um pedido só (D-5)', async () => {
    let release: (v: boolean) => void = () => {}
    mockRequest.mockImplementation(() => new Promise((r) => { release = r }))
    const { getByText, getByLabelText } = setup()
    fireEvent.press(getByText('abrir'))
    await waitFor(() => expect(mockAskMode).toHaveBeenCalled())
    await act(async () => {})
    fireEvent.press(getByLabelText('Ligar lembretes'))
    fireEvent.press(getByLabelText('Ligar lembretes'))
    await act(async () => release(true))
    expect(mockRequest).toHaveBeenCalledTimes(1)
  })

  it('reabrir com o sheet aberto fecha a promessa anterior como dismissed', async () => {
    let api: ReturnType<typeof usePushPrimer> | null = null
    function Grab() {
      api = usePushPrimer()
      return null
    }
    render(<PushPrimerProvider><Grab /></PushPrimerProvider>)
    let first: PrimerOutcome | null = null
    await act(async () => {
      api!.openPushPrimer({ entryPoint: 'today_banner' }).then((o) => { first = o })
    })
    await act(async () => {
      api!.openPushPrimer({ entryPoint: 'treatment_form' })
    })
    expect(first).toBe('dismissed')
  })

  it('sem provider ⇒ no-op que não lança', async () => {
    let got: PrimerOutcome | null = null
    function Bare() {
      const { openPushPrimer } = usePushPrimer()
      return <Pressable onPress={async () => { got = await openPushPrimer({ entryPoint: 'today_banner' }) }}><Text>x</Text></Pressable>
    }
    const { getByText } = render(<Bare />)
    await act(async () => fireEvent.press(getByText('x')))
    expect(got).toBe('dismissed')
  })
})
