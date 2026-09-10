import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';

/**
 * The unified activity timeline — one ordered history of a person.
 *
 * The brief names this the centrepiece of the 360 profile: "chronological,
 * filterable, source-labeled events across acquisition, sales, communications,
 * commerce, learning, community, support, AI interactions, and admin actions",
 * and "the person profile shows verified pre-lead activity and post-enrollment
 * learning/customer activity in one ordered timeline".
 *
 * The first version of the profile shipped without it at all, which is most of
 * why it read as severely limited: four panels of single-row facts and no
 * history.
 *
 * ── HOW SOURCES ARE CHOSEN ──────────────────────────────────────────────────
 *
 * Every source below is a table that actually holds person-linked rows in
 * production, measured 2026-09-07 rather than assumed:
 *
 *   visitor_sessions 85,119   campaign_leads 22,167   page_events 18,052
 *   openclaw_responses 4,774  intent_scores 818       scheduled_emails 423
 *   behavioral_signals 400    xp_events 33            points 31
 *   interaction_outcomes 14   activities 4            communication_logs 3
 *
 * A source with no person key, or with zero rows, is not queried — an empty
 * branch in a UNION costs a scan and returns nothing.
 *
 * ── THE 2026-09-09 AUDIT ────────────────────────────────────────────────────
 *
 * A sweep of all 163 person-keyed tables found 60 holding rows for three sample
 * learners, against the 14 this file read. The programme's own record of what a
 * learner DID was absent: attendance, curriculum completion, assessments,
 * mentor conversations, artifacts, reflections, subscriptions and community
 * posts are all added below.
 *
 * That audit is now a repeatable procedure rather than a one-off — see the
 * `person-360` skill, which carries the query and the full source registry so
 * a table added next quarter shows up as a gap instead of silently missing.
 *
 * ── DOMAIN GATING ───────────────────────────────────────────────────────────
 *
 * Each event carries a domain, and a branch is only included when the caller's
 * sections grant that domain. A mentor does not get the sales history; a revenue
 * rep does not get the learning history. The filtering happens in the UNION
 * itself, so unpermitted events are never read, never mind returned.
 */

export type EventDomain =
  | 'acquisition' | 'sales' | 'communication' | 'commerce' | 'learning' | 'community';

export interface TimelineEvent {
  occurredAt: string;
  domain: EventDomain;
  /** The table this came from, so a reader can trace any row back. */
  source: string;
  type: string;
  summary: string | null;
  /**
   * How many identical events this row stands for. 1 for an ordinary event.
   *
   * A reader should never see the same line twice; when a source genuinely
   * records something N times in one second, the row says so instead.
   */
  occurrences: number;
}

export interface TimelineQuery {
  /** Resolved lead ids for this person. Empty means no acquisition history. */
  leadIds: number[];
  /** Enrolment ids this caller may see for this person. */
  enrollmentIds: string[];
  /** Which domains the caller's sections permit. */
  domains: readonly EventDomain[];
  limit?: number;
}

/** Which sections grant which timeline domain. Mirrors the profile's panels. */
const DOMAIN_SECTIONS: Record<EventDomain, readonly string[]> = {
  acquisition: ['leads', 'revenue', 'lead_ingestion', 'campaigns'],
  sales: ['leads', 'revenue', 'lead_ingestion'],
  communication: ['leads', 'revenue', 'campaigns', 'inbox_content'],
  commerce: ['revenue'],
  learning: ['students', 'program', 'career_review'],
  community: ['students', 'program'],
};

export function domainsForSections(sections: readonly string[]): EventDomain[] {
  return (Object.keys(DOMAIN_SECTIONS) as EventDomain[])
    .filter((d) => DOMAIN_SECTIONS[d].some((s) => sections.includes(s)));
}

interface Branch {
  domain: EventDomain;
  /** Needs lead ids ('lead') or enrolment ids ('enrollment'). */
  key: 'lead' | 'enrollment';
  sql: string;
}

/**
 * One SELECT per source, all shaped to the same four columns.
 *
 * Written out rather than generated: each source names its own event type and
 * builds its own human summary, and a generic mapper would flatten exactly the
 * detail that makes a timeline readable.
 */
const BRANCHES: Branch[] = [
  {
    domain: 'acquisition', key: 'lead',
    sql: `SELECT vs.started_at AS occurred_at, 'acquisition' AS domain, 'visitor_sessions' AS source,
                 'session' AS type,
                 COALESCE(NULLIF(vs.site_slug,''),'site') ||
                   ' · ' || COALESCE(vs.pageview_count,0)::text || ' pages' AS summary
          FROM visitor_sessions vs WHERE vs.lead_id IN (:leadIds)`,
  },
  {
    domain: 'acquisition', key: 'lead',
    // Grouped per MINUTE, not per row: three views of '/' seven seconds apart
    // are three real events but read as three duplicate lines. The count says
    // what happened without repeating the line.
    sql: `SELECT max(pe.created_at) AS occurred_at, 'acquisition' AS domain,
                 'page_events' AS source, pe.event_type AS type,
                 COALESCE(NULLIF(pe.page_path,''), NULLIF(pe.page_url,''), '(no path)') ||
                   CASE WHEN COUNT(*) > 1 THEN ' ×' || COUNT(*)::text ELSE '' END AS summary
          FROM page_events pe
          WHERE pe.lead_id IN (:leadIds) AND pe.event_type <> 'heartbeat'
          GROUP BY date_trunc('minute', pe.created_at), pe.event_type,
                   COALESCE(NULLIF(pe.page_path,''), NULLIF(pe.page_url,''), '(no path)')`,
  },
  {
    domain: 'acquisition', key: 'lead',
    sql: `SELECT bs.detected_at AS occurred_at, 'acquisition' AS domain, 'behavioral_signals' AS source,
                 bs.signal_type AS type,
                 'strength ' || COALESCE(bs.signal_strength,0)::text AS summary
          FROM behavioral_signals bs WHERE bs.lead_id IN (:leadIds)`,
  },
  {
    domain: 'sales', key: 'lead',
    sql: `SELECT isc.score_updated_at AS occurred_at, 'sales' AS domain, 'intent_scores' AS source,
                 'intent_' || COALESCE(isc.intent_level,'scored') AS type,
                 'score ' || COALESCE(isc.score,0)::text AS summary
          FROM intent_scores isc WHERE isc.lead_id IN (:leadIds)`,
  },
  {
    domain: 'sales', key: 'lead',
    sql: `SELECT a.created_at AS occurred_at, 'sales' AS domain, 'activities' AS source,
                 a.type::text AS type, a.subject AS summary
          FROM activities a WHERE a.lead_id IN (:leadIds)`,
  },
  {
    domain: 'communication', key: 'lead',
    sql: `SELECT cl.enrolled_at AS occurred_at, 'communication' AS domain, 'campaign_leads' AS source,
                 'campaign_' || COALESCE(cl.status,'enrolled') AS type,
                 'step ' || COALESCE(cl.current_step_index,0)::text ||
                   ' of ' || COALESCE(cl.total_steps,0)::text AS summary
          FROM campaign_leads cl WHERE cl.lead_id IN (:leadIds)`,
  },
  {
    domain: 'communication', key: 'lead',
    sql: `SELECT se.sent_at AS occurred_at, 'communication' AS domain, 'scheduled_emails' AS source,
                 COALESCE(se.channel,'email') || '_sent' AS type, se.subject AS summary
          FROM scheduled_emails se
          WHERE se.lead_id IN (:leadIds) AND se.sent_at IS NOT NULL`,
  },
  {
    domain: 'communication', key: 'lead',
    // Joined to the email it refers to. The summary was `io.channel` -- literally
    // the word "email" -- so two opens THREE DAYS APART rendered as identical
    // lines. They were never duplicates; the summary just said nothing.
    sql: `SELECT io.created_at AS occurred_at, 'communication' AS domain,
                 'interaction_outcomes' AS source, io.outcome AS type,
                 COALESCE(se.subject,
                          io.channel || CASE WHEN io.step_index IS NOT NULL
                            THEN ' · step ' || io.step_index::text ELSE '' END) AS summary
          FROM interaction_outcomes io
          LEFT JOIN scheduled_emails se ON se.id = io.scheduled_email_id
          WHERE io.lead_id IN (:leadIds)`,
  },
  {
    domain: 'communication', key: 'lead',
    sql: `SELECT clog.created_at AS occurred_at, 'communication' AS domain, 'communication_logs' AS source,
                 clog.channel || '_' || COALESCE(clog.status,'logged') AS type,
                 COALESCE(clog.subject, clog.to_address) AS summary
          FROM communication_logs clog WHERE clog.lead_id IN (:leadIds)`,
  },
  {
    domain: 'communication', key: 'lead',
    sql: `SELECT orp.posted_at AS occurred_at, 'communication' AS domain, 'openclaw_responses' AS source,
                 'outreach_' || COALESCE(orp.post_status,'drafted') AS type,
                 COALESCE(orp.platform,'') AS summary
          FROM openclaw_responses orp
          WHERE orp.lead_id IN (:leadIds) AND orp.posted_at IS NOT NULL`,
  },
  {
    domain: 'commerce', key: 'enrollment',
    sql: `SELECT r.created_at AS occurred_at, 'commerce' AS domain, 'refunds' AS source,
                 'refund_' || COALESCE(r.status,'issued') AS type,
                 '$' || ROUND(COALESCE(r.amount_cents,0)/100.0, 2)::text AS summary
          FROM refunds r WHERE r.enrollment_id IN (:enrollmentIds)`,
  },
  {
    domain: 'learning', key: 'enrollment',
    sql: `SELECT x.created_at AS occurred_at, 'learning' AS domain, 'xp_events' AS source,
                 'xp_' || COALESCE(x.stream,'earned') AS type,
                 COALESCE(x.reason,'') || ' (+' || COALESCE(x.amount,0)::text || ')' AS summary
          FROM xp_events x WHERE x.enrollment_id IN (:enrollmentIds)`,
  },
  {
    domain: 'learning', key: 'enrollment',
    sql: `SELECT sp.created_at AS occurred_at, 'learning' AS domain, 'student_points_events' AS source,
                 sp.event_type AS type,
                 COALESCE(sp.event_key,'') || ' (+' || COALESCE(sp.points,0)::text || ')' AS summary
          FROM student_points_events sp WHERE sp.enrollment_id IN (:enrollmentIds)`,
  },
  {
    // ── COLLAPSED PER CARD, NOT PER ROW ─────────────────────────────────────
    //
    // Completing ONE card writes a row per (skill × band) — measured at 7-8
    // rows landing within the same second, all carrying the same source_ref.
    // Emitted one-per-row with a NULL summary, that rendered as eight identical
    // lines and buried the card completion they belonged to (Ali, 2026-09-09:
    // "Remove all the duplicates from the Activity Timeline").
    //
    // They were never duplicates — each credits a different skill. The defect
    // was throwing that away and then showing the husk eight times. Grouped by
    // the card, the whole fan-out becomes one line that says which skills it
    // credited.
    domain: 'learning', key: 'enrollment',
    sql: `SELECT max(sse.created_at) AS occurred_at, 'learning' AS domain,
                 'student_skill_evidence' AS source, 'skill_evidence' AS type,
                 string_agg(DISTINCT sse.skill_id, ', ' ORDER BY sse.skill_id) ||
                   ' (+' || round(COALESCE(SUM(sse.credit), 0))::text || ')' AS summary
          FROM student_skill_evidence sse
          WHERE sse.enrollment_id IN (:enrollmentIds)
          -- COALESCE so a row with no source_ref stands alone rather than being
          -- lumped in with every other unattributed row.
          GROUP BY sse.enrollment_id, COALESCE(sse.source_ref, sse.id::text)`,
  },
  // ── Added 2026-09-09 ──────────────────────────────────────────────────────
  //
  // The audit of every person-keyed table found the programme's own record of
  // what a learner did was missing entirely. timeline_card_progress alone holds
  // more rows for three people than every branch above it combined.
  {
    domain: 'learning', key: 'enrollment',
    sql: `SELECT ar.created_at AS occurred_at, 'learning' AS domain, 'attendance_records' AS source,
                 'class_' || ar.status::text AS type,
                 COALESCE(ls.title, 'Live session') ||
                   CASE WHEN ar.duration_minutes IS NOT NULL
                        THEN ' · ' || ar.duration_minutes::text || ' min' ELSE '' END AS summary
          FROM attendance_records ar
          LEFT JOIN live_sessions ls ON ls.id = ar.session_id
          WHERE ar.enrollment_id IN (:enrollmentIds)`,
  },
  {
    domain: 'learning', key: 'enrollment',
    sql: `SELECT tcp.completed_at AS occurred_at, 'learning' AS domain, 'timeline_card_progress' AS source,
                 'card_completed' AS type,
                 COALESCE(tc.title, 'Curriculum card') ||
                   CASE WHEN tc.week IS NOT NULL THEN ' · week ' || tc.week::text ELSE '' END AS summary
          FROM timeline_card_progress tcp
          LEFT JOIN timeline_cards tc ON tc.id = tcp.card_id
          WHERE tcp.enrollment_id IN (:enrollmentIds) AND tcp.completed_at IS NOT NULL`,
  },
  {
    domain: 'learning', key: 'enrollment',
    sql: `SELECT raa.submitted_at AS occurred_at, 'learning' AS domain, 'runtime_assessment_attempts' AS source,
                 CASE WHEN raa.passed THEN 'assessment_passed' ELSE 'assessment_attempted' END AS type,
                 COALESCE(raa.kind, 'assessment') ||
                   CASE WHEN raa.score IS NOT NULL
                        THEN ' · ' || ROUND(raa.score::numeric, 1)::text ELSE '' END AS summary
          FROM runtime_assessment_attempts raa
          WHERE raa.enrollment_id IN (:enrollmentIds) AND raa.submitted_at IS NOT NULL`,
  },
  {
    domain: 'learning', key: 'enrollment',
    sql: `SELECT rmt.created_at AS occurred_at, 'learning' AS domain, 'runtime_mentor_turns' AS source,
                 'mentor_' || COALESCE(rmt.mode, 'turn') AS type,
                 left(rmt.question, 140) AS summary
          FROM runtime_mentor_turns rmt WHERE rmt.enrollment_id IN (:enrollmentIds)`,
  },
  {
    domain: 'learning', key: 'enrollment',
    sql: `SELECT rpa.created_at AS occurred_at, 'learning' AS domain, 'runtime_portfolio_artifacts' AS source,
                 'artifact_' || COALESCE(rpa.kind, 'created') AS type, rpa.title AS summary
          FROM runtime_portfolio_artifacts rpa WHERE rpa.enrollment_id IN (:enrollmentIds)`,
  },
  {
    domain: 'learning', key: 'enrollment',
    sql: `SELECT re.created_at AS occurred_at, 'learning' AS domain, 'reflection_entries' AS source,
                 'reflection' AS type,
                 CASE WHEN re.week IS NOT NULL THEN 'week ' || re.week::text ELSE 'reflection' END ||
                   CASE WHEN re.readiness IS NOT NULL
                        THEN ' · readiness ' || re.readiness::text ELSE '' END AS summary
          FROM reflection_entries re WHERE re.enrollment_id IN (:enrollmentIds)`,
  },
  {
    domain: 'commerce', key: 'enrollment',
    sql: `SELECT s.created_at AS occurred_at, 'commerce' AS domain, 'subscriptions' AS source,
                 'subscription_' || COALESCE(s.status, 'recorded') AS type,
                 COALESCE(s.plan, 'plan') ||
                   CASE WHEN s.amount_cents IS NOT NULL
                        THEN ' · $' || ROUND(s.amount_cents/100.0, 2)::text ELSE '' END AS summary
          FROM subscriptions s WHERE s.enrollment_id IN (:enrollmentIds)`,
  },
  {
    domain: 'community', key: 'enrollment',
    sql: `SELECT cp.created_at AS occurred_at, 'community' AS domain, 'community_posts' AS source,
                 'post_' || COALESCE(cp.category, 'published') AS type,
                 left(cp.body, 140) AS summary
          FROM community_posts cp
          WHERE cp.member_id IN (
            SELECT cm.id FROM community_members cm WHERE cm.enrollment_id IN (:enrollmentIds)
          )`,
  },
];

const MAX_LIMIT = 500;

/**
 * Read the timeline.
 *
 * Only branches the caller may see AND that have keys to match on are unioned.
 * A person with no lead rows contributes no acquisition branches, which is the
 * difference between "no history" and a query that scans every table for
 * nothing.
 */
export async function getPersonTimeline(query: TimelineQuery): Promise<TimelineEvent[]> {
  const limit = Math.min(Math.max(query.limit ?? 100, 1), MAX_LIMIT);

  const usable = BRANCHES.filter((b) => {
    if (!query.domains.includes(b.domain)) return false;
    if (b.key === 'lead') return query.leadIds.length > 0;
    return query.enrollmentIds.length > 0;
  });

  if (usable.length === 0) return [];

  const replacements: Record<string, unknown> = { limit };
  if (query.leadIds.length) replacements.leadIds = query.leadIds;
  if (query.enrollmentIds.length) replacements.enrollmentIds = query.enrollmentIds;

  // ── IDENTICAL EVENTS COLLAPSE INTO ONE ROW WITH A COUNT ───────────────────
  //
  // A general safeguard, not a fix for one source. Any branch that emits rows
  // indistinguishable to a reader — same second, same domain, same type, same
  // summary — is collapsed and carries `occurrences` instead of repeating.
  //
  // Grouped on the SECOND rather than the exact instant, because a fan-out
  // writes its rows milliseconds apart; grouping on the raw timestamp would
  // leave them looking like duplicates while technically being distinct.
  //
  // Anything with a different summary survives as its own row: two xp_events in
  // the same second reading 'community:survey' and 'learning:survey' are two
  // real facts and stay two lines.
  const rows = await sequelize.query<{
    occurred_at: string; domain: EventDomain; source: string;
    type: string; summary: string | null; occurrences: number;
  }>(
    `SELECT max(occurred_at) AS occurred_at, domain, source, type, summary,
            COUNT(*)::int AS occurrences
     FROM (
       ${usable.map((b) => b.sql).join('\n       UNION ALL\n       ')}
     ) t
     WHERE occurred_at IS NOT NULL
     GROUP BY date_trunc('second', occurred_at), domain, source, type, summary
     ORDER BY max(occurred_at) DESC
     LIMIT :limit`,
    { type: QueryTypes.SELECT, replacements },
  );

  return rows.map((r) => ({
    occurredAt: r.occurred_at,
    domain: r.domain,
    source: r.source,
    type: r.type,
    summary: r.summary,
    occurrences: Number(r.occurrences ?? 1),
  }));
}
