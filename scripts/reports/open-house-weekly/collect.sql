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

-- OH1y: visitor_sessions has no visitor_id index. A per-visitor lookup scanned the whole table once per visitor and
-- passed the 60 s statement timeout on 22 Nov 2026 (144k sessions x ~700 visitors). Read the landing-page sessions for
-- both windows ONCE (the started_at index serves it), then look visitors up in that small set.
CREATE TEMP TABLE lpsess AS
SELECT s.visitor_id, s.started_at, s.utm_source, s.device_type, s.is_bounce, s.duration_seconds, s.fbclid, s.gclid, s.referrer_domain
FROM visitor_sessions s
WHERE s.started_at >= (SELECT min(s) FROM win) - interval '1 hour' AND s.started_at < (SELECT max(e) FROM win)
  AND s.entry_page ILIKE :'lp' AND s.visitor_id IS NOT NULL;
CREATE INDEX ON lpsess (visitor_id, started_at);

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
  FROM lpsess s
  WHERE s.visitor_id = v.visitor_id AND s.started_at >= w.s - interval '1 hour' AND s.started_at < w.e
  ORDER BY s.started_at LIMIT 1
) ss ON true;

-- ── 1b. The heat map's two inputs: what was clicked, and how far the clickers got ────────────────────────────────
--
-- A SEPARATE PASS, NOT AN EXTRA event_type IN `lpev` ABOVE. Adding 'click' to that filter would
-- feed the same rows into `vis`, and `vis` is what every number in this report is counted from.
-- The HAVING clause would most likely absorb it with no visible change, which is exactly the
-- problem: "most likely" is not a property you want on the line that defines "visitor". The
-- README promises this report agrees with the C120 audit to the person, so the clicks are
-- collected beside that table and never through it.
--
-- `click` IS INCLUDED HERE AND NOWHERE ELSE IN THIS FILE. The tracker emits `cta_click` for an
-- element matching a CTA selector and plain `click` for any other link or button
-- (frontend/public/v1/track.js, onClick). The funnel only ever read `cta_click`, so every
-- non-CTA click on the landing page has been recorded and never once looked at.
CREATE TEMP TABLE clk AS
SELECT w.name, pe.visitor_id, pe.event_type, pe.event_data, pe.created_at
FROM win w JOIN page_events pe ON pe.created_at >= w.s AND pe.created_at < w.e
WHERE pe.page_url ILIKE :'lp' AND pe.visitor_id IS NOT NULL
  AND pe.event_type IN ('cta_click', 'click');

-- One row per (window, clicked thing). The label is resolved the way the tracker resolves it, so
-- it can be joined to a measured element position by the same key: `data_track` first (which is
-- `data-track` or `data-track-cta`), then the trimmed element text, and only then a description
-- of an element that offered neither.
CREATE TEMP TABLE clkagg AS
SELECT c.name,
       c.event_type,
       left(nullif(c.event_data->>'data_track', ''), 80) AS data_track,
       left(nullif(c.event_data->>'element_text', ''), 120) AS element_text,
       left(nullif(c.event_data->>'href', ''), 160) AS href,
       nullif(c.event_data->>'element_tag', '') AS element_tag,
       count(*) AS clicks,
       count(DISTINCT c.visitor_id) AS people,
       -- A click from someone with no pageview in this window cannot be placed against this
       -- window's visitor count, so it is counted and flagged rather than silently mixed in.
       count(DISTINCT c.visitor_id) FILTER (WHERE NOT EXISTS (
         SELECT 1 FROM visx v WHERE v.name = c.name AND v.visitor_id = c.visitor_id)) AS people_without_pageview
FROM clk c
GROUP BY 1, 2, 3, 4, 5, 6;

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

-- ── 2a. OH1y: who was in the room at each Open House (the follow-up's rule: checked in, entered, or set a status) ──
CREATE TEMP TABLE oh_here AS
SELECT DISTINCT x.session_id, x.email FROM (
  SELECT sg.session_id, sg.email_lower AS email FROM session_guests sg
    JOIN live_sessions s ON s.id = sg.session_id AND s.open_house_event_id IS NOT NULL
   WHERE NOT sg.awaiting_class AND sg.email_lower IS NOT NULL
  UNION ALL
  SELECT ar.session_id, lower(e.email) FROM attendance_records ar JOIN enrollments e ON e.id = ar.enrollment_id
    JOIN live_sessions s ON s.id = ar.session_id AND s.open_house_event_id IS NOT NULL
   WHERE ar.status::text IN ('present', 'late') AND e.email IS NOT NULL
  UNION ALL
  -- A member who entered the classroom or set their status was there, even when marked absent for skipping check-in.
  SELECT pe.session_id, lower(e.email) FROM session_presence_events pe JOIN enrollments e ON e.id = pe.enrollment_id
    JOIN live_sessions s ON s.id = pe.session_id AND s.open_house_event_id IS NOT NULL
   WHERE pe.event_type = 'classroom_enter' AND e.email IS NOT NULL
  UNION ALL
  SELECT sp.session_id, lower(e.email) FROM session_pulse sp JOIN enrollments e ON e.id = sp.enrollment_id
    JOIN live_sessions s ON s.id = sp.session_id AND s.open_house_event_id IS NOT NULL
   WHERE e.email IS NOT NULL
) x
WHERE x.email NOT LIKE 'ali+%' AND x.email NOT LIKE '%@colaberry.com'
  AND x.email NOT LIKE '%@colaberry-test.local' AND x.email !~ '^(e2e[-_]|test-fixture-)';

-- OH1y: who did something in the room: a guest answered a poll, asked a question or set their status; a signed-in member
-- set their status, answered a poll or chatted. One row per (session, email, kind).
CREATE TEMP TABLE oh_did AS
SELECT DISTINCT x.session_id, x.email, x.kind FROM (
  SELECT p.session_id, sg.email_lower AS email, 'poll' AS kind FROM session_guest_poll_responses p JOIN session_guests sg ON sg.id = p.guest_id
  UNION ALL SELECT q.session_id, sg.email_lower, 'question' FROM session_guest_questions q JOIN session_guests sg ON sg.id = q.guest_id
  UNION ALL SELECT sg.session_id, sg.email_lower, 'status' FROM session_guests sg WHERE sg.pulse_state IS NOT NULL
  UNION ALL SELECT sp.session_id, lower(e.email), 'status' FROM session_pulse sp JOIN enrollments e ON e.id = sp.enrollment_id
  UNION ALL SELECT pr.session_id, lower(e.email), 'poll' FROM session_poll_responses pr JOIN enrollments e ON e.id = pr.enrollment_id
  UNION ALL SELECT cm.session_id, lower(e.email), 'chat' FROM session_chat_messages cm JOIN enrollments e ON e.id = cm.enrollment_id
) x
JOIN live_sessions s ON s.id = x.session_id AND s.open_house_event_id IS NOT NULL
WHERE x.email IS NOT NULL;

CREATE TEMP TABLE regx AS
SELECT g.*, wl.sent_at AS email_at,
  (SELECT min(u.used_at) FROM sign_in_link_uses u WHERE u.enrollment_id = g.enrollment_id AND u.used_at >= wl.sent_at) AS signin_at,
  CASE WHEN p.created_at >= g.reg_at THEN p.created_at END AS opened_at,
  -- Finished = watched 75%+ (the credit gate), whether or not they then clicked to collect the credit: on 11 Nov one
  -- learner watched 97% and never collected. credited_at is the click, its own step.
  p.started_at AS played_at,
  CASE WHEN p.completed_at IS NOT NULL THEN p.completed_at
       WHEN (p.analytics->'watch'->>'watched_pct')::numeric >= 75 THEN (p.analytics->'watch'->>'last_beat_at')::timestamptz END AS finished_at,
  p.completed_at AS credited_at,
  (p.analytics->'watch'->>'max_position_s')::numeric AS exit_s,
  (SELECT min(a.submitted_at) FROM runtime_assessment_attempts a WHERE a.enrollment_id = g.enrollment_id AND a.card_id = :'check') AS check_at,
  EXISTS (SELECT 1 FROM runtime_assessment_attempts a WHERE a.enrollment_id = g.enrollment_id AND a.card_id = :'check' AND a.score = 1) AS aced,
  EXISTS (SELECT 1 FROM sign_in_link_uses u WHERE u.enrollment_id = g.enrollment_id
          AND (u.used_at AT TIME ZONE 'America/Chicago')::date > (g.reg_at AT TIME ZONE 'America/Chicago')::date) AS returned_later,
  EXISTS (SELECT 1 FROM timeline_card_progress q WHERE q.enrollment_id = g.enrollment_id
          AND q.card_id NOT IN (:'video', :'check') AND q.created_at >= g.reg_at) AS kept_going,
  -- OH1y: the Open House they signed up for. "Held" = it ended before the window closed; "attended" = checked in on
  -- the platform, the same rule the follow-up uses (backend/src/services/openHouseFollowup.ts FOLLOWUP_PEOPLE_SQL).
  -- Zoom-direct joiners never check in, so attended is a floor.
  os.session_id, os.starts_at AS oh_starts_at,
  (os.ends_at IS NOT NULL AND os.ends_at < (SELECT e FROM win WHERE name = 'cur')) AS oh_held,
  EXISTS (SELECT 1 FROM oh_here h WHERE h.session_id = os.session_id AND h.email = g.email_lower) AS attended,
  (os.session_id IS NOT NULL AND EXISTS (SELECT 1 FROM scheduled_emails se JOIN leads l2 ON l2.id = se.lead_id
     WHERE se.metadata->>'event_session_id' = os.session_id::text AND se.metadata ? 'event_followup'
       AND se.status::text = 'sent' AND lower(l2.email) = g.email_lower)) AS followup_sent,
  EXISTS (SELECT 1 FROM oh_did d WHERE d.session_id = os.session_id AND d.email = g.email_lower) AS interacted,
  -- Paid = a PaySimple subscription with a payment on it, started after they signed up. Comp plans are not paid.
  -- "Checkout" = any non-comp subscription row created after sign-up, paid or not (pending / failed included).
  pay.paid_at, pay.checkout_at, pay.paid_before
FROM reg g
LEFT JOIN LATERAL (
  SELECT min(sb.started_at) FILTER (WHERE sb.paysimple_payment_id IS NOT NULL AND sb.started_at >= g.reg_at) AS paid_at,
         min(sb.created_at) FILTER (WHERE sb.created_at >= g.reg_at) AS checkout_at,
         bool_or(sb.paysimple_payment_id IS NOT NULL AND sb.started_at < g.reg_at) AS paid_before
  FROM subscriptions sb JOIN enrollments e3 ON e3.id = sb.enrollment_id
  WHERE lower(e3.email) = g.email_lower AND sb.plan::text <> 'comp'
) pay ON true
LEFT JOIN LATERAL (
  SELECT s.id AS session_id,
         ((s.session_date + s.start_time::time)::timestamp AT TIME ZONE 'America/Chicago') AS starts_at,
         ((s.session_date + coalesce(s.end_time::time, s.start_time::time + interval '90 minutes'))::timestamp AT TIME ZONE 'America/Chicago') AS ends_at
  FROM open_house_registrations r2 JOIN live_sessions s ON s.open_house_event_id = r2.event_id
  WHERE r2.id = g.reg_id AND s.status::text <> 'cancelled'
  ORDER BY s.session_date LIMIT 1
) os ON true
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

-- ── 2c. OH1y: every message this week's landing-page sign-ups received after signing up, until the window closed ───
-- Matched by address (email) or by lead (texts are addressed to a phone). One row per message, never per match.
CREATE TEMP TABLE cur_ppl AS
SELECT y.email_lower, min(y.reg_at) AS reg_at FROM regy y WHERE y.name = 'cur' AND y.door = 'landing_page' GROUP BY 1;
CREATE TEMP TABLE cur_leads AS
SELECT p.email_lower, l.id AS lead_id FROM cur_ppl p JOIN leads l ON lower(l.email) = p.email_lower;
CREATE TEMP TABLE commz AS
SELECT DISTINCT ON (c.id) c.id, who.email_lower AS person, c.channel::text AS channel, c.status::text AS status, c.subject,
       c.created_at, c.campaign_id, c.metadata
FROM communication_logs c
JOIN LATERAL (
  SELECT p.email_lower, p.reg_at FROM cur_ppl p WHERE p.email_lower = lower(c.to_address)
  UNION ALL
  SELECT cl.email_lower, p.reg_at FROM cur_leads cl JOIN cur_ppl p USING (email_lower) WHERE cl.lead_id = c.lead_id
) who ON true
WHERE c.created_at >= (SELECT s FROM win WHERE name = 'cur') - interval '5 minutes'
  AND c.created_at < (SELECT e FROM win WHERE name = 'cur')
  AND c.created_at >= who.reg_at - interval '5 minutes'
  AND coalesce(c.direction::text, 'outbound') <> 'inbound'
ORDER BY c.id, who.email_lower;

-- ── 2d. OH1y: everyone who paid to enroll in each window, wherever they came from ──────────────────────────────────
-- Ali, 22 Nov: "We had some people pay." The funnel's paid step only follows ad sign-ups; this follows every payer
-- (a PaySimple payment on a non-comp plan, first started in the window) back to where they came from.
CREATE TEMP TABLE payers AS
SELECT w.name, p.email, p.paid_at, p.plan,
  CASE WHEN EXISTS (SELECT 1 FROM open_house_registrations r WHERE r.email_lower = p.email AND r.source = 'landing_page') THEN 'ad_signup'
       WHEN EXISTS (SELECT 1 FROM leads l JOIN page_events pe ON pe.visitor_id = l.visitor_id
                    WHERE lower(l.email) = p.email AND pe.page_url ILIKE :'lp' AND pe.event_type = 'pageview') THEN 'ad_visit'
       WHEN EXISTS (SELECT 1 FROM open_house_registrations r WHERE r.email_lower = p.email) THEN 'oh_other_door'
       WHEN EXISTS (SELECT 1 FROM campaign_leads cl JOIN leads l ON l.id = cl.lead_id JOIN campaigns c ON c.id = cl.campaign_id
                    WHERE lower(l.email) = p.email AND (c.name ILIKE '%win-back%' OR c.name ILIKE '%alumni%')) THEN 'winback'
       WHEN (SELECT l.source FROM leads l WHERE lower(l.email) = p.email ORDER BY l.created_at LIMIT 1) ILIKE 'open_house%' THEN 'earlier_oh_lead'
       WHEN (SELECT l.source FROM leads l WHERE lower(l.email) = p.email ORDER BY l.created_at LIMIT 1) ILIKE 'ccpp_%' THEN 'winback'
       ELSE 'other' END AS origin,
  EXISTS (SELECT 1 FROM open_house_registrations r WHERE r.email_lower = p.email) AS oh_registered,
  EXISTS (SELECT 1 FROM oh_here h JOIN live_sessions s ON s.id = h.session_id WHERE h.email = p.email
          AND ((s.session_date + s.start_time::time)::timestamp AT TIME ZONE 'America/Chicago') < p.paid_at) AS came_before_paying
FROM win w
JOIN (
  SELECT lower(en.email) AS email, min(sb.started_at) AS paid_at, (array_agg(sb.plan::text ORDER BY sb.started_at))[1] AS plan
  FROM subscriptions sb JOIN enrollments en ON en.id = sb.enrollment_id
  WHERE sb.plan::text <> 'comp' AND sb.paysimple_payment_id IS NOT NULL AND sb.started_at IS NOT NULL
  GROUP BY 1
) p ON p.paid_at >= w.s AND p.paid_at < w.e
WHERE p.email NOT LIKE 'ali+%' AND p.email NOT LIKE '%@colaberry.com'
  AND p.email NOT LIKE '%@colaberry-test.local' AND p.email !~ '^(e2e[-_]|test-fixture-)';

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
    -- The heat map's data. `scroll` above already carries the reach at each of the five
    -- thresholds the tracker records; this adds what people clicked, and how far the people who
    -- clicked the main CTA had actually read before they clicked it.
    'heat', json_build_object(
      'clicks', (SELECT coalesce(json_agg(t ORDER BY t.clicks DESC, t.label), '[]') FROM (
          SELECT coalesce(a.data_track, a.element_text,
                          'an unlabeled ' || CASE a.element_tag WHEN 'a' THEN 'link' WHEN 'button' THEN 'button'
                                                                ELSE coalesce(a.element_tag, 'control') END) AS label,
                 a.event_type, a.data_track, a.element_text, a.href, a.element_tag,
                 a.clicks, a.people, a.people_without_pageview
          FROM clkagg a WHERE a.name = w.name) t),
      -- Split by whether they clicked the seat CTA. This is the pairing that shows whether the
      -- page is read before it converts: `under25` is people who clicked having never reached a
      -- quarter of the way down, which is only possible because a CTA sits above the fold.
      'by_seat', (SELECT coalesce(json_agg(t ORDER BY t.seat DESC), '[]') FROM (
          SELECT v.cta_seat AS seat, count(*) AS people,
                 count(*) FILTER (WHERE coalesce(v.max_scroll, 0) < 25) AS under25,
                 count(*) FILTER (WHERE v.max_scroll >= 25) AS d25,
                 count(*) FILTER (WHERE v.max_scroll >= 50) AS d50,
                 count(*) FILTER (WHERE v.max_scroll >= 75) AS d75,
                 count(*) FILTER (WHERE v.max_scroll >= 90) AS d90,
                 count(*) FILTER (WHERE v.max_scroll >= 100) AS d100
          FROM visx v WHERE v.name = w.name GROUP BY 1) t)),
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
    'payers', (SELECT json_build_object(
        'total', count(*), 'monthly', count(*) FILTER (WHERE plan = 'monthly'), 'annual', count(*) FILTER (WHERE plan = 'annual'),
        'oh_registered', count(*) FILTER (WHERE oh_registered), 'came_before_paying', count(*) FILTER (WHERE came_before_paying),
        'by_origin', (SELECT coalesce(json_agg(t ORDER BY t.n DESC, t.origin), '[]') FROM (
            SELECT origin, count(*) AS n, count(*) FILTER (WHERE came_before_paying) AS came FROM payers p2 WHERE p2.name = w.name GROUP BY 1) t))
      FROM payers p WHERE p.name = w.name),
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
        'credited', count(*) FILTER (WHERE new_account AND entered_at IS NOT NULL AND credited_at IS NOT NULL),
        'took_check', count(*) FILTER (WHERE new_account AND entered_at IS NOT NULL AND check_at IS NOT NULL),
        'aced', count(*) FILTER (WHERE new_account AND entered_at IS NOT NULL AND aced),
        'kept_going', count(*) FILTER (WHERE new_account AND entered_at IS NOT NULL AND kept_going),
        'returned_later', count(*) FILTER (WHERE new_account AND returned_later),
        -- OH1y: every landing-page sign-up (new account or not) whose Open House has happened, and who came.
        'oh_held', count(*) FILTER (WHERE oh_held),
        'oh_upcoming', count(*) FILTER (WHERE session_id IS NOT NULL AND NOT oh_held),
        'attended', count(*) FILTER (WHERE oh_held AND attended),
        'followup_sent', count(*) FILTER (WHERE oh_held AND followup_sent),
        'held_watched', count(*) FILTER (WHERE oh_held AND finished_at IS NOT NULL AND finished_at < oh_starts_at),
        'attended_watched', count(*) FILTER (WHERE oh_held AND attended AND finished_at IS NOT NULL AND finished_at < oh_starts_at),
        'interacted', count(*) FILTER (WHERE oh_held AND attended AND interacted),
        -- Paid: every landing-page sign-up who paid after signing up, then split by how far they got at the Open House.
        'paid', count(*) FILTER (WHERE paid_at IS NOT NULL),
        'paid_held', count(*) FILTER (WHERE oh_held AND paid_at IS NOT NULL),
        'paid_attended', count(*) FILTER (WHERE oh_held AND attended AND paid_at IS NOT NULL),
        'paid_interacted', count(*) FILTER (WHERE oh_held AND attended AND interacted AND paid_at IS NOT NULL),
        'checkout_held', count(*) FILTER (WHERE oh_held AND checkout_at IS NOT NULL),
        'checkout', count(*) FILTER (WHERE checkout_at IS NOT NULL),
        'already_paid', count(*) FILTER (WHERE paid_before),
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
  )) FROM win w),
  -- OH1y: every message this week's landing-page sign-ups received, grouped by what it was. A subject is only carried
  -- when every send of that message had the same one (Maya writes a subject per person, some with a first name).
  'comms', json_build_object(
    'people', (SELECT count(*) FROM cur_ppl),
    'reached', (SELECT count(DISTINCT person) FROM commz WHERE status = 'sent'),
    'median_per_person', (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY n) FROM (
        SELECT p.email_lower, count(c.id) FILTER (WHERE c.status = 'sent') AS n FROM cur_ppl p LEFT JOIN commz c ON c.person = p.email_lower GROUP BY 1) t),
    'max_per_person', (SELECT max(n) FROM (SELECT person, count(*) AS n FROM commz WHERE status = 'sent' GROUP BY 1) t),
    'messages', (SELECT coalesce(json_agg(m ORDER BY m.first_at, m.sent DESC), '[]') FROM (
      SELECT k.key, min(k.channel) AS channel, min(k.kind) AS kind, min(k.source) AS source, min(k.step) AS step,
             count(*) FILTER (WHERE k.status = 'sent') AS sent,
             count(*) FILTER (WHERE k.status <> 'sent') AS not_sent,
             string_agg(DISTINCT k.status, ', ') FILTER (WHERE k.status <> 'sent') AS not_sent_status,
             count(DISTINCT k.person) FILTER (WHERE k.status = 'sent') AS people,
             CASE WHEN count(DISTINCT k.subject) = 1 THEN min(k.subject) END AS subject,
             count(DISTINCT k.subject) AS subjects,
             to_char(min(k.created_at) AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD') AS first_ct,
             to_char(max(k.created_at) AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD') AS last_ct,
             min(k.created_at) AS first_at
      FROM (
        SELECT c.*, CASE
            WHEN c.metadata->>'event' IS NOT NULL THEN 'event:' || (c.metadata->>'event') || ':' || c.channel
            WHEN c.campaign_id IS NOT NULL THEN 'campaign:' || c.campaign_id || ':' || coalesce(c.metadata->>'step_index', '?') || ':' || c.channel
            WHEN c.metadata->>'email_type' IS NOT NULL THEN 'reminder:' || (c.metadata->>'email_type') || ':' || coalesce(c.metadata->>'reminder_type', '') || ':' || c.channel
            ELSE 'other:' || c.channel END AS key,
          CASE WHEN c.metadata->>'event' IS NOT NULL THEN 'system' WHEN c.campaign_id IS NOT NULL THEN 'campaign'
               WHEN c.metadata->>'email_type' IS NOT NULL THEN 'reminder' ELSE 'other' END AS kind,
          coalesce(c.metadata->>'event', cp.name, nullif(concat_ws(' ', c.metadata->>'email_type', c.metadata->>'reminder_type'), ''), 'other') AS source,
          CASE WHEN c.metadata->>'step_index' ~ '^[0-9]+$' THEN (c.metadata->>'step_index')::int + 1 END AS step
        FROM commz c LEFT JOIN campaigns cp ON cp.id = c.campaign_id
      ) k GROUP BY k.key) m),
    -- Still waiting to go out to these people (campaign sends booked, not yet sent).
    'queued', (SELECT coalesce(json_agg(q ORDER BY q.next_ct), '[]') FROM (
      SELECT coalesce(cp.name, 'no campaign') AS source, se.channel::text AS channel, count(*) AS sends, count(DISTINCT cl.email_lower) AS people,
             to_char(min(se.scheduled_for) AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD HH24:MI') AS next_ct
      FROM scheduled_emails se JOIN cur_leads cl ON cl.lead_id = se.lead_id LEFT JOIN campaigns cp ON cp.id = se.campaign_id
      WHERE se.status::text IN ('pending', 'processing', 'paused')
      GROUP BY 1, 2) q)),
  -- OH1y: every Open House since launch, whatever window the sign-ups fell in. All doors, test addresses excluded.
  'sessions', (SELECT coalesce(json_agg(t ORDER BY t.date), '[]') FROM (
    SELECT to_char(s.session_date, 'YYYY-MM-DD') AS date, s.status::text AS status,
      ((s.session_date + coalesce(s.end_time::time, s.start_time::time + interval '90 minutes'))::timestamp AT TIME ZONE 'America/Chicago')
        < (SELECT e FROM win WHERE name = 'cur') AS held,
      count(DISTINCT r.email_lower) AS registered,
      count(DISTINCT r.email_lower) FILTER (WHERE r.source = 'landing_page') AS registered_lp,
      count(DISTINCT r.email_lower) FILTER (WHERE r.email_lower IN (SELECT h.email FROM oh_here h WHERE h.session_id = s.id)) AS checked_in,
      count(DISTINCT r.email_lower) FILTER (WHERE r.source = 'landing_page' AND r.email_lower IN (SELECT h.email FROM oh_here h WHERE h.session_id = s.id)) AS checked_in_lp,
      (SELECT count(*) FROM oh_here h WHERE h.session_id = s.id AND h.email NOT IN (SELECT r3.email_lower FROM open_house_registrations r3 WHERE r3.event_id = s.open_house_event_id)) AS walk_ins,
      (SELECT count(DISTINCT d.email) FROM oh_did d WHERE d.session_id = s.id) AS interacted,
      (SELECT count(DISTINCT d.email) FROM oh_did d WHERE d.session_id = s.id AND d.kind = 'poll') AS answered_poll,
      (SELECT count(DISTINCT d.email) FROM oh_did d WHERE d.session_id = s.id AND d.kind = 'question') AS asked_question,
      (SELECT count(DISTINCT d.email) FROM oh_did d WHERE d.session_id = s.id AND d.kind IN ('status', 'chat')) AS set_status_or_chat,
      -- Registrants (all doors) who paid after this Open House started, and how many of them had checked in.
      count(DISTINCT r.email_lower) FILTER (WHERE EXISTS (SELECT 1 FROM subscriptions sb JOIN enrollments e4 ON e4.id = sb.enrollment_id
          WHERE lower(e4.email) = r.email_lower AND sb.plan::text <> 'comp' AND sb.paysimple_payment_id IS NOT NULL
            AND sb.started_at >= ((s.session_date + s.start_time::time)::timestamp AT TIME ZONE 'America/Chicago'))) AS paid_after,
      count(DISTINCT r.email_lower) FILTER (WHERE r.email_lower IN (SELECT h.email FROM oh_here h WHERE h.session_id = s.id)
        AND EXISTS (SELECT 1 FROM subscriptions sb JOIN enrollments e4 ON e4.id = sb.enrollment_id
          WHERE lower(e4.email) = r.email_lower AND sb.plan::text <> 'comp' AND sb.paysimple_payment_id IS NOT NULL
            AND sb.started_at >= ((s.session_date + s.start_time::time)::timestamp AT TIME ZONE 'America/Chicago'))) AS paid_after_checked_in,
      (SELECT count(*) FROM scheduled_emails se WHERE se.metadata->>'event_session_id' = s.id::text AND se.metadata ? 'event_followup') AS followups_booked,
      (SELECT count(*) FROM scheduled_emails se WHERE se.metadata->>'event_session_id' = s.id::text AND se.metadata ? 'event_followup' AND se.status::text = 'sent') AS followups_sent
    FROM live_sessions s
    LEFT JOIN open_house_registrations r ON r.event_id = s.open_house_event_id
      AND r.email_lower NOT LIKE 'ali+%' AND r.email_lower NOT LIKE '%@colaberry.com'
      AND r.email_lower NOT LIKE '%@colaberry-test.local' AND r.email_lower !~ '^(e2e[-_]|test-fixture-)'
    WHERE s.open_house_event_id IS NOT NULL AND s.status::text <> 'cancelled' AND s.session_date >= (:'launch'::timestamptz AT TIME ZONE 'America/Chicago')::date
    GROUP BY s.id, s.session_date, s.status, s.start_time, s.end_time, s.open_house_event_id) t)
);

-- Recipients for the Mandrill step (welcome emails sent to new landing-page accounts in "cur"), when run.sh asks.
\if :{?recipients_out}
  \o :recipients_out
  SELECT email_lower FROM regy WHERE name = 'cur' AND door = 'landing_page' AND new_account AND email_at IS NOT NULL;
  \o
\endif
