-- Explorer ad-funnel audit, C107: what was SEEN on Today, and which door a card was opened from.
--
-- Source: today_card_events (ensureTodayCardEventsSchema.ts), one row per learner per card per event per source, the
-- FIRST time it happened. 'seen' = the card was at least half on screen; 'open' = opened from the feed or from the
-- banner at the top of Today. This is what C98 could not measure: today_feed_impressions counts what the server
-- generated, not what anyone saw. The table is created on the first event after the C107 deploy; before that this
-- file fails on the missing table, which is the correct answer ("nothing recorded yet").
--
--   bash scripts/audits/explorer-ad-funnel/run.sh seen [days=14]

\if :{?days}
\else
  \set days 14
\endif

\echo '== V1 per Central day: people, cards seen, opens from the feed, opens from the banner'
SELECT (first_at AT TIME ZONE 'America/Chicago')::date AS day_ct,
       count(DISTINCT enrollment_id) AS people,
       count(*) FILTER (WHERE event = 'seen') AS seen,
       count(*) FILTER (WHERE event = 'open' AND source = 'feed') AS feed_opens,
       count(*) FILTER (WHERE event = 'open' AND source = 'banner') AS banner_opens
FROM today_card_events WHERE first_at >= now() - make_interval(days => :days)
GROUP BY 1 ORDER BY 1;

\echo '== V2 ad Explorers, first 24h after entering: cards seen and opened per person'
SELECT count(*) AS people,
       round(avg(seen), 1) AS avg_seen,
       count(*) FILTER (WHERE seen > 0) AS saw_any_card,
       count(*) FILTER (WHERE feed_opens > 0) AS opened_from_feed,
       count(*) FILTER (WHERE banner_opens > 0) AS opened_from_banner
FROM (
  SELECT b.id,
         count(e.*) FILTER (WHERE e.event = 'seen') AS seen,
         count(e.*) FILTER (WHERE e.event = 'open' AND e.source = 'feed') AS feed_opens,
         count(e.*) FILTER (WHERE e.event = 'open' AND e.source = 'banner') AS banner_opens
  FROM audit_base b
  LEFT JOIN today_card_events e ON e.enrollment_id = b.id AND e.first_at < b.entered_at + interval '24 hours'
  WHERE b.channel = 'ad' AND b.entered_at >= now() - make_interval(days => :days)
    AND b.entered_at < now() - interval '24 hours'
  GROUP BY b.id
) t;

\echo '== V3 seen and opened from the feed, by item type (all learners): seen-and-skipped vs opened'
SELECT COALESCE(i.item_type, '(unknown)') AS item_type,
       count(*) FILTER (WHERE s.event = 'seen') AS seen,
       count(o.ref) FILTER (WHERE s.event = 'seen') AS seen_then_opened,
       round(100.0 * count(o.ref) FILTER (WHERE s.event = 'seen') / NULLIF(count(*) FILTER (WHERE s.event = 'seen'), 0), 1) AS open_pct
FROM today_card_events s
LEFT JOIN today_card_events o
  ON o.enrollment_id = s.enrollment_id AND o.ref = s.ref AND o.event = 'open' AND o.source = 'feed'
LEFT JOIN LATERAL (
  SELECT COALESCE(f.item->>'type', f.provider, f.kind) AS item_type
  FROM today_feed_impressions f WHERE f.enrollment_id = s.enrollment_id AND f.ref = s.ref LIMIT 1
) i ON true
WHERE s.event = 'seen' AND s.first_at >= now() - make_interval(days => :days)
GROUP BY 1 ORDER BY 2 DESC;
