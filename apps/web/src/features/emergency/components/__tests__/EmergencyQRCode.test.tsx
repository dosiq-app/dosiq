/**
 * @fileoverview Testes para o componente EmergencyQRCode
 * @module features/emergency/components/__tests__/EmergencyQRCode
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import QRCode from 'qrcode'
import { decodeEmergencyQrFragment } from '@dosiq/core'
import EmergencyQRCode from '@/features/emergency/components/EmergencyQRCode'

// Mock da biblioteca qrcode
vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,mockedQRCodeData'),
  },
}))

describe('EmergencyQRCode', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.clearAllTimers()
  })

  const mockCardData = {
    name: 'João Silva',
    blood_type: 'A+',
    allergies: ['Penicilina', 'Dipirona'],
  }

  const mockMedications = [
    { name: 'Losartana', dosagePerPill: 50, dosageUnit: 'mg', frequency: 'diário', dosesPerDay: 1 },
    { name: 'Metformina', dosagePerPill: 500, dosageUnit: 'mg', frequency: 'diário', dosesPerDay: 2 },
  ]

  const mockLastUpdated = '2026-03-05T10:00:00.000Z'

  it('deve renderizar o estado de loading inicialmente', () => {
    render(
      <EmergencyQRCode
        cardData={mockCardData}
        medications={mockMedications}
        lastUpdated={mockLastUpdated}
      />
    )

    expect(screen.getByText(/Gerando QR code/i)).toBeInTheDocument()
  })

  it('deve exibir mensagem quando não há dados', async () => {
    render(<EmergencyQRCode cardData={null} medications={[]} />)

    await waitFor(() => {
      expect(screen.getByText(/Dados insuficientes para gerar QR code/i)).toBeInTheDocument()
    })
  })

  it('deve renderizar QR code quando dados são fornecidos', async () => {
    render(
      <EmergencyQRCode
        cardData={mockCardData}
        medications={mockMedications}
        lastUpdated={mockLastUpdated}
      />
    )

    await waitFor(() => {
      expect(screen.getByAltText(/^EMERGENCIA/)).toBeInTheDocument()
    })
  })

  it('deve exibir botões de ação quando QR code é gerado', async () => {
    render(
      <EmergencyQRCode
        cardData={mockCardData}
        medications={mockMedications}
        lastUpdated={mockLastUpdated}
      />
    )

    await waitFor(() => {
      expect(screen.getByText(/Salvar Imagem/i)).toBeInTheDocument()
      expect(screen.getByText(/Compartilhar/i)).toBeInTheDocument()
    })
  })

  it('074 G-4: dica de impressão + ficha médica nativa no lugar da tela de bloqueio', async () => {
    render(<EmergencyQRCode cardData={mockCardData} medications={mockMedications} lastUpdated={mockLastUpdated} />)
    await waitFor(() => expect(screen.getByText(/Imprima a imagem no tamanho de um cartão/i)).toBeInTheDocument())
    expect(screen.getByText(/Ficha Médica \(iPhone\)/)).toBeInTheDocument()
    expect(screen.queryByText(/tela de bloqueio/i)).not.toBeInTheDocument()
  })

  it('074 FR-008: instrução de uso ao lado do QR', async () => {
    render(<EmergencyQRCode cardData={mockCardData} medications={mockMedications} lastUpdated={mockLastUpdated} />)
    await waitFor(() =>
      expect(screen.getByText(/Aponte a câmera do celular — abre alergias, medicamentos e contato/)).toBeInTheDocument(),
    )
  })

  it('074 PO-1: o QR recebe TEXTO legível do montador do core — sem base64/JSON', async () => {
    render(
      <EmergencyQRCode
        cardData={{ ...mockCardData, emergency_contacts: [{ name: 'Ana', phone: '11 98765-4321' }] }}
        medications={mockMedications}
        name="João Silva"
        lastUpdated={mockLastUpdated}
      />,
    )
    await waitFor(() => expect(QRCode.toDataURL).toHaveBeenCalled())
    const text = String(lastQrArg())
    expect(text).not.toContain('eyJ')
    expect(text).not.toContain('{')
    expect(text).toContain('EMERGENCIA: JOAO SILVA')
    expect(text).toContain('11 98765-4321')
    // G-6: alt = o próprio texto do QR
    expect(screen.getByAltText(text)).toBeInTheDocument()
  })

  it('085 C2: cadência por intervalo leva o N', async () => {
    const meds = [{ name: 'Depo', dosagePerPill: 150, dosageUnit: 'mg', frequency: 'intervalo_dias', intervalDays: 90 }]
    render(<EmergencyQRCode cardData={mockCardData} medications={meds} lastUpdated={mockLastUpdated} />)
    await waitFor(() => expect(QRCode.toDataURL).toHaveBeenCalled())
    expect(String(lastQrArg())).toContain('A CADA 90 DIAS')
  })

  it('074 FR-013: sem nome não imprime "Paciente"', async () => {
    render(<EmergencyQRCode cardData={mockCardData} medications={mockMedications} lastUpdated={mockLastUpdated} />)
    await waitFor(() => expect(QRCode.toDataURL).toHaveBeenCalled())
    expect(String(lastQrArg())).not.toMatch(/PACIENTE/i)
  })

  it('074 G-3: zona de silêncio de 4 módulos e correção M', async () => {
    render(<EmergencyQRCode cardData={mockCardData} medications={mockMedications} lastUpdated={mockLastUpdated} />)
    await waitFor(() => expect(QRCode.toDataURL).toHaveBeenCalled())
    const calls = (QRCode.toDataURL as unknown as { mock: { calls: unknown[][] } }).mock.calls
    expect(calls[calls.length - 1][1]).toMatchObject({ margin: 4, errorCorrectionLevel: 'M' })
  })

  it('074 G-5: aviso de corte para a dona do cartão quando o QR não cabe todos', async () => {
    const meds = Array.from({ length: 16 }, (_, i) => ({ name: `Medicamento Numero ${i + 1}`, dosagePerPill: 50, dosageUnit: 'mg', frequency: 'diário', dosesPerDay: 2 }))
    render(<EmergencyQRCode cardData={mockCardData} medications={meds} lastUpdated={mockLastUpdated} />)
    await waitFor(() => expect(screen.getByText(/dos 16 tratamentos — a/)).toBeInTheDocument())
  })

  it('077 AC-4.2: data é o dia de SP do lastUpdated (22:30 de 01/09 → 2026-09-01)', async () => {
    render(<EmergencyQRCode cardData={mockCardData} medications={mockMedications} lastUpdated="2026-09-02T01:30:00.000Z" />)
    await waitFor(() => expect(QRCode.toDataURL).toHaveBeenCalled())
    expect(String(lastQrArg())).toContain('ATUALIZADO 2026-09-01')
  })

  it('077 AC-4.2: sem lastUpdated, data é o hoje de SP (22:30 de 01/09 → 2026-09-01)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-02T01:30:00.000Z'))
    try {
      render(<EmergencyQRCode cardData={mockCardData} medications={mockMedications} />)
      await waitFor(() => expect(QRCode.toDataURL).toHaveBeenCalled())
      expect(String(lastQrArg())).toContain('ATUALIZADO 2026-09-01')
    } finally {
      vi.useRealTimers()
    }
  })
})

/** Último link passado ao QR, decodificado para o texto legível (D5). */
function lastQrArg() {
  const calls = (QRCode.toDataURL as unknown as { mock: { calls: unknown[][] } }).mock.calls
  const url = String(calls[calls.length - 1][0])
  expect(url.startsWith('https://dosiq.app/er#')).toBe(true)
  return decodeEmergencyQrFragment(url.slice(url.indexOf('#')))
}
