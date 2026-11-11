-- C120: the Open House funnel, step by step, read-only. Run with psql -v since='<UTC timestamp>' (default: the ad LP's
-- switch to /open-house, 2026-11-10 21:10:03 UTC = 3:10 PM CST). Test sign-ups are excluded by address. No writes.
--
-- Steps (people, not events):
--   1 LP visitors          distinct visitor_id with a page view on the ad LP (both hosts)
--   2 Open House sign-ups   open_house_registrations rows (Open House event registration)
--   3 new account           the registration created a new Explorer enrollment (within 2 minutes)
--   4 welcome email sent    communication_logs open_house_welcome, status sent
--   5 email opened/clicked  NOT in our DB: Mandrill only (see mandrillFunnel.js); reported separately
--   6 entered the account   C121: either the Access your account button (the video card opened after sign-up) or a
--                           sign-in link (a sign_in_link_uses row after the welcome email); split out below
--   7 played the video      timeline_card_progress.started_at set on the video card (first watch beat)
--   8 finished the video    completed_at set (75% watched, credit collected)
--   9 took the Quick check  a runtime_assessment_attempts row on the Quick check card
--  10 aced it               a 5/5 attempt
\if :{?since}
\else
  \set since '2026-11-10 21:10:03+00'
\endif
\set video 'b0c844c0-01b0-439e-bc28-6a1b76b09afb'
\set check 'c05b1303-29eb-439c-a2de-e0d6853f6754'

CREATE TEMP TABLE oh AS
SELECT r.id AS reg_id, r.created_at AS reg_at, r.source, r.email_lower, e.id AS enrollment_id, e.enrollment_type,
       (e.created_at BETWEEN r.created_at - interval '2 minutes' AND r.created_at + interval '2 minutes') AS new_account
FROM open_house_registrations r
LEFT JOIN enrollments e ON e.id = r.enrollment_id
WHERE r.created_at >= :'since'
  AND r.email_lower NOT LIKE 'ali+%' AND r.email_lower NOT LIKE '%@colaberry.com'
  AND r.email_lower NOT LIKE '%@colaberry-test.local' AND r.email_lower !~ '^(e2e[-_]|test-fixture-)';

CREATE TEMP TABLE steps AS
SELECT o.*,
  w.sent_at AS email_at,
  (SELECT min(u.used_at) FROM sign_in_link_uses u WHERE u.enrollment_id = o.enrollment_id AND u.used_at >= w.sent_at) AS signin_at,
  -- Opening a card creates its progress row (runtimeService findOrCreate), so a row created after the sign-up means the
  -- person reached the video, by the C121 button or by a link.
  CASE WHEN p.created_at >= o.reg_at THEN p.created_at END AS opened_at,
  p.started_at AS played_at, p.completed_at AS finished_at,
  (p.analytics->'watch'->>'max_position_s')::numeric AS exit_s,
  (SELECT min(a.submitted_at) FROM runtime_assessment_attempts a WHERE a.enrollment_id = o.enrollment_id AND a.card_id = :'check') AS check_at,
  EXISTS (SELECT 1 FROM runtime_assessment_attempts a WHERE a.enrollment_id = o.enrollment_id AND a.card_id = :'check' AND a.score = 1) AS aced
FROM oh o
LEFT JOIN LATERAL (
  -- The welcome sent BY THIS sign-up (it is sent inside the sign-up request), never an older one to the same account.
  SELECT min(c.created_at) AS sent_at FROM communication_logs c
  WHERE c.status = 'sent' AND c.metadata->>'event' = 'open_house_welcome' AND c.metadata->>'enrollment_id' = o.enrollment_id::text
    AND c.created_at BETWEEN o.reg_at - interval '5 minutes' AND o.reg_at + interval '30 minutes'
) w ON true
LEFT JOIN timeline_card_progress p ON p.enrollment_id = o.enrollment_id AND p.card_id = :'video';

\echo == window ==
SELECT to_char(:'since'::timestamptz AT TIME ZONE 'America/Chicago', 'MM-DD HH24:MI') AS from_ct,
       to_char(now() AT TIME ZONE 'America/Chicago', 'MM-DD HH24:MI') AS to_ct,
       round(extract(epoch FROM now() - :'since'::timestamptz) / 3600.0, 1) AS hours;

\echo == funnel (people), ad landing page door only ==
CREATE TEMP VIEW lp AS SELECT *, LEAST(signin_at, opened_at) AS entered_at FROM steps WHERE source = 'landing_page';
WITH f AS (
  SELECT 1 AS n, 'LP visitors' AS step, (
    SELECT count(DISTINCT visitor_id) FROM page_events
    WHERE created_at >= :'since' AND event_type = 'pageview' AND page_url ILIKE '%/lp/colaberry-training/ai-learning-platform%') AS people
  UNION ALL SELECT 2, 'Open House sign-ups', count(*) FROM lp
  UNION ALL SELECT 3, 'new account created', count(*) FILTER (WHERE new_account) FROM lp
  UNION ALL SELECT 4, 'welcome email sent', count(*) FILTER (WHERE new_account AND email_at IS NOT NULL) FROM lp
  UNION ALL SELECT 6, 'entered the account', count(*) FILTER (WHERE new_account AND entered_at IS NOT NULL) FROM lp
  UNION ALL SELECT 7, 'played the video', count(*) FILTER (WHERE new_account AND entered_at IS NOT NULL AND played_at IS NOT NULL) FROM lp
  UNION ALL SELECT 8, 'finished the video', count(*) FILTER (WHERE new_account AND entered_at IS NOT NULL AND finished_at IS NOT NULL) FROM lp
  UNION ALL SELECT 9, 'took the Quick check', count(*) FILTER (WHERE new_account AND entered_at IS NOT NULL AND check_at IS NOT NULL) FROM lp
  UNION ALL SELECT 10, 'aced the Quick check (5/5)', count(*) FILTER (WHERE new_account AND entered_at IS NOT NULL AND aced) FROM lp
)
SELECT n, step, people,
       CASE WHEN n = 1 THEN NULL ELSE round(100.0 * people / NULLIF(lag(people) OVER (ORDER BY n), 0), 0) END AS pct_of_prev,
       round(100.0 * people / NULLIF(first_value(people) OVER (ORDER BY n), 0), 1) AS pct_of_visitors,
       round(100.0 * people / NULLIF((SELECT count(*) FROM lp), 0), 0) AS pct_of_signups
FROM f ORDER BY n;

\echo == how new landing-page accounts entered (C121: button vs email link) ==
SELECT count(*) FILTER (WHERE entered_at IS NOT NULL) AS entered,
       count(*) FILTER (WHERE signin_at IS NOT NULL) AS via_email_link,
       count(*) FILTER (WHERE entered_at IS NOT NULL AND signin_at IS NULL) AS via_button_only
FROM lp WHERE new_account;

\echo == sign-ups by door ==
SELECT source, count(*) AS signups, count(*) FILTER (WHERE new_account) AS new_accounts,
       count(*) FILTER (WHERE NOT new_account OR new_account IS NULL) AS existing_account
FROM steps GROUP BY 1 ORDER BY 2 DESC;

\echo == where landing-page sign-ups who played but did not finish left the video (seconds, 10-second bins) ==
SELECT width_bucket(exit_s, 0, 110, 11) * 10 AS up_to_s, count(*) AS learners
FROM lp WHERE played_at IS NOT NULL AND finished_at IS NULL GROUP BY 1 ORDER BY 1;

\echo == timing for landing-page sign-ups (median minutes) ==
SELECT round(extract(epoch FROM percentile_cont(0.5) WITHIN GROUP (ORDER BY entered_at - reg_at)) / 60.0, 1) AS signup_to_enter,
       round(extract(epoch FROM percentile_cont(0.5) WITHIN GROUP (ORDER BY played_at - entered_at)) / 60.0, 1) AS enter_to_play
FROM lp;

-- Recipients for mandrillFunnel.js (step 5): one address per line, written to the server file the caller names.
\if :{?recipients_out}
  -- (communication_logs.provider_message_id is the SMTP Message-ID header, not Mandrill's _id, so it cannot be looked up.)
  \pset tuples_only on
  \pset format unaligned
  \o :recipients_out
  SELECT email_lower FROM lp WHERE new_account AND email_at IS NOT NULL;
  \o
  \pset tuples_only off
  \pset format aligned
\endif
