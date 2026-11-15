-- Spec 119 (fatia A) — prova de 20261115_119_cmed_class_keys.sql
--   PO-119-10 (paridade core × SQL por casos-ouro) · PO-119-2 (carga atômica) · PO-119-3 /
--   PO-SEC-119-2 (tabela fechada) · PO-SEC-119-3 (sem SQL dinâmico, extensão em extensions, 10 mil
--   caracteres). Execução: MCP execute_sql no QA `ikcvwxyohmntncanclze` DEPOIS da migração;
--   termina em RAISE EXCEPTION 'RESULT …' ⇒ tudo desfeito (inclusive a carga do catálogo de teste).
--
-- 🔴 O literal entre os marcadores GOLDEN é cópia de
--   packages/core/src/services/cmed/__tests__/nameMatch.golden.json (sem _comment).
--   nameMatchParity.test.ts falha se divergir (CON-045: mudar a regra = goldens + core + SQL).

DO $$
DECLARE
  -- GOLDEN:BEGIN
  g jsonb := '{"keys":[{"in":"Ácido Acetilsalicílico","key":"acido acetilsalicilico","tokens":["acido","acetilsalicilico"]},{"in":"CAÇÃO ñ ü Ô","key":"cacao n u o","tokens":["cacao"]},{"in":"tg ( tirzepatida genérico 15mg )","key":"tg tirzepatida generico 15mg","tokens":["tirzepatida","generico"]},{"in":"  MOUNJARO®  5mg/0,5mL ","key":"mounjaro 5mg 0 5ml","tokens":["mounjaro"]},{"in":"Semaglutida-Ozempic/Wegovy","key":"semaglutida ozempic wegovy","tokens":["semaglutida","ozempic","wegovy"]},{"in":"İstanbul ﬁ Ǆ","key":"istanbul","tokens":["istanbul"]},{"in":"Ação; DROP TABLE x; --''\"","key":"acao drop table x","tokens":["acao","drop","table"]},{"in":"tv","key":"tv","tokens":[]},{"in":"vitamina vitamina D3","key":"vitamina vitamina d3","tokens":["vitamina"]},{"in":"","key":"","tokens":[]},{"in":null,"key":"","tokens":[]}],"catalog":{"tirzepatida":["A10S"],"mounjaro":["A10S"],"ozivy":["A10S"],"semaglutida":["A10S","A8A"],"ozempic":["A10S"],"escitalopram":["N6A4"],"canabidiol":["N7A"],"vitamina":["A11B4","A11C2"],"metformina":["A10J1"],"liraglutida":["A10S"],"cloridrato":["A10J1","N6A4"]},"matches":[{"texts":["tizerpatida",null],"layer":"approx","codes":["A10S"],"probable":true},{"texts":["ozivy",null],"layer":"exact","codes":["A10S"],"probable":true},{"texts":["tg ( tirzepatida genérico 15mg )",null],"layer":"exact","codes":["A10S"],"probable":true},{"texts":["Mounjaro","tirzepatida"],"layer":"exact","codes":["A10S"],"probable":true},{"texts":["semaglutida",null],"layer":"exact","codes":["A10S","A8A"],"probable":true},{"texts":["ozempik",null],"layer":"approx","codes":["A10S"],"probable":true},{"texts":["creatina",null],"layer":"none","codes":[],"probable":false},{"texts":["tv","C"],"layer":"none","codes":[],"probable":false},{"texts":["Emagrecimento","Emagrecimento"],"layer":"none","codes":[],"probable":false},{"texts":["escitalopram",null],"layer":"exact","codes":["N6A4"],"probable":false},{"texts":["vitamina D",null],"layer":"exact","codes":["A11B4","A11C2"],"probable":false},{"texts":["Glifage","cloridrato de metformina"],"layer":"exact","codes":["A10J1","N6A4"],"probable":false},{"texts":["liraglutida","metformina"],"layer":"exact","codes":["A10J1","A10S"],"probable":false},{"texts":["ozem",null],"layer":"none","codes":[],"probable":false},{"texts":["mounjara","ozivy"],"layer":"exact","codes":["A10S"],"probable":true},{"texts":[null,null],"layer":"none","codes":[],"probable":false}]}'::jsonb;
  -- GOLDEN:END
  k jsonb; m jsonb; rows jsonb; n int; got text[]; want text[]; res jsonb; probable boolean;
  v_before text; c_before int; t0 timestamptz; big text;
BEGIN
  -- ===== PO-119-10: normalização e tokens =====
  FOR k IN SELECT * FROM jsonb_array_elements(g->'keys') LOOP
    IF public.cmed_match_key(k->>'in') IS DISTINCT FROM (k->>'key') THEN
      RAISE EXCEPTION 'PO-119-10 key: in=% got=% want=%', k->'in', public.cmed_match_key(k->>'in'), k->>'key';
    END IF;
    got := ARRAY(SELECT unnest(public.cmed_match_tokens(k->>'in')) ORDER BY 1);
    want := ARRAY(SELECT jsonb_array_elements_text(k->'tokens') ORDER BY 1);
    IF got IS DISTINCT FROM want THEN
      RAISE EXCEPTION 'PO-119-10 tokens: in=% got=% want=%', k->'in', got, want;
    END IF;
  END LOOP;

  -- catálogo dos goldens (substitui o real só dentro desta transação)
  SELECT jsonb_agg(jsonb_build_object('token', e.key, 'class_codes', e.value)), count(*)
    INTO rows, n FROM jsonb_each(g->'catalog') e;
  res := public.admin_load_cmed_class_keys(rows, 'golden-1', n);
  IF (res->>'rows')::int <> n OR (SELECT count(*) FROM public.cmed_class_keys) <> n
     OR (SELECT max(catalog_version) FROM public.cmed_class_keys) <> 'golden-1' THEN
    RAISE EXCEPTION 'PO-119-1: carga=%', res;
  END IF;

  -- ===== PO-119-10 / PO-119-4: camadas exact → approx e regra de provável =====
  FOR m IN SELECT * FROM jsonb_array_elements(g->'matches') LOOP
    got := public.cmed_class_codes(m->'texts'->>0, m->'texts'->>1);
    want := ARRAY(SELECT jsonb_array_elements_text(m->'codes') ORDER BY 1);
    IF got IS DISTINCT FROM want THEN
      RAISE EXCEPTION 'PO-119-10 match: texts=% got=% want=%', m->'texts', got, want;
    END IF;
    probable := cardinality(got) > 0 AND NOT EXISTS (
      SELECT 1 FROM unnest(got) c
      WHERE NOT EXISTS (SELECT 1 FROM unnest(ARRAY['A10S', 'A10X9', 'A8A']) w WHERE c LIKE w || '%'));
    IF probable IS DISTINCT FROM (m->>'probable')::boolean THEN
      RAISE EXCEPTION 'PO-119-4 provável: texts=% got=%', m->'texts', probable;
    END IF;
  END LOOP;

  -- ===== PO-119-2: falha no meio não deixa catálogo parcial nem vazio =====
  SELECT max(catalog_version), count(*) INTO v_before, c_before FROM public.cmed_class_keys;
  -- (a) count divergente (validação antes da troca)
  BEGIN
    PERFORM public.admin_load_cmed_class_keys(rows, 'golden-2', n + 1);
    RAISE EXCEPTION 'PO-119-2: count divergente aceito';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  -- (b) falha injetada DEPOIS do DELETE: token inválido viola o CHECK no INSERT
  BEGIN
    PERFORM public.admin_load_cmed_class_keys(
      rows || jsonb_build_array(jsonb_build_object('token', 'X1', 'class_codes', ARRAY['A10S'])), 'golden-2', n + 1);
    RAISE EXCEPTION 'PO-119-2: token inválido aceito';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  -- (c) código fora do formato, versão vazia, payload não-array
  BEGIN
    PERFORM public.admin_load_cmed_class_keys(jsonb_build_array(jsonb_build_object('token', 'abcd', 'class_codes', ARRAY['a10s'])), 'golden-2', 1);
    RAISE EXCEPTION 'PO-119-2: código inválido aceito';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.admin_load_cmed_class_keys(rows, '  ', n);
    RAISE EXCEPTION 'PO-119-2: versão vazia aceita';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.admin_load_cmed_class_keys('{}'::jsonb, 'golden-2', 1);
    RAISE EXCEPTION 'PO-119-2: payload objeto aceito';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  IF (SELECT max(catalog_version) FROM public.cmed_class_keys) <> v_before
     OR (SELECT count(*) FROM public.cmed_class_keys) <> c_before THEN
    RAISE EXCEPTION 'PO-119-2: catálogo mudou após falha (%/%)', v_before, c_before;
  END IF;

  -- ===== PO-119-3 / PO-SEC-119-2: tabela só service_role, RLS ligada =====
  IF has_table_privilege('anon', 'public.cmed_class_keys', 'SELECT') OR has_table_privilege('anon', 'public.cmed_class_keys', 'INSERT')
     OR has_table_privilege('anon', 'public.cmed_class_keys', 'UPDATE') OR has_table_privilege('anon', 'public.cmed_class_keys', 'DELETE')
     OR has_table_privilege('authenticated', 'public.cmed_class_keys', 'SELECT') OR has_table_privilege('authenticated', 'public.cmed_class_keys', 'INSERT')
     OR has_table_privilege('authenticated', 'public.cmed_class_keys', 'UPDATE') OR has_table_privilege('authenticated', 'public.cmed_class_keys', 'DELETE')
     OR NOT has_table_privilege('service_role', 'public.cmed_class_keys', 'INSERT') THEN
    RAISE EXCEPTION 'PO-SEC-119-2: grants da tabela errados';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.cmed_class_keys'::regclass) THEN
    RAISE EXCEPTION 'PO-SEC-119-2: RLS desligada';
  END IF;
  IF has_function_privilege('anon', 'public.admin_load_cmed_class_keys(jsonb, text, integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.admin_load_cmed_class_keys(jsonb, text, integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.cmed_class_codes(text, text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.cmed_match_key(text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.admin_load_cmed_class_keys(jsonb, text, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PO-SEC-119-2: grants das funções errados';
  END IF;

  -- ===== PO-SEC-119-3: sem SQL dinâmico, search_path vazio, extensão fora de public =====
  IF EXISTS (SELECT 1 FROM pg_proc
             WHERE proname IN ('cmed_match_key', 'cmed_match_tokens', 'cmed_class_codes', 'admin_load_cmed_class_keys')
               AND (prosrc ~* '\mexecute\M|\mformat\s*\(' OR proconfig IS DISTINCT FROM ARRAY['search_path=""'])) THEN
    RAISE EXCEPTION 'PO-SEC-119-3: SQL dinâmico ou search_path';
  END IF;
  IF (SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'fuzzystrmatch') IS DISTINCT FROM 'extensions' THEN
    RAISE EXCEPTION 'PO-SEC-119-3: fuzzystrmatch fora de extensions';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname IN ('pg_trgm', 'unaccent') AND extnamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'PO-SEC-119-3: extensão em public';
  END IF;
  big := repeat('tizerpatida ', 900) || ''';DROP TABLE public.cmed_class_keys;--';
  t0 := clock_timestamp();
  got := public.cmed_class_codes(big, big);
  IF length(public.cmed_match_key(big)) > 120 OR got IS DISTINCT FROM ARRAY['A10S']
     OR clock_timestamp() - t0 > interval '500 ms' THEN
    RAISE EXCEPTION 'PO-SEC-119-3: entrada longa got=% t=%', got, clock_timestamp() - t0;
  END IF;

  RAISE EXCEPTION 'RESULT OK — PO-119-10 (% keys, % matches) + PO-119-1/2/3 + PO-SEC-119-2/3 (desfeito)',
    jsonb_array_length(g->'keys'), jsonb_array_length(g->'matches');
END $$;
