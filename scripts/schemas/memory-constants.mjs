// Pure domain and memory constants without external npm dependencies (js-yaml/zod).
// Kept separate so scripts/select-rules.mjs can run in isolated git worktrees
// without node_modules during RC6 reviews.

// Domínios reconhecidos para a memória DEVFLOW (.agent/memory/{rules,anti-patterns}/<domain>/).
// Derivado da estrutura real de diretórios do acervo — ver CLAUDE.md §Estrutura.
export const DOMAINS = [
  'data_and_schema',
  'react_and_ui',
  'mobile_and_platform',
  'infra_and_deploy',
  'process_and_testing',
  'notifications',
  'test_hygiene',
  'tooling_and_build'
];

// Critérios de justificativa para layer: hot (O = objetivo/observável, S = subjetivo/sinal).
export const HOT_CRITERIA = ['O1', 'O2', 'O3', 'O4', 'O5', 'S1', 'S2', 'S3'];

// IDs reais do acervo incluem formatos irregulares: AP-W15, AP-H01, AP-LOG-001, R-025-1, AP-97.
// Um padrão \d{3} reprovaria 104 arquivos reais — manter permissivo.
export const ID_PATTERN = /^(R|AP)-[A-Z0-9]+(-\d+)?$/;

// Heurística de mapeamento glob/caminho → domínio (FR-011c e select-rules.mjs). Simples de
// propósito: checa se a string CONTÉM um dos "marcadores" de caminho abaixo. Não é um matcher
// de glob real. Vive aqui (módulo puro, sem side-effects de CLI) para ser importável sem
// dependências externas ou disparar main().
export const DOMAIN_PATH_MARKERS = {
  data_and_schema: ['apps/web/src/schemas/', 'packages/core/src/schemas/', 'Schema', 'supabase/', '/services/'],
  react_and_ui: ['apps/web/src/features/', 'apps/web/src/views/', '.tsx'],
  mobile_and_platform: ['apps/mobile/'],
  infra_and_deploy: ['api/', '.github/', 'vercel.json'],
  notifications: ['server/bot/', 'server/notifications/'],
  process_and_testing: ['scripts/', '.agent/', 'docs/'],
  test_hygiene: ['.test.', '__tests__/'],
  tooling_and_build: ['packages/config/', 'packages/design-tokens/', '.config.js']
};
