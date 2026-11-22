#!/usr/bin/env node
// Deterministic Review Card compiler & codebase trigger validator (A2 + A3).
// Zero external npm dependencies (imports only Node built-ins and ./select-rules.mjs)
// so it can execute cleanly in isolated worktrees.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { matchGlob, specificity, isValidTrigger } from './select-rules.mjs';

export const CARD_MAX_BYTES = 450;
export const TRIGGER_MAX_REPO_SHARE = 0.20;
export const GLOB_MAX_REPO_SHARE = 0.45;
export const SEVERITIES = ['critical', 'high', 'medium'];

const CODE_SCAN_ROOTS = ['apps', 'packages', 'server', 'api', 'supabase', 'docs/migrations', 'scripts'];
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.sql']);
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  '.expo',
  'coverage',
  '__snapshots__',
  '.next',
  '.turbo',
  '.graftroom'
]);

const GENERIC_BACKTICK_WORDS = new Set([
  'true',
  'false',
  'null',
  'undefined',
  'string',
  'number',
  'boolean',
  'object',
  'void',
  'const',
  'let',
  'var',
  'return',
  'async',
  'await',
  'import',
  'export',
  'function',
  'class',
  'props',
  'state',
  'error',
  'active',
  'warm',
  'cold',
  'hot'
]);

const EXCEPTION_CUE_RE = /\b(exceto|salvo|except|unless|only when|fora d[eo]|s[oó] a exclus[aã]o)\b/gi;
const CARD_EXCEPTION_CUE_RE = /\b(exceto|salvo|except|unless|apenas|somente|s[oó]|so|only|fora|n[aã]o\s+em)\b/i;
const CRITICAL_CUE_RE = /(?:🔴|\[CRITICAL\]|severidade[^\n]*(?:cr[íi]tica|alta)|\bcritical\b)/i;

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

export function sha256(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

export function extractBody(rawMd) {
  const norm = String(rawMd || '').replace(/\r\n/g, '\n');
  if (!norm.startsWith('---\n')) return norm.trim();
  const end = norm.indexOf('\n---', 4);
  return end === -1 ? norm.trim() : norm.slice(end + 4).trim();
}

export function extractSourceSignals(rawMd) {
  const full = String(rawMd || '').replace(/\r\n/g, '\n');
  const body = extractBody(full);
  const symbols = new Set();
  const backtickRe = /`([A-Za-z_$.][A-Za-z0-9_$.()/-]{2,})`/g;
  let m;
  while ((m = backtickRe.exec(body)) !== null) {
    let tok = m[1].replace(/\(\)$/, '').replace(/\/$/, '').trim();
    if (!tok || /\s/.test(tok)) continue;
    if (GENERIC_BACKTICK_WORDS.has(tok.toLowerCase())) continue;
    symbols.add(tok);
  }
  const hasCriticalCue = CRITICAL_CUE_RE.test(full);
  const excMatches = body.match(EXCEPTION_CUE_RE) || [];
  return {
    body,
    codeSymbols: Array.from(symbols),
    hasCriticalCue,
    exceptionClauses: Array.from(new Set(excMatches.map((x) => x.toLowerCase())))
  };
}

const EMPTY_EXCEPTION_RE =
  /^(?:none|nenhum|nenhuma|n\/a|na|null|nil|-|sem\s+exce[cç][aã]o|sem\s+exce[cç][oõ]es)$/i;

function normField(val) {
  return String(val || '').replace(/\s+/g, ' ').trim();
}

export function normalizeException(raw) {
  let val = normField(raw);
  if (!val) return '';
  if (/^\(\s*exc:\s*/i.test(val) && val.endsWith(')')) {
    val = val.slice(0, -1).replace(/^\(\s*exc:\s*/i, '').trim();
  } else {
    val = val.replace(/^exc:\s*/i, '').trim();
  }
  if (!val || EMPTY_EXCEPTION_RE.test(val)) return '';
  return val;
}

export function renderReviewCard(card) {
  const id = normField(card?.id);
  const sev = normField(card?.severity).toLowerCase();
  const when = normField(card?.applies_when);
  const inv = normField(card?.invariant).replace(/\s*\(exc:\s*[^)]*\)/gi, '').trim();
  const exc = normalizeException(card?.exception);
  const bad = normField(card?.violation_pattern);
  const fix = normField(card?.fix_pattern);

  const invPart = exc ? `${inv} (exc: ${exc})` : inv;
  return `${id} | ${sev} | when: ${when} | inv: ${invPart} | bad: ${bad} -> fix: ${fix}`;
}

export function validateReviewCard(card, sourceMeta) {
  const errors = [];
  const warnings = [];
  const signals = extractSourceSignals(sourceMeta?.rawMd || '');

  const id = normField(card?.id);
  const sev = normField(card?.severity).toLowerCase();
  const when = normField(card?.applies_when);
  const inv = normField(card?.invariant).replace(/\s*\(exc:\s*[^)]*\)/gi, '').trim();
  const exc = normalizeException(card?.exception);
  const bad = normField(card?.violation_pattern);
  const fix = normField(card?.fix_pattern);

  if (!sourceMeta?.id || id !== sourceMeta.id) {
    errors.push(`id_mismatch: esperado "${sourceMeta?.id}", recebido "${id}"`);
  }
  if (!SEVERITIES.includes(sev)) {
    errors.push(`invalid_severity: "${sev}" fora de (${SEVERITIES.join('|')})`);
  }
  if (when.length < 6) errors.push('missing_or_short_applies_when');
  if (inv.length < 12) errors.push('missing_or_short_invariant');
  if (bad.length < 6) errors.push('missing_or_short_violation_pattern');
  if (fix.length < 6) errors.push('missing_or_short_fix_pattern');

  const truncRe = /(?:\.{3}|…)\s*$/;
  for (const [fname, fval] of [
    ['applies_when', when],
    ['invariant', inv],
    ['exception', exc],
    ['violation_pattern', bad],
    ['fix_pattern', fix]
  ]) {
    if (fval && truncRe.test(fval)) {
      errors.push(`truncated_field_${fname}`);
    }
  }

  const rendered = renderReviewCard(card);
  const bytes = Buffer.byteLength(rendered, 'utf8');
  if (bytes > CARD_MAX_BYTES) {
    errors.push(`exceeds_max_bytes: ${bytes}B > ${CARD_MAX_BYTES}B`);
  }

  const extraSyms = [
    ...(Array.isArray(card?.match_symbols) ? card.match_symbols : []),
    ...(Array.isArray(card?.match_imports) ? card.match_imports : [])
  ].join(' ');
  const haystackLower = `${rendered} ${extraSyms}`.toLowerCase();

  let symbolHits = 0;
  for (const sym of signals.codeSymbols) {
    if (haystackLower.includes(sym.toLowerCase())) {
      symbolHits += 1;
    }
  }
  if (signals.codeSymbols.length > 0 && symbolHits === 0) {
    errors.push(`missing_source_symbols: nenhum dos ${signals.codeSymbols.length} símbolos da regra preservado`);
  }

  const exceptionChecked = signals.exceptionClauses.length > 0;
  let exceptionPreserved = true;
  if (exceptionChecked) {
    const excText = `${inv} ${fix}`;
    if (exc.length < 3 && !CARD_EXCEPTION_CUE_RE.test(excText)) {
      exceptionPreserved = false;
      warnings.push(`exception_dropped: regra cita (${signals.exceptionClauses.join(', ')}) mas o card omitiu exceção`);
    }
  }

  if (signals.hasCriticalCue && sev === 'medium') {
    warnings.push('severity_downgraded: fonte indica critical/high mas card veio como medium');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    rendered,
    bytes,
    symbolHits,
    totalSourceSymbols: signals.codeSymbols.length,
    exceptionChecked,
    exceptionPreserved
  };
}

export function scanRepoCodeFiles(repoRoot) {
  const files = [];
  const contentsByFile = new Map();

  function walk(absDir) {
    if (!fs.existsSync(absDir)) return;
    const entries = fs.readdirSync(absDir, { withFileTypes: true });
    for (const ent of entries) {
      if (SKIP_DIRS.has(ent.name)) continue;
      const full = path.join(absDir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase();
        if (!CODE_EXTENSIONS.has(ext)) continue;
        const rel = path.relative(repoRoot, full).split(path.sep).join('/');
        files.push(rel);
        try {
          contentsByFile.set(rel, fs.readFileSync(full, 'utf-8'));
        } catch {
          contentsByFile.set(rel, '');
        }
      }
    }
  }

  for (const sub of CODE_SCAN_ROOTS) {
    walk(path.join(repoRoot, sub));
  }
  files.sort();
  return { files, contentsByFile };
}

export function dedupeRedundantTriggers(items) {
  const objs = (items || [])
    .map((item, origIdx) =>
      typeof item === 'string'
        ? { trigger: item.trim(), hits: 0, _origIdx: origIdx }
        : { ...item, trigger: String(item?.trigger || '').trim(), _origIdx: origIdx }
    )
    .filter((x) => x.trigger.length > 0);

  const byName = [];
  const seenExact = new Set();
  for (const item of objs) {
    if (seenExact.has(item.trigger)) continue;
    seenExact.add(item.trigger);
    byName.push(item);
  }

  const byLenAsc = byName
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => a.item.trigger.length - b.item.trigger.length || a.idx - b.idx);

  const droppedIdx = new Set();
  const dropped = [];
  for (let i = 0; i < byLenAsc.length; i++) {
    const aPos = byLenAsc[i].idx;
    if (droppedIdx.has(aPos)) continue;
    const a = byLenAsc[i].item;
    for (let j = i + 1; j < byLenAsc.length; j++) {
      const bPos = byLenAsc[j].idx;
      if (droppedIdx.has(bPos)) continue;
      const b = byLenAsc[j].item;
      if (a.trigger !== b.trigger && b.trigger.includes(a.trigger)) {
        const aHits = a.hits || 0;
        const bHits = b.hits || 0;
        const keepLonger = bHits > 0 && (aHits > 80 || bHits >= aHits * 0.7);
        if (keepLonger) {
          droppedIdx.add(aPos);
          dropped.push({ trigger: a.trigger, reason: 'redundant_substring_duplicate', replacedBy: b.trigger, hits: aHits });
          break;
        } else {
          droppedIdx.add(bPos);
          dropped.push({ trigger: b.trigger, reason: 'redundant_substring_duplicate', replacedBy: a.trigger, hits: bHits });
        }
      }
    }
  }

  const kept = [];
  for (let i = 0; i < byName.length; i++) {
    if (!droppedIdx.has(i)) {
      const { _origIdx, ...clean } = byName[i];
      kept.push(clean);
    }
  }
  return { kept, dropped };
}

export function validateTriggersAgainstRepo(card, sourceMeta, repoIndex) {
  const files = repoIndex?.files || [];
  const contentsByFile = repoIndex?.contentsByFile || new Map();
  const totalFiles = files.length;
  const rawMd = String(sourceMeta?.rawMd || '');

  const keptPaths = [];
  const rejectedPaths = [];
  const seenPaths = new Set();
  for (const rawGlob of Array.isArray(card?.match_paths) ? card.match_paths : []) {
    const glob = String(rawGlob || '').trim();
    if (!glob || seenPaths.has(glob)) continue;
    seenPaths.add(glob);
    if (glob.length < 3 || /\s/.test(glob)) {
      rejectedPaths.push({ glob, reason: 'invalid_glob', hits: 0 });
      continue;
    }
    let hits = 0;
    for (const f of files) {
      if (matchGlob(glob, f)) hits += 1;
    }
    const spec = specificity(glob);
    const share = totalFiles > 0 ? hits / totalFiles : 0;
    if (hits === 0) {
      rejectedPaths.push({ glob, reason: 'dead_glob', hits: 0 });
    } else if (share > GLOB_MAX_REPO_SHARE && spec <= 2) {
      rejectedPaths.push({ glob, reason: 'too_broad_glob', hits, share: round4(share) });
    } else {
      keptPaths.push({ glob, hits, spec, share: round4(share) });
    }
  }

  const rawKeptTriggers = [];
  const rejectedTriggers = [];
  const seenTrigs = new Set();
  const rawTriggers = [
    ...(Array.isArray(card?.match_imports) ? card.match_imports : []),
    ...(Array.isArray(card?.match_symbols) ? card.match_symbols : [])
  ];
  for (const rawTok of rawTriggers) {
    const t = String(rawTok || '').trim();
    if (!t || seenTrigs.has(t)) continue;
    seenTrigs.add(t);
    if (!isValidTrigger(t) || t.length < 3) {
      rejectedTriggers.push({ trigger: t, reason: 'invalid_short_trigger', hits: 0 });
      continue;
    }
    let hits = 0;
    for (const content of contentsByFile.values()) {
      if (content.includes(t)) hits += 1;
    }
    const share = totalFiles > 0 ? hits / totalFiles : 0;
    if (hits === 0) {
      if (rawMd.includes(t)) {
        rawKeptTriggers.push({ trigger: t, hits: 0, share: 0, note: 'from_source_zero_head_hits' });
      } else {
        rejectedTriggers.push({ trigger: t, reason: 'dead_hallucinated_trigger', hits: 0 });
      }
    } else if (share > TRIGGER_MAX_REPO_SHARE) {
      rejectedTriggers.push({ trigger: t, reason: 'too_broad_trigger', hits, share: round4(share) });
    } else {
      rawKeptTriggers.push({ trigger: t, hits, share: round4(share) });
    }
  }

  const deduped = dedupeRedundantTriggers(rawKeptTriggers);
  const keptTriggers = deduped.kept;
  for (const d of deduped.dropped) {
    rejectedTriggers.push(d);
  }

  return { keptPaths, rejectedPaths, keptTriggers, rejectedTriggers };
}

export function buildOverlayIndex(baseIndex, validatedEntries, repoIndex = null, maxTriggersPerRule = 10) {
  const clone = structuredClone(baseIndex);
  const globDF = Object.create(null);
  for (const rule of Object.values(clone.rules || {})) {
    if (!rule || rule.layer === 'hot') continue;
    for (const g of new Set(rule.paths || [])) {
      globDF[g] = (globDF[g] || 0) + 1;
    }
  }

  const contentsList = repoIndex ? Array.from(repoIndex.contentsByFile.values()) : null;
  const totalFiles = contentsList ? contentsList.length : 0;
  const hitCache = new Map();

  function triggerHitCount(t) {
    if (!contentsList || totalFiles === 0) return null;
    if (hitCache.has(t)) return hitCache.get(t);
    let hits = 0;
    for (const c of contentsList) {
      if (c.includes(t)) hits += 1;
    }
    hitCache.set(t, hits);
    return hits;
  }

  function isTriggerNotTooBroad(t) {
    if (!isValidTrigger(t)) return false;
    const hits = triggerHitCount(t);
    if (hits === null) return true;
    return hits / totalFiles <= TRIGGER_MAX_REPO_SHARE;
  }

  for (const entry of validatedEntries || []) {
    if (!entry?.validation?.ok) continue;
    const rule = clone.rules?.[entry.id];
    if (!rule) continue;

    const tv = entry.triggerValidation || { keptPaths: [], keptTriggers: [] };
    const newPaths = (tv.keptPaths || []).map((p) => (typeof p === 'string' ? p : p.glob));
    if (newPaths.length > 0) {
      const curPaths = rule.paths || [];
      const allBoilerplate =
        curPaths.length > 0 && curPaths.every((g) => specificity(g) <= 2 && (globDF[g] || 0) >= 20);
      if (allBoilerplate || curPaths.length === 0) {
        rule.paths = Array.from(new Set(newPaths));
      } else {
        rule.paths = Array.from(new Set([...curPaths, ...newPaths]));
      }
    }

    const combinedObjs = [];
    for (const t of (rule.diff_triggers || []).filter((x) => isTriggerNotTooBroad(x))) {
      combinedObjs.push({ trigger: t, hits: triggerHitCount(t) ?? 0 });
    }
    const keptSorted = (tv.keptTriggers || [])
      .slice()
      .sort((a, b) => ((b.hits || 0) > 0 ? 1 : 0) - ((a.hits || 0) > 0 ? 1 : 0));
    for (const kt of keptSorted) {
      if (typeof kt === 'string') {
        combinedObjs.push({ trigger: kt, hits: triggerHitCount(kt) ?? 0 });
      } else {
        combinedObjs.push({ trigger: kt.trigger, hits: kt.hits ?? triggerHitCount(kt.trigger) ?? 0 });
      }
    }

    const deduped = dedupeRedundantTriggers(combinedObjs);
    rule.diff_triggers = deduped.kept.map((x) => x.trigger).slice(0, maxTriggersPerRule);
    rule.review_card = entry.validation.rendered;
    if (entry.source_sha256) rule.review_card_sha256 = entry.source_sha256;
  }

  return clone;
}
