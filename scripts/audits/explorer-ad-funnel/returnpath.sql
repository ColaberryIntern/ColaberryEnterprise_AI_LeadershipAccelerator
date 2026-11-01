-- Explorer ad-funnel audit: the RETURN PATH (C97). Does an ad Explorer come back, and what stands in the way?
-- Run through run.sh. Temp tables, not views: the visitor_id fan-out is too slow to recompute per query.
--
-- An Explorer's visits = visitor_sessions reached by their lead_id OR by any visitor_id that lead ever used, because a
-- return on the same browser keeps the visitor_id before the tracker re-identifies it.
-- A RETURN visit = a session that starts 6+ hours after entered_at, so the signup session and a refresh do not count.
-- A session "reached the portal" if it viewed any /portal/ page other than login, verify and signup.
CREATE TEMP TABLE ad_x AS
SELECT id, lead_id, entered_at FROM audit_base WHERE channel = 'ad' AND lead_id IS NOT NULL;

CREATE TEMP TABLE ad_visitors AS
SELECT DISTINCT a.id AS enrollment_id, v.visitor_id
FROM ad_x a JOIN visitor_sessions v ON v.lead_id = a.lead_id WHERE v.visitor_id IS NOT NULL;

CREATE TEMP TABLE ad_sessions AS
SELECT DISTINCT a.id AS enrollment_id, a.entered_at, v.id AS sid, v.started_at, v.entry_page, v.device_type,
       (v.fbclid IS NOT NULL OR v.gclid IS NOT NULL OR v.utm_source IS NOT NULL) AS from_ad
FROM ad_x a JOIN visitor_sessions v ON v.lead_id = a.lead_id
WHERE v.started_at >= a.entered_at - interval '1 day'
UNION
SELECT a.id, a.entered_at, v.id, v.started_at, v.entry_page, v.device_type,
       (v.fbclid IS NOT NULL OR v.gclid IS NOT NULL OR v.utm_source IS NOT NULL)
FROM ad_x a JOIN ad_visitors av ON av.enrollment_id = a.id JOIN visitor_sessions v ON v.visitor_id = av.visitor_id
WHERE v.started_at >= a.entered_at - interval '1 day';

CREATE TEMP TABLE sess_flags AS
SELECT s.sid,
  bool_or(p.page_path LIKE '/portal/%' AND p.page_path NOT LIKE '/portal/login%'
          AND p.page_path NOT LIKE '/portal/verify%' AND p.page_path NOT LIKE '/portal/signup%') AS saw_portal,
  bool_or(p.page_path LIKE '/portal/login%') AS hit_login
FROM (SELECT DISTINCT sid FROM ad_sessions) s JOIN page_events p ON p.session_id = s.sid
GROUP BY s.sid;

CREATE TEMP TABLE return_sessions AS
SELECT s.*, COALESCE(f.saw_portal, false) AS saw_portal, COALESCE(f.hit_login, false) AS hit_login
FROM ad_sessions s LEFT JOIN sess_flags f ON f.sid = s.sid
WHERE s.started_at >= s.entered_at + interval '6 hours';

\echo '== R1 ad Explorers who came back (a session 6+ hours after entering), people, by entry week'
SELECT date_trunc('week', a.entered_at)::date AS entry_week, count(*) AS ad_explorers,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM return_sessions r WHERE r.enrollment_id = a.id)) AS came_back,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM return_sessions r WHERE r.enrollment_id = a.id
                                 AND r.started_at < a.entered_at + interval '7 days')) AS came_back_within_7d,
  count(*) FILTER (WHERE a.entered_at < now() - interval '7 days') AS have_had_7_days
FROM ad_x a GROUP BY 1 ORDER BY 1;

\echo '== R2 return sessions: what happened (per session)'
SELECT count(*) AS return_sessions,
  count(*) FILTER (WHERE saw_portal AND NOT hit_login) AS straight_into_portal,
  count(*) FILTER (WHERE hit_login AND NOT saw_portal) AS stopped_at_sign_in,
  count(*) FILTER (WHERE hit_login AND saw_portal) AS sign_in_then_portal,
  count(*) FILTER (WHERE NOT saw_portal AND NOT hit_login) AS never_reached_portal,
  count(*) FILTER (WHERE started_at >= entered_at + interval '7 days') AS after_7_day_session_ends
FROM return_sessions;

\echo '== R3 returners (people): reached the portal on some return vs never did'
SELECT count(DISTINCT enrollment_id) AS returners,
  count(DISTINCT enrollment_id) FILTER (WHERE saw_portal) AS reached_portal,
  count(DISTINCT enrollment_id) FILTER (WHERE hit_login) AS saw_sign_in_page,
  count(DISTINCT enrollment_id) FILTER (WHERE NOT saw_portal AND NOT hit_login) AS had_a_visit_that_never_reached_portal
FROM return_sessions;

\echo '== R4 return sessions that never reached the portal: where they landed and how they arrived'
SELECT left(COALESCE(regexp_replace(entry_page, '\?.*$', ''), '(none)'), 50) AS landed_on, from_ad AS via_an_ad_click,
  COALESCE(device_type, '?') AS device, count(*) AS sessions, count(DISTINCT enrollment_id) AS people
FROM return_sessions WHERE NOT saw_portal AND NOT hit_login
GROUP BY 1, 2, 3 ORDER BY sessions DESC LIMIT 10;

\echo '== R5 CONTROL: which portal entry pages the tracker records at all (every visitor since :since)'
SELECT CASE WHEN page_path LIKE '/portal/login%' THEN 'login' WHEN page_path LIKE '/portal/verify%' THEN 'verify'
            ELSE 'today' END AS page, count(*) AS events, count(DISTINCT session_id) AS sessions
FROM page_events WHERE timestamp >= :'since'
  AND (page_path LIKE '/portal/login%' OR page_path LIKE '/portal/verify%' OR page_path LIKE '/portal/today%')
GROUP BY 1 ORDER BY 1;

\echo '== R6 messages logged to ad Explorers after they entered (communication_logs)'
SELECT c.channel, left(COALESCE(c.subject, '(none)'), 55) AS subject, count(*) AS messages,
  count(DISTINCT a.id) AS people, min(c.created_at)::date AS first_day, max(c.created_at)::date AS last_day
FROM ad_x a JOIN communication_logs c ON c.lead_id = a.lead_id AND c.created_at >= a.entered_at
GROUP BY 1, 2 ORDER BY messages DESC LIMIT 10;

\echo '== R7 the sign-in link email: did people who entered before 24 Oct visit in the 48 hours after it was sent?'
SELECT (g.sent_at IS NOT NULL) AS got_sign_in_email, count(*) AS people,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM ad_sessions s WHERE s.enrollment_id = a.id
    AND s.started_at >= COALESCE(g.sent_at, '2026-10-24') AND s.started_at < COALESCE(g.sent_at, '2026-10-24') + interval '48 hours'))
    AS visited_within_48h_of_send
FROM ad_x a
LEFT JOIN LATERAL (SELECT min(c.created_at) AS sent_at FROM communication_logs c
                   WHERE c.lead_id = a.lead_id AND c.subject ILIKE '%sign-in link%' AND c.created_at >= a.entered_at) g ON true
WHERE a.entered_at < '2026-10-24'
GROUP BY 1 ORDER BY 1;
