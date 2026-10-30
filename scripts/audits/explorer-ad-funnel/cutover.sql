-- Explorer ad-funnel audit: ad Explorers before vs after a release (default: C91, live 2026-10-29 23:30 UTC).
-- Run through run.sh with -v cutover='<timestamp with zone>'. The windows differ in length: compare RATES, not counts.
\if :{?cutover}
\else
  \set cutover '2026-10-29 23:30:00+00'
\endif

CREATE TEMP VIEW audit_period AS
SELECT b.*, CASE WHEN b.entered_at >= :'cutover' THEN 'after' ELSE 'before' END AS period
FROM audit_base b WHERE b.channel = 'ad';

\echo '== C1 ad Explorers before vs after the cutover'
SELECT period,
  count(*) AS signed_up,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM audit_first_win w WHERE w.enrollment_id = a.id)) AS first_win,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM audit_first_win w WHERE w.enrollment_id = a.id AND w.first_win_at < a.entered_at + interval '24 hours')) AS first_win_24h,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM subscriptions s JOIN enrollments e2 ON e2.id = s.enrollment_id WHERE lower(e2.email) = a.email AND s.created_at >= a.entered_at)) AS checkout_started,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM subscriptions s JOIN enrollments e2 ON e2.id = s.enrollment_id WHERE lower(e2.email) = a.email AND s.status = 'active' AND s.plan <> 'comp')) AS paid
FROM audit_period a GROUP BY 1 ORDER BY 1 DESC;

\echo '== C2 enroll-link clicks and arrivals through the gate''s first-lesson door'
SELECT a.period,
  count(DISTINCT a.id) FILTER (WHERE p.event_data->>'href' LIKE '%tab=subscription%') AS clicked_enroll_link,
  count(DISTINCT a.id) FILTER (WHERE p.page_path LIKE '/portal/today%' AND p.page_url LIKE '%first=1%') AS arrived_via_first_lesson_door
FROM audit_period a
JOIN visitor_sessions v ON v.lead_id = a.lead_id
JOIN page_events p ON p.session_id::text = v.id::text AND p.timestamp >= a.entered_at
GROUP BY 1 ORDER BY 1 DESC;
