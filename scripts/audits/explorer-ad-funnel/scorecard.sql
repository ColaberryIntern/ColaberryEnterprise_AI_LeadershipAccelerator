-- Explorer ad-funnel audit: the release scorecard. Ad Explorers by release period; every rate is counted only over
-- people who have had the full window, so a period that ended an hour ago is not judged on half a day.
--
-- Periods: before C91 (< 2026-10-29 23:30 UTC), C91's first release only (until #3500 went live at
-- 2026-10-30 17:36:04 UTC), after #3500. A "return" is a visitor session on the lead starting 6+ hours after entry.

CREATE TEMP TABLE sc AS
SELECT b.id, b.email, b.lead_id, b.entered_at,
  CASE WHEN b.entered_at <  '2026-10-29 23:30:00+00' THEN '1_before_C91'
       WHEN b.entered_at <  '2026-10-30 17:36:04+00' THEN '2_C91_only'
       ELSE '3_after_3500' END AS period,
  (SELECT w.first_win_at FROM audit_first_win w WHERE w.enrollment_id = b.id) AS first_win_at,
  (SELECT min(v.started_at) FROM visitor_sessions v
     WHERE v.lead_id = b.lead_id AND v.started_at >= b.entered_at + interval '6 hours') AS first_return_at
FROM audit_base b WHERE b.channel = 'ad';

\echo '== S1 first lesson within 24h (only people who have had 24h)'
SELECT period, count(*) AS had_24h,
  count(*) FILTER (WHERE first_win_at < entered_at + interval '24 hours') AS first_win_24h,
  round(100.0 * count(*) FILTER (WHERE first_win_at < entered_at + interval '24 hours') / NULLIF(count(*), 0), 1) AS pct
FROM sc WHERE entered_at < now() - interval '24 hours' GROUP BY 1 ORDER BY 1;

\echo '== S2 came back within 3 days (only people who have had 3 days)'
SELECT period, count(*) AS had_3d,
  count(*) FILTER (WHERE first_return_at < entered_at + interval '3 days') AS came_back_3d,
  round(100.0 * count(*) FILTER (WHERE first_return_at < entered_at + interval '3 days') / NULLIF(count(*), 0), 1) AS pct
FROM sc WHERE entered_at < now() - interval '3 days' GROUP BY 1 ORDER BY 1;

\echo '== S3 checkout started / paid (all, any time)'
SELECT period, count(*) AS signed_up,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM subscriptions s JOIN enrollments e2 ON e2.id = s.enrollment_id
                                 WHERE lower(e2.email) = sc.email AND s.created_at >= sc.entered_at)) AS checkout_started,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM subscriptions s JOIN enrollments e2 ON e2.id = s.enrollment_id
                                 WHERE lower(e2.email) = sc.email AND s.status = 'active' AND s.plan <> 'comp')) AS paid
FROM sc GROUP BY 1 ORDER BY 1;

\echo '== S4 ad Explorers per Central day: first lesson ever, and the ad tags on the lead (C94 / C104)'
SELECT (sc.entered_at AT TIME ZONE 'America/Chicago')::date AS day_ct, count(*) AS ad_explorers,
  count(*) FILTER (WHERE first_win_at IS NOT NULL) AS first_win_ever,
  count(*) FILTER (WHERE l.utm_source IS NOT NULL) AS lead_has_utm_source,
  count(*) FILTER (WHERE l.utm_content IS NOT NULL) AS lead_has_utm_content
FROM sc LEFT JOIN leads l ON l.id = sc.lead_id
WHERE sc.entered_at >= now() - interval '10 days' GROUP BY 1 ORDER BY 1;

\echo '== S5 all Explorers by channel, last 10 days (context)'
SELECT channel, count(*) FROM audit_base WHERE entered_at >= now() - interval '10 days' GROUP BY 1 ORDER BY 2 DESC;

\echo '== S6 freshness'
SELECT now()::timestamp(0) AS now_utc, max(entered_at)::timestamp(0) AS last_ad_entry FROM sc;
