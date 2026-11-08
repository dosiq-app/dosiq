// emergencyQrText.test.ts — spec 074: texto do QR do cartão legível por humano, fonte única da
// linha de medicamento, teto por tabela de capacidade v10-M (D3) e failure modes do montador.
import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  buildEmergencyQrText,
  formatEmergencyMedLine,
  normalizeQrText,
  encodeEmergencyQrFragment,
  decodeEmergencyQrFragment,
  EMERGENCY_QR_BASE_URL,
  type EmergencyMedication,
} from '../emergencyQrText'

const losartana: EmergencyMedication = {
  name: 'Losartana',
  dosagePerPill: 50,
  dosageUnit: 'mg',
  dosagePerIntake: 1,
  intakeUnit: null,
  dosesPerDay: 1,
  frequency: 'diário',
}

const base = {
  name: 'Maria José da Conceição',
  bloodType: 'O+',
  allergies: ['Dipirona', 'Penicilina'],
  contacts: [{ name: 'João', relationship: 'Filho', phone: '(11) 98765-4321' }],
  medications: [losartana],
  updatedOn: '2026-09-26',
}

function manyMeds(n: number): EmergencyMedication[] {
  return Array.from({ length: n }, (_, i) => ({
    ...losartana,
    name: `Medicamento Numero ${i + 1}`,
    dosagePerIntake: 2,
  }))
}

describe('074 — buildEmergencyQrText', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.clearAllTimers()
  })

  it('PO-1: texto legível, sem base64 nem JSON, com nome/sangue/alergia/dose/telefone', () => {
    const { text, url, droppedMedications } = buildEmergencyQrText(base)
    expect(text).not.toContain('eyJ')
    expect(text).not.toMatch(/[{}[\]]/)
    expect(text).toContain('EMERGENCIA: MARIA JOSE DA CONCEICAO')
    expect(text).toContain('SANGUE O+')
    expect(text).toContain('ALERGIA: DIPIRONA. PENICILINA')
    expect(text).toContain('USA: LOSARTANA 50 MG 1X/DIA /')
    expect(text).toContain('AVISAR: JOAO FILHO 11 98765-4321')
    expect(text).toContain('ATUALIZADO 2026-09-26')
    expect(url.startsWith('https://dosiq.app/er#')).toBe(true)
    expect(decodeEmergencyQrFragment(url.slice(url.indexOf('#')))).toBe(text)
    expect(droppedMedications).toBe(0)
  })

  it('SC-005a: intervalo_dias N=90 ⇒ A CADA 90 DIAS', () => {
    const { text } = buildEmergencyQrText({
      ...base,
      medications: [{ name: 'Depo', dosagePerPill: 150, dosageUnit: 'mg', dosesPerDay: 1, frequency: 'intervalo_dias', intervalDays: 90 }],
    })
    expect(text).toContain('DEPO 150 MG A CADA 90 DIAS')
  })

  it('sem alergia ⇒ ausência declarada (NENHUMA INFORMADA), nunca campo sumido', () => {
    expect(buildEmergencyQrText({ ...base, allergies: [] }).text).toContain('ALERGIA: NENHUMA INFORMADA')
    expect(buildEmergencyQrText({ ...base, allergies: null }).text).toContain('ALERGIA: NENHUMA INFORMADA')
  })

  it('PO-5/FR-013: sem nome ⇒ campo omitido, nunca "Paciente"', () => {
    const { text } = buildEmergencyQrText({ ...base, name: null })
    expect(text.startsWith('EMERGENCIA MEDICA / ')).toBe(true)
    expect(text).not.toMatch(/PACIENTE/i)
    expect(buildEmergencyQrText({ ...base, name: '   ' }).text).not.toMatch(/PACIENTE/i)
  })

  it('tipo sanguíneo desconhecido/ausente é omitido', () => {
    expect(buildEmergencyQrText({ ...base, bloodType: 'desconhecido' }).text).not.toContain('SANGUE')
    expect(buildEmergencyQrText({ ...base, bloodType: null }).text).not.toContain('SANGUE')
  })

  it('degenerados: sem medicamentos, sem contatos, sem data', () => {
    const r = buildEmergencyQrText({ name: 'Ana', medications: [], contacts: [], updatedOn: null })
    expect(r.text).toBe('EMERGENCIA: ANA / ALERGIA: NENHUMA INFORMADA')
    expect(r.droppedMedications).toBe(0)
    expect(r.totalMedications).toBe(0)
  })

  it('E-6: telefone +55 continua alfanumérico', () => {
    const r = buildEmergencyQrText({ ...base, contacts: [{ name: 'Ana', phone: '+55 11 98765-4321' }] })
    expect(r.text).toContain('AVISAR: ANA +55 11 98765-4321')
    expect(r.url).toContain('%2B55+11+98765-4321')
  })

  it('caractere fora do alfabeto ⇒ percent-encoded no link, texto preservado', () => {
    const r = buildEmergencyQrText({ ...base, allergies: ['Látex & corante'] })
    expect(r.text).toContain('LATEX & CORANTE')
    expect(r.url).toContain('LATEX+%26+CORANTE')
    expect(decodeEmergencyQrFragment(r.url.split('#')[1])).toBe(r.text)
    expect(r.overCapacity).toBe(false)
  })

  it('PO-4: 16 tratamentos ⇒ corta, anuncia +N como último item da lista, preserva alergia e contato', () => {
    const r = buildEmergencyQrText({ ...base, medications: manyMeds(16) })
    expect(r.droppedMedications).toBeGreaterThan(0)
    expect(r.text).toContain(`. +${r.droppedMedications} TRATAMENTOS NO CARTAO / AVISAR:`)
    expect(r.text).toContain('ALERGIA: DIPIRONA. PENICILINA')
    expect(r.text).toContain('11 98765-4321')
    expect(r.overCapacity).toBe(false)
    // corta na ORDEM recebida (a da tela): os primeiros ficam
    expect(r.text).toContain('MEDICAMENTO NUMERO 1 ')
  })

  it('contatos extras só entram se couberem depois de todos os medicamentos', () => {
    const contacts = [
      { name: 'João', phone: '11 1111-1111' },
      { name: 'Ana', phone: '11 2222-2222' },
    ]
    expect(buildEmergencyQrText({ ...base, contacts }).text).toContain('ANA 11 2222-2222')
    const cut = buildEmergencyQrText({ ...base, contacts, medications: manyMeds(16) })
    expect(cut.text).toContain('JOAO 11 1111-1111')
    expect(cut.text).not.toContain('ANA 11 2222-2222')
  })

  it('INV-1: alergia gigante nunca é cortada — sinaliza overCapacity', () => {
    const allergies = Array.from({ length: 20 }, (_, i) => `Alergia longa numero ${i}`)
    const r = buildEmergencyQrText({ ...base, allergies, medications: manyMeds(4) })
    expect(r.text).toContain('ALERGIA LONGA NUMERO 19')
    expect(r.droppedMedications).toBe(4)
    expect(r.overCapacity).toBe(true)
  })
})

describe('074 — linha compacta do QR (smoke 2026-11-07: só 2 de 8 cabiam)', () => {
  const smoke: EmergencyMedication[] = [
    { name: 'Mesigyna', dosagePerPill: 50, dosageUnit: 'mg/ml', dosagePerIntake: 1, intakeUnit: 'ml', dosesPerDay: 1, frequency: 'intervalo_dias', intervalDays: 30 },
    { name: 'Puran T4', dosagePerPill: 75, dosageUnit: 'mcg', dosagePerIntake: 1, dosesPerDay: 1, frequency: 'diário' },
    { name: 'Sinvastatina', dosagePerPill: 20, dosageUnit: 'mg', dosagePerIntake: 1, dosesPerDay: 1, frequency: 'diário' },
    { name: 'Ozempic', dosagePerPill: 1.34, dosageUnit: 'mg/ml', dosagePerIntake: 0.25, intakeUnit: 'mg', dosesPerDay: 1, frequency: 'semanal' },
    { name: 'Metropolol', dosagePerPill: 25, dosageUnit: 'mg', dosagePerIntake: 2, dosesPerDay: 2, frequency: 'diário' },
    { name: 'Mounjaro', dosagePerPill: 5, dosageUnit: 'mg/ml', dosagePerIntake: 2.5, intakeUnit: 'mg', dosesPerDay: 1, frequency: 'semanal' },
    { name: 'Lantus', dosagePerPill: 100, dosageUnit: 'ui/ml', dosagePerIntake: 10, intakeUnit: 'UI', dosesPerDay: 3, frequency: 'diário' },
    { name: 'Wegovy', dosagePerPill: 3.2, dosageUnit: 'mg/ml', dosagePerIntake: 2.4, intakeUnit: 'mg', dosesPerDay: 1, frequency: 'semanal' },
  ]
  const r = buildEmergencyQrText({
    name: 'Maria', bloodType: 'A+', allergies: ['Nenhuma'],
    contacts: [{ name: 'Ze Smoke Girl', relationship: 'Muie', phone: '(99)99999-9999' }],
    medications: smoke, updatedOn: '2026-11-07',
  })

  it('sem concentração repetida, sem "≈ mL", cadência curta', () => {
    expect(r.text).toContain('MESIGYNA 1 ML A CADA 30 DIAS')
    expect(r.text).toContain('PURAN T4 75 MCG 1X/DIA')
    expect(r.text).toContain('OZEMPIC 0.25 MG SEMANAL')
    expect(r.text).not.toContain('≈')
  })

  it('mais de uma unidade por tomada mantém a contagem', () => {
    const only = buildEmergencyQrText({ name: 'Maria', medications: [smoke[4]] })
    expect(only.text).toContain('METROPOLOL 2 UN. 50 MG 2X/DIA')
  })

  it('o cartão real do smoke passa de 2 para 4 dos 8 tratamentos', () => {
    expect(r.totalMedications - r.droppedMedications).toBe(4)
    expect(r.text).toContain('. +4 TRATAMENTOS NO CARTAO / AVISAR:')
    expect(r.overCapacity).toBe(false)
  })
})

describe('074 — formatEmergencyMedLine (fonte única da linha)', () => {
  it('diário com tomadas ⇒ "Nx ao dia"', () => {
    const line = formatEmergencyMedLine({ ...losartana, dosesPerDay: 2 })
    expect(line).toMatchObject({ name: 'Losartana', strength: '50 mg', frequency: '2x ao dia' })
    expect(line.dose).toContain('50 mg')
  })

  it('cadência não-diária mantém a contagem de tomadas (073/F-12)', () => {
    const line = formatEmergencyMedLine({ ...losartana, frequency: 'semanal', dosesPerDay: 2 })
    expect(line.frequency).toBe('2x — Semanal')
  })

  it('sem cadastro: sem concentração, sem dose, sem frequência — nulos, nunca inventados', () => {
    expect(formatEmergencyMedLine({ name: 'X' })).toEqual({ name: 'X', strength: null, dose: null, frequency: null })
  })
})

describe('074 — normalizeQrText', () => {
  it('maiúsculas, sem acento, vírgula vira ponto, sem parênteses', () => {
    expect(normalizeQrText('Ação 0,5 mL (filho)')).toBe('ACAO 0.5 ML FILHO')
  })
})

describe('074 D5 — link do QR (fragmento)', () => {
  it('prefixo minúsculo (HTTPS maiúsculo derruba a câmera do Android)', () => {
    expect(EMERGENCY_QR_BASE_URL).toBe('https://dosiq.app/er#')
  })

  it('FR-017: + literal vira %2B, espaço vira +, % vira %25; tudo no alfabeto alfanumérico', () => {
    const frag = encodeEmergencyQrFragment('SANGUE A+ / 50%')
    expect(frag).toBe('SANGUE+A%2B+/+50%25')
    expect(frag).toMatch(/^[0-9A-Z $%*+\-./:]*$/)
  })

  it('round-trip: A+, O-, acento residual e símbolos', () => {
    for (const t of ['SANGUE A+', 'SANGUE O-', 'ALERGIA: LATEX & ß', 'X / Y: 1.5 MG']) {
      expect(decodeEmergencyQrFragment(encodeEmergencyQrFragment(t))).toBe(t)
    }
  })

  it("RC6 #935: ' ! ~ _ (que encodeURIComponent deixa crus) saem percent-encoded e voltam iguais", () => {
    const frag = encodeEmergencyQrFragment("D'AVILA ! ~ _")
    expect(frag).toBe('D%27AVILA+%21+%7E+%5F')
    expect(frag).toMatch(/^[0-9A-Z $%*+\-./:]*$/)
    expect(decodeEmergencyQrFragment(frag)).toBe("D'AVILA ! ~ _")
  })

  it('decode: vazio, só # e percent inválido ⇒ null', () => {
    expect(decodeEmergencyQrFragment('')).toBeNull()
    expect(decodeEmergencyQrFragment('#')).toBeNull()
    expect(decodeEmergencyQrFragment(null)).toBeNull()
    expect(decodeEmergencyQrFragment('#ABC%E0%A4%A')).toBeNull()
  })
})
