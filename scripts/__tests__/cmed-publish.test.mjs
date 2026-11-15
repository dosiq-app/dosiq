// Spec 119 · PO-SEC-119-4 / PO-119-1 / PO-119-2 — script `cmed:publish`.
// Rodar: npx tsx --test scripts/__tests__/cmed-publish.test.mjs (importa o core TS).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { PROD_REF, QA_REF, run } from '../cmed-publish.mjs'

const DIR = '/fixture'
const jwt = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`
const QA_KEY = jwt({ ref: QA_REF, role: 'service_role' })
const PROD_KEY = jwt({ ref: PROD_REF, role: 'service_role' })
const qaEnv = { CMED_SUPABASE_URL: `https://${QA_REF}.supabase.co`, CMED_SUPABASE_SERVICE_KEY: QA_KEY }

// cmedIndex v1 mínimo: 2 linhas (mounjaro/tirzepatida A10S; venvanse/lisdexanfetamina N6B)
const N2 = [null, null]
const cols = { e: ['', ''], p: ['MOUNJARO', 'VENVANSE'], s: ['TIRZEPATIDA', 'LISDEXANFETAMINA'], a: ['', ''], r: ['1', '2'], l: N2, k: N2, c: [0, 1], t: N2, u: N2, f: N2, d: N2, nc: N2, q: N2, ds: N2, amb: [0, 0] }
const dict = { l: [], k: [], c: ['A10S', 'N6B'], cn: ['Antidiabeticos', 'Psicoestimulantes'], t: [], u: [], f: [] }
function fixture({ index = { v: 1, n: 2, cols, dict }, countDelta = 0, sizeDelta = 0 } = {}) {
  const body = Buffer.from(JSON.stringify(index))
  const manifest = Buffer.from(JSON.stringify({ version: '9.9.9', files: { cmedIndex: { path: 'anvisa/v1/cmedIndex.json', size: body.length + sizeDelta, count: 2 + countDelta } } }))
  const files = { [path.join(DIR, 'cmedIndex.json')]: body, [path.join(DIR, 'manifest.json')]: manifest }
  return (p, enc) => {
    if (!(p in files)) throw new Error(`ENOENT ${p}`)
    return enc ? files[p].toString(enc) : files[p]
  }
}
function fakeClient() {
  const calls = []
  const client = {
    storage: { from: (b) => ({ upload: async (p) => (calls.push(['upload', b, p]), { error: null }) }) },
    rpc: async (fn, args) => (calls.push(['rpc', fn, args]), { data: { rows: args.p_expected_count, catalog_version: args.p_version }, error: null }),
  }
  return { calls, makeClient: () => client }
}
const silent = () => {}

test('caminho feliz no QA: sobe arquivos, manifest por último, carrega o derivado com a versão', async () => {
  const { calls, makeClient } = fakeClient()
  const out = await run(['--dir', DIR], { env: qaEnv, read: fixture(), makeClient, log: silent })
  assert.equal(out.written, true)
  assert.deepEqual(calls.map((c) => c[2] ?? c[1]).slice(0, 2), ['anvisa/v1/cmedIndex.json', 'anvisa/v1/manifest.json'])
  const rpc = calls.find((c) => c[0] === 'rpc')
  assert.equal(rpc[1], 'admin_load_cmed_class_keys')
  assert.equal(rpc[2].p_version, '9.9.9')
  assert.equal(rpc[2].p_expected_count, rpc[2].p_rows.length)
  assert.deepEqual(rpc[2].p_rows.find((r) => r.token === 'tirzepatida'), { token: 'tirzepatida', class_codes: ['A10S'] })
})

const aborts = [
  ['projeto divergente (chave de prod, URL do QA)', { env: { ...qaEnv, CMED_SUPABASE_SERVICE_KEY: PROD_KEY } }, /outro projeto/],
  ['chave não service_role', { env: { ...qaEnv, CMED_SUPABASE_SERVICE_KEY: jwt({ ref: QA_REF, role: 'anon' }) } }, /service_role/],
  ['count ≠ manifest', { read: fixture({ countDelta: 1 }) }, /manifest diz 3/],
  ['tamanho ≠ manifest', { read: fixture({ sizeDelta: 5 }) }, /bytes, manifest diz/],
  ['v desconhecido', { read: fixture({ index: { v: 2, n: 0, cols: {}, dict: {} } }) }, /decodificador do core \(version\)/],
  ['prod sem --prod', { env: { CMED_SUPABASE_URL: `https://${PROD_REF}.supabase.co`, CMED_SUPABASE_SERVICE_KEY: PROD_KEY } }, /use --prod/],
  ['prod com confirmação errada', { argv: ['--prod'], env: { CMED_SUPABASE_URL: `https://${PROD_REF}.supabase.co`, CMED_SUPABASE_SERVICE_KEY: PROD_KEY }, confirm: async () => 'ikcvwxyohmntncanclze' }, /não confere/],
  ['projeto desconhecido', { env: { CMED_SUPABASE_URL: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co', CMED_SUPABASE_SERVICE_KEY: 'sb_secret_x' } }, /desconhecido/],
]
for (const [name, opts, re] of aborts) {
  test(`aborta sem escrever: ${name}`, async () => {
    const { calls, makeClient } = fakeClient()
    await assert.rejects(
      run(['--dir', DIR, ...(opts.argv ?? [])], { env: opts.env ?? qaEnv, read: opts.read ?? fixture(), makeClient, confirm: opts.confirm, log: silent }),
      re,
    )
    assert.equal(calls.length, 0)
  })
}

test('prod com --prod e confirmação correta escreve', async () => {
  const { calls, makeClient } = fakeClient()
  const env = { CMED_SUPABASE_URL: `https://${PROD_REF}.supabase.co`, CMED_SUPABASE_SERVICE_KEY: PROD_KEY }
  const out = await run(['--dir', DIR, '--prod'], { env, read: fixture(), makeClient, confirm: async () => PROD_REF, log: silent })
  assert.equal(out.env, 'prod')
  assert.ok(calls.length > 0)
})

test('--dry-run valida e não escreve', async () => {
  const { calls, makeClient } = fakeClient()
  const out = await run(['--dir', DIR, '--dry-run'], { env: qaEnv, read: fixture(), makeClient, log: silent })
  assert.equal(out.written, false)
  assert.equal(out.tokens, 4)
  assert.equal(calls.length, 0)
})

test('falha na carga: erro explícito, avisa divergência e não vaza a chave', async () => {
  const lines = []
  const client = {
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
    rpc: async () => ({ data: null, error: { message: `boom Bearer ${QA_KEY}` } }),
  }
  await assert.rejects(
    run(['--dir', DIR], { env: qaEnv, read: fixture(), makeClient: () => client, log: (l) => lines.push(l) }),
    (err) => {
      assert.match(err.message, /bucket JÁ está na 9\.9\.9/)
      assert.ok(!err.message.includes(QA_KEY))
      assert.match(err.message, /\[redacted\]/)
      return true
    },
  )
  assert.ok(lines.every((l) => !l.includes(QA_KEY)))
})
