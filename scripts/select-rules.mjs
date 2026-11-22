#!/usr/bin/env node
// Consome o índice compilado por scripts/compile-memory-index.mjs e devolve as regras
// relevantes para um diff/lista de caminhos alterados. Ver spec 060 para o algoritmo de score.
//
// Fail-safe (FR-007): índice ausente/ilegível/JSON inválido NUNCA quebra o RC6 — imprime
// "fail-safe 056 ativado" em stderr e devolve os domínios dos caminhos alterados, exit 0.

import fs from 'fs';
import path from 'path';
import { fileURLToPath , pathToFileURL } from 'url';
import { DOMAIN_PATH_MARKERS } from './schemas/memory-constants.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const WEIGHT_TRIGGER = 12;
const TRIGGER_EXTRA_RATIO = 0.25;
const MAX_TRIGGER_HITS = 4;
const WEIGHT_KEYWORD = 2;
const KEYWORD_EXTRA_RATIO = 0.4;
const MAX_KEYWORD_HITS = 3;
const WEIGHT_DOMAIN = 1;
// Sublinear specificity curve for curated globs (spec 0..6; >6 adds +0.5/seg).
// Prevents 0-trigger deep paths (spec 5-6) from outweighing curated paths with diff_triggers.
const PATH_SPEC_CURVE = [0, 8, 14, 21, 24, 26, 27];
// Crowd penalty for bulk-generated boilerplate globs (e.g. apps/mobile/** 148x, apps/web/** 104x).
const GLOB_CROWD_HIGH = 20;
const GLOB_CROWD_MED = 10;
const GLOB_CROWD_HIGH_FACTOR = 0.35;
const GLOB_CROWD_MED_FACTOR = 0.65;
// Prefix-consistent soft domain diversity: no penalty for first 3 rules/domain, gentle 5% decay after.
const DOMAIN_FREE_SLOTS = 3;
const DOMAIN_REPEAT_DECAY = 0.95;
// A5: 1-hop related code paths, doc rule graph, and episodic citation priors (strictly bounded).
const ADJ_PATH_RATIO = 0.35;
const ADJ_PATH_MIN_SPEC = 2;
const A5_SEED_LIMIT = 5;
const A5_GRAPH_CAP = 4.0;
const A5_EPISODIC_CAP = 3.0;
const A5_TOTAL_CAP = 5.0;
const A5_TOTAL_MAX_RATIO = 0.2;
const RULE_ID_REF_RE = /\b((?:R|AP)-[A-Z0-9]+(?:-\d+)?)\b/g;

function parseArgs(argv) {
  const args = {
    root: null,
    index: null,
    paths: [],
    relatedPaths: [],
    diffFile: null,
    format: 'full',
    json: false,
    id: null,
    limit: 5,
    enableGraph: false,
    noGraph: false,
    excludePr: null
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--root') {
      args.root = argv[++i];
    } else if (arg === '--index') {
      args.index = argv[++i];
    } else if (arg === '--paths') {
      while (argv[i + 1] && !argv[i + 1].startsWith('--')) {
        args.paths.push(argv[++i]);
      }
    } else if (arg === '--related-paths') {
      while (argv[i + 1] && !argv[i + 1].startsWith('--')) {
        args.relatedPaths.push(argv[++i]);
      }
    } else if (arg === '--diff-file' || arg === '--diff-fixture') {
      args.diffFile = argv[++i];
    } else if (arg === '--format') {
      args.format = argv[++i];
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--graph') {
      args.enableGraph = true;
    } else if (arg === '--no-graph') {
      args.noGraph = true;
    } else if (arg === '--exclude-pr') {
      const prNum = parseInt(argv[++i], 10);
      if (Number.isFinite(prNum)) args.excludePr = prNum;
    } else if (arg === '--id') {
      args.id = argv[++i];
    } else if (arg === '--limit') {
      // parseInt("abc") => NaN, e `selected.length >= NaN` é sempre falso: o limite sumiria
      // e o prompt receberia o catálogo inteiro — exatamente o que esta spec existe para evitar.
      const parsed = parseInt(argv[++i], 10);
      args.limit = Number.isFinite(parsed) && parsed >= 0 ? parsed : 5;
    }
  }
  return args;
}

// --- glob matching (implementação própria, sem dependência: só '*' e '**') -----------------

function globToRegExp(glob) {
  let re = '';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*';
        i += 2;
        // engole uma barra seguinte opcional, p/ "apps/**/*.ts" casar "apps/x.ts" tb
        if (glob[i] === '/') i += 1;
      } else {
        re += '[^/]*';
        i += 1;
      }
    } else if ('.+^${}()|[]\\'.includes(c)) {
      re += `\\${c}`;
      i += 1;
    } else {
      re += c;
      i += 1;
    }
  }
  return new RegExp(`^${re}$`);
}

function matchGlob(glob, filePath) {
  return globToRegExp(glob).test(filePath);
}

function specificity(glob) {
  return glob.split('/').filter((seg) => seg.length > 0 && !seg.includes('*')).length;
}

// --- domínio a partir de caminho (heurística compartilhada com o validador) ----------------

function domainsForPath(filePath) {
  const matched = new Set();
  for (const [domain, markers] of Object.entries(DOMAIN_PATH_MARKERS)) {
    if (markers.some((marker) => filePath.includes(marker))) {
      matched.add(domain);
    }
  }
  return matched;
}

function domainsForPaths(paths) {
  const all = new Set();
  for (const p of paths) {
    for (const d of domainsForPath(p)) all.add(d);
  }
  return all;
}

// --- diff parsing ---------------------------------------------------------------------------

function parseDiff(diffText) {
  const lines = diffText.split(/\r?\n/);
  const changedPaths = [];
  const addedLines = [];
  for (const line of lines) {
    const m = line.match(/^\+\+\+ b\/(.+)$/);
    if (m) {
      changedPaths.push(m[1]);
      continue;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      addedLines.push(line.slice(1));
    }
  }
  return { changedPaths, addedLines };
}

// --- fail-safe --------------------------------------------------------------------------

function failSafe(changedPaths) {
  console.error('fail-safe 056 ativado');
  const domains = Array.from(domainsForPaths(changedPaths)).sort();
  console.log(domains.join('\n'));
  process.exitCode = 0;
}

function loadIndex(indexPath) {
  const raw = fs.readFileSync(indexPath, 'utf-8');
  return JSON.parse(raw);
}

// --- scoring ------------------------------------------------------------------------------

function round2(n) {
  return Math.round(n * 100) / 100;
}

function stripAccents(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function tokenizeCode(text) {
  if (!text) return new Set();
  const spaced = text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  return new Set(stripAccents(spaced).toLowerCase().match(/[a-z0-9]{2,}/g) || []);
}

function isValidTrigger(trigger) {
  return typeof trigger === 'string' && /[A-Za-z0-9]{2}/.test(trigger);
}

function idfWeight(df, totalRules) {
  if (!totalRules || totalRules <= 1) return 1;
  const norm = Math.log((totalRules + 1) / ((df || 1) + 1)) / Math.log(totalRules + 1);
  return 0.4 + 0.6 * Math.max(0, norm);
}

function computeIndexStats(index) {
  const globDF = Object.create(null);
  const trigDF = Object.create(null);
  const kwDF = Object.create(null);
  let totalRules = 0;
  for (const rule of Object.values((index && index.rules) || {})) {
    if (!rule || rule.layer === 'hot') continue;
    totalRules += 1;
    for (const g of new Set(rule.paths || [])) {
      globDF[g] = (globDF[g] || 0) + 1;
    }
    for (const t of new Set(rule.diff_triggers || [])) {
      if (isValidTrigger(t)) trigDF[t] = (trigDF[t] || 0) + 1;
    }
    for (const k of new Set((rule.keywords || []).map((x) => String(x).toLowerCase()))) {
      kwDF[k] = (kwDF[k] || 0) + 1;
    }
  }
  return { totalRules, globDF, trigDF, kwDF };
}

function prepareCtx(ctx) {
  const changedPaths = ctx.changedPaths || [];
  const relatedPaths = ctx.relatedPaths || [];
  const addedLines = ctx.addedLines || [];
  const addedJoin = addedLines.join('\n');
  const pathsJoin = changedPaths.join('\n');
  return {
    changedPaths,
    relatedPaths,
    addedLines,
    changedDomains: ctx.changedDomains || new Set(),
    addedJoin,
    addedLower: addedJoin.toLowerCase(),
    pathsJoin,
    pathsLower: pathsJoin.toLowerCase(),
    diffTokens: tokenizeCode(`${addedJoin}\n${pathsJoin}`)
  };
}

function scoreRule(id, rule, ctx, stats = null) {
  const prepared = ctx.diffTokens ? ctx : prepareCtx(ctx);

  let pathScore = 0;
  let bestSpecificity = 0;
  let pathReason = null;
  for (const glob of rule.paths || []) {
    for (const cp of prepared.changedPaths) {
      if (matchGlob(glob, cp)) {
        const spec = specificity(glob);
        const curveLast = PATH_SPEC_CURVE.length - 1;
        const base =
          spec < PATH_SPEC_CURVE.length
            ? PATH_SPEC_CURVE[spec]
            : PATH_SPEC_CURVE[curveLast] + (spec - curveLast) * 0.5;
        const df = stats ? stats.globDF[glob] || 1 : 1;
        const crowd =
          df >= GLOB_CROWD_HIGH ? GLOB_CROWD_HIGH_FACTOR : df >= GLOB_CROWD_MED ? GLOB_CROWD_MED_FACTOR : 1;
        const s = base * crowd;
        if (s > pathScore || (s === pathScore && spec > bestSpecificity)) {
          pathScore = s;
          bestSpecificity = spec;
          pathReason = { type: 'path', glob, path: cp, specificity: spec, df, score: round2(s) };
        }
      }
    }
  }

  const matchedTrigs = [];
  for (const trigger of new Set(rule.diff_triggers || [])) {
    if (!isValidTrigger(trigger)) continue;
    if (prepared.addedJoin.includes(trigger)) {
      const w = WEIGHT_TRIGGER * (stats ? idfWeight(stats.trigDF[trigger], stats.totalRules) : 1);
      matchedTrigs.push({ trigger, weight: w });
    }
  }
  matchedTrigs.sort((a, b) => b.weight - a.weight || (a.trigger < b.trigger ? -1 : a.trigger > b.trigger ? 1 : 0));

  let triggerScore = 0;
  let triggerReason = null;
  if (matchedTrigs.length > 0) {
    triggerScore = matchedTrigs[0].weight;
    for (let i = 1; i < Math.min(matchedTrigs.length, MAX_TRIGGER_HITS); i++) {
      triggerScore += matchedTrigs[i].weight * (TRIGGER_EXTRA_RATIO / i);
    }
    triggerReason = {
      type: 'diff_trigger',
      trigger: matchedTrigs[0].trigger,
      triggers: matchedTrigs.slice(0, MAX_TRIGGER_HITS).map((m) => m.trigger),
      count: matchedTrigs.length,
      score: round2(triggerScore)
    };
  }

  const seenKws = new Set();
  const matchedKws = [];
  for (const rawKeyword of rule.keywords || []) {
    const kl = String(rawKeyword).toLowerCase();
    if (!kl || seenKws.has(kl)) continue;
    seenKws.add(kl);
    const kNorm = stripAccents(kl);
    const inDiff =
      kNorm.length <= 3
        ? prepared.diffTokens.has(kNorm)
        : prepared.diffTokens.has(kNorm) || prepared.addedLower.includes(kl);
    const inPath = kNorm.length <= 3 ? false : prepared.pathsLower.includes(kl);
    if (inDiff || inPath) {
      const w = WEIGHT_KEYWORD * (stats ? idfWeight(stats.kwDF[kl], stats.totalRules) : 1);
      matchedKws.push({ keyword: rawKeyword, where: inDiff ? 'diff' : 'path', weight: w });
    }
  }
  matchedKws.sort((a, b) => b.weight - a.weight || (a.keyword < b.keyword ? -1 : a.keyword > b.keyword ? 1 : 0));

  let keywordScore = 0;
  let keywordReason = null;
  if (matchedKws.length > 0) {
    keywordScore = matchedKws[0].weight;
    for (let i = 1; i < Math.min(matchedKws.length, MAX_KEYWORD_HITS); i++) {
      keywordScore += matchedKws[i].weight * (KEYWORD_EXTRA_RATIO / i);
    }
    keywordReason = {
      type: 'keyword',
      keyword: matchedKws[0].keyword,
      keywords: matchedKws.slice(0, MAX_KEYWORD_HITS).map((m) => m.keyword),
      where: matchedKws[0].where,
      score: round2(keywordScore)
    };
  }

  let domainScore = 0;
  let domainReason = null;
  if (prepared.changedDomains.has(rule.domain)) {
    domainScore = WEIGHT_DOMAIN;
    domainReason = { type: 'domain', domain: rule.domain, score: WEIGHT_DOMAIN };
  }

  // A5: 1-hop adjacent code path boost (only when diff already matched a real trigger and glob spec >= 2)
  let adjPathScore = 0;
  let adjPathReason = null;
  if (pathScore === 0 && triggerScore > 0 && prepared.relatedPaths.length > 0) {
    let bestRelSpec = 0;
    for (const glob of rule.paths || []) {
      const spec = specificity(glob);
      if (spec < ADJ_PATH_MIN_SPEC) continue;
      for (const rp of prepared.relatedPaths) {
        if (matchGlob(glob, rp)) {
          const curveLast = PATH_SPEC_CURVE.length - 1;
          const base =
            spec < PATH_SPEC_CURVE.length
              ? PATH_SPEC_CURVE[spec]
              : PATH_SPEC_CURVE[curveLast] + (spec - curveLast) * 0.5;
          const df = stats ? stats.globDF[glob] || 1 : 1;
          const crowd =
            df >= GLOB_CROWD_HIGH ? GLOB_CROWD_HIGH_FACTOR : df >= GLOB_CROWD_MED ? GLOB_CROWD_MED_FACTOR : 1;
          const s = round2(base * crowd * ADJ_PATH_RATIO);
          if (s > adjPathScore || (s === adjPathScore && spec > bestRelSpec)) {
            adjPathScore = s;
            bestRelSpec = spec;
            adjPathReason = { type: 'adj_path', glob, path: rp, specificity: spec, df, score: s };
          }
        }
      }
    }
    if (bestRelSpec > bestSpecificity) {
      bestSpecificity = bestRelSpec;
    }
  }

  const total = round2(pathScore + adjPathScore + triggerScore + keywordScore + domainScore);
  const reasons = [pathReason, adjPathReason, triggerReason, keywordReason, domainReason].filter(Boolean);

  return {
    id,
    domain: rule.domain,
    title: rule.title,
    summary: rule.summary,
    score: total,
    specificity: bestSpecificity,
    triggerCount: matchedTrigs.length,
    keywordScore: round2(keywordScore),
    reasons
  };
}

function addUndirectedEdge(adjMap, a, b) {
  if (!a || !b || a === b) return;
  if (!adjMap[a]) adjMap[a] = new Set();
  if (!adjMap[b]) adjMap[b] = new Set();
  adjMap[a].add(b);
  adjMap[b].add(a);
}

function loadMemoryGraph(index, memoryRoot, options = {}) {
  const { excludePr = null } = options;
  const rulesObj = (index && index.rules) || {};
  const docNeighbors = Object.create(null);
  const ruleCitations = Object.create(null);
  const coCitations = Object.create(null);
  const fileRuleCitations = Object.create(null);

  for (const [id, rule] of Object.entries(rulesObj)) {
    if (!rule) continue;
    for (const relId of rule.related_ids || []) {
      if (Object.prototype.hasOwnProperty.call(rulesObj, relId)) {
        addUndirectedEdge(docNeighbors, id, relId);
      }
    }
    if (memoryRoot && rule.domain) {
      try {
        const txt = fs.readFileSync(ruleFilePath(memoryRoot, id, rule.domain), 'utf-8');
        let m;
        RULE_ID_REF_RE.lastIndex = 0;
        while ((m = RULE_ID_REF_RE.exec(txt)) !== null) {
          const refId = m[1];
          if (Object.prototype.hasOwnProperty.call(rulesObj, refId)) {
            addUndirectedEdge(docNeighbors, id, refId);
          }
        }
      } catch {
        // fail-open when markdown bodies are unavailable
      }
    }
  }

  if (memoryRoot) {
    const eventsPath = path.join(memoryRoot, 'events.jsonl');
    try {
      const rawEvents = fs.readFileSync(eventsPath, 'utf-8');
      for (const line of rawEvents.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let ev;
        try {
          ev = JSON.parse(trimmed);
        } catch {
          continue;
        }
        if (!ev || typeof ev !== 'object') continue;
        if (excludePr !== null && excludePr !== undefined && ev.pr !== undefined && Number(ev.pr) === Number(excludePr)) {
          continue;
        }
        const ids = new Set();
        for (const field of ['rules_cited', 'rules_applied', 'aps_triggered']) {
          const arr = ev[field];
          if (!Array.isArray(arr)) continue;
          for (const item of arr) {
            let rm;
            RULE_ID_REF_RE.lastIndex = 0;
            while ((rm = RULE_ID_REF_RE.exec(String(item))) !== null) {
              if (Object.prototype.hasOwnProperty.call(rulesObj, rm[1])) {
                ids.add(rm[1]);
              }
            }
          }
        }
        if (ids.size === 0) continue;
        const idArr = Array.from(ids);
        for (const id of idArr) {
          ruleCitations[id] = (ruleCitations[id] || 0) + 1;
        }
        for (let i = 0; i < idArr.length; i++) {
          const a = idArr[i];
          if (!coCitations[a]) coCitations[a] = Object.create(null);
          for (let j = 0; j < idArr.length; j++) {
            if (i === j) continue;
            const b = idArr[j];
            coCitations[a][b] = (coCitations[a][b] || 0) + 1;
          }
        }
        if (Array.isArray(ev.files)) {
          for (const fp of ev.files) {
            if (typeof fp !== 'string' || !fp) continue;
            if (!fileRuleCitations[fp]) fileRuleCitations[fp] = Object.create(null);
            for (const id of idArr) {
              fileRuleCitations[fp][id] = (fileRuleCitations[fp][id] || 0) + 1;
            }
          }
        }
      }
    } catch {
      // fail-open when events.jsonl is absent
    }
  }

  return { docNeighbors, ruleCitations, coCitations, fileRuleCitations };
}

function sortScoredRules(scored) {
  // Desempate determinístico: score desc, triggers desc, especificidade desc, id asc.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.triggerCount !== a.triggerCount) return b.triggerCount - a.triggerCount;
    if (b.specificity !== a.specificity) return b.specificity - a.specificity;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function selectRules(index, ctx, limit) {
  const stats = computeIndexStats(index);
  const prepared = prepareCtx(ctx);
  const scored = [];
  for (const [id, rule] of Object.entries(index.rules)) {
    if (rule.layer === 'hot') continue; // hot sai por fora do orçamento, sempre
    const s = scoreRule(id, rule, prepared, stats);
    if (s.score > 0) scored.push(s);
  }

  sortScoredRules(scored);

  const graphOptIn = Boolean(ctx.graph || ctx.enableGraph || process.env.RC6_RULE_GRAPH === '1');
  const useGraph = !ctx.noGraph && process.env.RC6_RULE_GRAPH !== '0' && graphOptIn && (ctx.graph || ctx.memoryRoot);
  if (useGraph && scored.length > 0) {
    const graph = ctx.graph || loadMemoryGraph(index, ctx.memoryRoot, { excludePr: ctx.excludePr });
    const seeds = scored.filter((r) => r.triggerCount > 0).slice(0, A5_SEED_LIMIT);

    for (const cand of scored) {
      let directFileHits = 0;
      for (const cp of prepared.changedPaths) {
        const fmap = graph.fileRuleCitations[cp];
        if (fmap && fmap[cand.id]) directFileHits += fmap[cand.id];
      }
      const hasRealEvidence =
        cand.triggerCount > 0 || (cand.keywordScore || 0) > 0 || cand.specificity >= 3 || directFileHits > 0;
      if (!hasRealEvidence) continue;

      let graphBoost = 0;
      let bestSeed = null;
      for (const s of seeds) {
        if (s.id === cand.id || s.score <= cand.score) continue;
        const docLinked = Boolean(graph.docNeighbors[s.id] && graph.docNeighbors[s.id].has(cand.id));
        const coCites = (graph.coCitations[s.id] && graph.coCitations[s.id][cand.id]) || 0;
        if (docLinked || coCites >= 2) {
          const b = round2(Math.min(cand.score * 0.15, s.score * 0.1, A5_GRAPH_CAP));
          if (b > graphBoost) {
            graphBoost = b;
            bestSeed = s.id;
          }
        }
      }

      let episodicBoost = 0;
      const cites = graph.ruleCitations[cand.id] || 0;
      if (directFileHits > 0 || (cand.triggerCount > 0 && cites > 0)) {
        episodicBoost = round2(
          Math.min(
            cand.score * 0.12,
            (directFileHits > 0 ? 2.0 : 0) + Math.log1p(cites) * 0.45,
            A5_EPISODIC_CAP
          )
        );
      }

      const rawBoost = round2(graphBoost + episodicBoost);
      if (rawBoost > 0) {
        const cappedBoost = round2(Math.min(rawBoost, cand.score * A5_TOTAL_MAX_RATIO, A5_TOTAL_CAP));
        if (cappedBoost > 0) {
          const scale = cappedBoost / rawBoost;
          if (graphBoost > 0 && bestSeed) {
            cand.reasons.push({ type: 'graph_1hop', via: bestSeed, score: round2(graphBoost * scale) });
          }
          if (episodicBoost > 0) {
            cand.reasons.push({
              type: 'episodic',
              citations: cites,
              fileHits: directFileHits,
              score: round2(episodicBoost * scale)
            });
          }
          cand.score = round2(cand.score + cappedBoost);
        }
      }
    }

    sortScoredRules(scored);
  }

  // Diversidade suave consistente por prefixo: 3 vagas livres por domínio, decaimento leve (0.95^k)
  // depois — garante selectRules(idx, ctx, 5) == selectRules(idx, ctx, 60).slice(0, 5) sem sufocar
  // regras do mesmo domínio quando têm evidência real.
  const remaining = scored.slice();
  const selected = [];
  const perDomain = Object.create(null);
  while (selected.length < limit && remaining.length > 0) {
    let bestIdx = 0;
    let bestEff = -1;
    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i];
      const count = perDomain[cand.domain] || 0;
      const decay = count < DOMAIN_FREE_SLOTS ? 1 : Math.pow(DOMAIN_REPEAT_DECAY, count - DOMAIN_FREE_SLOTS + 1);
      const eff = cand.score * decay;
      if (eff > bestEff) {
        bestEff = eff;
        bestIdx = i;
      }
    }
    const chosen = remaining.splice(bestIdx, 1)[0];
    perDomain[chosen.domain] = (perDomain[chosen.domain] || 0) + 1;
    selected.push(chosen);
  }

  return selected;
}

function reasonToText(reason) {
  if (reason.type === 'path') return `path:${reason.glob} (spec=${reason.specificity}) +${reason.score}`;
  if (reason.type === 'adj_path') return `adj_path:${reason.glob} (via ${reason.path}, spec=${reason.specificity}) +${reason.score}`;
  if (reason.type === 'diff_trigger') {
    if (reason.triggers && reason.triggers.length > 1) {
      return `trigger:${reason.triggers.map((t) => `"${t}"`).join(',')} +${reason.score}`;
    }
    return `trigger:"${reason.trigger}" +${reason.score}`;
  }
  if (reason.type === 'keyword') {
    if (reason.keywords && reason.keywords.length > 1) {
      return `keyword:${reason.keywords.map((k) => `"${k}"`).join(',')} (${reason.where}) +${reason.score}`;
    }
    return `keyword:"${reason.keyword}" (${reason.where}) +${reason.score}`;
  }
  if (reason.type === 'domain') return `domain:${reason.domain} +${reason.score}`;
  if (reason.type === 'graph_1hop') return `graph:via_${reason.via} +${reason.score}`;
  if (reason.type === 'episodic') return `episodic:cites=${reason.citations}${reason.fileHits ? `,file=${reason.fileHits}` : ''} +${reason.score}`;
  return JSON.stringify(reason);
}

function formatHotBlock(id, rule, root) {
  const body = ruleBody(root, id, rule.domain);
  return [`## [HOT] ${id} — ${rule.title}`, '', body || rule.summary].join('\n');
}

// Caminho no disco a partir do id + domínio. R-* mora em rules/, AP-* em anti-patterns/.
function ruleFilePath(root, id, domain) {
  const bucket = id.startsWith('AP-') ? 'anti-patterns' : 'rules';
  return path.join(root, bucket, domain, `${id}.md`);
}

// Corpo da memória sem o frontmatter (o frontmatter é metadado de roteamento, não conteúdo).
function ruleBody(root, id, domain) {
  try {
    const t = fs.readFileSync(ruleFilePath(root, id, domain), 'utf-8');
    if (!t.startsWith('---\n')) return t.trim();
    const end = t.indexOf('\n---', 4);
    return end === -1 ? t.trim() : t.slice(end + 4).replace(/^\n+/, '').trim();
  } catch {
    return null;
  }
}

// FR-015: o formato default injeta a regra INTEIRA. Mandar o `summary` aqui repetiria o defeito
// que esta spec existe para corrigir — texto curto demais para agir, só que por outro caminho.
// O resumo serve para DECIDIR se vale abrir (--format brief), não para substituir a regra.
function formatFullBlock(item, rule, root) {
  const body = ruleBody(root, item.id, rule.domain);
  return [
    `## ${item.id} — ${rule.title} (score=${item.score})`,
    `motivo: ${item.reasons.map(reasonToText).join('; ')}`,
    '',
    body || rule.summary
  ].join('\n');
}

function formatHotCardBlock(id, rule, root) {
  const card = typeof rule.review_card === 'string' ? rule.review_card.trim() : '';
  if (!card) return formatHotBlock(id, rule, root);
  return [`## [HOT] ${id} — ${rule.title}`, '', card].join('\n');
}

function formatCardBlock(item, rule, root) {
  const card = typeof rule.review_card === 'string' ? rule.review_card.trim() : '';
  if (!card) return formatFullBlock(item, rule, root);
  return [
    `## ${item.id} — ${rule.title} (score=${item.score})`,
    `motivo: ${item.reasons.map(reasonToText).join('; ')}`,
    '',
    card
  ].join('\n');
}

function printResults({ index, hotIds, selected, format, json, changedDomains, memoryRoot }) {
  if (json) {
    const out = {
      hot: hotIds.map((id) => ({ id, ...index.rules[id] })),
      selected: selected.map((item) => {
        const rule = index.rules[item.id];
        return {
          id: item.id,
          title: item.title,
          summary: item.summary,
          domain: item.domain,
          score: item.score,
          specificity: item.specificity,
          reasons: item.reasons,
          ...(rule && typeof rule.review_card === 'string' && rule.review_card.trim()
            ? { review_card: rule.review_card }
            : {})
        };
      }),
      changedDomains: Array.from(changedDomains).sort()
    };
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  if (format === 'brief') {
    for (const id of hotIds) {
      const rule = index.rules[id];
      console.log(`[HOT] ${id} — ${rule.summary}`);
    }
    for (const item of selected) {
      console.log(`${item.id} — ${item.summary} (${item.reasons.map(reasonToText).join('; ')})`);
    }
    return;
  }

  if (format === 'card') {
    const blocks = [];
    for (const id of hotIds) {
      blocks.push(formatHotCardBlock(id, index.rules[id], memoryRoot));
    }
    for (const item of selected) {
      blocks.push(formatCardBlock(item, index.rules[item.id], memoryRoot));
    }
    console.log(blocks.join('\n\n'));
    return;
  }

  // format === 'full' (default)
  const blocks = [];
  for (const id of hotIds) {
    blocks.push(formatHotBlock(id, index.rules[id], memoryRoot));
  }
  for (const item of selected) {
    blocks.push(formatFullBlock(item, index.rules[item.id], memoryRoot));
  }
  console.log(blocks.join('\n\n'));
}

function findRuleFile(root, id, domain) {
  for (const sub of ['rules', 'anti-patterns']) {
    const candidate = path.join(root, sub, domain, `${id}.md`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = args.root ? path.resolve(args.root) : path.join(repoRoot, '.agent/memory');
  const indexPath = args.index ? path.resolve(args.index) : path.join(root, 'compiled_rules_index.json');

  let changedPaths = [...args.paths];
  let addedLines = [];

  if (args.diffFile) {
    let diffText;
    try {
      diffText = fs.readFileSync(path.resolve(args.diffFile), 'utf-8');
    } catch (e) {
      console.error(`erro ao ler diff "${args.diffFile}": ${e.message}`);
      process.exitCode = 1;
      return;
    }
    const parsed = parseDiff(diffText);
    changedPaths = changedPaths.concat(parsed.changedPaths);
    addedLines = parsed.addedLines;
  }

  let index;
  try {
    index = loadIndex(indexPath);
  } catch (e) {
    failSafe(changedPaths);
    return;
  }

  if (!index || typeof index !== 'object' || !index.rules) {
    failSafe(changedPaths);
    return;
  }

  const changedDomains = domainsForPaths(changedPaths);
  const ctx = {
    changedPaths,
    relatedPaths: args.relatedPaths,
    addedLines,
    changedDomains,
    memoryRoot: root,
    enableGraph: args.enableGraph,
    noGraph: args.noGraph,
    excludePr: args.excludePr
  };

  if (args.id) {
    const rule = index.rules[args.id];
    if (!rule) {
      console.error(`id "${args.id}" não encontrado no índice`);
      process.exitCode = 1;
      return;
    }
    const filePath = findRuleFile(root, args.id, rule.domain);
    if (!filePath) {
      console.error(`arquivo de origem de "${args.id}" não encontrado sob ${root}`);
      process.exitCode = 1;
      return;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    if (args.json) {
      console.log(JSON.stringify({ id: args.id, path: path.relative(repoRoot, filePath), content }, null, 2));
    } else {
      console.log(content);
    }
    process.exitCode = 0;
    return;
  }

  const hotIds = (index.hot || []).slice().sort();
  const selected = selectRules(index, ctx, args.limit);

  printResults({ index, hotIds, selected, format: args.format, json: args.json, changedDomains, memoryRoot: root });
  process.exitCode = 0;
}

// Só executa a CLI quando o arquivo é o entrypoint. Sem esta guarda, `import` de
// qualquer helper daqui roda o CLI inteiro como efeito colateral (medido: importar
// select-rules.mjs imprimia "fail-safe 056 ativado" e a seleção completa).
function isEntrypoint(argv1) {
  if (!argv1) return false;
  try {
    return import.meta.url === pathToFileURL(fs.realpathSync(argv1)).href;
  } catch {
    return import.meta.url === pathToFileURL(argv1).href;
  }
}

if (isEntrypoint(process.argv[1])) {
  main();
}

export {
  globToRegExp,
  matchGlob,
  specificity,
  domainsForPath,
  domainsForPaths,
  parseDiff,
  isValidTrigger,
  tokenizeCode,
  computeIndexStats,
  loadMemoryGraph,
  scoreRule,
  selectRules,
  formatCardBlock,
  formatHotCardBlock
};
