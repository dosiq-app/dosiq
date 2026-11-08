/**
 * Montador ÚNICO do conteúdo do cartão de emergência (spec 074).
 *
 * O QR do cartão é lido pela câmera nativa de um terceiro. Câmera nativa só age sobre tipos que
 * reconhece (URL, contato, tel:) — texto puro não abre nada no iPhone e vai à busca do Google no
 * Android (smoke 2026-11-07, D5). Por isso o QR é um LINK `https://dosiq.app/er#<texto>`: o texto
 * legível vai no FRAGMENTO, que nunca é enviado ao servidor; a página `/er` só o decodifica.
 * Nunca base64/JSON (o formato antigo era ilegível por qualquer leitor). Fonte única da
 * linha de medicamento (`formatEmergencyMedLine`) para a tela, a impressão, o QR e — na 006 — o
 * mobile (AP-339: duas agregações = duas verdades).
 *
 * Puro: sem lib de QR, sem relógio (a data entra por parâmetro — R-020/077).
 */

import { formatFrequencyLabel } from '../schemas/protocolSchema'
import { formatConcentration, formatIntakeDose } from './doseUnit'

/** Medicamento vigente do cartão, no formato que a tela do cartão já monta. */
export interface EmergencyMedication {
  name: string | null | undefined
  dosagePerPill?: number | string | null
  dosageUnit?: string | null
  unitsPerMl?: number | null
  intakeUnit?: string | null
  dosagePerIntake?: number | string | null
  dosesPerDay?: number | null
  frequency?: string | null
  intervalDays?: number | null
}

export interface EmergencyMedLine {
  name: string
  /** Concentração ("50 mg"); null quando o cadastro não tem. */
  strength: string | null
  /** Dose por tomada já formatada pelo core; null sem posologia. */
  dose: string | null
  /** Tomadas + cadência ("2x ao dia", "1x — A cada 90 dias"); null sem frequência. */
  frequency: string | null
}

/**
 * Linha legível de um medicamento do cartão. Dose e cadência só pelos formatadores do core
 * (FR-003/003a); a contagem de tomadas não some em cadência não-diária (073/F-12).
 */
export function formatEmergencyMedLine(med: EmergencyMedication): EmergencyMedLine {
  const medicineLike = {
    dosage_unit: med.dosageUnit ?? null,
    dosage_per_pill: med.dosagePerPill ?? null,
    units_per_ml: med.unitsPerMl ?? null,
  }
  const dose =
    med.dosagePerIntake != null && med.dosagePerIntake !== ''
      ? formatIntakeDose(med.dosagePerIntake, med.intakeUnit, medicineLike) || null
      : null
  const strength = formatConcentration(med.dosagePerPill ?? null, med.dosageUnit ?? null) || null
  const cadence = med.frequency ? formatFrequencyLabel(med.frequency, med.intervalDays) : null
  const doses = med.dosesPerDay != null ? `${med.dosesPerDay}x` : null
  const frequency =
    med.frequency === 'diário' && doses
      ? `${doses} ao dia`
      : [doses, cadence].filter(Boolean).join(' — ') || null
  return { name: String(med.name ?? '').trim(), strength, dose, frequency }
}

export interface EmergencyContact {
  name?: string | null
  phone?: string | null
  relationship?: string | null
}

export interface EmergencyQrInput {
  /** `display_name` do perfil; ausente ⇒ campo omitido, nunca "Paciente" (FR-013). */
  name?: string | null
  bloodType?: string | null
  allergies?: readonly (string | null | undefined)[] | null
  contacts?: readonly EmergencyContact[] | null
  medications?: readonly EmergencyMedication[] | null
  /** Dia local `YYYY-MM-DD` da última atualização (calculado pelo chamador). */
  updatedOn?: string | null
}

export interface EmergencyQrText {
  /** Texto legível (alfabeto alfanumérico do QR) — `alt` da imagem e conteúdo da `/er`. */
  text: string
  /** Link codificado no QR: `EMERGENCY_QR_BASE_URL` + fragmento (D5). */
  url: string
  /** Tratamentos que ficaram fora do QR pelo teto (D3). */
  droppedMedications: number
  totalMedications: number
  /** Campos inegociáveis (alergia/contato) sozinhos passam do teto — QR excede 57×57. */
  overCapacity: boolean
}

/**
 * Versão 10 (57×57 módulos) com correção M comporta 216 codewords de dados = **1728 bits**
 * (ISO/IEC 18004; conferido contra a lib `qrcode`, RC3 E-1). O teto do cartão é medido em módulos (D3).
 */
export const EMERGENCY_QR_DATA_BITS = 1728
export const EMERGENCY_QR_MAX_MODULES = 57

/**
 * Prefixo do link (D5). MINÚSCULO por exigência de device: `HTTPS://` derruba a câmera do Android
 * (o esquema é comparado com distinção de caixa). Domínio fixo — nunca `location.origin`: o QR
 * impresso tem de apontar para produção mesmo se gerado num preview.
 */
export const EMERGENCY_QR_BASE_URL = 'https://dosiq.app/er#'

const ALNUM_CHAR_RE = /[0-9A-Z $%*+\-./:]/
const SEP = ' / '

/**
 * Texto → fragmento do link, todo no alfabeto alfanumérico do QR: `%` e `+` literais viram `%25`/`%2B`
 * (o `+` de "A+" não pode virar espaço na leitura — FR-017), espaço vira `+`, e qualquer caractere
 * fora do alfabeto é percent-encoded (hex maiúsculo, continua alfanumérico).
 */
export function encodeEmergencyQrFragment(text: string): string {
  let out = ''
  for (const ch of text) {
    if (ch === '%') out += '%25'
    else if (ch === '+') out += '%2B'
    else if (ch === ' ') out += '+'
    else if (ALNUM_CHAR_RE.test(ch)) out += ch
    // Byte a byte, explícito: `encodeURIComponent` deixa `' ! ~ _` crus (fora do alfabeto do QR),
    // o que forçaria segmento Byte e furaria a conta de bits (RC6 #935).
    else out += Array.from(utf8(ch), (b) => '%' + b.toString(16).toUpperCase().padStart(2, '0')).join('')
  }
  return out
}

/** UTF-8 sem `TextEncoder` (core roda também no RN): `encodeURIComponent` escapa tudo fora de ASCII. */
function utf8(ch: string): number[] {
  const escaped = encodeURIComponent(ch)
  if (!escaped.startsWith('%')) return [ch.charCodeAt(0)]
  return escaped.split('%').slice(1).map((h) => parseInt(h, 16))
}

/** Fragmento (com ou sem `#`) → texto. Inválido/vazio ⇒ `null` (a `/er` mostra "QR incompleto"). */
export function decodeEmergencyQrFragment(fragment: string | null | undefined): string | null {
  const raw = (fragment ?? '').replace(/^#/, '')
  if (!raw) return null
  try {
    const text = decodeURIComponent(raw.replace(/\+/g, ' ')).trim()
    return text || null
  } catch {
    return null
  }
}

/**
 * Custo em bits do link no QR: prefixo em segmento Byte + fragmento em segmento Alfanumérico (v10:
 * contadores de 16 e 11 bits). Conservador — a lib otimiza segmentos e nunca gasta mais.
 */
function linkBits(fragment: string): number {
  const prefix = 4 + 16 + 8 * EMERGENCY_QR_BASE_URL.length // ASCII: 1 byte por char
  const n = fragment.length
  return prefix + 4 + 11 + 11 * Math.floor(n / 2) + 6 * (n % 2)
}

/** Texto → alfabeto alfanumérico do QR (AD-3): maiúsculas, sem acento, `,`→`.`, sem parênteses. */
export function normalizeQrText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/,/g, '.')
    .replace(/[—–]/g, '-')
    .replace(/[()[\]{};]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function fits(text: string): boolean {
  return linkBits(encodeEmergencyQrFragment(text)) <= EMERGENCY_QR_DATA_BITS
}

/**
 * Linha COMPACTA do QR, derivada da mesma `formatEmergencyMedLine` da tela (sem segunda verdade):
 * o QR tem ~277 caracteres para tudo, e a linha da tela repete a concentração ("75 mcg · 1 un.
 * (75 mcg)") e carrega detalhe de seringa. No QR: nome + dose (o que vai no corpo) + cadência curta.
 * - "1 un. (75 mcg)" → "75 mcg"; "2 un. (20 mg)" → "2 un. 20 mg"; "≈ 0,19 mL" sai
 * - sem dose ⇒ concentração; "1x ao dia" → "1x/dia"; "1x — Semanal" → "Semanal" (1x implícito)
 */
function compactDose(line: EmergencyMedLine): string | null {
  if (!line.dose) return line.strength
  const dose = line.dose.replace(/\s*\(≈[^)]*\)/g, '').trim()
  const units = /^(\d+(?:[.,]\d+)?) un\.? \((.+)\)$/.exec(dose)
  if (!units) return dose
  return units[1] === '1' ? units[2] : `${units[1]} un. ${units[2]}`
}

function compactFrequency(frequency: string | null): string | null {
  if (!frequency) return null
  return frequency.replace(/ ao dia$/, '/dia').replace(/^1x — /, '')
}

function medToQr(med: EmergencyMedication): string {
  const line = formatEmergencyMedLine(med)
  return normalizeQrText(
    [line.name, compactDose(line), compactFrequency(line.frequency)].filter(Boolean).join(' '),
  )
}

function contactToQr(c: EmergencyContact): string {
  return normalizeQrText([c.name, c.relationship, c.phone].filter(Boolean).join(' '))
}

/**
 * Monta o texto do QR. Ordem (FR-002): nome · sangue · alergias · medicamentos · contato · data.
 * Teto (D3/FR-010): corta a lista de medicamentos (na ordem recebida, a da tela) e anuncia
 * `+N TRATAMENTOS NO CARTAO` como último item do `USA:`; alergia e 1º contato nunca são cortados; contatos extras só se
 * couberem depois de todos os medicamentos.
 */
export function buildEmergencyQrText(input: EmergencyQrInput): EmergencyQrText {
  const name = normalizeQrText(input.name ?? '')
  const blood =
    input.bloodType && input.bloodType !== 'desconhecido' ? normalizeQrText(input.bloodType) : ''
  const allergies = (input.allergies ?? []).map((a) => normalizeQrText(a ?? '')).filter(Boolean)
  const contacts = (input.contacts ?? []).map(contactToQr).filter(Boolean)
  const meds = (input.medications ?? []).map(medToQr).filter(Boolean)

  const head = [
    name ? `EMERGENCIA: ${name}` : 'EMERGENCIA MEDICA',
    blood ? `SANGUE ${blood}` : '',
    `ALERGIA: ${allergies.length ? allergies.join('. ') : 'NENHUMA INFORMADA'}`,
  ].filter(Boolean)
  const tail = input.updatedOn ? `ATUALIZADO ${input.updatedOn}` : ''

  const compose = (medList: string[], dropped: number, contactList: string[]) => {
    const parts = [...head]
    // D3 (ajuste do smoke 2026-11-07): o corte é anunciado JUNTO da lista, como último item.
    const cut = dropped > 0 ? [`+${dropped} TRATAMENTOS NO CARTAO`] : []
    if (medList.length || cut.length) parts.push(`USA: ${[...medList, ...cut].join('. ')}`)
    if (contactList.length) parts.push(`AVISAR: ${contactList.join('. ')}`)
    if (tail) parts.push(tail)
    return parts.join(SEP)
  }

  const firstContact = contacts.slice(0, 1)
  let kept = meds.length
  let text = compose(meds, 0, firstContact)
  while (kept > 0 && !fits(text)) {
    kept -= 1
    text = compose(meds.slice(0, kept), meds.length - kept, firstContact)
  }
  const dropped = meds.length - kept

  // Contatos extras: só se couberem, depois de todos os medicamentos (plan, Clarifications).
  if (dropped === 0) {
    for (let n = 2; n <= contacts.length; n += 1) {
      const candidate = compose(meds, 0, contacts.slice(0, n))
      if (!fits(candidate)) break
      text = candidate
    }
  }

  return {
    text,
    url: EMERGENCY_QR_BASE_URL + encodeEmergencyQrFragment(text),
    droppedMedications: dropped,
    totalMedications: meds.length,
    overCapacity: !fits(text),
  }
}
