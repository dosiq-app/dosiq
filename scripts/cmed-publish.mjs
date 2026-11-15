#!/usr/bin/env -S npx tsx
/**
 * cmed-publish.mjs — publica o índice CMED num gesto só (spec 119 · FR-002 · ADR-123).
 *
 *   1. Valida os arquivos locais: tamanho e count de cada arquivo = manifest; `decodeCmedIndex`
 *      (core, o MESMO decodificador do app) aceita o cmedIndex (PO-SEC-119-4).
 *   2. Resolve o alvo: QA por padrão (CON-044). Prod exige `--prod` + digitar o project_ref.
 *      A chave service_role tem de ser do MESMO projeto da URL (bucket e banco = um projeto só).
 *   3. Sobe os arquivos do manifest e por último o manifest (bucket `dosiq-assets`, como hoje).
 *   4. Carrega o derivado `token → códigos` (`buildClassTokenMap`, core) via
 *      `admin_load_cmed_class_keys` — uma transação: falha ⇒ catálogo anterior intacto (PO-119-2).
 *
 * Uso (rodar pelo npm, que usa tsx):
 *   npm run cmed:publish -- --dry-run
 *   npm run cmed:publish                       # QA
 *   npm run cmed:publish -- --prod             # prod: pede o project_ref digitado
 *   opções: --dir <pasta>  (padrão ../dosiq-moat/data/anvisa)
 *
 * Env: sem `--prod` carrega `.env.local` da raiz (QA, CON-044); com `--prod`, `.env` da raiz (prod).
 * Variáveis: CMED_SUPABASE_URL/CMED_SUPABASE_SERVICE_KEY › SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ›
 * VITE_SUPABASE_URL/VITE_SUPABASE_SERVICE_KEY. O project_ref da URL e o da chave são conferidos de
 * qualquer jeito (resolveTarget). 🔴 A chave nunca é impressa (PO-SEC-119-4).
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { decodeCmedIndex } from '../packages/core/src/services/cmed/cmedIndex.ts'
import { buildClassTokenMap } from '../packages/core/src/services/cmed/nameMatch.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const QA_REF = 'ikcvwxyohmntncanclze'
export const PROD_REF = 'kwqjtdsqkkbebfiaxubb'
export const BUCKET = 'dosiq-assets'
export const DEFAULT_DIR = path.resolve(__dirname, '../../dosiq-moat/data/anvisa')

export class PublishError extends Error {}

/** project_ref de `https://<ref>.supabase.co`; `null` fora desse formato. */
export function refFromUrl(url) {
  const m = /^https:\/\/([a-z0-9]{20})\.supabase\.co\/?$/.exec(String(url || '').trim())
  return m ? m[1] : null
}

/** Claim `ref`/`role` de uma chave JWT legada; `null` se a chave não é JWT (formato sb_secret_…). */
export function jwtClaims(key) {
  const parts = String(key || '').split('.')
  if (parts.length !== 3) return null
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

export function parseArgs(argv) {
  const args = { prod: false, dryRun: false, dir: DEFAULT_DIR }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--prod') args.prod = true
    else if (a === '--dry-run') args.dryRun = true
    else if (a === '--dir') args.dir = path.resolve(argv[++i] ?? '')
    else throw new PublishError(`opção desconhecida: ${a}`)
  }
  return args
}

/** Alvo validado ANTES de qualquer escrita (PO-SEC-119-4). */
export async function resolveTarget({ url, key, prod, confirm }) {
  if (!url || !key) throw new PublishError('CMED_SUPABASE_URL e CMED_SUPABASE_SERVICE_KEY são obrigatórias')
  const ref = refFromUrl(url)
  if (!ref) throw new PublishError('URL do Supabase fora do formato https://<ref>.supabase.co')
  const claims = jwtClaims(key)
  if (claims && claims.ref !== ref) throw new PublishError(`a chave é de outro projeto (${claims.ref ?? '?'}) que a URL (${ref})`)
  if (claims && claims.role !== 'service_role') throw new PublishError('a chave não é service_role')
  if (ref === PROD_REF) {
    if (!prod) throw new PublishError('a URL aponta para PROD; use --prod (o padrão é o QA)')
    const typed = String((await confirm(`Digite o project_ref de prod (${PROD_REF}) para confirmar: `)) || '').trim()
    if (typed !== PROD_REF) throw new PublishError('confirmação de prod não confere')
  } else if (ref === QA_REF) {
    if (prod) throw new PublishError('--prod com a URL do QA')
  } else {
    throw new PublishError(`projeto desconhecido: ${ref}`)
  }
  return { ref, url: url.trim(), key, env: ref === PROD_REF ? 'prod' : 'qa' }
}

/** Lê e valida manifest + arquivos; devolve o derivado pronto para carga. */
export function loadAndValidate(dir, read = readFileSync) {
  let manifest
  try {
    manifest = JSON.parse(read(path.join(dir, 'manifest.json'), 'utf8'))
  } catch {
    throw new PublishError(`manifest.json ilegível em ${dir}`)
  }
  const version = typeof manifest?.version === 'string' ? manifest.version.trim() : ''
  const files = manifest?.files
  if (!version || !files || typeof files !== 'object' || !files.cmedIndex) {
    throw new PublishError('manifest sem version ou sem files.cmedIndex')
  }
  const uploads = []
  let cmedRaw = null
  for (const [name, meta] of Object.entries(files)) {
    const file = path.basename(String(meta?.path || ''))
    if (!file || !String(meta.path).startsWith('anvisa/v1/')) throw new PublishError(`caminho inválido no manifest: ${name}`)
    const buf = read(path.join(dir, file))
    if (buf.length !== meta.size) throw new PublishError(`${file}: ${buf.length} bytes, manifest diz ${meta.size}`)
    let json
    try {
      json = JSON.parse(buf.toString('utf8'))
    } catch {
      throw new PublishError(`${file}: JSON inválido`)
    }
    if (name === 'cmedIndex') cmedRaw = json
    else if (Array.isArray(json) && typeof meta.count === 'number' && json.length !== meta.count) {
      throw new PublishError(`${file}: ${json.length} itens, manifest diz ${meta.count}`)
    }
    uploads.push({ path: meta.path, body: buf })
  }
  const decoded = decodeCmedIndex(cmedRaw)
  if (decoded.ok === false) throw new PublishError(`cmedIndex recusado pelo decodificador do core (${decoded.reason})`)
  if (decoded.index.n !== files.cmedIndex.count) {
    throw new PublishError(`cmedIndex: ${decoded.index.n} linhas, manifest diz ${files.cmedIndex.count}`)
  }
  const map = buildClassTokenMap(decoded.index)
  const rows = [...map].map(([token, class_codes]) => ({ token, class_codes }))
  if (rows.length === 0) throw new PublishError('derivado vazio')
  return { version, uploads, rows, cmedRows: decoded.index.n, manifestBody: read(path.join(dir, 'manifest.json')) }
}

/** Esconde a chave de qualquer mensagem (erros do SDK podem ecoar cabeçalhos). */
function redact(text, key) {
  const s = String(text ?? '')
  return key ? s.split(key).join('[redacted]') : s
}

export async function run(argv, { env = process.env, read = readFileSync, makeClient = createClient, confirm, log = console.log } = {}) {
  const args = parseArgs(argv)
  const data = loadAndValidate(args.dir, read)
  const target = await resolveTarget({
    url: env.CMED_SUPABASE_URL || env.SUPABASE_URL || env.VITE_SUPABASE_URL,
    key: env.CMED_SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_KEY,
    prod: args.prod,
    confirm: confirm ?? defaultConfirm,
  })
  log(`cmed:publish → ${target.env} (${target.ref}) · versão ${data.version} · ${data.cmedRows} linhas CMED → ${data.rows.length} tokens`)
  if (args.dryRun) {
    log('dry-run: nada escrito')
    return { ...target, version: data.version, tokens: data.rows.length, written: false }
  }
  try {
    const client = makeClient(target.url, target.key, { auth: { persistSession: false, autoRefreshToken: false } })
    for (const u of [...data.uploads, { path: 'anvisa/v1/manifest.json', body: data.manifestBody }]) {
      const { error } = await client.storage.from(BUCKET).upload(u.path, u.body, { upsert: true, contentType: 'application/json' })
      if (error) throw new PublishError(`upload ${u.path}: ${error.message}`)
      log(`  ✓ ${BUCKET}/${u.path}`)
    }
    const { data: loaded, error } = await client.rpc('admin_load_cmed_class_keys', {
      p_rows: data.rows,
      p_version: data.version,
      p_expected_count: data.rows.length,
    })
    if (error) {
      throw new PublishError(
        `carga do catálogo falhou (${error.message}). O bucket JÁ está na ${data.version}; o banco segue na versão anterior. Reexecute.`,
      )
    }
    log(`  ✓ cmed_class_keys = ${loaded?.rows} tokens · versão ${loaded?.catalog_version}`)
    return { ...target, version: data.version, tokens: data.rows.length, written: true }
  } catch (err) {
    throw new PublishError(redact(err?.message, target.key))
  }
}

async function defaultConfirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    return await rl.question(question)
  } finally {
    rl.close()
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // QA por padrão: o .env.local da raiz aponta para o QA; o .env, para prod (CON-044).
  const envFile = process.argv.includes('--prod') ? '.env' : '.env.local'
  config({ path: path.join(__dirname, '..', envFile), quiet: true })
  run(process.argv.slice(2)).then(
    () => process.exit(0),
    (err) => {
      const key = process.env.CMED_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_KEY
      console.error(`❌ cmed:publish: ${redact(err?.message ?? err, key)}`)
      process.exit(1)
    },
  )
}
