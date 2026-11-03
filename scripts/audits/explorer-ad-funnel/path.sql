-- Explorer ad-funnel audit, C101: the path new ad Explorers take through the campus.
--
-- Source: campus_room_visits, one row per building ENTERED (an area change, or a return after the 90 s presence
-- window), written from the C101 release on. Earlier signups have no rows by construction: campus_presence only ever
-- held where someone was LAST. A learner who turned off "Show which building I'm in" is never recorded.
--
-- "First session" = visits within 60 minutes of the learner's first recorded visit.

\if :{?days}
\else
  \set days 14
\endif

CREATE TEMP TABLE pv AS
SELECT v.enrollment_id, v.area, v.entered_at,
       row_number() OVER (PARTITION BY v.enrollment_id ORDER BY v.entered_at, v.id) AS step,
       lead(v.area) OVER (PARTITION BY v.enrollment_id ORDER BY v.entered_at, v.id) AS next_area,
       min(v.entered_at) OVER (PARTITION BY v.enrollment_id) AS first_visit
FROM campus_room_visits v
JOIN audit_base b ON b.id = v.enrollment_id
WHERE b.channel = 'ad' AND v.entered_at >= now() - make_interval(days => :days);

\echo '== P1 coverage: ad Explorers with any recorded visit, and visits per person'
SELECT count(DISTINCT enrollment_id) AS people, count(*) AS visits,
       round(count(*)::numeric / NULLIF(count(DISTINCT enrollment_id), 0), 1) AS visits_per_person
FROM pv;

\echo '== P2 first building entered'
SELECT area, count(*) AS people FROM pv WHERE step = 1 GROUP BY 1 ORDER BY 2 DESC;

\echo '== P3 first session: room-to-room moves (from -> to), most common first'
SELECT area AS from_area, COALESCE(next_area, '(left campus)') AS to_area, count(*) AS moves
FROM pv WHERE entered_at < first_visit + interval '60 minutes'
GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 25;

\echo '== P4 first session: how many different buildings each person entered'
SELECT n_buildings, count(*) AS people FROM (
  SELECT enrollment_id, count(DISTINCT area) AS n_buildings FROM pv
  WHERE entered_at < first_visit + interval '60 minutes' GROUP BY 1) t
GROUP BY 1 ORDER BY 1;

\echo '== P5 last building before leaving (first session), and whether they finished a first lesson'
SELECT last_area, count(*) AS people,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM audit_first_win w WHERE w.enrollment_id = t.enrollment_id)) AS first_win
FROM (
  SELECT DISTINCT ON (enrollment_id) enrollment_id, area AS last_area
  FROM pv WHERE entered_at < first_visit + interval '60 minutes'
  ORDER BY enrollment_id, entered_at DESC) t
GROUP BY 1 ORDER BY 2 DESC;
