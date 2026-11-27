import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@services/api/reactivationAdminService', () => ({
  reactivationAdminService: {
    getVariants: vi.fn(),
    simulate: vi.fn(),
    send: vi.fn(),
  },
}))

import ReactivationAdmin from '../ReactivationAdmin'
import { parseCohort, isValidMinVersion, simulationKey } from '../reactivationFormUtils'
import { reactivationAdminService } from '@services/api/reactivationAdminService'

const svc = reactivationAdminService as unknown as Record<'getVariants' | 'simulate' | 'send', ReturnType<typeof vi.fn>>

const U1 = 'a0000000-0000-4000-8000-000000000001'
const U2 = 'a0000000-0000-4000-8000-000000000002'

const VARIANTS = {
  A: { title: 'O dosiq ficou mais fácil', body: 'Corpo A' },
  B: { title: 'A gente melhorou o cadastro', body: 'Corpo B' },
  C: { title: 'Leva 1 minuto', body: 'Corpo C' },
  D: { title: 'Bom te ver de volta?', body: 'Corpo D' },
  E: { title: 'Uma mensagem do Coelho', body: 'Corpo E' },
}

/** Payload no formato do handler (api/admin/_handlers/reactivation.ts). */
const SIMULATION = {
  mode: 'simulate', variant: 'B', preview: VARIANTS.B, min_version: '0.35.0', cohort: 2,
  would_send: [U1], skipped: [{ user_id: U2, reason: 'no_eligible_device' }], skipped_by_reason: { no_eligible_device: 1 },
}

afterEach(() => { vi.clearAllMocks(); vi.clearAllTimers() })

describe('reactivationFormUtils', () => {
  it('normaliza coorte colada de CSV/JSON: separadores, aspas, caixa, repetidos e inválidos', () => {
    const r = parseCohort(`"${U1}",\n${U2.toUpperCase()}; ${U1}  lixo ['x']`)
    expect(r.valid).toEqual([U1, U2])
    expect(r.duplicates).toBe(1)
    expect(r.invalid).toEqual(['lixo', 'x'])
  })

  it('valida versão e gera chave estável à ordem da coorte', () => {
    expect(isValidMinVersion('0.35.0')).toBe(true)
    expect(isValidMinVersion('nova')).toBe(false)
    expect(simulationKey([U2, U1], 'B', '0.35.0')).toBe(simulationKey([U1, U2], 'B', ' 0.35.0 '))
  })
})

describe('ReactivationAdmin', () => {
  beforeEach(() => {
    svc.getVariants.mockResolvedValue(VARIANTS)
    svc.simulate.mockResolvedValue(SIMULATION)
    svc.send.mockResolvedValue({ ...SIMULATION, mode: 'send', sent: [{ user_id: U1, delivered: 1, failed: 0 }], unlogged: [] })
  })

  async function simulateTwo() {
    render(<ReactivationAdmin onBack={vi.fn()} />)
    await screen.findByTestId('variant-preview')
    fireEvent.change(screen.getByLabelText(/Coorte/), { target: { value: `${U1}\n${U2}` } })
    fireEvent.click(screen.getByRole('button', { name: /Simular/ }))
    await screen.findByTestId('simulation')
  }

  it('mostra a copy da variante vinda do servidor', async () => {
    render(<ReactivationAdmin onBack={vi.fn()} />)
    expect(await screen.findByText('A gente melhorou o cadastro')).toBeTruthy()
  })

  it('simula com os campos normalizados e só libera Enviar com ENVIAR digitado', async () => {
    await simulateTwo()
    expect(svc.simulate).toHaveBeenCalledWith({ user_ids: [U1, U2], variant: 'B', min_version: '0.35.0' })
    expect(screen.getByText('Sem aparelho ativo na versão mínima')).toBeTruthy()
    const sendBtn = screen.getByRole('button', { name: /Enviar/ }) as HTMLButtonElement
    expect(sendBtn.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(/Digite ENVIAR/), { target: { value: 'ENVIAR' } })
    expect(sendBtn.disabled).toBe(false)
    fireEvent.click(sendBtn)
    await screen.findByTestId('send-result')
    expect(svc.send).toHaveBeenCalledWith({ user_ids: [U1, U2], variant: 'B', min_version: '0.35.0' }, 'ENVIAR')
  })

  it('mudar um campo depois da simulação esconde o envio até simular de novo', async () => {
    await simulateTwo()
    fireEvent.click(screen.getByRole('radio', { name: /C/ }))
    await waitFor(() => expect(screen.queryByTestId('simulation')).toBeNull())
    expect(screen.getByText(/Simule de novo/)).toBeTruthy()
    expect(svc.send).not.toHaveBeenCalled()
  })

  it('destaca contas enviadas sem registro no histórico', async () => {
    svc.send.mockResolvedValueOnce({ ...SIMULATION, mode: 'send', sent: [{ user_id: U1, delivered: 1, failed: 0 }], unlogged: [U1] })
    await simulateTwo()
    fireEvent.change(screen.getByLabelText(/Digite ENVIAR/), { target: { value: 'ENVIAR' } })
    fireEvent.click(screen.getByRole('button', { name: /Enviar/ }))
    expect(await screen.findByText(/podem receber de novo/)).toBeTruthy()
  })
})
