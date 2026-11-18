/**
 * Sugestão de domínio de e-mail no cadastro (spec 123, US1 · FR-001).
 *
 * Função pura, calculada no aparelho — nenhum endereço sai do app (INV-5). Nunca altera o campo
 * nem bloqueia o envio: devolve só o domínio provável, e a tela decide se mostra o aviso (INV-1).
 *
 * Regras, na ordem (a primeira que casa decide):
 *  1. domínio conhecido ⇒ silêncio;
 *  2. domínio no mapa de correções ⇒ destino do mapa;
 *  3. fim com erro de TLD (`.con`, `.com.b`…) ⇒ TLD certo, se o resultado for conhecido;
 *  4. até 2 edições de UM único conhecido "longo" (nome antes do 1º ponto com 5+ letras) ⇒ ele;
 *  5. qualquer outro ⇒ silêncio.
 *
 * Manutenção: a lista muda por PR, com a consulta agregada por domínio das contas não confirmadas
 * no corpo do PR (spec 123 §Sugestão de domínio — dono e manutenção).
 */

/** Provedores com uso real no Brasil + os que já apareceram em prod (alvos da regra 4). */
const PRIMARY_DOMAINS = [
  'gmail.com',
  'hotmail.com',
  'outlook.com',
  'outlook.com.br',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'yahoo.com',
  'yahoo.com.br',
  'uol.com.br',
  'bol.com.br',
  'terra.com.br',
  'ig.com.br',
  'globo.com',
  'proton.me',
  'protonmail.com',
] as const

/** Vizinhos legítimos: na lista só para garantir silêncio (regra 1); nunca são sugeridos. */
const NEIGHBOR_DOMAINS = [
  'mail.com',
  'ymail.com',
  'gmx.com',
  'mac.com',
  'hotmail.com.br',
  'live.com.pt',
  'googlemail.com',
] as const

export const KNOWN_EMAIL_DOMAINS: readonly string[] = [...PRIMARY_DOMAINS, ...NEIGHBOR_DOMAINS]

/** Casos que a regra 4 não pega ou pegaria errado. */
export const EMAIL_DOMAIN_CORRECTIONS: Readonly<Record<string, string>> = {
  'gmail.com.br': 'gmail.com',
  'icloud.com.br': 'icloud.com',
  'hotmail.con.br': 'hotmail.com',
  'live.con': 'live.com',
  'uol.con.br': 'uol.com.br',
  'bol.con.br': 'bol.com.br',
}

/** Fins de domínio com erro de digitação de TLD → fim certo. Mais longos primeiro. */
const TLD_TYPOS: ReadonlyArray<readonly [string, string]> = [
  ['.com.bt', '.com.br'],
  ['.com.be', '.com.br'],
  ['.com.b', '.com.br'],
  ['.comm', '.com'],
  ['.con', '.com'],
  ['.cmo', '.com'],
  ['.vom', '.com'],
  ['.xom', '.com'],
]

const MAX_EDITS = 2
const MIN_LABEL_FOR_FUZZY = 5

const KNOWN_SET = new Set(KNOWN_EMAIL_DOMAINS)
const FUZZY_TARGETS = PRIMARY_DOMAINS.filter((d) => d.split('.')[0].length >= MIN_LABEL_FOR_FUZZY)

/** Distância de edição com transposição adjacente (OSA), com corte em `limit + 1`. */
function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1
  const rows: number[][] = []
  for (let i = 0; i <= a.length; i++) {
    rows.push(new Array<number>(b.length + 1).fill(0))
    rows[i][0] = i
  }
  for (let j = 0; j <= b.length; j++) rows[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let best = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, rows[i - 2][j - 2] + 1)
      }
      rows[i][j] = best
    }
  }
  return rows[a.length][b.length]
}

function extractDomain(email: string | null | undefined): string | null {
  if (typeof email !== 'string') return null
  const clean = email.trim().toLowerCase()
  const at = clean.lastIndexOf('@')
  if (at <= 0) return null
  const domain = clean.slice(at + 1)
  if (!domain.includes('.')) return null
  return domain
}

/**
 * Devolve o domínio provável quando o digitado parece erro; `null` quando não há o que sugerir.
 * Só o domínio — quem monta o endereço preserva a parte antes do `@` como a pessoa digitou.
 */
export function suggestEmailDomain(email: string | null | undefined): string | null {
  const domain = extractDomain(email)
  if (domain === null) return null

  if (KNOWN_SET.has(domain)) return null

  const corrected = EMAIL_DOMAIN_CORRECTIONS[domain]
  if (corrected !== undefined) return corrected

  for (const [typo, fix] of TLD_TYPOS) {
    if (domain.endsWith(typo)) {
      const candidate = domain.slice(0, -typo.length) + fix
      if (KNOWN_SET.has(candidate)) return candidate
    }
  }

  let best: string | null = null
  let bestDistance = MAX_EDITS + 1
  let tie = false
  for (const target of FUZZY_TARGETS) {
    const distance = editDistance(domain, target, MAX_EDITS)
    if (distance < bestDistance) {
      best = target
      bestDistance = distance
      tie = false
    } else if (distance === bestDistance && distance <= MAX_EDITS) {
      tie = true
    }
  }
  if (best === null || bestDistance > MAX_EDITS || tie) return null
  return best
}
