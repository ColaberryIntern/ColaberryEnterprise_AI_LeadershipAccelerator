-- Explorer ad-funnel audit, C106: is anyone using their sign-in link?
--
-- Source: sign_in_link_uses (one row per successful link sign-in) and sign_in_link_invalid_daily (a per-day count of
-- invalid or expired links), written by GET /api/portal/verify from the C106 release on. Before it, link use could not
-- be measured at all (returnpath R5: zero /portal/verify page events). Neither table stores the token, IP or UA.

\if :{?days}
\else
  \set days 14
\endif

\echo '== L1 successful link sign-ins per Central day: uses, people'
SELECT (used_at AT TIME ZONE 'America/Chicago')::date AS day_ct, count(*) AS uses, count(DISTINCT enrollment_id) AS people
FROM sign_in_link_uses WHERE used_at >= now() - make_interval(days => :days)
GROUP BY 1 ORDER BY 1;

\echo '== L2 ad Explorers who signed in with a link, and how long after entering'
SELECT count(DISTINCT u.enrollment_id) AS ad_explorers_used_link,
       round(avg(extract(epoch FROM (u.first_use - b.entered_at)) / 3600)::numeric, 1) AS avg_hours_after_entry
FROM (SELECT enrollment_id, min(used_at) AS first_use FROM sign_in_link_uses GROUP BY 1) u
JOIN audit_base b ON b.id = u.enrollment_id
WHERE b.channel = 'ad';

\echo '== L3 invalid or expired links per day'
SELECT day, invalid_count FROM sign_in_link_invalid_daily WHERE day >= CURRENT_DATE - :days ORDER BY day;
