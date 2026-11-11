-- C123: weekly Open House funnel + behavior snapshot, read-only. Emits ONE JSON object (psql -At) for the report
-- renderer. Two windows: "cur" = [since, until) and "prev" = the same length immediately before it, clamped to the
-- launch of the Open House landing page (2026-11-10 21:10:03 UTC = 3:10 PM CST), so "prev" is null in launch week.
--
--   psql -At -v since='2026-11-10 21:10:03+00' [-v until='...'] -f collect.sql
--
-- People, not events. Test sign-ups are excluded by address (same rule as scripts/audits/open-house-funnel). Run it
-- inside BEGIN ... ROLLBACK (run.sh does); it creates only TEMP tables.
\if :{?since}
\else
  \set since '2026-11-10 21:10:03+00'
\endif
\if :{?until}
\else
  \set until 'now'
\endif
\set launch '2026-11-10 21:10:03+00'
\set lp '%/lp/colaberry-training/ai-learning-platform%'
\set video 'b0c844c0-01b0-439e-bc28-6a1b76b09afb'
\set check 'c05b1303-29eb-439c-a2de-e0d6853f6754'

-- "cur" never starts before launch: earlier traffic went through a different page and would mix two funnels.
CREATE TEMP TABLE win AS
WITH b AS (SELECT greatest(:'since'::timestamptz, :'launch'::timestamptz) AS s, :'until'::timestamptz AS e)
SELECT 'cur'::text AS name, b.s, b.e FROM b
UNION ALL
SELECT 'prev', greatest(:'launch'::timestamptz, b.s - (b.e - b.s)), b.s FROM b
WHERE b.s > :'launch'::timestamptz;

-- ── 1. Landing page visitors: one row per (window, visitor) ──────────────────────────────────────────────────────
-- One pass over the window's LP events (page_events has no visitor index, so never look it up per visitor).
CREATE TEMP TABLE lpev AS
SELECT w.name, pe.visitor_id, pe.event_type, pe.event_data, pe.created_at
FROM win w JOIN page_events pe ON pe.created_at >= w.s AND pe.created_at < w.e
WHERE pe.page_url ILIKE :'lp' AND pe.visitor_id IS NOT NULL
  AND pe.event_type IN ('pageview', 'scroll', 'cta_click');

CREATE TEMP TABLE vis AS
SELECT name, visitor_id, min(created_at) FILTER (WHERE event_type = 'pageview') AS first_at,
       max(CASE WHEN event_type = 'scroll' THEN (event_data->>'depth')::int END) AS max_scroll,
       coalesce(bool_or(event_type = 'cta_click' AND event_data->>'data_track' ILIKE 'save my seat%'), false) AS cta_seat,
       coalesce(bool_or(event_type = 'cta_click' AND event_data->>'href' ILIKE '%/portal/signup%'), false) AS cta_start
FROM lpev GROUP BY 1, 2 HAVING bool_or(event_type = 'pageview');

CREATE TEMP TABLE visx AS
SELECT v.*, ss.device, ss.bounce, ss.duration_s,
  CASE WHEN lower(ss.utm_source) IN ('fb', 'facebook') THEN 'Facebook'
       WHEN lower(ss.utm_source) IN ('ig', 'instagram') THEN 'Instagram'
       WHEN ss.fbclid THEN 'Facebook'
       WHEN ss.gclid THEN 'Google'
       WHEN ss.referrer_domain IS NOT NULL AND ss.referrer_domain !~ '(colaberry|refactored)' THEN 'Other site'
       ELSE 'Direct / untagged' END AS source
FROM vis v
JOIN win w ON w.name = v.name
LEFT JOIN LATERAL (
  SELECT s.utm_source, coalesce(nullif(s.device_type, ''), 'unknown') AS device, s.is_bounce AS bounce,
         s.duration_seconds AS duration_s, s.fbclid IS NOT NULL AS fbclid, s.gclid IS NOT NULL AS gclid, s.referrer_domain
  FROM visitor_sessions s
  WHERE s.visitor_id = v.visitor_id AND s.entry_page ILIKE :'lp' AND s.started_at >= w.s - interval '1 hour' AND s.started_at < w.e
  ORDER BY s.started_at LIMIT 1
) ss ON true;

-- ── 2. Open House sign-ups: one row per (window, registration), both doors ───────────────────────────────────────
CREATE TEMP TABLE reg AS
SELECT w.name, r.id AS reg_id, r.created_at AS reg_at, r.source AS door, r.email_lower, e.id AS enrollment_id,
       (e.created_at BETWEEN r.created_at - interval '2 minutes' AND r.created_at + interval '2 minutes') AS new_account,
       ld.visitor_id
FROM win w
JOIN open_house_registrations r ON r.created_at >= w.s AND r.created_at < w.e
LEFT JOIN enrollments e ON e.id = r.enrollment_id
LEFT JOIN LATERAL (
  SELECT l.visitor_id FROM leads l
  WHERE lower(l.email) = r.email_lower AND l.created_at BETWEEN r.created_at - interval '10 minutes' AND r.created_at + interval '10 minutes'
  ORDER BY abs(extract(epoch FROM l.created_at - r.created_at)) LIMIT 1
) ld ON true
WHERE r.email_lower NOT LIKE 'ali+%' AND r.email_lower NOT LIKE '%@colaberry.com'
  AND r.email_lower NOT LIKE '%@colaberry-test.local' AND r.email_lower !~ '^(e2e[-_]|test-fixture-)';

CREATE TEMP TABLE regx AS
SELECT g.*, wl.sent_at AS email_at,
  (SELECT min(u.used_at) FROM sign_in_link_uses u WHERE u.enrollment_id = g.enrollment_id AND u.used_at >= wl.sent_at) AS signin_at,
  CASE WHEN p.created_at >= g.reg_at THEN p.created_at END AS opened_at,
  p.started_at AS played_at, p.completed_at AS finished_at,
  (p.analytics->'watch'->>'max_position_s')::numeric AS exit_s,
  (SELECT min(a.submitted_at) FROM runtime_assessment_attempts a WHERE a.enrollment_id = g.enrollment_id AND a.card_id = :'check') AS check_at,
  EXISTS (SELECT 1 FROM runtime_assessment_attempts a WHERE a.enrollment_id = g.enrollment_id AND a.card_id = :'check' AND a.score = 1) AS aced,
  EXISTS (SELECT 1 FROM sign_in_link_uses u WHERE u.enrollment_id = g.enrollment_id
          AND (u.used_at AT TIME ZONE 'America/Chicago')::date > (g.reg_at AT TIME ZONE 'America/Chicago')::date) AS returned_later,
  EXISTS (SELECT 1 FROM timeline_card_progress q WHERE q.enrollment_id = g.enrollment_id
          AND q.card_id NOT IN (:'video', :'check') AND q.created_at >= g.reg_at) AS kept_going
FROM reg g
LEFT JOIN LATERAL (
  SELECT min(c.created_at) AS sent_at FROM communication_logs c
  WHERE c.status = 'sent' AND c.metadata->>'event' = 'open_house_welcome' AND c.metadata->>'enrollment_id' = g.enrollment_id::text
    AND c.created_at BETWEEN g.reg_at - interval '5 minutes' AND g.reg_at + interval '30 minutes'
) wl ON true
LEFT JOIN timeline_card_progress p ON p.enrollment_id = g.enrollment_id AND p.card_id = :'video';

CREATE TEMP VIEW regy AS
SELECT x.*, LEAST(x.signin_at, x.opened_at) AS entered_at,
  CASE WHEN x.opened_at IS NOT NULL AND (x.signin_at IS NULL OR x.opened_at <= x.signin_at) THEN 'button'
       WHEN x.signin_at IS NOT NULL THEN 'link' END AS entered_by
FROM regx x;

-- ── 3. The second LP path: "Start Learning AI for $0" -> /portal/signup (an Explorer account, no Open House) ────
CREATE TEMP TABLE startpath AS
SELECT v.name, count(DISTINCT v.visitor_id) AS accounts
FROM visx v
JOIN leads l ON l.visitor_id = v.visitor_id
JOIN enrollments e ON lower(e.email) = lower(l.email) AND e.created_at >= v.first_at
WHERE v.cta_start AND NOT EXISTS (SELECT 1 FROM reg g WHERE g.name = v.name AND g.email_lower = lower(l.email))
GROUP BY 1;

-- ── 4. One JSON object ──────────────────────────────────────────────────────────────────────────────────────────
SELECT json_build_object(
  'generated_ct', to_char(now() AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD HH24:MI'),
  'launch_ct', to_char(:'launch'::timestamptz AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD HH24:MI'),
  'windows', (SELECT json_object_agg(w.name, json_build_object(
    'from_ct', to_char(w.s AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD HH24:MI'),
    'to_ct', to_char(w.e AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD HH24:MI'),
    'hours', round(extract(epoch FROM w.e - w.s) / 3600.0, 1),
    'visitors', (SELECT count(*) FROM visx v WHERE v.name = w.name),
    'engagement', (SELECT json_build_object(
        'seat', count(*) FILTER (WHERE cta_seat),
        'start', count(*) FILTER (WHERE cta_start AND NOT cta_seat),
        'read', count(*) FILTER (WHERE NOT (cta_seat OR cta_start) AND max_scroll >= 75),
        'skimmed', count(*) FILTER (WHERE NOT (cta_seat OR cta_start) AND max_scroll >= 25 AND max_scroll < 75),
        'bounced', count(*) FILTER (WHERE NOT (cta_seat OR cta_start) AND coalesce(max_scroll, 0) < 25))
      FROM visx v WHERE v.name = w.name),
    'scroll', (SELECT json_build_object('d25', count(*) FILTER (WHERE max_scroll >= 25), 'd50', count(*) FILTER (WHERE max_scroll >= 50),
        'd75', count(*) FILTER (WHERE max_scroll >= 75), 'd90', count(*) FILTER (WHERE max_scroll >= 90),
        'd100', count(*) FILTER (WHERE max_scroll >= 100)) FROM visx v WHERE v.name = w.name),
    'median_visit_s', (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_s))::int FROM visx v WHERE v.name = w.name AND duration_s > 0),
    'by_source', (SELECT coalesce(json_agg(t ORDER BY t.visitors DESC), '[]') FROM (
        SELECT v.source AS label, count(*) AS visitors, count(*) FILTER (WHERE v.cta_seat) AS clicked_seat,
               count(DISTINCT g.reg_id) AS signups
        FROM visx v LEFT JOIN reg g ON g.name = v.name AND g.visitor_id = v.visitor_id
        WHERE v.name = w.name GROUP BY 1) t),
    'by_device', (SELECT coalesce(json_agg(t ORDER BY t.visitors DESC), '[]') FROM (
        SELECT coalesce(v.device, 'unknown') AS label, count(*) AS visitors, count(*) FILTER (WHERE v.cta_seat) AS clicked_seat,
               count(DISTINCT g.reg_id) AS signups
        FROM visx v LEFT JOIN reg g ON g.name = v.name AND g.visitor_id = v.visitor_id
        WHERE v.name = w.name GROUP BY 1) t),
    'start_path', json_build_object(
        'clicks', (SELECT count(*) FROM visx v WHERE v.name = w.name AND v.cta_start),
        'accounts', coalesce((SELECT accounts FROM startpath sp WHERE sp.name = w.name), 0)),
    'signups', (SELECT json_build_object(
        'total', count(*), 'landing_page', count(*) FILTER (WHERE door = 'landing_page'),
        'training_site', count(*) FILTER (WHERE door = 'training_site'),
        'other_door', count(*) FILTER (WHERE door NOT IN ('landing_page', 'training_site') OR door IS NULL),
        'lp_linked_to_visit', count(*) FILTER (WHERE door = 'landing_page' AND visitor_id IN (SELECT visitor_id FROM visx v WHERE v.name = w.name)),
        'lp_from_seat_click', count(*) FILTER (WHERE door = 'landing_page' AND visitor_id IN (SELECT visitor_id FROM visx v WHERE v.name = w.name AND v.cta_seat)))
      FROM reg g WHERE g.name = w.name),
    -- Everything from here follows the landing page door only, the ad funnel.
    'journey', (SELECT json_build_object(
        'signups', count(*),
        'new_account', count(*) FILTER (WHERE new_account),
        'existing_account', count(*) FILTER (WHERE NOT coalesce(new_account, false)),
        'email_sent', count(*) FILTER (WHERE new_account AND email_at IS NOT NULL),
        'entered', count(*) FILTER (WHERE new_account AND entered_at IS NOT NULL),
        'entered_button', count(*) FILTER (WHERE new_account AND entered_by = 'button'),
        'entered_link', count(*) FILTER (WHERE new_account AND entered_by = 'link'),
        'played', count(*) FILTER (WHERE new_account AND entered_at IS NOT NULL AND played_at IS NOT NULL),
        'finished', count(*) FILTER (WHERE new_account AND entered_at IS NOT NULL AND finished_at IS NOT NULL),
        'took_check', count(*) FILTER (WHERE new_account AND entered_at IS NOT NULL AND check_at IS NOT NULL),
        'aced', count(*) FILTER (WHERE new_account AND entered_at IS NOT NULL AND aced),
        'kept_going', count(*) FILTER (WHERE new_account AND entered_at IS NOT NULL AND kept_going),
        'returned_later', count(*) FILTER (WHERE new_account AND returned_later),
        'exits', coalesce(json_agg(round(exit_s)::int ORDER BY exit_s) FILTER (
            WHERE new_account AND played_at IS NOT NULL AND finished_at IS NULL AND exit_s IS NOT NULL), '[]'),
        'median_min_signup_to_enter', round((extract(epoch FROM percentile_cont(0.5) WITHIN GROUP (ORDER BY entered_at - reg_at)) / 60.0)::numeric, 1),
        'median_min_enter_to_finish', round((extract(epoch FROM percentile_cont(0.5) WITHIN GROUP (ORDER BY finished_at - entered_at)) / 60.0)::numeric, 1))
      FROM regy y WHERE y.name = w.name AND y.door = 'landing_page'),
    'daily', (SELECT coalesce(json_agg(d ORDER BY d.day), '[]') FROM (
        SELECT to_char(day, 'YYYY-MM-DD') AS day,
          (SELECT count(*) FROM visx v WHERE v.name = w.name AND (v.first_at AT TIME ZONE 'America/Chicago')::date = day) AS visitors,
          (SELECT count(*) FROM regy y WHERE y.name = w.name AND y.door = 'landing_page' AND (y.reg_at AT TIME ZONE 'America/Chicago')::date = day) AS signups,
          (SELECT count(*) FROM regy y WHERE y.name = w.name AND y.door = 'landing_page' AND y.new_account AND y.entered_at IS NOT NULL AND (y.reg_at AT TIME ZONE 'America/Chicago')::date = day) AS entered,
          (SELECT count(*) FROM regy y WHERE y.name = w.name AND y.door = 'landing_page' AND y.new_account AND y.finished_at IS NOT NULL AND (y.reg_at AT TIME ZONE 'America/Chicago')::date = day) AS finished
        FROM generate_series((w.s AT TIME ZONE 'America/Chicago')::date, (w.e AT TIME ZONE 'America/Chicago')::date, interval '1 day') AS day) d)
  )) FROM win w)
);

-- Recipients for the Mandrill step (welcome emails sent to new landing-page accounts in "cur"), when run.sh asks.
\if :{?recipients_out}
  \o :recipients_out
  SELECT email_lower FROM regy WHERE name = 'cur' AND door = 'landing_page' AND new_account AND email_at IS NOT NULL;
  \o
\endif
