-- Explorer ad-funnel audit, C98: what the Today feed holds for an ad Explorer, and what anyone opens.
--
-- Source: today_feed_impressions, one row per item the server GENERATED for a learner (todayFeedComposer). It is not
-- a view count: the composer over-fetches (+4 per page), rows the client filters out (Today Plan refs) are still
-- written, and nothing records what scrolled into view. interacted_at is set by exactly one action, opening a card
-- from the feed (TodayFeedV2 handleOpen -> interact 'open'). So "generated" overcounts what was seen and "opened"
-- undercounts engagement; the queries below say which they measure.
--
-- "First session" = rows served within 60 minutes of the learner's first feed row.

CREATE TEMP TABLE fx AS
SELECT f.enrollment_id, f.position, f.kind, f.provider, f.card_id, f.served_at, f.interacted_at,
       COALESCE(f.item->>'type', f.provider, f.kind) AS item_type,
       f.item->>'surface' AS surface,
       CASE WHEN f.item->>'week' ~ '^-?[0-9]+$' THEN (f.item->>'week')::int END AS week,
       min(f.served_at) OVER (PARTITION BY f.enrollment_id) AS first_served,
       b.entered_at
FROM audit_base b JOIN today_feed_impressions f ON f.enrollment_id = b.id
WHERE b.channel = 'ad';

\echo '== F1 totals: generated, opened, people (all time, and first session only)'
SELECT 'all_time' AS scope, count(DISTINCT enrollment_id) AS people, count(*) AS generated, count(interacted_at) AS opened FROM fx
UNION ALL
SELECT 'first_session', count(DISTINCT enrollment_id), count(*), count(interacted_at) FILTER (WHERE interacted_at < first_served + interval '60 minutes')
FROM fx WHERE served_at < first_served + interval '60 minutes';

\echo '== F2 first session: items generated per person (how deep the server went)'
SELECT CASE WHEN n <= 10 THEN '01-10' WHEN n <= 20 THEN '11-20' WHEN n <= 40 THEN '21-40' ELSE '41+' END AS items, count(*) AS people
FROM (SELECT enrollment_id, count(*) AS n FROM fx WHERE served_at < first_served + interval '60 minutes' GROUP BY 1) t
GROUP BY 1 ORDER BY 1;

\echo '== F3 first session: what kinds of item (by type), with people and opens'
SELECT kind, item_type, count(*) AS generated, count(DISTINCT enrollment_id) AS people, count(interacted_at) AS opened,
       min(position) AS best_position
FROM fx WHERE served_at < first_served + interval '60 minutes'
GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 25;

\echo '== F4 first session: beginner fit. Week 0 class cards vs evergreen (no week) vs later weeks'
SELECT CASE WHEN week IS NULL THEN 'no_week (evergreen / ambient)' WHEN week = 0 THEN 'week_0' ELSE 'week_1_plus' END AS fit,
       surface, count(*) AS generated, count(interacted_at) AS opened
FROM fx WHERE served_at < first_served + interval '60 minutes'
GROUP BY 1, 2 ORDER BY 3 DESC;

\echo '== F5 by feed position (all time): is anything below the top ever opened?'
SELECT CASE WHEN position <= 3 THEN '01-03' WHEN position <= 10 THEN '04-10' WHEN position <= 30 THEN '11-30' ELSE '31+' END AS pos,
       count(*) AS generated, count(interacted_at) AS opened
FROM fx GROUP BY 1 ORDER BY 1;

\echo '== F6 every opened item (all time)'
SELECT served_at::timestamp(0) AS served, interacted_at::timestamp(0) AS opened_at, position, kind, item_type, week
FROM fx WHERE interacted_at IS NOT NULL ORDER BY interacted_at;

\echo '== F7 control: how ad Explorers DID open cards (runtime page visits), feed vs elsewhere'
SELECT count(DISTINCT b.id) AS people_opened_any_card,
       count(DISTINCT b.id) FILTER (WHERE EXISTS (SELECT 1 FROM fx WHERE fx.enrollment_id = b.id AND fx.interacted_at IS NOT NULL)) AS of_them_via_feed
FROM audit_base b
JOIN visitor_sessions v ON v.lead_id = b.lead_id
JOIN page_events p ON p.session_id = v.id AND p.page_path LIKE '/portal/runtime/%' AND p.timestamp >= b.entered_at
WHERE b.channel = 'ad';

\echo '== F8 did they reach the feed at all? Today visits with any scroll event, first session'
SELECT count(DISTINCT b.id) AS people_on_today,
       count(DISTINCT b.id) FILTER (WHERE p.event_type = 'scroll') AS scrolled_today
FROM audit_base b
JOIN visitor_sessions v ON v.lead_id = b.lead_id
JOIN page_events p ON p.session_id = v.id AND p.page_path LIKE '/portal/today%'
  AND p.timestamp >= b.entered_at AND p.timestamp < b.entered_at + interval '60 minutes'
WHERE b.channel = 'ad';

\echo '== F9 control: the same open logging, for learners who are NOT Explorers (paying members, staff)'
SELECT count(*) AS generated, count(f.interacted_at) AS opened,
       round(100.0 * count(f.interacted_at) / NULLIF(count(*), 0), 1) AS open_pct
FROM today_feed_impressions f JOIN enrollments e ON e.id = f.enrollment_id
WHERE e.explorer_entered_at IS NULL;
