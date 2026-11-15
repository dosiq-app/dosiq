-- Spec 119 (fatia A) — catálogo CMED no banco como DERIVADO só do servidor (ADR-123 · CON-045).
--
-- public.cmed_class_keys(token → class_codes[], catalog_version)
--   Espelho derivado do cmedIndex.json publicado (INV-4): palavra normalizada das chaves de produto
--   e de substância → códigos de classe distintos. Gerado por `buildClassTokenMap` (core) no
--   `npm run cmed:publish`; nunca editado à mão. Sem dado de usuário (FR-003).
-- public.cmed_match_key(text) / cmed_match_tokens(text) — espelho de matchKey/matchTokens do core
--   (paridade por casos-ouro: packages/core/src/services/cmed/__tests__/nameMatch.golden.json).
--   Sem `unaccent`: normalize(NFD) nativo + remoção de U+0300–U+036F = normalizeText (C-A3).
-- public.cmed_class_codes(name, ingredient) — camadas exact → approx (Levenshtein, C-A4).
-- public.admin_load_cmed_class_keys(rows, version, expected) — troca atômica (PO-119-2): roda numa
--   transação só (chamada RPC); qualquer RAISE desfaz o DELETE e o catálogo anterior fica inteiro.
--
-- 🔴 Tabela nasce FECHADA (ADR-119, PO-SEC-119-2): RLS sem policy, nenhum grant a anon/authenticated.
-- 🔴 Funções: search_path vazio, chamadas qualificadas, sem SQL dinâmico (PO-SEC-119-3); EXECUTE só
--    service_role. A RPC do painel (DEFINER) é quem chama cmed_class_codes.
-- Extensão fuzzystrmatch em `extensions` (nunca em public).
--
-- Prova: 20261115_119_cmed_class_keys.test.sql (QA primeiro, CON-044).

BEGIN;

CREATE EXTENSION IF NOT EXISTS fuzzystrmatch WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.cmed_class_keys (
  token text PRIMARY KEY CHECK (token ~ '^[a-z]{4,120}$'),
  class_codes text[] NOT NULL CHECK (cardinality(class_codes) > 0),
  catalog_version text NOT NULL CHECK (length(btrim(catalog_version)) > 0),
  loaded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cmed_class_keys ENABLE ROW LEVEL SECURITY;
-- grants: nenhum a anon/authenticated (só service_role — o app usa o JSON baixado)
REVOKE ALL ON TABLE public.cmed_class_keys FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.cmed_class_keys TO service_role;

-- matchKey (core): minúsculas + NFD sem diacríticos; não [a-z0-9] → espaço; trim; 120 caracteres.
CREATE OR REPLACE FUNCTION public.cmed_match_key(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO ''
AS $$
  SELECT btrim(left(
    btrim(regexp_replace(
      regexp_replace(normalize(lower(coalesce(p_text, '')), NFD), '[\u0300-\u036f]', '', 'g'),
      '[^a-z0-9]+', ' ', 'g')),
    120))
$$;

-- matchTokens (core): palavras com ≥ 4 caracteres e sem dígito, distintas.
CREATE OR REPLACE FUNCTION public.cmed_match_tokens(p_text text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO ''
AS $$
  SELECT coalesce(array_agg(DISTINCT t), '{}'::text[])
  FROM unnest(string_to_array(public.cmed_match_key(p_text), ' ')) AS t
  WHERE length(t) >= 4 AND t !~ '[0-9]'
$$;

-- matchClassCodes (core): (1) palavra igual a um token do catálogo ⇒ união das classes;
-- (2) só se nada bateu exato: palavras ≥ 5 a distância Levenshtein ≤ 1 (≤ 2 a partir de 9).
CREATE OR REPLACE FUNCTION public.cmed_class_codes(p_name text, p_ingredient text)
RETURNS text[]
LANGUAGE sql
STABLE
SET search_path TO ''
AS $$
  WITH tk AS (
    SELECT DISTINCT t
    FROM unnest(public.cmed_match_tokens(p_name) || public.cmed_match_tokens(p_ingredient)) AS t
  ),
  ex AS (
    SELECT DISTINCT c
    FROM tk JOIN public.cmed_class_keys k ON k.token = tk.t
    CROSS JOIN LATERAL unnest(k.class_codes) AS c
  ),
  fz AS (
    SELECT DISTINCT c
    FROM tk
    JOIN public.cmed_class_keys k
      ON length(tk.t) >= 5
     AND abs(length(k.token) - length(tk.t)) <= CASE WHEN length(tk.t) >= 9 THEN 2 ELSE 1 END
     AND extensions.levenshtein(tk.t, k.token) <= CASE WHEN length(tk.t) >= 9 THEN 2 ELSE 1 END
    CROSS JOIN LATERAL unnest(k.class_codes) AS c
    WHERE NOT EXISTS (SELECT 1 FROM ex)
  )
  SELECT coalesce(array_agg(c ORDER BY c), '{}'::text[])
  FROM (SELECT c FROM ex UNION SELECT c FROM fz) u
$$;

-- Carga atômica (PO-119-2): valida tudo antes de trocar; RAISE ⇒ rollback da chamada inteira.
CREATE OR REPLACE FUNCTION public.admin_load_cmed_class_keys(
  p_rows jsonb,
  p_version text,
  p_expected_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_count integer;
  v_inserted integer;
BEGIN
  IF p_version IS NULL OR length(btrim(p_version)) = 0 THEN
    RAISE EXCEPTION 'cmed_load: versão ausente' USING ERRCODE = '22023';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'cmed_load: payload não é array' USING ERRCODE = '22023';
  END IF;
  v_count := jsonb_array_length(p_rows);
  IF p_expected_count IS NULL OR p_expected_count <= 0 OR v_count <> p_expected_count THEN
    RAISE EXCEPTION 'cmed_load: % linhas, esperado %', v_count, p_expected_count USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_rows) AS x(token text, class_codes text[])
    CROSS JOIN LATERAL unnest(coalesce(x.class_codes, '{}'::text[])) AS c
    WHERE c IS NULL OR c !~ '^[A-Z][0-9A-Z]{1,5}$'
  ) THEN
    RAISE EXCEPTION 'cmed_load: código de classe fora do formato' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.cmed_class_keys WHERE true;

  INSERT INTO public.cmed_class_keys (token, class_codes, catalog_version)
  SELECT x.token, x.class_codes, btrim(p_version)
  FROM jsonb_to_recordset(p_rows) AS x(token text, class_codes text[]);
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted <> p_expected_count THEN
    RAISE EXCEPTION 'cmed_load: inseridas %, esperado %', v_inserted, p_expected_count USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object('catalog_version', btrim(p_version), 'rows', v_inserted);
END;
$$;

REVOKE ALL ON FUNCTION public.cmed_match_key(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cmed_match_tokens(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cmed_class_codes(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_load_cmed_class_keys(jsonb, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cmed_match_key(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cmed_match_tokens(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cmed_class_codes(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_load_cmed_class_keys(jsonb, text, integer) TO service_role;

COMMIT;
