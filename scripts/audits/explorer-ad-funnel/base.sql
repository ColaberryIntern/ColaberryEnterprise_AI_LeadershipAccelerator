-- Explorer ad-funnel audit: the shared population. Included by every query file through run.sh; never run alone.
--
-- One row per Explorer who entered on or after :since. Channel comes from the Explorer's FIRST visitor session,
-- reached by lowercased email (enrollments -> leads -> visitor_sessions), because /portal/signup does not send
-- the ad's UTM tags (leads.utm_source is NULL for those signups; the ad data is on visitor_sessions).
--
--   ad        : a paid click id (fbclid, gclid, msclkid, ttclid) or a paid utm_source / utm_medium
--   non_ad    : tracked, but no paid signal
--   untracked : no visitor session joined (tracking blocked, or an account created off the site)
--
-- Excluded: the daily points smoke test's throwaway guests (@colaberry-test.local, pointsEarnSmoke.js),
-- which create a real Explorer and complete a card every day at 13:30 UTC.
--
-- Read-only: a TEMP VIEW inside a transaction that run.sh always rolls back.
\if :{?since}
\else
  \set since '2026-10-19'
\endif

CREATE TEMP VIEW audit_base AS
SELECT e.id,
       lower(e.email) AS email,
       COALESCE(e.explorer_entered_at, e.created_at) AS entered_at,
       l.id AS lead_id,
       vs.utm_source, vs.utm_medium, vs.utm_campaign, vs.entry_page,
       CASE
         WHEN vs.fbclid IS NOT NULL OR vs.gclid IS NOT NULL OR vs.msclkid IS NOT NULL OR vs.ttclid IS NOT NULL
           OR lower(COALESCE(vs.utm_source, '')) ~ '(facebook|^fb|instagram|^ig|meta|google|linkedin|tiktok)'
           OR lower(COALESCE(vs.utm_medium, '')) ~ '(cpc|paid|ppc|social_paid)'
         THEN 'ad'
         WHEN vs.lead_id IS NULL THEN 'untracked'
         ELSE 'non_ad'
       END AS channel
FROM enrollments e
LEFT JOIN LATERAL (SELECT id FROM leads l WHERE lower(l.email) = lower(e.email) ORDER BY id LIMIT 1) l ON true
LEFT JOIN LATERAL (SELECT * FROM visitor_sessions v WHERE v.lead_id = l.id ORDER BY started_at LIMIT 1) vs ON true
WHERE e.explorer_entered_at IS NOT NULL
  AND e.explorer_entered_at >= :'since'
  AND lower(e.email) NOT LIKE '%@colaberry-test.local';

-- "First win" = a learning completion in the points ledger. Must match FIRST_WIN_EVENT_TYPES in
-- backend/src/services/explorerFirstWin.ts.
CREATE TEMP VIEW audit_first_win AS
SELECT s.enrollment_id, min(s.created_at) AS first_win_at
FROM student_points_events s
WHERE s.event_type IN ('card_complete', 'knowledge_check', 'survey_complete', 'evaluation_passed',
                       'ambient_learning', 'deep_dive_field_guide')
GROUP BY s.enrollment_id;
