-- Explorer ad-funnel audit: what ad Explorers did after signing up. Run through run.sh.

CREATE TEMP VIEW audit_ad_events AS
SELECT b.id, p.event_type, p.page_path, p.page_url, p.event_data, p.timestamp
FROM audit_base b
JOIN visitor_sessions v ON v.lead_id = b.lead_id
JOIN page_events p ON p.session_id::text = v.id::text AND p.timestamp >= b.entered_at
WHERE b.channel = 'ad';

\echo '== B1 return visits: distinct days with a visitor session started after signup'
SELECT days_after_signup, count(*) AS people FROM (
  SELECT b.id, count(DISTINCT date_trunc('day', v.started_at)) FILTER (WHERE v.started_at >= b.entered_at) AS days_after_signup
  FROM audit_base b LEFT JOIN visitor_sessions v ON v.lead_id = b.lead_id
  WHERE b.channel = 'ad' GROUP BY b.id) x
GROUP BY 1 ORDER BY 1;

\echo '== B2 portal pages visited after signup'
SELECT regexp_replace(page_path, '[0-9a-f-]{36}', ':id', 'g') AS path, count(DISTINCT id) AS people, count(*) AS events
FROM audit_ad_events GROUP BY 1 ORDER BY 2 DESC LIMIT 15;

\echo '== B3 top click targets in the portal'
SELECT page_path, left(COALESCE(event_data->>'href', event_data->>'element_text', ''), 70) AS target,
       count(DISTINCT id) AS people, count(*) AS clicks
FROM audit_ad_events WHERE event_type IN ('click', 'cta_click') AND page_path LIKE '/portal%'
GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 15;

\echo '== B4 total time in the portal per person'
SELECT CASE WHEN s < 60 THEN 'a <1 min' WHEN s < 300 THEN 'b 1-5 min' WHEN s < 1200 THEN 'c 5-20 min' ELSE 'd 20+ min' END AS bucket,
       count(*) AS people
FROM (SELECT b.id, COALESCE(sum((e.event_data->>'seconds')::numeric) FILTER (WHERE e.event_type = 'time_on_page'), 0) AS s
      FROM audit_base b LEFT JOIN audit_ad_events e ON e.id = b.id
      WHERE b.channel = 'ad' GROUP BY b.id) x
GROUP BY 1 ORDER BY 1;

\echo '== B5 Today feed: cards shown vs touched'
SELECT count(DISTINCT f.enrollment_id) AS people_shown, count(*) AS impressions, count(f.interacted_at) AS interactions
FROM audit_base b JOIN today_feed_impressions f ON f.enrollment_id = b.id WHERE b.channel = 'ad';

\echo '== B6 checkouts started by ad Explorers'
SELECT s.plan, s.status, s.amount_cents, round(extract(epoch FROM s.created_at - b.entered_at) / 3600, 1) AS hours_after_signup
FROM audit_base b JOIN enrollments e2 ON lower(e2.email) = b.email JOIN subscriptions s ON s.enrollment_id = e2.id
WHERE b.channel = 'ad' ORDER BY s.created_at;

\echo '== B7 messages sent to ad Explorers after signup'
SELECT c.channel, left(COALESCE(c.subject, ''), 60) AS subject, count(DISTINCT b.id) AS people
FROM audit_base b JOIN communication_logs c ON (lower(c.to_address) = b.email OR c.lead_id = b.lead_id)
  AND c.created_at >= b.entered_at - interval '5 minutes'
WHERE b.channel = 'ad' GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 10;
