import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CARD_MAX_BYTES,
  TRIGGER_MAX_REPO_SHARE,
  normalizeException,
  renderReviewCard,
  validateReviewCard,
  dedupeRedundantTriggers,
  validateTriggersAgainstRepo,
  buildOverlayIndex
} from '../compile-review-cards.mjs';
import { selectRules, domainsForPaths } from '../select-rules.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptsDir = path.resolve(__dirname, '..');

const SAMPLE_MD = `---
title: Fato histórico congela snapshot
summary: Tabela de fatos congela atributos na escrita.
layer: warm
status: active
applies_to:
  paths:
    - apps/web/**
---

# R-299 — Fato histórico

## Regra
\`dose_instances\` congela \`medicine_id\`, exceto em deleção de conta.
Não resolver \`protocols.medicine_id\` por join em \`.select(\`.
`;

test('renderReviewCard e validateReviewCard aceitam card válido <= 450B com símbolo e exceção', () => {
  const card = {
    id: 'R-299',
    severity: 'critical',
    applies_when: 'Escrita/leitura em dose_instances ou queries Supabase .select()',
    invariant: 'Fato histórico congela medicine_id na linha sem resolver via join em protocols',
    exception: 'exceto exclusão total de conta',
    violation_pattern: 'Resolver medicine_id via join em .select() na tabela viva',
    fix_pattern: 'Persistir medicine_id em dose_instances no write e ler direto',
    match_paths: ['packages/core/src/repositories/**'],
    match_imports: [],
    match_symbols: ['dose_instances', 'medicine_id', '.select(']
  };
  const res = validateReviewCard(card, { id: 'R-299', rawMd: SAMPLE_MD, domain: 'data_and_schema' });
  assert.equal(res.ok, true, `erros inesperados: ${res.errors.join('; ')}`);
  assert.deepEqual(res.warnings, []);
  assert.ok(res.bytes <= CARD_MAX_BYTES, `bytes=${res.bytes}`);
  assert.ok(res.rendered.includes('(exc: exceto exclusão total de conta)'));
  assert.ok(res.symbolHits >= 2);
});

test('validateReviewCard rejeita >450B, truncamento "...", id errado, severidade inválida e zero símbolos', () => {
  const oversized = {
    id: 'R-999',
    severity: 'low',
    applies_when: 'Quando...',
    invariant: 'Curta',
    exception: '',
    violation_pattern: 'Usar parseLocalDate sem cuidado ' + 'x'.repeat(420),
    fix_pattern: 'Usar helper correto',
    match_symbols: []
  };
  const r1 = validateReviewCard(oversized, { id: 'R-299', rawMd: SAMPLE_MD, domain: 'data_and_schema' });
  assert.equal(r1.ok, false);
  assert.ok(r1.errors.some((e) => e.startsWith('id_mismatch')));
  assert.ok(r1.errors.some((e) => e.startsWith('invalid_severity')));
  assert.ok(r1.errors.includes('missing_or_short_invariant'));
  assert.ok(r1.errors.includes('truncated_field_applies_when'));
  assert.ok(r1.errors.some((e) => e.startsWith('exceeds_max_bytes')));
  assert.ok(r1.errors.some((e) => e.startsWith('missing_source_symbols')));
});

test('validateReviewCard sinaliza exception_dropped quando fonte tem exceção omitida pelo card', () => {
  const card = {
    id: 'R-299',
    severity: 'high',
    applies_when: 'Queries em dose_instances e serviços de leitura',
    invariant: 'Sempre congelar medicine_id diretamente na linha de dose_instances',
    exception: '',
    violation_pattern: '.select() fazendo join com protocols para medicine_id',
    fix_pattern: 'Ler coluna congelada medicine_id direto do registro',
    match_symbols: ['dose_instances']
  };
  const r = validateReviewCard(card, { id: 'R-299', rawMd: SAMPLE_MD, domain: 'data_and_schema' });
  assert.equal(r.ok, true);
  assert.equal(r.exceptionChecked, true);
  assert.equal(r.exceptionPreserved, false);
  assert.ok(r.warnings.some((w) => w.startsWith('exception_dropped')));
});

test('validateTriggersAgainstRepo filtra glob morto, "*" e trigger amplo/alucinado mas mantém símbolo da fonte', () => {
  const repoIndex = {
    files: [
      'apps/mobile/src/features/A.tsx',
      'apps/web/src/features/B.tsx',
      'packages/core/src/repositories/doseRepo.ts',
      'server/notifications/dispatch.ts',
      'packages/core/src/utils/date.ts'
    ],
    contentsByFile: new Map([
      ['apps/mobile/src/features/A.tsx', 'export function A() { useEffect(() => {}); return null; }'],
      ['apps/web/src/features/B.tsx', 'export function B() { useState(0); return null; }'],
      ['packages/core/src/repositories/doseRepo.ts', 'export const q = () => client.from("dose_instances").select("medicine_id");'],
      ['server/notifications/dispatch.ts', 'export function send() { return 1; }'],
      ['packages/core/src/utils/date.ts', 'export function parseLocalDate() { return new Date(); }']
    ])
  };
  const card = {
    id: 'R-299',
    match_paths: [
      'apps/mobile/src/features/**',
      'packages/core/src/repositories/**',
      'apps/naoexiste/**',
      '**/*.tsx' // 2/5 = 40% e specificity 0 OK (< 45%); vamos testar glob broad com 3/5?
    ],
    match_imports: [],
    match_symbols: [
      'dose_instances', // 1/5 = 20% (exato no teto TRIGGER_MAX_REPO_SHARE=0.20)
      'export', // 5/5 = 100% > 20%
      'return', // 4/5 = 80% > 20%
      '*',
      'hallucinatedApiCall',
      'protocols.medicine_id' // 0 hits in HEAD, but literally present in SAMPLE_MD!
    ]
  };
  const tv = validateTriggersAgainstRepo(card, { id: 'R-299', rawMd: SAMPLE_MD }, repoIndex);
  assert.deepEqual(tv.keptPaths.map((x) => x.glob), [
    'apps/mobile/src/features/**',
    'packages/core/src/repositories/**',
    '**/*.tsx'
  ]);
  assert.deepEqual(
    tv.rejectedPaths.map((x) => [x.glob, x.reason]),
    [['apps/naoexiste/**', 'dead_glob']]
  );
  assert.deepEqual(tv.keptTriggers.map((x) => x.trigger), ['dose_instances', 'protocols.medicine_id']);
  assert.deepEqual(
    tv.rejectedTriggers.map((x) => [x.trigger, x.reason]),
    [
      ['export', 'too_broad_trigger'],
      ['return', 'too_broad_trigger'],
      ['*', 'invalid_short_trigger'],
      ['hallucinatedApiCall', 'dead_hallucinated_trigger']
    ]
  );
});

test('buildOverlayIndex não muta índice base, substitui boilerplate e integra com selectRules', () => {
  const rules = {};
  for (let i = 1; i <= 21; i++) {
    rules[`R-${String(i).padStart(3, '0')}`] = {
      title: `Boilerplate ${i}`,
      summary: 'S',
      domain: 'react_and_ui',
      layer: 'warm',
      paths: ['apps/web/**'],
      diff_triggers: [],
      keywords: []
    };
  }
  rules['AP-282'] = {
    title: 'Erro em campo oculto',
    summary: 'safeParse falha em campo fora da tela',
    domain: 'react_and_ui',
    layer: 'warm',
    paths: ['apps/web/**'],
    diff_triggers: ['*'],
    keywords: ['campo']
  };
  const baseIndex = { hot: [], rules };

  const validated = [
    {
      id: 'AP-282',
      source_sha256: 'abc123',
      validation: {
        ok: true,
        rendered: 'AP-282 | high | when: forms | inv: sempre normalizar -> fix: safeParse com campo visível'
      },
      triggerValidation: {
        keptPaths: [{ glob: 'apps/mobile/src/features/**' }, { glob: 'apps/web/src/features/**' }],
        keptTriggers: [{ trigger: 'safeParse', hits: 3 }]
      }
    }
  ];

  const overlay = buildOverlayIndex(baseIndex, validated);
  assert.deepEqual(baseIndex.rules['AP-282'].paths, ['apps/web/**'], 'índice base não pode ser mutado');
  assert.deepEqual(overlay.rules['AP-282'].paths, ['apps/mobile/src/features/**', 'apps/web/src/features/**']);
  assert.deepEqual(overlay.rules['AP-282'].diff_triggers, ['safeParse'], 'trigger degenerado "*" removido');
  assert.ok(overlay.rules['AP-282'].review_card.startsWith('AP-282 | high |'));

  const changedPaths = ['apps/mobile/src/features/onboarding/Step.tsx'];
  const picked = selectRules(
    overlay,
    {
      changedPaths,
      addedLines: ['const parsed = formSchema.safeParse(values);'],
      changedDomains: domainsForPaths(changedPaths)
    },
    5
  );
  assert.equal(picked[0].id, 'AP-282');
});

test('compile-review-cards.mjs roda isolado sem node_modules', () => {
  const iso = fs.mkdtempSync(path.join(os.tmpdir(), 'crc-iso-'));
  try {
    const isoScripts = path.join(iso, 'scripts');
    const isoSchemas = path.join(isoScripts, 'schemas');
    fs.mkdirSync(isoSchemas, { recursive: true });
    fs.copyFileSync(path.join(scriptsDir, 'compile-review-cards.mjs'), path.join(isoScripts, 'compile-review-cards.mjs'));
    fs.copyFileSync(path.join(scriptsDir, 'select-rules.mjs'), path.join(isoScripts, 'select-rules.mjs'));
    fs.copyFileSync(path.join(scriptsDir, 'schemas', 'memory-constants.mjs'), path.join(isoSchemas, 'memory-constants.mjs'));

    const res = spawnSync(
      'node',
      [
        '--input-type=module',
        '-e',
        `import { renderReviewCard } from '${path.join(isoScripts, 'compile-review-cards.mjs')}'; console.log(renderReviewCard({id:'R-1',severity:'high',applies_when:'a b',invariant:'inv inv inv',violation_pattern:'bad bad',fix_pattern:'fix fix'}));`
      ],
      { cwd: iso, encoding: 'utf-8' }
    );
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /^R-1 \| high \| when: a b/);
  } finally {
    fs.rmSync(iso, { recursive: true, force: true });
  }
});

test('normalizeException limpa none/nenhuma/N/A e renderReviewCard não duplica (exc:)', () => {
  for (const blank of ['none', 'None', 'nenhuma', 'nenhum', 'N/A', '-', 'sem exceção', '']) {
    assert.equal(normalizeException(blank), '', `esperado vazio para "${blank}"`);
  }
  assert.equal(normalizeException('(exc: apenas conta)'), 'apenas conta');
  assert.equal(
    normalizeException("Diferença de calendário (ex: 'hoje')"),
    "Diferença de calendário (ex: 'hoje')"
  );

  const noExc = renderReviewCard({
    id: 'R-288',
    severity: 'critical',
    applies_when: 'filas em DB',
    invariant: 'Usar FOR UPDATE SKIP LOCKED',
    exception: 'none',
    violation_pattern: 'claim sem transação',
    fix_pattern: 'usar CTE atômica'
  });
  assert.ok(!/\(exc:/i.test(noExc), `não deve renderizar (exc: none): ${noExc}`);

  const noDup = renderReviewCard({
    id: 'AP-358',
    severity: 'medium',
    applies_when: 'auth signOut',
    invariant: 'Emitir evento antes do reset (exc: tags de device)',
    exception: 'tags de device',
    violation_pattern: 'await signOut(); emit();',
    fix_pattern: 'emit(); await signOut();'
  });
  assert.equal((noDup.match(/\(exc:/g) || []).length, 1, `não deve duplicar (exc:): ${noDup}`);
});

test('validateReviewCard aceita exception preenchida sem repetir palavra "exceto"', () => {
  const res = validateReviewCard(
    {
      id: 'R-299',
      severity: 'critical',
      applies_when: 'consultas em dose_instances',
      invariant: 'Fato histórico congela medicine_id na linha sem join',
      exception: 'exclusão de conta',
      violation_pattern: 'resolver medicine_id via protocols no .select()',
      fix_pattern: 'gravar medicine_id congelado em dose_instances',
      match_symbols: ['dose_instances', 'medicine_id']
    },
    { id: 'R-299', rawMd: SAMPLE_MD, domain: 'data_and_schema' }
  );
  assert.equal(res.ok, true, res.errors.join('; '));
  assert.equal(res.exceptionChecked, true);
  assert.equal(res.exceptionPreserved, true);
  assert.deepEqual(res.warnings, []);
});

test('dedupeRedundantTriggers colapsa substrings redundantes mantendo a forma mais discriminativa', () => {
  const res = dedupeRedundantTriggers([
    { trigger: 'useState', hits: 272 },
    { trigger: 'useState(', hits: 235 },
    { trigger: 'getNow', hits: 119 },
    { trigger: 'getNow()', hits: 99 },
    { trigger: 'signOut', hits: 14 },
    { trigger: 'signOut(', hits: 7 },
    { trigger: 'FOR UPDATE', hits: 29 },
    { trigger: 'FOR UPDATE SKIP LOCKED', hits: 4 }
  ]);
  assert.deepEqual(
    res.kept.map((x) => x.trigger),
    ['useState(', 'getNow()', 'signOut', 'FOR UPDATE']
  );
  assert.equal(res.dropped.length, 4);
  assert.ok(res.dropped.every((d) => d.reason === 'redundant_substring_duplicate'));
});

test('TRIGGER_MAX_REPO_SHARE=0.20 rejeita token em 2/5 (40%) e aceita em 1/5 (20%) + too_broad_glob', () => {
  assert.equal(TRIGGER_MAX_REPO_SHARE, 0.2);
  const repoIndex = {
    files: [
      'apps/mobile/src/features/A.ts',
      'apps/mobile/src/features/B.ts',
      'packages/core/src/repositories/C.ts',
      'server/notifications/D.ts',
      'api/webhook/E.ts'
    ],
    contentsByFile: new Map([
      ['apps/mobile/src/features/A.ts', 'supabase.from("x"); getNow();'],
      ['apps/mobile/src/features/B.ts', 'supabase.from("y"); getNow(); useState(() => 1);'],
      ['packages/core/src/repositories/C.ts', 'parseLocalDate();'],
      ['server/notifications/D.ts', 'dispatch();'],
      ['api/webhook/E.ts', 'handle();']
    ])
  };
  const tv = validateTriggersAgainstRepo(
    {
      id: 'R-20',
      match_paths: ['**/*.ts', 'packages/core/src/repositories/**'],
      match_imports: [],
      match_symbols: ['supabase', 'getNow()', 'useState(() =>', 'parseLocalDate(']
    },
    { id: 'R-20', rawMd: SAMPLE_MD },
    repoIndex
  );
  assert.deepEqual(tv.rejectedPaths.map((x) => [x.glob, x.reason]), [['**/*.ts', 'too_broad_glob']]);
  assert.deepEqual(tv.keptPaths.map((x) => x.glob), ['packages/core/src/repositories/**']);
  assert.deepEqual(tv.keptTriggers.map((x) => x.trigger), ['useState(() =>', 'parseLocalDate(']);
  assert.ok(tv.rejectedTriggers.some((x) => x.trigger === 'supabase' && x.reason === 'too_broad_trigger'));
  assert.ok(tv.rejectedTriggers.some((x) => x.trigger === 'getNow()' && x.reason === 'too_broad_trigger'));
});
