// Spec 123 (PO-123-1): a tabela de casos do §Sugestão de domínio, linha a linha.
import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  suggestEmailDomain,
  KNOWN_EMAIL_DOMAINS,
  EMAIL_DOMAIN_CORRECTIONS,
} from '../emailDomainSuggestion'

const SUGGESTS: Array<[string, string]> = [
  ['hotma.com', 'hotmail.com'],
  ['gmail.con', 'gmail.com'],
  ['gmial.com', 'gmail.com'],
  ['gmai.com', 'gmail.com'],
  ['gmaill.com', 'gmail.com'],
  ['gnail.com', 'gmail.com'],
  ['hotmial.com', 'hotmail.com'],
  ['hotmal.com', 'hotmail.com'],
  ['hotmail.cm', 'hotmail.com'],
  ['outlok.com', 'outlook.com'],
  ['outloo.com', 'outlook.com'],
  ['iclod.com', 'icloud.com'],
  ['icloud.co', 'icloud.com'],
  ['glovo.com', 'globo.com'],
  ['globoo.com', 'globo.com'],
  ['globo.co', 'globo.com'],
  ['yaho.com.br', 'yahoo.com.br'],
  ['yahoo.com.b', 'yahoo.com.br'],
  ['gmail.com.br', 'gmail.com'],
]

const SILENT = [
  'gmail.com', 'mail.com', 'ymail.com', 'me.com',
  'dosiq.app', 'usp.br', 'empresa.com.br', 'jcaton.com',
  'ge.com', 'ibm.com', 'live.co', 'uol.com',
]

afterEach(() => {
  vi.clearAllMocks()
  vi.clearAllTimers()
})

describe('suggestEmailDomain — tabela da spec', () => {
  it.each(SUGGESTS)('%s ⇒ sugere %s', (domain, expected) => {
    expect(suggestEmailDomain(`fulano@${domain}`)).toBe(expected)
  })

  it.each(SILENT)('%s ⇒ silêncio', (domain) => {
    expect(suggestEmailDomain(`fulano@${domain}`)).toBeNull()
  })
})

describe('suggestEmailDomain — entradas degeneradas', () => {
  it.each(['', '   ', 'fulano', 'fulano@', '@gmail.con'])('%j ⇒ null', (value) => {
    expect(suggestEmailDomain(value)).toBeNull()
  })

  it('aceita null/undefined sem lançar', () => {
    expect(suggestEmailDomain(null)).toBeNull()
    expect(suggestEmailDomain(undefined)).toBeNull()
  })

  it('ignora caixa e espaço nas bordas', () => {
    expect(suggestEmailDomain('  Fulano@GMAIL.CON ')).toBe('gmail.com')
  })

  it('usa o último @ como separador', () => {
    expect(suggestEmailDomain('a@b@hotmal.com')).toBe('hotmail.com')
  })

  it('domínio sem ponto ⇒ silêncio', () => {
    expect(suggestEmailDomain('fulano@gmail')).toBeNull()
  })

  it('empate entre dois conhecidos ⇒ silêncio', () => {
    // "yahoo.co.b" fica a 2 edições de yahoo.com e de yahoo.com.br.
    expect(suggestEmailDomain('fulano@yahoo.co.b')).toBeNull()
    // sem empate: "outlook.co" a 1 de outlook.com e a 4 de outlook.com.br.
    expect(suggestEmailDomain('fulano@outlook.co')).toBe('outlook.com')
  })
})

describe('constantes', () => {
  it('lista de conhecidos não vazia, minúscula e sem duplicata', () => {
    expect(KNOWN_EMAIL_DOMAINS.length).toBeGreaterThan(0)
    expect(new Set(KNOWN_EMAIL_DOMAINS).size).toBe(KNOWN_EMAIL_DOMAINS.length)
    for (const d of KNOWN_EMAIL_DOMAINS) expect(d).toBe(d.toLowerCase())
  })

  it('todo destino do mapa de correções é conhecido', () => {
    for (const target of Object.values(EMAIL_DOMAIN_CORRECTIONS)) {
      expect(KNOWN_EMAIL_DOMAINS).toContain(target)
    }
  })
})
