// erPage.test.ts — 074 D5 / PO-7 / FR-016 / INV-6: a página estática `public/er.html` decodifica o
// fragmento gerado pelo montador do core e mostra o cartão. Teste cruzado: o link vem do core REAL,
// a página roda num JSDOM próprio com o script dela (sem copiar o decoder para cá).
import { describe, it, expect, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { JSDOM } from 'jsdom'
import { buildEmergencyQrText, EMERGENCY_QR_BASE_URL } from '@dosiq/core'

const HTML = readFileSync(resolve(__dirname, '../../../../../public/er.html'), 'utf8')

function open(url: string) {
  const dom = new JSDOM(HTML, { url, runScripts: 'dangerously' })
  const doc = dom.window.document
  return { doc, text: doc.body.textContent ?? '', dom }
}

const card = {
  name: 'Maria José',
  bloodType: 'A+',
  allergies: ['Dipirona', 'Penicilina'],
  contacts: [{ name: 'Zé', relationship: 'Filho', phone: '(11) 98765-4321' }],
  medications: [{ name: 'Losartana', dosagePerPill: 50, dosageUnit: 'mg', dosesPerDay: 2, frequency: 'diário' }],
  updatedOn: '2026-11-07',
}

describe('074 D5 — página /er', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.clearAllTimers()
  })

  it('PO-7: round-trip core → link → página: nome, sangue A+ (sem virar espaço), alergia, remédio, contato', () => {
    const { url } = buildEmergencyQrText(card)
    expect(url.startsWith(EMERGENCY_QR_BASE_URL)).toBe(true)
    const { doc, text } = open(url)
    expect(doc.querySelector('.name')?.textContent).toBe('MARIA JOSE')
    expect(text).toContain('TIPO SANGUÍNEO')
    expect(text).toContain('A+')
    expect(doc.querySelector('.allergy .value')?.textContent).toBe('DIPIRONA. PENICILINA')
    expect([...doc.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      expect.stringContaining('LOSARTANA 50 MG'),
    ])
    expect(text).toContain('ATUALIZADO 2026-11-07')
  })

  it('contato vira link tel: só com dígitos', () => {
    const { doc } = open(buildEmergencyQrText(card).url)
    const call = doc.querySelector('a.call') as HTMLAnchorElement
    expect(call.getAttribute('href')).toBe('tel:11987654321')
  })

  it('várias linhas de medicamento separadas pelo ". " do montador', () => {
    const meds = [card.medications[0], { name: 'Metformina', dosagePerPill: 850, dosageUnit: 'mg', dosesPerDay: 2, frequency: 'diário' }]
    const { doc } = open(buildEmergencyQrText({ ...card, medications: meds }).url)
    expect(doc.querySelectorAll('li')).toHaveLength(2)
  })

  it('corte: "+N TRATAMENTOS NO CARTAO" vira o último item da lista, separado do remédio anterior', () => {
    const many = Array.from({ length: 16 }, (_, i) => ({ ...card.medications[0], name: `Remedio ${i + 1}` }))
    const r = buildEmergencyQrText({ ...card, medications: many })
    const items = [...open(r.url).doc.querySelectorAll('li')]
    const last = items[items.length - 1]
    expect(last.className).toBe('cut')
    expect(last.textContent).toBe(`+${r.droppedMedications} tratamentos no cartão impresso`)
    expect(items[items.length - 2].textContent).not.toContain('TRATAMENTOS')
  })

  it('branding: logo e links de política/termos', () => {
    const { doc } = open(buildEmergencyQrText(card).url)
    expect(doc.querySelector('.brand img')?.getAttribute('src')).toBe('/dosiq-logo-verde.svg')
    const hrefs = [...doc.querySelectorAll('footer a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['/politica-de-privacidade', '/termos-de-uso'])
  })

  it('fragmento vazio ou corrompido ⇒ "QR incompleto", sem quebrar', () => {
    for (const url of ['https://dosiq.app/er', 'https://dosiq.app/er#', 'https://dosiq.app/er#ABC%E0%A4%A']) {
      expect(open(url).text).toContain('QR incompleto')
    }
  })

  it('segurança: HTML no fragmento é texto, nunca markup', () => {
    const evil = 'https://dosiq.app/er#EMERGENCIA:+%3Cimg+src%3Dx+onerror%3Dalert(1)%3E'
    const { doc } = open(evil)
    expect(doc.querySelector('[onerror], img[src="x"]')).toBeNull()
    expect(doc.querySelector('.name')?.textContent).toContain('<img')
  })

  it('INV-6: página sem script externo, sem fetch/XHR/beacon, noindex', () => {
    expect(HTML).not.toMatch(/<script[^>]+src=/i)
    const script = HTML.slice(HTML.indexOf('<script>'), HTML.indexOf('</script>'))
    expect(script.length).toBeGreaterThan(100)
    expect(script).not.toMatch(/fetch\(|XMLHttpRequest|sendBeacon|posthog|sentry|innerHTML|import\(/i)
    expect(HTML).toContain('content="noindex,nofollow"')
  })
})
