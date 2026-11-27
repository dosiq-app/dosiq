// apps/web/src/views/admin/reactivationFormUtils.ts
// Normalização da coorte colada no painel de reativação (spec 126). Puro: sem I/O.
// O servidor revalida tudo; isto é conveniência para o operador ver o que vai mandar.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SEMVER_RE = /^\d+\.\d+(\.\d+)?$/

export const COHORT_MAX = 500
export const CONFIRM_TOKEN = 'ENVIAR'
export const TITLE_MAX = 40
export const BODY_MAX = 110

export interface CohortParse {
  valid: string[]
  invalid: string[]
  duplicates: number
}

/** Aceita vírgula, ponto e vírgula, espaço, quebra de linha e aspas (colado de CSV/JSON/SQL). */
export function parseCohort(text: string): CohortParse {
  const tokens = text
    .split(/[\s,;]+/)
    .map((t) => t.replace(/^["'[\]()]+|["'[\]()]+$/g, '').trim().toLowerCase())
    .filter((t) => t.length > 0)
  const seen = new Set<string>()
  const invalid: string[] = []
  let duplicates = 0
  for (const token of tokens) {
    if (!UUID_RE.test(token)) {
      if (!invalid.includes(token)) invalid.push(token)
      continue
    }
    if (seen.has(token)) duplicates += 1
    else seen.add(token)
  }
  return { valid: [...seen], invalid, duplicates }
}

export function isValidMinVersion(value: string): boolean {
  return SEMVER_RE.test(value.trim())
}

/** Chave da simulação: enviar só vale para os MESMOS campos que foram simulados. */
export function simulationKey(userIds: string[], variant: string, minVersion: string): string {
  return JSON.stringify([[...userIds].sort(), variant, minVersion.trim()])
}
