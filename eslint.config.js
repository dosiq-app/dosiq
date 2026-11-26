import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import importX from 'eslint-plugin-import-x'
import noRelativeImportPaths from 'eslint-plugin-no-relative-import-paths'
import n from 'eslint-plugin-n'
import reactNative from 'eslint-plugin-react-native'
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'

// Guardrails AST base compartilhados entre blocos (preservados ao estender por domínio em Flat Config)
const BASE_RESTRICTED_SYNTAX = [
  // R-020: Timezone Safe Dates
  {
    selector: 'NewExpression[callee.name="Date"]',
    message: 'Não use "new Date()". Use "parseLocalDate()" de @utils/dateUtils para evitar bugs de timezone (R-020).'
  },
  // R-020/AP-342 (spec 077): dia/hora a partir do corte de uma string ISO é a leitura UTC.
  // Sobre Date de parede só coincide com SP num runtime UTC; sobre instante dá o dia UTC.
  {
    selector: 'CallExpression[callee.property.name=/^(split|slice|substring|substr)$/][callee.object.callee.property.name="toISOString"]',
    message: 'toISOString() recortado devolve dia/hora UTC, não o de SP. Use formatLocalDate(getUserTime(...)) / getTodayLocal() de @dosiq/core (R-020, AP-342). Caso legítimo (instante UTC de propósito): eslint-disable-next-line com o motivo.'
  },
  {
    selector: 'CallExpression[callee.property.name="split"][arguments.0.value="T"]',
    message: 'split("T") corta uma data ISO e devolve o dia UTC do instante. Use formatLocalDate(getUserTime(parseISO(x), tz)) de @dosiq/core (R-020, AP-342).'
  },
  // R-020: Proibir bibliotecas de data externas sem centralização
  {
    selector: 'ImportDeclaration[source.value="dayjs"], ImportDeclaration[source.value="moment"]',
    message: 'Não use dayjs/moment diretamente. Centralize lógica de data em @utils/dateUtils (R-020).'
  },
  // R-204: Acessibilidade (Botões sobre Divs)
  {
    selector: 'JSXOpeningElement[name.name="div"] > JSXAttribute[name.name="onClick"]',
    message: 'Não use <div> com onClick. Use <button> ou o componente <Button> para acessibilidade (R-204).'
  },
  // ADR-008: Design System hardcoded colors detection
  {
    selector: 'JSXAttribute[name.name="style"] Literal[value=/^#|^rgb|^hsl/]',
    message: 'Não use cores hardcoded em estilos inline. Use variáveis CSS do Design System (--color-*).'
  },
  // R-010: Hook Order — States antes de Memos, Effects, Handlers
  {
    selector: 'BlockStatement > :matches(VariableDeclaration:has(CallExpression[callee.name=/^(useMemo|useCallback)$/]), ExpressionStatement:has(CallExpression[callee.name=/^(useEffect|useLayoutEffect|useFocusEffect|useInsertionEffect)$/])) ~ VariableDeclaration:has(CallExpression[callee.name=/^(useState|useRef|useReducer|useContext)$/])',
    message: 'R-010: Ordem dos hooks incorreta. Declare States/Refs/Context (useState, useRef, etc.) antes de Memos, Effects e Handlers.'
  },
  // R-010: Hook Order — Memos antes de Effects e Handlers
  {
    selector: 'BlockStatement > :matches(VariableDeclaration:has(CallExpression[callee.name="useCallback"]), ExpressionStatement:has(CallExpression[callee.name=/^(useEffect|useLayoutEffect|useFocusEffect|useInsertionEffect)$/])) ~ VariableDeclaration:has(CallExpression[callee.name="useMemo"])',
    message: 'R-010: Ordem dos hooks incorreta. Declare Memos (useMemo) antes de Effects e Handlers.'
  },
  // 034-A/AP-299: enum de DB em z.enum() DEVE ser pt-BR COM acento (o CHECK do banco
  // rejeita a versão sem — 23514). Só literais DIRETOS no z.enum(); constantes tolerantes
  // de leitura (mapas de normalização) ficam fora de propósito. 'cp' só existe em
  // titration_steps (TITRATION_INTAKE_UNITS compõe via [...INTAKE_UNITS, 'cp'], não aqui).
  {
    selector: 'CallExpression[callee.object.name="z"][callee.property.name="enum"] Literal[value=/^(daily|weekly|monthly|biweekly|as_needed|when_needed|diario|quando_necessario|cp)$/]',
    message: 'Enum de DB em inglês ou sem acento dentro de z.enum(). Os CHECKs do banco exigem pt-BR verbatim (ex.: "diário", "quando_necessário"; comprimido = NULL, não "cp"). Ver CLAUDE.md §Schemas — enums (AP-299).'
  },
  // 034-A/R-090 (lição Sprint 7): res.json(body) sem res.status() quebra no Vercel.
  // [arguments.length>0] distingue do res.json() de fetch Response (0 args).
  {
    selector: 'CallExpression[callee.object.name="res"][callee.property.name="json"][arguments.length>0]',
    message: 'res.json(body) direto quebra no Vercel. Use SEMPRE res.status(code).json(body) (R-090 / lição Sprint 7).'
  },
]

const ASI_MOCK_CAST_SELECTOR = {
  selector: 'MemberExpression[object.type="CallExpression"][object.arguments.length=1][object.arguments.0.type="TSAsExpression"][property.name=/^mock/] TSTypeReference[typeName.right.name=/Mock$/], MemberExpression[object.type="CallExpression"][object.arguments.length=1][object.arguments.0.type="TSAsExpression"][property.name=/^mock/] TSTypeReference[typeName.name=/Mock$/]',
  message: 'ASI bug: (x as jest.Mock) sem ";" inicial encadeou como argumento da linha anterior. Use jest.mocked(x) ou ";" inicial (RC6 Ext #6).'
}

const R305_UPDATE_SELECT_SELECTOR = {
  selector: 'CallExpression[callee.property.name="eq"][callee.object.type="CallExpression"][callee.object.callee.property.name="update"]:not(CallExpression[callee.property.name="select"] *)',
  message: 'R-305: .update().eq() em tabela com RLS falha em silêncio (0 linhas) sem .select(). Encadeie .select() e valide o retorno.'
}

const AP366_USEMEMO_NOW_SELECTOR = {
  selector: 'CallExpression[callee.name="useMemo"] CallExpression[callee.name=/^(getNow|getRawNow|nowInSP)$/]',
  message: 'AP-366: getNow()/getRawNow()/nowInSP() dentro de useMemo congela o "agora" no instante da última carga. Use useMinuteClock() ou passe o instante nas deps.'
}

const NO_SUPABASE_IN_UI_SELECTOR = {
  selector: 'CallExpression[callee.property.name="from"][callee.object.name=/^(supabase|nativeSupabaseClient|typedClient)$/]',
  message: 'Proibido chamar supabase.from() direto em screens/ ou components/. Extraia a query para @dosiq/core/repositories (R-231) ou para o service da feature.'
}

const NO_SETTIMEOUT_IN_COMPONENTS_SELECTOR = {
  selector: 'CallExpression[callee.name=/^(setTimeout|setInterval)$/], CallExpression[callee.object.name=/^(global|globalThis|window)$/][callee.property.name=/^(setTimeout|setInterval)$/]',
  message: 'Proibido setTimeout()/setInterval() direto em components/ mobile (remendo temporal sujeito a race condition). Use @shared/utils/withTimeout para promessas, @shared/hooks/useModalAutoFocus para foco pós-modal, callbacks de ciclo de vida (onShow/onDismiss) ou um hook dedicado em shared/hooks/.'
}

const AP366_LEGACY_MOBILE_SCREENS = [
  'apps/mobile/src/features/dashboard/screens/TodayScreen.tsx',
]

const AP366_LEGACY_MOBILE_COMPONENTS = [
  'apps/mobile/src/features/dashboard/components/TreatmentWeekModule.tsx',
  'apps/mobile/src/features/measures/components/ScatterTrend.tsx',
  'apps/mobile/src/features/treatments/components/NextDoseField.tsx',
  'apps/mobile/src/features/treatments/components/TreatmentSentenceCard.tsx',
]

const AP366_LEGACY_WEB_COMPONENTS = [
  'apps/web/src/features/calendar/components/DoseCalendar.tsx',
  'apps/web/src/features/measures/components/ScatterTrend.tsx',
]

const AP366_LEGACY_FILES = [
  ...AP366_LEGACY_MOBILE_SCREENS,
  'apps/mobile/src/features/dashboard/hooks/_useTodayDerived.ts',
  ...AP366_LEGACY_MOBILE_COMPONENTS,
  ...AP366_LEGACY_WEB_COMPONENTS,
  'apps/web/src/features/dashboard/hooks/useDashboardContext.tsx',
  'apps/web/src/features/dashboard/hooks/useSparklineData.ts',
]

// Testes são isolados dos blocos de produção por whitelist (evita falsos bloqueios de regras de app)
const TEST_FILE_PATTERNS = [
  '**/__tests__/**/*.{js,jsx,ts,tsx}',
  '**/*.test.{js,jsx,ts,tsx}',
  '**/*.spec.{js,jsx,ts,tsx}',
]

export default [
  { ignores: [
    '**/dist/**',
    '**/node_modules/**',
    '**/.git/**',
    '**/android/**',
    '**/ios/**',
    '**/coverage/**',
    '**/.next/**',
    '**/build/**',
    '**/.expo/**',
    '**/.vercel/**',
    '**/scratch/**',
    '**/.agent/**',
    '**/.claude/**',
    '**/plans/**',
  ] },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    ignores: ['**/*.config.{js,jsx}', '**/vite.config.js', '**/vitest.config.js', ...TEST_FILE_PATTERNS],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'import-x': importX,
      'no-relative-import-paths': noRelativeImportPaths,
    },
    settings: {
      'import-x/resolver': {
        node: true,
        alias: {
          map: [
            ['@', './apps/web/src'],
            ['@features', './apps/web/src/features'],
            ['@shared', './apps/web/src/shared'],
            ['@services', './apps/web/src/services'],
            ['@dashboard', './apps/web/src/features/dashboard'],
            ['@medications', './apps/web/src/features/medications'],
            ['@protocols', './apps/web/src/features/protocols'],
            ['@stock', './apps/web/src/features/stock'],
            ['@adherence', './apps/web/src/features/adherence'],
            ['@calendar', './apps/web/src/features/calendar'],
            ['@emergency', './apps/web/src/features/emergency'],
            ['@prescriptions', './apps/web/src/features/prescriptions'],
            ['@settings', './apps/web/src/views/settings'],
            ['@schemas', './apps/web/src/schemas'],
            ['@utils', './apps/web/src/utils'],
            ['@dosiq/core', './packages/core/src']
          ],
          extensions: ['.js', '.jsx', '.ts', '.tsx']
        }
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      
      // R-116: no-console (redução de ruído em produção)
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }],

      // R-002: Forçar uso de Aliases em vez de caminhos relativos longos
      'no-relative-import-paths/no-relative-import-paths': [
        'error',
        { allowSameFolder: true, rootDir: 'apps/web/src', prefix: '@' }
      ],

      // Import rules
      'import-x/no-unresolved': 'error',
      'import-x/no-cycle': 'error',
      'import-x/no-duplicates': 'error',

      // R-122: Complexidade e Tamanho de Funções
      'complexity': ['warn', { max: 15 }],
      'max-lines-per-function': ['warn', { max: 100, skipBlankLines: true, skipComments: true }],

      'no-unused-vars': ['error', { varsIgnorePattern: '^(motion|AnimatePresence|[A-Z_])' }],

      // AI Agent Guardrails & DevFlow Rules
      'no-restricted-syntax': ['error', ...BASE_RESTRICTED_SYNTAX],

      'no-restricted-imports': ['error', {
        patterns: [
          // Estágio 1: Cross-boundary imports
          {
            group: ['**/server/**'],
            message: 'Aplicações Web não devem importar diretamente do diretório server/. Use @packages/core para lógica compartilhada.'
          },
          // Legado Wave 9 (preservado)
          {
            group: ['**/lib/**'],
            message: 'src/lib/ foi removido. Use "@shared/utils/supabase" ou "@shared/utils/queryCache".',
          },
          {
            group: [
              './hooks', './hooks/**',
              '../hooks', '../hooks/**',
              '../../hooks', '../../hooks/**',
              '../../../hooks', '../../../hooks/**',
            ],
            message: 'src/hooks/ foi removido. Use "@shared/hooks/" ou o alias da feature (ex: "@dashboard/hooks/", "@medications/hooks/").',
          },
          {
            group: [
              './components', './components/**',
              '../components', '../components/**',
              '../../components', '../../components/**',
              '../../../components', '../../../components/**',
            ],
            message: 'src/components/ foi removido. Use "@shared/components/" ou o alias da feature (ex: "@medications/components/", "@stock/components/").',
          },
          {
            group: ['@shared/constants', '@shared/constants/**'],
            message: '@shared/constants/ foi removido. Use "@schemas/" (ex: "@schemas/medicineSchema").',
          },
          {
            group: ['@medications/constants/**', '@stock/constants/**'],
            message: 'Feature constants/ foram removidos. Use "@schemas/" diretamente.',
          },
        ]
      }]
    },
  },
  {
    // Bloco TS/TSX — parser dedicado; regras herdadas do bloco principal acima
    files: ['**/*.{ts,tsx}'],
    ignores: TEST_FILE_PATTERNS,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^(motion|AnimatePresence|[A-Z_])' }],
    },
  },
  {
    files: [
      '**/*.config.{js,jsx,cjs}',
      '**/*.config.js',
      '**/vite.config.js',
      '**/vitest.*.config.js',
      '**/jest.config.js',
      '**/metro.config.js',
      '**/babel.config.js',
      '**/app.config.js',
      '**/scripts/**/*.{js,mjs,ts,tsx}',
      '**/scratch/**/*.cjs'
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'import-x/no-unresolved': 'off',
      'no-console': 'off',
      'no-restricted-syntax': 'off',
      'no-restricted-imports': 'off',
    },
  },
  {
    // Packages: imports relativos usam extensão .js apontando pra fonte .ts
    // (padrão nodenext — exigido pela cadeia de .d.ts do core na Vercel, 040/F6 D1).
    // O resolver node do import-x não mapeia .js→.ts; tsc/strict-island cobrem resolução.
    files: ['packages/*/src/**/*.{ts,tsx}'],
    ignores: TEST_FILE_PATTERNS,
    rules: {
      'import-x/no-unresolved': 'off',
    },
  },
  // Estágio 3: Domínios Específicos
  {
    // Server & API (Node.js Strict)
    files: ['server/**/*.{js,ts}', 'api/**/*.{js,ts}'],
    ignores: TEST_FILE_PATTERNS,
    plugins: {
      n,
    },
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    settings: {
      'import-x/resolver': {
        node: {
          moduleDirectory: ['node_modules', 'server/node_modules']
        }
      }
    },
    rules: {
      'import-x/no-unresolved': 'off',
      'n/no-process-exit': 'error',
      'n/no-path-concat': 'error',
      'no-console': 'off', // Logs são essenciais no server
      'no-restricted-imports': ['error', {
        patterns: [
          // API pode importar do server/ (exceção temporária), mas mantém outras restrições
          {
            group: ['**/lib/**'],
            message: 'src/lib/ foi removido. Use "@shared/utils/supabase" ou "@shared/utils/queryCache".',
          }
          // Outras restrições de hooks/components não se aplicam a api/ (Node)
        ]
      }]
    },
  },
  {
    // Mobile (React Native)
    files: ['apps/mobile/**/*.{js,jsx,ts,tsx}'],
    ignores: TEST_FILE_PATTERNS,
    plugins: {
      'react-native': reactNative,
    },
    languageOptions: {
      globals: {
        ...globals.browser, // RN usa alguns browser globals (console, fetch)
        ...globals.jest,    // Mobile usa Jest para testes
        '__DEV__': 'readonly',
      },
    },
    settings: {
      'import-x/resolver': {
        node: true,
        alias: {
          map: [
            ['@', './apps/mobile/src'],
            ['@shared', './apps/mobile/src/shared'],
            ['@features', './apps/mobile/src/features'],
            ['@utils', './apps/mobile/src/utils'],
            ['@schemas', './apps/mobile/src/schemas'],
            ['@adherence', './apps/mobile/src/features/adherence'],
            ['@medications', './apps/mobile/src/features/medications'],
            ['@protocols', './apps/mobile/src/features/protocols'],
            ['@stock', './apps/mobile/src/features/stock'],
            ['@dashboard', './apps/mobile/src/features/dashboard'],
            ['@navigation', './apps/mobile/src/navigation'],
            ['@platform', './apps/mobile/src/platform'],
            ['@profile', './apps/mobile/src/features/profile'],
            ['@notifications', './apps/mobile/src/features/notifications'],
            ['@treatments', './apps/mobile/src/features/treatments'],
            ['@dose', './apps/mobile/src/features/dose'],
            ['@history', './apps/mobile/src/features/history'],
            ['@measures', './apps/mobile/src/features/measures'],
            ['@dosiq/core', './packages/core/src'],
          ],
          extensions: ['.ios.js', '.android.js', '.js', '.jsx', '.ts', '.tsx']
        }
      }
    },
    rules: {
      'react-native/no-inline-styles': 'warn',
      'react-native/no-color-literals': 'warn',
      'react-native/no-raw-text': 'error',
      'no-relative-import-paths/no-relative-import-paths': 'off', // Mobile usa estrutura diferente
    },
  },
  // Override 0: API handlers têm complexidade estrutural legítima (parse/validate/respond)
  {
    files: ['api/**/*.{js,ts}', 'api/**/_handlers/**/*.{js,ts}'],
    ignores: TEST_FILE_PATTERNS,
    rules: {
      'max-lines-per-function': ['warn', { max: 150, skipBlankLines: true, skipComments: true }],
      'complexity': ['warn', { max: 20 }],
    }
  },
  // Override 1: Componentes React (.jsx/.tsx)
  {
    files: ['**/*.{jsx,tsx}'],
    ignores: TEST_FILE_PATTERNS,
    rules: {
      'max-lines-per-function': ['warn', { max: 150, skipBlankLines: true, skipComments: true }],
      'complexity': ['warn', { max: 20 }],
    }
  },
  // Override 1B: Telas, Modais, Sheets e Views (JSX rico e descritivo — 063)
  {
    files: [
      '**/screens/**/*.{jsx,tsx}',
      '**/views/**/*.{jsx,tsx}',
      '**/*Modal*.{jsx,tsx}',
      '**/*Sheet*.{jsx,tsx}',
    ],
    ignores: TEST_FILE_PATTERNS,
    rules: {
      'max-lines-per-function': ['warn', { max: 200, skipBlankLines: true, skipComments: true }],
      'complexity': ['warn', { max: 25 }],
    }
  },
  // Override 2: Repositórios, Hooks e Formatadores do Core (complexidade de enums/formatadores de saúde — 063)
  {
    files: [
      'packages/core/src/repositories/**/*.{js,ts}',
      'packages/core/src/utils/**/*.{js,ts}',
      'packages/core/src/export/**/*.{js,ts}',
      'packages/core/src/chatbot/**/*.{js,ts}',
      '**/hooks/**/*.{js,ts}',
      '**/_use*.{js,ts}',
    ],
    ignores: TEST_FILE_PATTERNS,
    rules: {
      'max-lines-per-function': ['warn', { max: 250, skipBlankLines: true, skipComments: true }],
      'complexity': ['warn', { max: 25 }],
    }
  },
  // A4 / AP-216: Proibir `any` explícito nos domínios core já 100% tipados
  {
    files: ['packages/core/src/types/**/*.ts', 'packages/core/src/schemas/**/*.ts'],
    ignores: TEST_FILE_PATTERNS,
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  // A4 / R-305: .update().eq() sem .select() em repositórios core (falha silenciosa de RLS)
  {
    files: ['packages/core/src/repositories/**/*.ts'],
    ignores: [
      ...TEST_FILE_PATTERNS,
      // Dívida legada pré-existente mapeada em 1.3c
      'packages/core/src/repositories/createDoseInstanceRepository.ts',
      'packages/core/src/repositories/createPurchaseRepository.ts',
      'packages/core/src/repositories/createTitrationRepository.ts',
    ],
    rules: {
      'no-restricted-syntax': ['error', ...BASE_RESTRICTED_SYNTAX, R305_UPDATE_SELECT_SELECTOR],
    },
  },
  // A4 / AP-366: getNow()/getRawNow()/nowInSP() dentro de useMemo (congela relógio da UI)
  {
    files: [
      'apps/mobile/src/features/**/*.{ts,tsx}',
      'apps/web/src/features/**/*.{ts,tsx}',
    ],
    ignores: [
      ...TEST_FILE_PATTERNS,
      ...AP366_LEGACY_FILES,
    ],
    rules: {
      'no-restricted-syntax': ['error', ...BASE_RESTRICTED_SYNTAX, AP366_USEMEMO_NOW_SELECTOR],
    },
  },
  // Guardrails arquiteturais em UI (screens/ e components/) preservando o baseline legado de AP-366
  {
    files: ['apps/mobile/src/features/**/screens/**/*.{ts,tsx}'],
    ignores: [...TEST_FILE_PATTERNS, ...AP366_LEGACY_MOBILE_SCREENS],
    rules: {
      'no-restricted-syntax': ['error', ...BASE_RESTRICTED_SYNTAX, AP366_USEMEMO_NOW_SELECTOR, NO_SUPABASE_IN_UI_SELECTOR],
    },
  },
  {
    files: AP366_LEGACY_MOBILE_SCREENS,
    ignores: TEST_FILE_PATTERNS,
    rules: {
      'no-restricted-syntax': ['error', ...BASE_RESTRICTED_SYNTAX, NO_SUPABASE_IN_UI_SELECTOR],
    },
  },
  {
    files: ['apps/mobile/src/features/**/components/**/*.{ts,tsx}'],
    ignores: [...TEST_FILE_PATTERNS, ...AP366_LEGACY_MOBILE_COMPONENTS],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...BASE_RESTRICTED_SYNTAX,
        AP366_USEMEMO_NOW_SELECTOR,
        NO_SUPABASE_IN_UI_SELECTOR,
        NO_SETTIMEOUT_IN_COMPONENTS_SELECTOR,
      ],
    },
  },
  {
    files: AP366_LEGACY_MOBILE_COMPONENTS,
    ignores: TEST_FILE_PATTERNS,
    rules: {
      'no-restricted-syntax': [
        'error',
        ...BASE_RESTRICTED_SYNTAX,
        NO_SUPABASE_IN_UI_SELECTOR,
        NO_SETTIMEOUT_IN_COMPONENTS_SELECTOR,
      ],
    },
  },
  {
    files: ['apps/web/src/features/**/components/**/*.{ts,tsx}'],
    ignores: [...TEST_FILE_PATTERNS, ...AP366_LEGACY_WEB_COMPONENTS],
    rules: {
      'no-restricted-syntax': ['error', ...BASE_RESTRICTED_SYNTAX, AP366_USEMEMO_NOW_SELECTOR, NO_SUPABASE_IN_UI_SELECTOR],
    },
  },
  {
    files: AP366_LEGACY_WEB_COMPONENTS,
    ignores: TEST_FILE_PATTERNS,
    rules: {
      'no-restricted-syntax': ['error', ...BASE_RESTRICTED_SYNTAX, NO_SUPABASE_IN_UI_SELECTOR],
    },
  },
  // Override 3: Bloco isolado para testes por whitelist — zero regras de app; só parser TS + 3 guardrails sintáticas
  {
    files: TEST_FILE_PATTERNS,
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
    rules: {
      'no-unexpected-multiline': 'error',
      'no-dupe-keys': 'error',
      'no-restricted-syntax': ['error', ASI_MOCK_CAST_SELECTOR],
    },
  },
]
