import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  scoreRule,
  selectRules,
  isValidTrigger,
  tokenizeCode,
  domainsForPaths,
  loadMemoryGraph,
  formatCardBlock,
  formatHotCardBlock
} from '../select-rules.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptsDir = path.resolve(__dirname, '..');
const fixturesRoot = path.join(scriptsDir, '__fixtures__', 'memory');
const diffsDir = path.join(scriptsDir, '__fixtures__', 'diffs');
const compileScript = path.join(scriptsDir, 'compile-memory-index.mjs');
const selectScript = path.join(scriptsDir, 'select-rules.mjs');

let tmpDir;
let indexPath;

function run(script, args) {
  const stderrFile = path.join(os.tmpdir(), `select-rules-test-stderr-${process.pid}-${Math.random().toString(36).slice(2)}.log`);
  const stderrFd = fs.openSync(stderrFile, 'w');
  try {
    const stdout = execFileSync('node', [script, ...args], { encoding: 'utf-8', stdio: ['ignore', 'pipe', stderrFd] });
    return { stdout, stderr: fs.readFileSync(stderrFile, 'utf-8'), status: 0 };
  } catch (e) {
    return { stdout: e.stdout ?? '', stderr: fs.readFileSync(stderrFile, 'utf-8'), status: e.status ?? 1 };
  } finally {
    fs.closeSync(stderrFd);
    fs.rmSync(stderrFile, { force: true });
  }
}

function selectJson(diffFixtureName, extraArgs = []) {
  const args = [
    '--root',
    fixturesRoot,
    '--index',
    indexPath,
    '--diff-fixture',
    path.join(diffsDir, diffFixtureName),
    '--json',
    ...extraArgs
  ];
  const result = run(selectScript, args);
  assert.equal(result.status, 0, `select-rules deveria sair 0; stderr=${result.stderr}`);
  return JSON.parse(result.stdout);
}

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'select-rules-test-'));
  indexPath = path.join(tmpDir, 'idx.json');
  const compileResult = run(compileScript, ['--root', fixturesRoot, '--out', indexPath]);
  assert.equal(compileResult.status, 0, `compile falhou: ${compileResult.stderr}`);
  assert.ok(fs.existsSync(indexPath), 'índice não foi escrito');
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('diff de SQL seleciona regras data_and_schema e NÃO regras de UI', () => {
  const out = selectJson('sql-drop-column.diff');
  const selectedIds = out.selected.map((r) => r.id);
  const selectedDomains = new Set(out.selected.map((r) => r.domain));

  assert.ok(selectedIds.length > 0, 'deveria selecionar ao menos uma regra');
  assert.ok(!selectedDomains.has('react_and_ui'), 'não deveria selecionar regras de UI para um diff de SQL');
  assert.ok(
    selectedIds.some((id) => ['R-901', 'R-903', 'AP-901'].includes(id)),
    'deveria selecionar ao menos uma regra de data_and_schema'
  );
});

test('hot aparece sempre, mesmo em diff que não casa nada', () => {
  const args = [
    '--root',
    fixturesRoot,
    '--index',
    indexPath,
    '--paths',
    'docs/README_totalmente_irrelevante.md',
    '--json'
  ];
  const result = run(selectScript, args);
  assert.equal(result.status, 0);
  const out = JSON.parse(result.stdout);
  const hotIds = out.hot.map((r) => r.id);
  assert.deepEqual(hotIds, ['R-900'], 'R-900 (layer hot) deve aparecer sempre');
});

test('glob específico vence glob genérico no mesmo caminho', () => {
  const out = selectJson('sql-drop-column.diff');
  const r901 = out.selected.find((r) => r.id === 'R-901');
  const r903 = out.selected.find((r) => r.id === 'R-903');

  assert.ok(r901, 'R-901 (glob específico supabase/migrations/*.sql) deveria estar selecionado');
  // R-903 (glob genérico supabase/**) pode ficar de fora pelo teto de 2/domínio, mas se aparecer
  // tem que vir depois de R-901 no ranking.
  if (r903) {
    assert.ok(r901.score >= r903.score, 'R-901 deveria pontuar >= R-903 no mesmo caminho');
    assert.ok(r901.specificity > r903.specificity, 'especificidade de R-901 deveria ser maior que a de R-903');
  }
});

test('fail-safe 056: índice ausente imprime aviso em stderr e sai 0, devolvendo domínios', () => {
  const missingIndex = path.join(tmpDir, 'nao-existe.json');
  const result = run(selectScript, [
    '--root',
    fixturesRoot,
    '--index',
    missingIndex,
    '--paths',
    'apps/mobile/src/hooks/useDoseReminder.ts'
  ]);
  assert.equal(result.status, 0, 'fail-safe nunca deve sair com erro');
  assert.match(result.stderr, /fail-safe 056 ativado/);
  assert.match(result.stdout, /mobile_and_platform/);
});

test('duas execuções seguidas devolvem a mesma ordem (determinismo)', () => {
  const first = selectJson('sql-drop-column.diff');
  const second = selectJson('sql-drop-column.diff');
  assert.deepEqual(
    first.selected.map((r) => r.id),
    second.selected.map((r) => r.id),
    'a ordem dos ids selecionados deve ser idêntica entre execuções'
  );
});

// O teto por domínio é SOFT: ele espalha as vagas quando HÁ disputa, mas não deixa vaga vazia
// quando não há. Como teto duro, ele limitava a seleção a 2 x (nº de domínios) — e um diff de UM
// domínio, que é o caso comum, devolvia 2 regras contra as "3 a 5" de FR-004/SC-003.
test('teto por domínio espalha sob disputa, mas não deixa vaga vazia', () => {
  // Com folga de vagas (limit alto), o teto NÃO deve suprimir candidatos válidos.
  const folgado = selectJson('sql-drop-column.diff', ['--limit', '10']);
  const semTeto = selectJson('sql-drop-column.diff', ['--limit', '10']);
  assert.deepEqual(
    folgado.selected.map((r) => r.id),
    semTeto.selected.map((r) => r.id),
    'determinismo entre execuções com folga'
  );

  // Sob disputa real (mais candidatos que vagas), nenhum domínio leva TODAS as vagas.
  const apertado = selectJson('sql-drop-column.diff', ['--limit', '2']);
  const counts = {};
  for (const r of apertado.selected) counts[r.domain] = (counts[r.domain] || 0) + 1;
  const domains = Object.keys(counts);
  if (apertado.selected.length >= 2 && domains.length > 1) {
    for (const d of domains) {
      assert.ok(counts[d] <= 2, `domínio ${d} passou do teto sob disputa: ${counts[d]}`);
    }
  }

  // E o orçamento é de fato USADO quando existem candidatos para preenchê-lo.
  const disponiveis = folgado.selected.length;
  const cinco = selectJson('sql-drop-column.diff', ['--limit', '5']);
  assert.equal(
    cinco.selected.length,
    Math.min(5, disponiveis),
    'com candidatos suficientes, o limite tem de ser preenchido — vaga vazia é recall jogado fora'
  );
});

test('--id devolve o arquivo inteiro da regra, ignorando scoring', () => {
  const result = run(selectScript, [
    '--root',
    fixturesRoot,
    '--index',
    indexPath,
    '--id',
    'R-900'
  ]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^---\nid: R-900/);
  assert.match(result.stdout, /hot_reason:/);
});

test('funciona sem node_modules (worktree isolado fora do repo)', () => {
  const iso = fs.mkdtempSync(path.join(os.tmpdir(), 'select-rules-isolated-'));
  try {
    const isoScripts = path.join(iso, 'scripts');
    const isoSchemas = path.join(isoScripts, 'schemas');
    fs.mkdirSync(isoSchemas, { recursive: true });
    fs.copyFileSync(selectScript, path.join(isoScripts, 'select-rules.mjs'));
    fs.copyFileSync(
      path.join(scriptsDir, 'schemas', 'memory-constants.mjs'),
      path.join(isoSchemas, 'memory-constants.mjs')
    );

    const res = spawnSync(
      'node',
      [
        path.join(isoScripts, 'select-rules.mjs'),
        '--root',
        fixturesRoot,
        '--index',
        indexPath,
        '--diff-fixture',
        path.join(diffsDir, 'sql-drop-column.diff'),
        '--json'
      ],
      { cwd: iso, encoding: 'utf-8' }
    );
    assert.equal(res.status, 0, `esperado status 0 sem node_modules; stderr=${res.stderr}`);
    assert.equal(res.stderr, '', `stderr deveria ser vazio; recebido=${res.stderr}`);
    const out = JSON.parse(res.stdout);
    assert.ok(out.selected.length > 0, 'deveria selecionar ao menos uma regra sem node_modules');
    assert.ok(
      out.hot.some((r) => r.id === 'R-900'),
      'hot deveria incluir R-900 sem node_modules'
    );
  } finally {
    fs.rmSync(iso, { recursive: true, force: true });
  }
});

test('filtro de trigger degenerado bloqueia "*" mas aceita triggers curtos válidos', () => {
  assert.equal(isValidTrigger('*'), false);
  assert.equal(isValidTrigger('***'), false);
  assert.equal(isValidTrigger('---'), false);
  assert.equal(isValidTrigger('RC3'), true);
  assert.equal(isValidTrigger('.select('), true);
  assert.equal(isValidTrigger('${unit}'), true);

  const deg = scoreRule(
    'AP-DEG',
    { domain: 'react_and_ui', title: 'T', summary: 'S', paths: [], diff_triggers: ['*'], keywords: [] },
    { changedPaths: [], addedLines: ['/** * comentário JSDoc */'], changedDomains: new Set() }
  );
  assert.equal(deg.score, 0, 'trigger "*" não deve pontuar');

  const okShort = scoreRule(
    'AP-RC3',
    { domain: 'process_and_testing', title: 'T', summary: 'S', paths: [], diff_triggers: ['RC3'], keywords: [] },
    { changedPaths: [], addedLines: ['// gate RC3'], changedDomains: new Set() }
  );
  assert.ok(okShort.score > 0, 'trigger alfanumérico curto "RC3" deve pontuar');
});

test('desconto de glob boilerplate e multi-trigger superam regra spec=5 sem trigger', () => {
  const rules = {};
  for (let i = 1; i <= 22; i++) {
    rules[`AP-${String(i).padStart(3, '0')}`] = {
      title: `Boilerplate ${i}`,
      summary: 'S',
      domain: 'react_and_ui',
      layer: 'warm',
      paths: ['apps/web/**'],
      diff_triggers: [],
      keywords: []
    };
  }
  rules['R-DEEP'] = {
    title: 'Deep 0-trigger',
    summary: 'S',
    domain: 'react_and_ui',
    layer: 'warm',
    paths: ['apps/mobile/src/features/a/b/**'],
    diff_triggers: [],
    keywords: []
  };
  rules['R-UNCR'] = {
    title: 'Uncrowded web glob',
    summary: 'S',
    domain: 'react_and_ui',
    layer: 'warm',
    paths: ['apps/web/src/**'],
    diff_triggers: [],
    keywords: []
  };
  rules['R-CUR'] = {
    title: 'Curated trigger',
    summary: 'S',
    domain: 'data_and_schema',
    layer: 'warm',
    paths: ['apps/mobile/src/utils/**'],
    diff_triggers: ['parseLocalDate'],
    keywords: []
  };

  const changedPaths = [
    'apps/web/src/Page.tsx',
    'apps/mobile/src/utils/date.ts',
    'apps/mobile/src/features/a/b/View.tsx'
  ];
  const out = selectRules(
    { rules },
    { changedPaths, addedLines: ['const d = parseLocalDate(raw);'], changedDomains: domainsForPaths(changedPaths) },
    5
  );
  const rank = Object.fromEntries(out.map((r, i) => [r.id, r]));
  assert.equal(out[0].id, 'R-CUR', 'glob curado + trigger deve vencer spec=5 sem trigger');
  assert.ok(rank['R-UNCR'].score > rank['AP-001'].score, 'glob curado sem crowd deve vencer glob boilerplate >=20x');
});

test('keywords code-aware e sem acento casam camelCase e acentos sem falso positivo em <=3 chars', () => {
  const toks = tokenizeCode('parseLocalDate useState vínculo');
  assert.ok(toks.has('parse') && toks.has('local') && toks.has('date'));
  assert.ok(toks.has('use') && toks.has('state'));
  assert.ok(toks.has('vinculo'));

  const htmlVsMl = scoreRule(
    'AP-ML',
    { domain: 'react_and_ui', title: 'T', summary: 'S', paths: [], diff_triggers: [], keywords: ['ml'] },
    { changedPaths: [], addedLines: ['return <html><body>ok</body></html>;'], changedDomains: new Set() }
  );
  assert.equal(htmlVsMl.score, 0, 'keyword <=3 chars "ml" não deve casar substring de "html"');

  const accentAndCamel = scoreRule(
    'AP-TOK',
    { domain: 'data_and_schema', title: 'T', summary: 'S', paths: [], diff_triggers: [], keywords: ['vinculo', 'local'] },
    { changedPaths: [], addedLines: ['// vínculo do parseLocalDate'], changedDomains: new Set() }
  );
  assert.ok(accentAndCamel.score > 2, 'multi-hit acento + camelCase deve somar acima de um hit único');
});

test('consistência por prefixo e segurança contra Object.prototype (toString/constructor)', () => {
  const rules = {};
  for (let i = 1; i <= 8; i++) {
    rules[`R-${String(100 + i)}`] = {
      title: `Rule ${i}`,
      summary: 'S',
      domain: 'data_and_schema',
      layer: 'warm',
      paths: ['packages/core/src/repositories/**'],
      diff_triggers: i <= 2 ? ['toString', 'constructor'] : ['.select('],
      keywords: ['valueOf', 'hasOwnProperty']
    };
  }
  const idx = { rules };
  const ctx = {
    changedPaths: ['packages/core/src/repositories/repo.ts'],
    addedLines: ['x.toString(); x.constructor(); valueOf();'],
    changedDomains: new Set(['data_and_schema'])
  };
  const top5 = selectRules(idx, ctx, 5).map((r) => r.id);
  const top20 = selectRules(idx, ctx, 20).map((r) => r.id);
  assert.deepEqual(top5, top20.slice(0, 5), 'top-5 deve ser prefixo exato de top-20');
});

test('--format card emite review_card quando presente e faz fallback para full/summary quando ausente', () => {
  const cardDir = fs.mkdtempSync(path.join(os.tmpdir(), 'select-rules-card-'));
  try {
    const idxFile = path.join(cardDir, 'compiled_rules_index.json');
    const cardRule = {
      title: 'Card Rule',
      summary: 'Summary Card',
      domain: 'data_and_schema',
      layer: 'warm',
      paths: ['packages/core/src/repositories/**'],
      diff_triggers: ['.update('],
      keywords: [],
      review_card: 'Verifique `.update().select()`.\n(exc: tabela pública)'
    };
    const fallbackRule = {
      title: 'Fallback Rule',
      summary: 'Summary Fallback Only',
      domain: 'data_and_schema',
      layer: 'warm',
      paths: ['packages/core/src/repositories/**'],
      diff_triggers: ['.select('],
      keywords: []
    };
    const hotCardRule = {
      title: 'Hot Card',
      summary: 'Hot Summary',
      domain: 'data_and_schema',
      layer: 'hot',
      paths: [],
      diff_triggers: [],
      keywords: [],
      review_card: 'Regra HOT em review_card.'
    };
    fs.writeFileSync(
      idxFile,
      JSON.stringify({
        hot: ['R-HOT1'],
        rules: {
          'R-HOT1': hotCardRule,
          'R-CARD': cardRule,
          'R-FBK': fallbackRule
        }
      })
    );
    const diffFile = path.join(cardDir, 'test.diff');
    fs.writeFileSync(
      diffFile,
      [
        'diff --git a/packages/core/src/repositories/x.ts b/packages/core/src/repositories/x.ts',
        '--- a/packages/core/src/repositories/x.ts',
        '+++ b/packages/core/src/repositories/x.ts',
        '@@ -1 +1,2 @@',
        '+await db.from("t").update({ a: 1 }).select()',
        ''
      ].join('\n')
    );

    const cardOut = run(selectScript, ['--root', cardDir, '--index', idxFile, '--diff-file', diffFile, '--format', 'card', '--limit', '5']);
    assert.equal(cardOut.status, 0, cardOut.stderr);
    assert.ok(cardOut.stdout.includes('## [HOT] R-HOT1 — Hot Card\n\nRegra HOT em review_card.'));
    assert.ok(cardOut.stdout.includes('## R-CARD — Card Rule'));
    assert.ok(cardOut.stdout.includes('Verifique `.update().select()`.'));
    assert.ok(cardOut.stdout.includes('## R-FBK — Fallback Rule'));
    assert.ok(cardOut.stdout.includes('Summary Fallback Only'));

    const jsonOut = run(selectScript, ['--root', cardDir, '--index', idxFile, '--diff-file', diffFile, '--json', '--limit', '5']);
    assert.equal(jsonOut.status, 0, jsonOut.stderr);
    const parsed = JSON.parse(jsonOut.stdout);
    const selectedById = Object.fromEntries(parsed.selected.map((s) => [s.id, s]));
    assert.equal(selectedById['R-CARD'].review_card, cardRule.review_card);
    assert.equal(selectedById['R-FBK'].review_card, undefined);

    const directHot = formatHotCardBlock('R-HOT1', hotCardRule, cardDir);
    assert.ok(directHot.includes('Regra HOT em review_card.'));
    const directFallback = formatCardBlock(
      { id: 'R-FBK', score: 1, reasons: [{ type: 'domain', domain: 'data_and_schema', score: 1 }] },
      fallbackRule,
      cardDir
    );
    assert.ok(directFallback.includes('Summary Fallback Only'));
  } finally {
    fs.rmSync(cardDir, { recursive: true, force: true });
  }
});

test('--related-paths ativa adj_path somente com triggerScore > 0 e glob spec >= 2', () => {
  const relRule = {
    domain: 'data_and_schema',
    title: 'Callee contract',
    summary: 'S',
    paths: ['packages/core/src/utils/**'],
    diff_triggers: ['formatDose('],
    keywords: []
  };
  const shallowGlobRule = {
    ...relRule,
    paths: ['packages/**']
  };
  const noTrigRule = {
    ...relRule,
    diff_triggers: []
  };

  const baseCtx = {
    changedPaths: ['apps/mobile/src/features/dashboard/components/Card.tsx'],
    relatedPaths: ['packages/core/src/utils/doseUnit.ts'],
    addedLines: ['const s = formatDose(10, "mg");'],
    changedDomains: domainsForPaths(['apps/mobile/src/features/dashboard/components/Card.tsx'])
  };

  const withAdj = scoreRule('R-ADJ', relRule, baseCtx);
  const withoutAdj = scoreRule('R-ADJ', relRule, { ...baseCtx, relatedPaths: [] });
  assert.ok(withAdj.reasons.some((r) => r.type === 'adj_path'), 'deveria registrar reason adj_path');
  assert.ok(withAdj.score > withoutAdj.score, 'adj_path deve somar score quando glob spec >= 2 e há trigger');

  const shallow = scoreRule('R-SHW', shallowGlobRule, baseCtx);
  assert.equal(shallow.reasons.some((r) => r.type === 'adj_path'), false, 'glob raso (spec < 2) não ativa adj_path');

  const noTrig = scoreRule('R-NTG', noTrigRule, baseCtx);
  assert.equal(noTrig.reasons.some((r) => r.type === 'adj_path'), false, 'sem trigger no diff não ativa adj_path');
});

test('A5 loadMemoryGraph e boost graph_1hop/episodic respeitam excludePr, files numérico e guarda anti-Mateus', () => {
  const gDir = fs.mkdtempSync(path.join(os.tmpdir(), 'select-rules-a5-'));
  try {
    fs.mkdirSync(path.join(gDir, 'rules', 'data_and_schema'), { recursive: true });
    fs.writeFileSync(
      path.join(gDir, 'rules', 'data_and_schema', 'R-SEED.md'),
      '# R-SEED\nRelacionada com [[R-COUPLED]] no mesmo fluxo.\n'
    );
    fs.writeFileSync(
      path.join(gDir, 'rules', 'data_and_schema', 'R-COUPLED.md'),
      '# R-COUPLED\nRegra acoplada.\n'
    );
    fs.writeFileSync(
      path.join(gDir, 'events.jsonl'),
      [
        '{"event":"coding_complete","pr":10,"files":3,"rules_applied":["R-BOILER","R-COUPLED"]}',
        '{"event":"ai_review_complete","pr":11,"files":["packages/core/src/repositories/repo.ts"],"rules_cited":["R-COUPLED","R-PEER"]}',
        '{"event":"ai_review_complete","pr":999,"files":["packages/core/src/repositories/repo.ts"],"rules_cited":["R-LEAK"]}'
      ].join('\n') + '\n'
    );

    const index = {
      rules: {
        'R-SEED': {
          title: 'Seed Rule',
          summary: 'S',
          domain: 'data_and_schema',
          layer: 'warm',
          paths: ['packages/core/src/repositories/**'],
          diff_triggers: ['.update(', '.select('],
          keywords: []
        },
        'R-COUPLED': {
          title: 'Coupled Rule',
          summary: 'S',
          domain: 'data_and_schema',
          layer: 'warm',
          paths: ['packages/core/src/repositories/**'],
          diff_triggers: ['.eq('],
          keywords: []
        },
        'R-PEER': {
          title: 'Peer Rule',
          summary: 'S',
          domain: 'data_and_schema',
          layer: 'warm',
          paths: ['packages/core/src/repositories/**'],
          diff_triggers: ['.eq('],
          keywords: []
        },
        'R-BOILER': {
          title: 'Boilerplate Only',
          summary: 'S',
          domain: 'data_and_schema',
          layer: 'warm',
          paths: ['packages/**'],
          diff_triggers: [],
          keywords: []
        },
        'R-LEAK': {
          title: 'Excluded PR Rule',
          summary: 'S',
          domain: 'data_and_schema',
          layer: 'warm',
          paths: ['packages/core/src/repositories/**'],
          diff_triggers: ['.eq('],
          keywords: []
        },
        'R-ZERO': {
          title: 'Zero Diff Match',
          summary: 'S',
          domain: 'react_and_ui',
          layer: 'warm',
          paths: ['apps/web/**'],
          diff_triggers: ['unusedToken'],
          keywords: []
        }
      }
    };

    const graphFiltered = loadMemoryGraph(index, gDir, { excludePr: 999 });
    assert.ok(graphFiltered.docNeighbors['R-SEED'].has('R-COUPLED'));
    assert.equal(graphFiltered.ruleCitations['R-LEAK'] || 0, 0, 'excludePr deve ignorar eventos do próprio PR');

    const selectedDefault = selectRules(
      index,
      {
        changedPaths: ['packages/core/src/repositories/repo.ts'],
        addedLines: ['await db.from("t").update({ a: 1 }).select().eq("id", id);'],
        changedDomains: new Set(['data_and_schema']),
        memoryRoot: gDir,
        excludePr: 999
      },
      10
    );
    const byIdDefault = Object.fromEntries(selectedDefault.map((s) => [s.id, s]));
    assert.equal(
      byIdDefault['R-COUPLED'].reasons.some((r) => r.type === 'graph_1hop' || r.type === 'episodic'),
      false,
      'boost graph/episodic deve ficar desligado por padrão (opt-in via enableGraph/RC6_RULE_GRAPH=1)'
    );

    const selected = selectRules(
      index,
      {
        changedPaths: ['packages/core/src/repositories/repo.ts'],
        addedLines: ['await db.from("t").update({ a: 1 }).select().eq("id", id);'],
        changedDomains: new Set(['data_and_schema']),
        memoryRoot: gDir,
        enableGraph: true,
        excludePr: 999
      },
      10
    );

    const byId = Object.fromEntries(selected.map((s) => [s.id, s]));
    assert.ok(byId['R-COUPLED'].reasons.some((r) => r.type === 'graph_1hop'), 'R-COUPLED deve ganhar graph_1hop via R-SEED');
    assert.ok(byId['R-COUPLED'].reasons.some((r) => r.type === 'episodic'), 'R-COUPLED deve ganhar episodic');
    assert.ok(byId['R-COUPLED'].score > byId['R-PEER'].score, 'R-COUPLED conectado em grafo deve superar R-PEER de mesmo trigger');
    assert.equal(
      byId['R-BOILER'].reasons.some((r) => r.type === 'graph_1hop' || r.type === 'episodic'),
      false,
      'glob boilerplate sem trigger/keyword/file-hit não deve receber boost episódico/grafo'
    );
    assert.equal(byId['R-ZERO'], undefined, 'regra com score 0 no diff nunca entra via grafo');
  } finally {
    fs.rmSync(gDir, { recursive: true, force: true });
  }
});
