-- Spec 118 — Crescimento & Wedge: recorte pós-v0.34 (FR-001..003).
--
-- public.get_admin_growth_analytics(p_limit, p_offset, p_excluded_user_ids, p_since) → jsonb
--   Mesma função da spec 115 (20261103_admin_growth_analytics.sql), com duas mudanças:
--   · p_since timestamptz DEFAULT NULL — recorta base_users por auth.users.created_at >= p_since.
--     Toda CTE deriva de base_users, então o recorte vale para todos os blocos (INV-1). NULL = base
--     total, idêntica à 115 (INV-2). `excluded` continua global (conta de exclusão não é recorte).
--   · Coorte 30d removida (is_cohort30, *_c30, feature_rates[].cohort30) — substituída pelo recorte
--     fixo. `totals.new_30d` segue, agora com a expressão inline.
--   O handler resolve p_since a partir de GROWTH_COHORTS (core); data livre do cliente não chega aqui.
--
-- 🔴 Assinatura nova ⇒ DROP da antiga no mesmo bloco (INV-4: uma só assinatura; sem overload que o
--    PostgREST resolveria por nome de parâmetro). Ordem de deploy: Vercel primeiro, migração logo
--    depois — o handler novo omite p_since no modo total, então funciona contra as duas assinaturas.
-- 🔴 Privacidade, SECURITY DEFINER, search_path vazio e grants: idênticos à 115 (ver lá). EXECUTE só
--    service_role (ADR-119).
-- Wedge: a lista abaixo espelha WEDGE_CLASS_PREFIXES — wedgeParity.test.ts lê ESTE arquivo.
--
-- Prova: 20261110_admin_growth_cohort.test.sql (QA primeiro).

BEGIN;

DROP FUNCTION IF EXISTS public.get_admin_growth_analytics(integer, integer, uuid[]);

CREATE FUNCTION public.get_admin_growth_analytics(
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0,
  p_excluded_user_ids uuid[] DEFAULT '{}',
  p_since timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
WITH params AS (
  SELECT
    least(greatest(coalesce(p_limit, 100), 1), 500) AS lim,
    greatest(coalesce(p_offset, 0), 0) AS offs,
    coalesce(p_excluded_user_ids, '{}'::uuid[]) AS excl,
    p_since AS since,
    -- WEDGE_CLASS_PREFIXES (espelho de packages/core/src/services/trackedMeasure.ts)
    ARRAY['A10S', 'A10X9', 'A8A']::text[] AS wedge
),
base_users AS (
  SELECT u.id AS user_id, u.created_at, u.last_sign_in_at
  FROM auth.users u CROSS JOIN params p
  WHERE NOT (u.id = ANY (p.excl))
    -- Recorte (spec 118 · INV-1): predicado único; toda CTE abaixo deriva de base_users.
    AND (p.since IS NULL OR u.created_at >= p.since)
),
excluded AS (
  SELECT count(*)::int AS n FROM auth.users u CROSS JOIN params p WHERE u.id = ANY (p.excl)
),
live_protocols AS (
  SELECT
    pr.id AS protocol_id,
    pr.user_id,
    pr.name AS protocol_name,
    pr.frequency,
    nullif(upper(trim(m.therapeutic_class_code)), '') AS class_code,
    m.therapeutic_class AS class_label,
    EXISTS (SELECT 1 FROM public.titration_steps ts WHERE ts.protocol_id = pr.id) AS has_titration,
    nullif(coalesce(pr.tracked_measure, 'nenhum'), 'nenhum') AS tracked_measure,
    coalesce(pr.critical_alarm, false) AS has_critical_alarm,
    (pr.medicine_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.stock s WHERE s.medicine_id = pr.medicine_id)) AS has_stock,
    (pr.end_date IS NOT NULL) AS has_end_date
  FROM public.protocols pr
  JOIN base_users bu ON bu.user_id = pr.user_id
  LEFT JOIN public.medicines m ON m.id = pr.medicine_id
  WHERE pr.archived_at IS NULL
),
classified AS (
  SELECT lp.*,
    CASE
      WHEN lp.class_code IS NULL THEN 'sem_codigo'
      WHEN EXISTS (SELECT 1 FROM params p, unnest(p.wedge) w WHERE lp.class_code LIKE w || '%') THEN 'glp1_antiobesidade'
      WHEN lp.class_code LIKE 'A10%' THEN 'antidiabeticos_outros'
      ELSE 'outras'
    END AS wedge_bucket
  FROM live_protocols lp
),
denoms AS (
  SELECT
    count(DISTINCT user_id)::int AS users_all,
    count(*)::int AS protocols_all
  FROM classified
),
push_users AS (
  SELECT DISTINCT nd.user_id
  FROM public.notification_devices nd
  JOIN base_users bu ON bu.user_id = nd.user_id
  WHERE nd.is_active AND nd.provider IN ('expo', 'webpush')
),
feature_rows AS (
  SELECT c.user_id, f.feature, f.enabled
  FROM classified c
  CROSS JOIN LATERAL (VALUES
    ('titration', c.has_titration),
    ('biomarker', c.tracked_measure IS NOT NULL),
    ('critical_alarm', c.has_critical_alarm),
    ('stock', c.has_stock),
    ('end_date', c.has_end_date)
  ) AS f(feature, enabled)
),
feature_rates AS (
  SELECT fr.feature,
    count(DISTINCT fr.user_id) FILTER (WHERE fr.enabled)::int AS users,
    count(*) FILTER (WHERE fr.enabled)::int AS protocols
  FROM feature_rows fr
  GROUP BY fr.feature
),
platform_events AS (
  SELECT da.user_id, da.platform, da.last_seen_at AS seen_at
  FROM public.device_activity da JOIN base_users bu ON bu.user_id = da.user_id
  UNION ALL
  SELECT nd.user_id, nd.platform, nd.last_seen_at
  FROM public.notification_devices nd JOIN base_users bu ON bu.user_id = nd.user_id
  UNION ALL
  SELECT ses.user_id,
    CASE
      WHEN ses.user_agent LIKE 'Dosiq/%CFNetwork%' THEN 'ios'
      WHEN ses.user_agent LIKE 'okhttp/%' THEN 'android'
      WHEN ses.user_agent LIKE 'Mozilla/%' THEN 'web'
    END,
    ses.updated_at
  FROM auth.sessions ses JOIN base_users bu ON bu.user_id = ses.user_id
),
users_page AS (
  SELECT bu.* FROM base_users bu
  ORDER BY bu.created_at DESC, bu.user_id
  LIMIT (SELECT lim FROM params) OFFSET (SELECT offs FROM params)
)
SELECT jsonb_build_object(
  'generated_at', now(),
  'excluded_count', (SELECT n FROM excluded),
  'total_users', (SELECT count(*)::int FROM base_users),
  'totals', (
    SELECT jsonb_build_object(
      'users', (SELECT count(*)::int FROM base_users),
      'new_7d', (SELECT count(*)::int FROM base_users WHERE created_at >= now() - interval '7 days'),
      'new_30d', (SELECT count(*)::int FROM base_users WHERE created_at >= now() - interval '30 days'),
      'users_with_protocols', d.users_all,
      'protocols', d.protocols_all,
      'push_active_users', (SELECT count(*)::int FROM push_users),
      'push_active_pct', coalesce(round(100.0 * (SELECT count(*) FROM push_users) / nullif((SELECT count(*) FROM base_users), 0), 1), 0),
      'stock_users_pct', coalesce(round(100.0 * (SELECT users FROM feature_rates WHERE feature = 'stock') / nullif(d.users_all, 0), 1), 0),
      'critical_alarm_users_pct', coalesce(round(100.0 * (SELECT users FROM feature_rates WHERE feature = 'critical_alarm') / nullif(d.users_all, 0), 1), 0)
    ) FROM denoms d
  ),
  'class_distribution', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'class_code', g.code, 'label', g.label, 'wedge', g.bucket,
      'users', g.users, 'protocols', g.protocols,
      'users_pct', coalesce(round(100.0 * g.users / nullif(d.users_all, 0), 1), 0)
    ) ORDER BY g.users DESC, g.protocols DESC, g.code)
    FROM (
      SELECT coalesce(class_code, 'sem_codigo') AS code,
             -- sem_codigo junta classes distintas: rótulo nulo, nunca o texto de uma delas (fix pós-#931)
             mode() WITHIN GROUP (ORDER BY class_label) FILTER (WHERE class_code IS NOT NULL) AS label,
             min(wedge_bucket) AS bucket,
             count(DISTINCT user_id)::int AS users, count(*)::int AS protocols
      FROM classified GROUP BY coalesce(class_code, 'sem_codigo')
    ) g CROSS JOIN denoms d
  ), '[]'::jsonb),
  'wedge', (
    SELECT jsonb_object_agg(b.bucket, jsonb_build_object(
      'users', coalesce(w.users, 0), 'protocols', coalesce(w.protocols, 0),
      'users_pct', coalesce(round(100.0 * w.users / nullif(d.users_all, 0), 1), 0)
    ))
    FROM (VALUES ('glp1_antiobesidade'), ('antidiabeticos_outros'), ('outras'), ('sem_codigo')) AS b(bucket)
    CROSS JOIN denoms d
    LEFT JOIN (
      SELECT wedge_bucket, count(DISTINCT user_id)::int AS users, count(*)::int AS protocols
      FROM classified GROUP BY wedge_bucket
    ) w ON w.wedge_bucket = b.bucket
  ),
  'frequency_distribution', coalesce((
    SELECT jsonb_agg(jsonb_build_object('frequency', f.frequency, 'users', f.users, 'protocols', f.protocols)
      ORDER BY f.protocols DESC, f.frequency)
    FROM (
      SELECT frequency, count(DISTINCT user_id)::int AS users, count(*)::int AS protocols
      FROM classified GROUP BY frequency
    ) f
  ), '[]'::jsonb),
  'feature_rates', (
    SELECT jsonb_agg(jsonb_build_object(
      'feature', k.feature,
      'users', coalesce(r.users, 0), 'protocols', coalesce(r.protocols, 0),
      'users_pct', coalesce(round(100.0 * r.users / nullif(d.users_all, 0), 1), 0),
      'protocols_pct', coalesce(round(100.0 * r.protocols / nullif(d.protocols_all, 0), 1), 0)
    ) ORDER BY k.ord)
    FROM (VALUES (1, 'titration'), (2, 'biomarker'), (3, 'critical_alarm'), (4, 'stock'), (5, 'end_date')) AS k(ord, feature)
    CROSS JOIN denoms d
    LEFT JOIN feature_rates r ON r.feature = k.feature
  ),
  'denominators', (SELECT to_jsonb(d) FROM denoms d),
  'users', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'user_id', up.user_id,
      'email', (SELECT ue.email FROM public.user_emails ue WHERE ue.id = up.user_id),
      'created_at', up.created_at,
      'last_activity_at', greatest(up.last_sign_in_at,
        (SELECT max(da.last_seen_at) FROM public.device_activity da WHERE da.user_id = up.user_id)),
      'platforms', coalesce((
        SELECT jsonb_agg(DISTINCT pe.platform ORDER BY pe.platform)
        FROM platform_events pe WHERE pe.user_id = up.user_id AND pe.platform IS NOT NULL
      ), '[]'::jsonb),
      'platform', (
        SELECT pe.platform FROM platform_events pe
        WHERE pe.user_id = up.user_id AND pe.platform IS NOT NULL
        ORDER BY pe.seen_at DESC NULLS LAST LIMIT 1
      ),
      'app_version', coalesce(dev.app_version, nd.app_version),
      'push_active', EXISTS (SELECT 1 FROM push_users pu WHERE pu.user_id = up.user_id),
      'onboarding_completed', coalesce((SELECT bool_or(us.onboarding_completed) FROM public.user_settings us WHERE us.user_id = up.user_id), false),
      'protocols_count', (SELECT count(*)::int FROM classified c WHERE c.user_id = up.user_id),
      'treatments', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'protocol_id', c.protocol_id,
          'protocol_name', c.protocol_name,
          'therapeutic_class', c.class_label,
          'therapeutic_class_code', c.class_code,
          'wedge', c.wedge_bucket,
          'frequency', c.frequency,
          'features', jsonb_build_object(
            'titration', c.has_titration,
            'tracked_measure', c.tracked_measure,
            'critical_alarm', c.has_critical_alarm,
            'stock', c.has_stock,
            'end_date', c.has_end_date
          )
        ) ORDER BY c.protocol_name)
        FROM classified c WHERE c.user_id = up.user_id
      ), '[]'::jsonb)
    ) ORDER BY up.created_at DESC, up.user_id)
    FROM users_page up
    LEFT JOIN LATERAL (
      SELECT da.app_version FROM public.device_activity da
      WHERE da.user_id = up.user_id ORDER BY da.last_seen_at DESC NULLS LAST LIMIT 1
    ) dev ON true
    LEFT JOIN LATERAL (
      SELECT x.app_version FROM public.notification_devices x
      WHERE x.user_id = up.user_id ORDER BY x.last_seen_at DESC NULLS LAST LIMIT 1
    ) nd ON true
  ), '[]'::jsonb)
);
$$;

REVOKE ALL ON FUNCTION public.get_admin_growth_analytics(integer, integer, uuid[], timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_growth_analytics(integer, integer, uuid[], timestamptz) TO service_role;

COMMIT;

