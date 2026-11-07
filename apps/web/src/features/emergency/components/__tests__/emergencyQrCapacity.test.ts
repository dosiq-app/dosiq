// emergencyQrCapacity.test.ts — 074 PO-4 / SC-001 / SC-004 (RC3 E-3); D5: mede o LINK inteiro.
// Teste cruzado com a lib `qrcode` REAL: este arquivo NÃO pode ter vi.mock('qrcode') — um teste que
// mede o mock passa sempre. A tabela de capacidade do core é a regra; a lib é a prova.
import { describe, it, expect, afterEach, vi } from 'vitest'
import QRCode from 'qrcode'
import { buildEmergencyQrText, EMERGENCY_QR_MAX_MODULES, type EmergencyMedication } from '@dosiq/core'

const modules = (text: string) => QRCode.create(text, { errorCorrectionLevel: 'M' }).modules.size

const card = {
  name: 'Maria José da Conceição',
  bloodType: 'O+',
  allergies: ['Dipirona', 'Penicilina'],
  contacts: [{ name: 'João', relationship: 'Filho', phone: '(11) 98765-4321' }],
  updatedOn: '2026-09-26',
}

function meds(n: number): EmergencyMedication[] {
  return Array.from({ length: n }, (_, i) => ({
    name: `Medicamento Numero ${i + 1}`,
    dosagePerPill: 2.5,
    dosageUnit: 'mg',
    dosagePerIntake: 1,
    dosesPerDay: 2,
    frequency: i % 3 === 0 ? 'intervalo_dias' : 'diário',
    intervalDays: i % 3 === 0 ? 90 : null,
  }))
}

describe('074 — capacidade real do QR (lib qrcode sem mock)', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.clearAllTimers()
  })

  it('PO-4/SC-004: nenhum cartão passa de 57×57 com 0..16 tratamentos', () => {
    for (let n = 0; n <= 16; n += 1) {
      const { url } = buildEmergencyQrText({ ...card, medications: meds(n) })
      expect({ n, ok: modules(url) <= EMERGENCY_QR_MAX_MODULES }).toEqual({ n, ok: true })
    }
  })

  it('PO-4: com 16, a lista termina em +N TRATAMENTOS NO CARTAO e mantém alergia e telefone', () => {
    const r = buildEmergencyQrText({ ...card, medications: meds(16) })
    expect(r.text).toMatch(/\. \+\d+ TRATAMENTOS NO CARTAO \/ AVISAR:/)
    expect(r.text).toContain('DIPIRONA. PENICILINA')
    expect(r.text).toContain('11 98765-4321')
  })

  it('caractere fora do alfabeto (percent-encoded) também respeita 57×57', () => {
    for (const n of [0, 4, 8, 16]) {
      const { url } = buildEmergencyQrText({ ...card, allergies: ['Látex & corante'], medications: meds(n) })
      expect(url).toContain('%26')
      expect(modules(url)).toBeLessThanOrEqual(EMERGENCY_QR_MAX_MODULES)
    }
  })

  it('SC-001: o QR do mesmo paciente encolhe frente ao base64(JSON) de hoje (≤ 61 onde era maior)', () => {
    const four = meds(4)
    const legacy = {
      v: '1',
      n: card.name,
      m: four.map((m) => ({ n: m.name, d: '2,5 mg', f: m.frequency === 'diário' ? 'Diário' : 'A cada 90 dias' })),
      a: card.allergies,
      dt: card.updatedOn,
      bt: card.bloodType,
    }
    const legacyText = btoa(unescape(encodeURIComponent(JSON.stringify(legacy))))
    const { url } = buildEmergencyQrText({ ...card, medications: four })
    expect(modules(url)).toBeLessThan(modules(legacyText))
    expect(modules(url)).toBeLessThanOrEqual(61)
  })
})
