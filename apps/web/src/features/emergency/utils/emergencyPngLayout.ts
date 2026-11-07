/**
 * Layout PURO do PNG do cartão de emergência (spec 074, RC2 G-2/G-3/G-7, RC3 E-4).
 *
 * Formato cartão de carteira CR80 retrato: 1024×1632 px. QR no topo (~78% da largura) com zona de
 * silêncio de 4 módulos (a da lib); faixa de texto abaixo, pt-BR COM acento, corpo ≥ 64 px que
 * reduz até 56 px e então trunca as alergias com "… ver cartão completo" (a faixa é redundância:
 * o QR carrega a alergia inteira). `measure` é injetado ⇒ testável sem canvas (jsdom não tem).
 */

export const PNG_WIDTH = 1024
export const PNG_HEIGHT = 1632
export const PNG_PADDING = 48
export const PNG_QR_SIZE = 800
export const PNG_QR_MARGIN_MODULES = 4
export const PNG_TITLE_PX = 80
export const PNG_BODY_PX = 64
export const PNG_BODY_MIN_PX = 56
export const PNG_LINE_HEIGHT = 1.2
export const PNG_TITLE = 'EMERGÊNCIA MÉDICA'
export const PNG_TRUNCATION = '… ver cartão completo'
export const PNG_INSTRUCTION = 'Aponte a câmera para o QR'

/** Largura do texto em px para um corpo de fonte (`bold` só no título). */
export type MeasureText = (text: string, fontPx: number, bold?: boolean) => number

export interface EmergencyPngFields {
  name?: string | null
  bloodType?: string | null
  allergies?: readonly string[] | null
  /** "João (Filho) (11) 98765-4321" — 1º contato já formatado. */
  contact?: string | null
}

export interface PngTextLine {
  text: string
  fontPx: number
  bold: boolean
  /** Linha de base (y) no canvas. */
  y: number
  color: 'title' | 'body'
}

export interface EmergencyPngLayout {
  width: number
  height: number
  qr: { x: number; y: number; size: number; margin: number }
  lines: PngTextLine[]
  bodyPx: number
  truncated: boolean
}

/** Quebra por palavra; palavra maior que a largura é cortada por caractere. */
export function wrapText(text: string, maxWidth: number, fontPx: number, measure: MeasureText, bold = false): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (measure(candidate, fontPx, bold) <= maxWidth) {
      current = candidate
      continue
    }
    if (current) lines.push(current)
    if (measure(word, fontPx, bold) <= maxWidth) {
      current = word
      continue
    }
    let chunk = ''
    for (const ch of word) {
      if (measure(chunk + ch, fontPx, bold) > maxWidth && chunk) {
        lines.push(chunk)
        chunk = ch
      } else {
        chunk += ch
      }
    }
    current = chunk
  }
  if (current) lines.push(current)
  return lines
}

function blocksFor(fields: EmergencyPngFields) {
  const allergies = (fields.allergies ?? []).filter(Boolean)
  return {
    before: [
      fields.name?.trim() || null,
      fields.bloodType ? `Sangue: ${fields.bloodType}` : null,
    ].filter((v): v is string => Boolean(v)),
    allergies: `Alergias: ${allergies.length ? allergies.join(', ') : 'nenhuma informada'}`,
    after: [fields.contact ? `Avisar: ${fields.contact}` : null, PNG_INSTRUCTION].filter(
      (v): v is string => Boolean(v),
    ),
  }
}

export function layoutEmergencyPng(fields: EmergencyPngFields, measure: MeasureText): EmergencyPngLayout {
  const maxWidth = PNG_WIDTH - PNG_PADDING * 2
  const qr = { x: (PNG_WIDTH - PNG_QR_SIZE) / 2, y: PNG_PADDING, size: PNG_QR_SIZE, margin: PNG_QR_MARGIN_MODULES }
  const bandTop = qr.y + qr.size + 24
  const bandBottom = PNG_HEIGHT - PNG_PADDING
  const titleLines = wrapText(PNG_TITLE, maxWidth, PNG_TITLE_PX, measure, true)
  const titleHeight = titleLines.length * PNG_TITLE_PX * PNG_LINE_HEIGHT
  const blocks = blocksFor(fields)

  let bodyPx = PNG_BODY_PX
  let allergyLines: string[] = []
  let fixedLines: { before: string[]; after: string[] } = { before: [], after: [] }
  let truncated = false

  for (;;) {
    const wrap = (t: string) => wrapText(t, maxWidth, bodyPx, measure)
    fixedLines = { before: blocks.before.flatMap(wrap), after: blocks.after.flatMap(wrap) }
    allergyLines = wrap(blocks.allergies)
    const lineH = bodyPx * PNG_LINE_HEIGHT
    const budget = Math.floor((bandBottom - bandTop - titleHeight) / lineH)
    const fixed = fixedLines.before.length + fixedLines.after.length
    if (fixed + allergyLines.length <= budget) break
    if (bodyPx > PNG_BODY_MIN_PX) {
      bodyPx -= 4
      continue
    }
    // No corpo mínimo: só as alergias encolhem; a última linha visível anuncia o corte.
    const room = Math.max(1, budget - fixed)
    allergyLines = [...allergyLines.slice(0, room - 1), PNG_TRUNCATION]
    truncated = true
    break
  }

  const lines: PngTextLine[] = []
  let y = bandTop
  for (const text of titleLines) {
    y += PNG_TITLE_PX * PNG_LINE_HEIGHT
    lines.push({ text, fontPx: PNG_TITLE_PX, bold: true, y, color: 'title' })
  }
  for (const text of [...fixedLines.before, ...allergyLines, ...fixedLines.after]) {
    y += bodyPx * PNG_LINE_HEIGHT
    lines.push({ text, fontPx: bodyPx, bold: false, y, color: 'body' })
  }

  return { width: PNG_WIDTH, height: PNG_HEIGHT, qr, lines, bodyPx, truncated }
}

/** Nome de arquivo derivado do nome normalizado (G-9): sem acento, kebab; sem nome ⇒ dosiq. */
export function emergencyPngFileName(name?: string | null): string {
  const slug = (name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `cartao-emergencia-${slug || 'dosiq'}.png`
}
