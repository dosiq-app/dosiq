-- 20261127_047_store_review_clicked_at.sql — spec 047, slice A (T001)
--
-- OBJETIVO
--   Registrar o último toque do usuário no botão "Avaliar na App Store / Google Play"
--   (Perfil › Sobre o dosiq e topo da tela "Problema ou sugestão"). Os gatilhos automáticos
--   do slice B leem `store_review_clicked_at IS NULL` para nunca pedir avaliação a quem já
--   foi à loja (spec 047 FM-6).
--
-- ═══════════════════════════════════════════════════════════════════════════════
-- R-270 CHANGE PREFLIGHT — Failure Modes & Degenerate Inputs
-- ─────────────────────────────────────────────────────────────────────────────
-- | Modo                              | Análise / mitigação                                     |
-- |-----------------------------------|---------------------------------------------------------|
-- | linhas existentes                 | Coluna nula sem default ⇒ zero backfill; NULL = "nunca  |
-- |                                   | tocou" é o significado correto para o histórico. PASS   |
-- | linha de user_settings ausente    | Escrita é upsert `onConflict user_id` (repositório) —   |
-- |                                   | cria a linha. Trigger handle_new_user_settings já cria  |
-- |                                   | no cadastro. PASS                                       |
-- | grant da coluna nova              | authenticated tem INSERT/UPDATE/SELECT em NÍVEL DE      |
-- |                                   | TABELA (information_schema.table_privileges, QA         |
-- |                                   | 2026-11-27) ⇒ coluna nova herda. Sem objeto novo no     |
-- |                                   | public ⇒ sem GRANT novo (lint:migration-grants). PASS   |
-- | RLS                               | Políticas existentes de user_settings (user_id =        |
-- |                                   | auth.uid()) cobrem a coluna; teste prova upsert próprio |
-- |                                   | e bloqueio de terceiro. PASS                            |
-- | toque duplo / dois aparelhos      | Último toque vence; o slice B só testa IS NULL ⇒ ordem  |
-- |                                   | irrelevante. PASS                                       |
-- | relógio do cliente                | Valor vem de getServerTimestamp() no cliente; irrelevante|
-- |                                   | para IS NULL (RC3 E7). PASS                             |
-- | rollback                          | DROP COLUMN IF EXISTS (abaixo). PASS                    |
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS store_review_clicked_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.user_settings.store_review_clicked_at IS
  'Spec 047: instante do último toque no botão de avaliar na loja. NULL = nunca tocou. Gatilhos automáticos de avaliação só rodam com NULL.';

-- Verificação pós-aplicação
--   SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='user_settings' AND column_name='store_review_clicked_at';
--   (esperado: timestamp with time zone · YES · NULL)
--   SELECT has_column_privilege('authenticated','public.user_settings','store_review_clicked_at','INSERT'),
--          has_column_privilege('authenticated','public.user_settings','store_review_clicked_at','UPDATE');
--   (esperado: true · true)
--
-- Rollback
--   ALTER TABLE public.user_settings DROP COLUMN IF EXISTS store_review_clicked_at;
