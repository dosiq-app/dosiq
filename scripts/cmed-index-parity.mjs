#!/usr/bin/env -S npx tsx
// Paridade do decode do índice CMED na base CHEIA (local-only): caminho atual × referência congelada.
// A base nunca entra no repo público; o caminho vem de CMED_BASE_PATH. Sem a env: aviso e exit 0
// (o CI cobre a fixture curada). Divergência: lista as primeiras e exit 1.
//
//   CMED_BASE_PATH=../dosiq-moat/data/anvisa/cmedIndex.json npx tsx scripts/cmed-index-parity.mjs

import { readFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { decodeCmedIndex, buildEanLookup, isValidEan13 } from '../packages/core/src/services/cmed/cmedIndex.ts'
import { medicineDraftFromRow } from '../packages/core/src/services/cmed/cmedMedicine.ts'
import {
  decodeCmedIndexReference,
  buildEanLookupReference,
} from '../packages/core/src/services/cmed/__tests__/cmedIndexReference.ts'

const MAX_REPORT = 10

function main() {
  const basePath = process.env.CMED_BASE_PATH
  if (!basePath) {
    console.warn('[cmed-index-parity] CMED_BASE_PATH ausente — paridade da base cheia NÃO rodou (pulado).')
    return 0
  }
  const text = readFileSync(basePath, 'utf8')
  const next = decodeCmedIndex(JSON.parse(text))
  const ref = decodeCmedIndexReference(JSON.parse(text))
  if (next.ok === false || ref.ok === false) {
    console.error('[cmed-index-parity] decode recusou:', JSON.stringify({ next: next.ok || next.reason, ref: ref.ok || ref.reason }))
    return 1
  }
  const diffs = []
  const note = (msg) => {
    if (diffs.length < MAX_REPORT) console.error('  ✗', msg)
    diffs.push(msg)
  }
  if (next.index.n !== ref.index.n) note(`n: ${next.index.n} × ${ref.index.n}`)

  let rowsOk = 0
  let draftsOk = 0
  for (let i = 0; i < ref.index.n; i += 1) {
    const { e, ...refRow } = ref.index.rows[i]
    const row = next.index.rows[i]
    const eans = next.index.eanCol[i].split('|').filter(Boolean)
    if (isDeepStrictEqual(row, refRow) && isDeepStrictEqual(eans, e)
      && next.index.productKeys[i] === ref.index.productKeys[i]
      && next.index.substanceKeys[i] === ref.index.substanceKeys[i]) rowsOk += 1
    else note(`linha ${i} (${refRow.p})`)
    if (isDeepStrictEqual(medicineDraftFromRow(row), medicineDraftFromRow(refRow))) draftsOk += 1
    else note(`rascunho ${i} (${refRow.p})`)
  }

  const lk = buildEanLookup(next.index)
  const lkRef = buildEanLookupReference(ref.index, isValidEan13)
  let eansOk = 0
  for (const [ean, idxs] of lkRef) {
    if (isDeepStrictEqual(lk.get(ean), idxs)) eansOk += 1
    else note(`EAN ${ean}`)
  }
  if (lk.size !== lkRef.size) note(`lookup: ${lk.size} EANs × ${lkRef.size}`)

  const n = ref.index.n
  console.log(`[cmed-index-parity] base: ${basePath}`)
  console.log(`  linhas    ${rowsOk}/${n}`)
  console.log(`  rascunhos ${draftsOk}/${n}`)
  console.log(`  EANs      ${eansOk}/${lkRef.size} (lookup novo: ${lk.size})`)
  console.log(diffs.length === 0 ? '  ✓ paridade total' : `  ✗ ${diffs.length} divergência(s)`)
  return diffs.length === 0 ? 0 : 1
}

process.exitCode = main()
