-- Spec 119 (fatia A) — prova de 20261115_119_growth_probable_wedge.sql
--   PO-119-4 (provável pelo nome, confirmado intocado) · PO-SEC-119-1 (nenhum texto no payload) ·
--   PO-SEC-119-3 (nome de 10 mil caracteres com aspas) · PO-119-5 (tempo).
-- Execução: MCP execute_sql no QA `ikcvwxyohmntncanclze` DEPOIS das duas migrações da 119; termina em
--   RAISE EXCEPTION 'RESULT …' ⇒ tudo desfeito (fixture e catálogo de teste).
-- Guard (regressão integral): rodar TAMBÉM 20261114_admin_growth_confirmed.test.sql sem edição — o
--   corpo novo é aditivo, nenhuma expectativa antiga muda.
--
-- Fixture (só ela conta: todo usuário pré-existente vai em p_excluded_user_ids). Catálogo = mini
--   catálogo dos casos-ouro (nameMatch.golden.json), carregado nesta transação.
--   P — 'SECRET_MED_NAME_P1 tizerpatida' sem código (provável, erro de digitação)
--       + 'SECRET_MED_NAME_P2' com código A10S (confirmado)
--   Q — 'SECRET_MED_NAME_Q1 creatina' sem código (outros) · 'tv' sem código (outros)
--       · 'SECRET_MED_NAME_Q2' + princípio 'tg ( tirzepatida genérico 15mg )' (provável, por princípio)
--       · 'SECRET_MED_NAME_Q3 liraglutida metformina' (classes mistas ⇒ outros)
--       · nome de 10 mil caracteres com aspas e ponto-e-vírgula (outros, sem erro)

DO $$
DECLARE
  p uuid := gen_random_uuid(); q uuid := gen_random_uuid();
  m uuid; others uuid[]; r jsonb; t0 timestamptz; dt interval; secret text;
  cat jsonb := '[{"token":"tirzepatida","class_codes":["A10S"]},{"token":"mounjaro","class_codes":["A10S"]},
                 {"token":"liraglutida","class_codes":["A10S"]},{"token":"metformina","class_codes":["A10J1"]},
                 {"token":"escitalopram","class_codes":["N6A4"]}]';
BEGIN
  SELECT coalesce(array_agg(id), '{}') INTO others FROM auth.users;
  PERFORM public.admin_load_cmed_class_keys(cat, 'golden-119', jsonb_array_length(cat));

  INSERT INTO auth.users (id, email, created_at, last_sign_in_at, email_confirmed_at) VALUES
    (p, 'growth-119-p@fixture.test', now(), now(), now()),
    (q, 'growth-119-q@fixture.test', now(), now(), now());

  INSERT INTO public.medicines (user_id, name) VALUES (p, 'SECRET_MED_NAME_P1 tizerpatida') RETURNING id INTO m;
  INSERT INTO public.protocols (user_id, medicine_id, name, frequency, start_date) VALUES (p, m, 'Trat P1', 'semanal', current_date);
  INSERT INTO public.medicines (user_id, name, therapeutic_class, therapeutic_class_code)
    VALUES (p, 'SECRET_MED_NAME_P2', 'Antidiabeticos', 'A10S') RETURNING id INTO m;
  INSERT INTO public.protocols (user_id, medicine_id, name, frequency, start_date) VALUES (p, m, 'Trat P2', 'semanal', current_date);

  INSERT INTO public.medicines (user_id, name) VALUES (q, 'SECRET_MED_NAME_Q1 creatina') RETURNING id INTO m;
  INSERT INTO public.protocols (user_id, medicine_id, name, frequency, start_date) VALUES (q, m, 'Trat Q1', 'diário', current_date);
  INSERT INTO public.medicines (user_id, name) VALUES (q, 'tv') RETURNING id INTO m;
  INSERT INTO public.protocols (user_id, medicine_id, name, frequency, start_date) VALUES (q, m, 'Trat Q tv', 'semanal', current_date);
  INSERT INTO public.medicines (user_id, name, active_ingredient)
    VALUES (q, 'SECRET_MED_NAME_Q2', 'tg ( tirzepatida genérico 15mg )') RETURNING id INTO m;
  INSERT INTO public.protocols (user_id, medicine_id, name, frequency, start_date) VALUES (q, m, 'Trat Q2', 'semanal', current_date);
  INSERT INTO public.medicines (user_id, name) VALUES (q, 'SECRET_MED_NAME_Q3 liraglutida metformina') RETURNING id INTO m;
  INSERT INTO public.protocols (user_id, medicine_id, name, frequency, start_date) VALUES (q, m, 'Trat Q3', 'diário', current_date);
  INSERT INTO public.medicines (user_id, name) VALUES (q, repeat('SECRET_MED_NAME_LONG '';DROP TABLE x;-- ', 270)) RETURNING id INTO m;
  INSERT INTO public.protocols (user_id, medicine_id, name, frequency, start_date) VALUES (q, m, 'Trat Q longo', 'diário', current_date);

  t0 := clock_timestamp();
  r := public.get_admin_growth_analytics(100, 0, others);
  dt := clock_timestamp() - t0;

  -- ===== PO-119-4: confirmado intocado; provável separado; resto em outros =====
  IF (r#>>'{wedge,glp1_antiobesidade,users}')::int <> 1 OR (r#>>'{wedge,glp1_antiobesidade,protocols}')::int <> 1 THEN
    RAISE EXCEPTION 'PO-119-4/INV-2: confirmado=%', r#>'{wedge,glp1_antiobesidade}';
  END IF;
  IF (r#>>'{wedge,glp1_antiobesidade_probable,users}')::int <> 2 OR (r#>>'{wedge,glp1_antiobesidade_probable,protocols}')::int <> 2
     OR (r#>>'{wedge,glp1_antiobesidade_probable,users_pct}')::numeric <> 100.0 THEN
    RAISE EXCEPTION 'PO-119-4: provável=%', r#>'{wedge,glp1_antiobesidade_probable}';
  END IF;
  IF (r#>>'{wedge,sem_codigo,protocols}')::int <> 6 OR (r#>>'{wedge,sem_codigo_outros,protocols}')::int <> 4
     OR (r#>>'{wedge,sem_codigo_outros,users}')::int <> 1 THEN
    RAISE EXCEPTION 'PO-119-4: sem_codigo=% outros=%', r#>'{wedge,sem_codigo}', r#>'{wedge,sem_codigo_outros}';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(r->'users') u, jsonb_array_elements(u->'treatments') t
      WHERE (t->>'probable_wedge')::boolean) <> 2
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(r->'users') u, jsonb_array_elements(u->'treatments') t
                WHERE t->>'wedge' <> 'sem_codigo' AND (t->>'probable_wedge')::boolean)
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(r->'users') u, jsonb_array_elements(u->'treatments') t
                WHERE NOT (t ? 'probable_wedge')) THEN
    RAISE EXCEPTION 'PO-119-4: probable_wedge por tratamento errado';
  END IF;
  IF r->>'catalog_version' IS DISTINCT FROM 'golden-119' THEN
    RAISE EXCEPTION 'PO-119-1: catalog_version=%', r->'catalog_version';
  END IF;
  -- FR-006: nada gravado em medicines
  IF EXISTS (SELECT 1 FROM public.medicines WHERE user_id IN (p, q) AND therapeutic_class_code IS NOT NULL
             AND name <> 'SECRET_MED_NAME_P2') THEN
    RAISE EXCEPTION 'FR-006: medicines alterado';
  END IF;

  -- ===== PO-SEC-119-1: nenhum texto livre no payload (nome, princípio, token casado) =====
  FOREACH secret IN ARRAY ARRAY['SECRET_MED_NAME', 'tizerpatida', 'tirzepatida', 'creatina', 'liraglutida',
                                'metformina', 'generico', 'genérico', 'DROP TABLE'] LOOP
    IF position(lower(secret) IN lower(r::text)) > 0 THEN
      RAISE EXCEPTION 'PO-SEC-119-1: % no payload', secret;
    END IF;
  END LOOP;

  -- ===== PO-SEC-119-3 / PO-119-5: entrada longa não quebra; tempo dentro do orçamento =====
  IF dt > interval '1500 ms' THEN
    RAISE EXCEPTION 'PO-119-5: RPC levou %', dt;
  END IF;

  -- ===== catálogo vazio (antes da 1ª carga): ninguém é provável, nada quebra =====
  DELETE FROM public.cmed_class_keys WHERE true;
  r := public.get_admin_growth_analytics(100, 0, others);
  IF (r#>>'{wedge,glp1_antiobesidade_probable,users}')::int <> 0 OR (r#>>'{wedge,sem_codigo_outros,protocols}')::int <> 6
     OR r->'catalog_version' <> 'null'::jsonb OR (r#>>'{wedge,glp1_antiobesidade,users}')::int <> 1 THEN
    RAISE EXCEPTION 'R-270: catálogo vazio=%', r->'wedge';
  END IF;

  -- recorte vazio: denominador 0 ⇒ 0, nunca erro
  r := public.get_admin_growth_analytics(100, 0, others, now() + interval '1 second');
  IF (r#>>'{wedge,glp1_antiobesidade_probable,users_pct}')::numeric <> 0 OR (r#>>'{wedge,sem_codigo_outros,users}')::int <> 0 THEN
    RAISE EXCEPTION 'R-270: recorte vazio=%', r->'wedge';
  END IF;

  -- grants e definer (ADR-119)
  IF has_function_privilege('anon', 'public.get_admin_growth_analytics(integer, integer, uuid[], timestamptz)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.get_admin_growth_analytics(integer, integer, uuid[], timestamptz)', 'EXECUTE')
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_admin_growth_analytics' AND prosecdef
                    AND proconfig = ARRAY['search_path=""'] AND prosrc !~* '\mexecute\M|\mformat\s*\(') THEN
    RAISE EXCEPTION 'PO-SEC-119-3: grants/definer/SQL dinâmico';
  END IF;

  RAISE EXCEPTION 'RESULT OK — PO-119-4 + PO-SEC-119-1/3 + PO-119-5 (RPC % ms; % pré-existentes excluídos; desfeito)',
    round(extract(epoch FROM dt) * 1000), coalesce(array_length(others, 1), 0);
END $$;
