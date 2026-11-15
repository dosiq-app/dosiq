// Paridade core × SQL do casamento nome → código (spec 119 · PO-119-10 · CON-045).
// O .test.sql da 119 roda os MESMOS casos-ouro contra cmed_match_key/cmed_class_codes no QA; aqui se
// garante que o literal embutido nele é o golden do core, e que as constantes da regra batem com a
// migração. Divergir = painel e app discordam sobre o que casa.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import golden from '../cmed/__tests__/nameMatch.golden.json'
import { MATCH_FUZZY_MIN, MATCH_KEY_MAX, MATCH_TOKEN_MIN, fuzzyThreshold } from '../cmed/nameMatch'

const MIGRATIONS = resolve(__dirname, '../../../../../docs/migrations')
const read = (file: string) => readFileSync(resolve(MIGRATIONS, file), 'utf8')

describe('paridade nameMatch core × SQL (119)', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.clearAllTimers()
  })

  it('o literal GOLDEN do .test.sql é o golden do core', () => {
    const sql = read('20261115_119_cmed_class_keys.test.sql')
    const match = sql.match(/-- GOLDEN:BEGIN\n\s*g jsonb := '(.*)'::jsonb;\n\s*-- GOLDEN:END/)
    if (!match) throw new Error('marcadores GOLDEN ausentes no .test.sql')
    const embedded = JSON.parse(match[1].replace(/''/g, "'"))
    const { _comment: _ignored, ...expected } = golden
    expect(embedded).toEqual(expected)
  })

  it('constantes da regra espelhadas na migração', () => {
    const sql = read('20261115_119_cmed_class_keys.sql')
    expect(MATCH_KEY_MAX).toBe(120)
    expect(sql).toContain(`${MATCH_KEY_MAX}))`)
    expect(sql).toContain(`length(t) >= ${MATCH_TOKEN_MIN}`)
    expect(sql).toContain(`length(tk.t) >= ${MATCH_FUZZY_MIN}`)
    expect(fuzzyThreshold(8)).toBe(1)
    expect(fuzzyThreshold(9)).toBe(2)
    expect(sql).toContain('CASE WHEN length(tk.t) >= 9 THEN 2 ELSE 1 END')
    expect(sql).toContain("'[\\u0300-\\u036f]'")
    expect(sql).toContain("'[^a-z0-9]+', ' '")
  })
})
