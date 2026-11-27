-- Spec 047 (slice A) — prova de 20261127_047_store_review_clicked_at.sql (PO-1, RC3 E1)
--   Coluna existe com o tipo certo · authenticated tem INSERT/UPDATE na coluna · upsert real como
--   usuário autenticado grava na própria linha (RLS) e não alcança linha de terceiro.
--   Execução: MCP execute_sql no QA `ikcvwxyohmntncanclze` DEPOIS da migração; termina em
--   RAISE EXCEPTION 'RESULT …' ⇒ tudo desfeito.

DO $$
DECLARE
  v_u1 uuid; v_u2 uuid; v_ts timestamptz := '2026-11-27 12:00:00+00'; n int; v_got timestamptz;
BEGIN
  -- 1. Coluna
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='user_settings'
      AND column_name='store_review_clicked_at'
      AND data_type='timestamp with time zone' AND is_nullable='YES' AND column_default IS NULL
  ) THEN RAISE EXCEPTION 'PO-1 coluna ausente ou com tipo/default errado'; END IF;

  -- 2. Privilégio de coluna (RC3 E1)
  IF NOT has_column_privilege('authenticated','public.user_settings','store_review_clicked_at','INSERT')
     OR NOT has_column_privilege('authenticated','public.user_settings','store_review_clicked_at','UPDATE')
     OR NOT has_column_privilege('authenticated','public.user_settings','store_review_clicked_at','SELECT') THEN
    RAISE EXCEPTION 'PO-1 authenticated sem INSERT/UPDATE/SELECT na coluna';
  END IF;

  -- 3. Upsert real como authenticated (RLS)
  SELECT user_id INTO v_u1 FROM public.user_settings ORDER BY created_at LIMIT 1;
  SELECT user_id INTO v_u2 FROM public.user_settings WHERE user_id <> v_u1 ORDER BY created_at LIMIT 1;
  IF v_u1 IS NULL OR v_u2 IS NULL THEN RAISE EXCEPTION 'PO-1 QA precisa de 2 linhas em user_settings'; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_u1, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  INSERT INTO public.user_settings (user_id, store_review_clicked_at, updated_at)
  VALUES (v_u1, v_ts, now())
  ON CONFLICT (user_id) DO UPDATE SET store_review_clicked_at = EXCLUDED.store_review_clicked_at,
                                      updated_at = EXCLUDED.updated_at;

  SELECT store_review_clicked_at INTO v_got FROM public.user_settings WHERE user_id = v_u1;
  IF v_got IS DISTINCT FROM v_ts THEN RAISE EXCEPTION 'PO-1 upsert próprio não gravou: %', v_got; END IF;

  -- terceiro: RLS esconde a linha ⇒ UPDATE afeta 0
  UPDATE public.user_settings SET store_review_clicked_at = v_ts WHERE user_id = v_u2;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'PO-1 RLS deixou gravar linha de terceiro'; END IF;

  RESET ROLE;
  RAISE EXCEPTION 'RESULT ok: coluna, privilégios, upsert próprio e bloqueio de terceiro';
END $$;
