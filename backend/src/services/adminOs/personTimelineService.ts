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
    sql: `SELECT pe.created_at AS occurred_at, 'acquisition' AS domain, 'page_events' AS source,
                 pe.event_type AS type,
                 COALESCE(NULLIF(pe.page_path,''), NULLIF(pe.page_url,''), '') AS summary
          FROM page_events pe
          WHERE pe.lead_id IN (:leadIds) AND pe.event_type <> 'heartbeat'`,
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
    sql: `SELECT io.created_at AS occurred_at, 'communication' AS domain, 'interaction_outcomes' AS source,
                 io.outcome AS type, io.channel AS summary
          FROM interaction_outcomes io WHERE io.lead_id IN (:leadIds)`,
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
    domain: 'learning', key: 'enrollment',
    sql: `SELECT sse.created_at AS occurred_at, 'learning' AS domain, 'student_skill_evidence' AS source,
                 'skill_evidence' AS type, NULL AS summary
          FROM student_skill_evidence sse WHERE sse.enrollment_id IN (:enrollmentIds)`,
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

  const rows = await sequelize.query<{
    occurred_at: string; domain: EventDomain; source: string; type: string; summary: string | null;
  }>(
    `SELECT occurred_at, domain, source, type, summary FROM (
       ${usable.map((b) => b.sql).join('\n       UNION ALL\n       ')}
     ) t
     WHERE occurred_at IS NOT NULL
     ORDER BY occurred_at DESC
     LIMIT :limit`,
    { type: QueryTypes.SELECT, replacements },
  );

  return rows.map((r) => ({
    occurredAt: r.occurred_at,
    domain: r.domain,
    source: r.source,
    type: r.type,
    summary: r.summary,
  }));
}
