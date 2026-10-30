-- Explorer ad-funnel audit: who signed up, from where, and how far each channel got. Run through run.sh.

\echo '== F1 signups by channel and week'
SELECT channel, date_trunc('week', entered_at)::date AS week, count(*) AS people
FROM audit_base GROUP BY 1, 2 ORDER BY 2, 1;

\echo '== F2 ad signups by source / medium / campaign'
SELECT utm_source, utm_medium, utm_campaign, count(*) AS people
FROM audit_base WHERE channel = 'ad' GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 20;

\echo '== F3 ad landing pages: sessions and how many became leads (anonymous funnel)'
SELECT v.entry_page, count(DISTINCT v.id) AS ad_sessions, count(DISTINCT v.lead_id) AS became_leads
FROM visitor_sessions v
WHERE v.started_at >= :'since'
  AND (v.fbclid IS NOT NULL OR v.gclid IS NOT NULL
       OR lower(COALESCE(v.utm_source, '')) ~ '(facebook|^fb|instagram|^ig|meta|google|linkedin|tiktok)')
GROUP BY 1 ORDER BY 2 DESC LIMIT 10;

\echo '== F4 stage funnel per channel (people, not events)'
SELECT b.channel,
  count(*) AS signed_up,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM campus_presence cp WHERE cp.enrollment_id = b.id)) AS reached_campus,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM campus_tour_progress t WHERE t.enrollment_id = b.id AND t.tour = 'explorer')) AS tour_started,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM campus_tour_progress t WHERE t.enrollment_id = b.id AND t.tour = 'explorer' AND t.finished_at IS NOT NULL)) AS tour_finished,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM audit_first_win w WHERE w.enrollment_id = b.id)) AS first_win,
  count(*) FILTER (WHERE (SELECT count(*) FROM timeline_card_progress c WHERE c.enrollment_id = b.id AND c.status = 'completed') >= 3) AS three_cards,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM student_points_events s WHERE s.enrollment_id = b.id AND s.event_type = 'open_house_rsvp')) AS rsvp,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM campus_admissions_bookings a WHERE a.enrollment_id = b.id AND a.status = 'booked')) AS call_booked,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM subscriptions s JOIN enrollments e2 ON e2.id = s.enrollment_id WHERE lower(e2.email) = b.email)) AS checkout_started,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM subscriptions s JOIN enrollments e2 ON e2.id = s.enrollment_id WHERE lower(e2.email) = b.email AND s.status = 'active' AND s.plan <> 'comp')) AS paid
FROM audit_base b GROUP BY 1 ORDER BY 1;

\echo '== F5 explorer tour: furthest stop reached (recorded since 2026-10-26)'
SELECT b.channel, t.furthest_stop, t.total_stops, count(*) AS people
FROM audit_base b JOIN campus_tour_progress t ON t.enrollment_id = b.id AND t.tour = 'explorer'
GROUP BY 1, 2, 3 ORDER BY 1, 3, 2;

\echo '== F6 where on campus each person was last seen (one row per person, overwritten on every move)'
SELECT b.channel, cp.area, count(*) AS people
FROM audit_base b JOIN campus_presence cp ON cp.enrollment_id = b.id
GROUP BY 1, 2 ORDER BY 1, 3 DESC;

\echo '== F7 Explorer Growth state'
SELECT b.channel, p.primary_state, count(*) AS people
FROM audit_base b LEFT JOIN explorer_journey_profiles p ON p.enrollment_id = b.id
GROUP BY 1, 2 ORDER BY 1, 3 DESC;
