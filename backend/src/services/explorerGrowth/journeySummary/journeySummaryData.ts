/**
 * Read everything the journey card needs, for every Explorer lead we can write
 * to (T208).
 *
 * ALL OR NOTHING, PER LEAD. If any part of a lead's read fails, that lead is
 * skipped and nothing is written for it. Agreed with Kes on 2026-11-24: a stale
 * card is recoverable, a card silently rebuilt from half the data is not,
 * because Rose and Taiwo are told to read it before every call and cannot tell
 * a thin card from a quiet lead.
 *
 * WHAT THE SOURCES CAN AND CANNOT SAY, measured on production 2026-11-27 across
 * 1,278 Explorer profiles. These are the reasons this file reads what it reads:
 *
 *   interest   `affinities` is the topical interest by design but is populated
 *              on ZERO profiles, and `signal_summary` holds numeric tiers, not
 *              topics. So the only honest topical source is the lead's own
 *              `interest_area`, which is present on roughly 4 in 183. Most
 *              cards will therefore have no INTERESTED IN line, and that is
 *              correct rather than a gap to paper over.
 *   events     `sent` from `scheduled_emails`; `opened` / `clicked` from
 *              `interaction_outcomes`, which is live (opens recorded the same
 *              day this was written). `replied` is NOT read: zero rows for
 *              Explorer leads and none repo-wide since 2026-07-29.
 *   signals    reused from `explorerOutreachRanking.reasonsFor` via
 *              `getOutreach`, the only tested thing in the repo that writes
 *              caller-facing sentences about an Explorer. Not reimplemented.
 *   next step  `explorer_journey_decisions`, present for 153 of 1,278. Absent
 *              for the rest, so the section is usually omitted.
 *   caution    `leads.status` against `SUPPRESSED_LEAD_STATUSES`, the strictest
 *              list in the repo. NOT `contactability`, which is populated on
 *              zero profiles, and NOT `consent_contact`, which is false for
 *              1,074 of 1,278 because it gates branded EMAIL. Rendering that as
 *              a phone warning would tell two callers to skip 84% of the queue
 *              on a misreading.
 */
import { QueryTypes } from 'sequelize';
import sequelize from '../../../config/database';
import { SUPPRESSED_LEAD_STATUSES } from '../explorerContactabilityService';
import { getOutreach } from '../explorerCampusService';
import { JourneyEvent, JourneySummaryInput } from './journeySummaryTypes';

/** How far back a card looks. Older history is counted, not printed. */
export const EVENT_WINDOW_DAYS = 180;

/** A decision older than this is not a "next step" any more. */
export const DECISION_FRESH_DAYS = 30;

/** Enough to cover the whole Explorer pool in one pass. */
const POOL_LIMIT = 10000;

export interface JourneyTarget {
  leadId: number;
  /** Where to write. Null-checked by the query, so always present here. */
  ghlContactId: string;
  /** Decides which GHL sub-account, and therefore which key. */
  leadSource: string | null;
  input: JourneySummaryInput;
}

interface BaseRow {
  lead_id: number;
  enrollment_id: string | null;
  email_normalized: string | null;
  ghl_contact_id: string;
  lead_source: string | null;
  lead_status: string | null;
  interest_area: string | null;
}

interface EventRow {
  lead_id: number;
  at: Date;
  kind: JourneyEvent['kind'];
  subject: string | null;
}

interface DecisionRow {
  enrollment_id: string;
  selected_action: string | null;
  reason: string | null;
  decision_date: Date;
}

const BASE_SQL = `
  SELECT p.lead_id,
         p.enrollment_id,
         p.email_normalized,
         l.ghl_contact_id,
         l.source      AS lead_source,
         l.status      AS lead_status,
         l.interest_area
    FROM explorer_journey_profiles p
    JOIN leads l ON l.id = p.lead_id
   WHERE p.lead_id IS NOT NULL
     AND l.ghl_contact_id IS NOT NULL
     AND l.ghl_contact_id <> ''
`;

/**
 * Sends and engagement in one pass, newest first.
 *
 * The two halves are deliberately separate rows rather than a join that would
 * collapse them: "we emailed on the 20th" and "they opened it on the 25th" are
 * two things a caller wants to see, not one.
 */
const EVENTS_SQL = `
  SELECT s.lead_id,
         s.sent_at AS at,
         'sent'::text AS kind,
         s.subject
    FROM scheduled_emails s
   WHERE s.sent_at IS NOT NULL
     AND s.channel = 'email'
     AND s.sent_at > now() - (:windowDays * interval '1 day')
     AND s.lead_id IS NOT NULL
  UNION ALL
  SELECT io.lead_id,
         io.created_at AS at,
         io.outcome::text AS kind,
         se.subject
    FROM interaction_outcomes io
    LEFT JOIN scheduled_emails se ON se.id = io.scheduled_email_id
   WHERE io.outcome IN ('opened', 'clicked')
     AND io.created_at > now() - (:windowDays * interval '1 day')
     AND io.lead_id IS NOT NULL
   ORDER BY at DESC
`;

const DECISIONS_SQL = `
  SELECT DISTINCT ON (d.enrollment_id)
         d.enrollment_id, d.selected_action, d.reason, d.decision_date
    FROM explorer_journey_decisions d
   WHERE d.decision_date > (now() - (:freshDays * interval '1 day'))::date
   ORDER BY d.enrollment_id, d.decision_date DESC
`;

function groupBy<T, K>(rows: T[], key: (r: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = out.get(k);
    if (list) list.push(r);
    else out.set(k, [r]);
  }
  return out;
}

/** Plain words for an action code, falling back to the code rather than hiding it. */
export function actionLabel(action: string | null): string {
  if (!action) return 'Follow up';
  const map: Record<string, string> = {
    SEND_EMAIL: 'Send the next email',
    RECOMMEND_LESSON: 'Recommend a lesson',
    HOLD: 'Hold, no action',
  };
  return map[action] ?? action;
}

/**
 * Build the inputs for every writable Explorer lead.
 *
 * Throws only if a whole source fails, which means the run should abort rather
 * than write a pass of thin cards. A failure for ONE lead is impossible here by
 * construction: every per-lead value is derived from rows already in memory.
 */
export async function loadJourneyTargets(
  now: Date = new Date(),
): Promise<JourneyTarget[]> {
  const base = await sequelize.query<BaseRow>(BASE_SQL, { type: QueryTypes.SELECT });
  if (base.length === 0) return [];

  const events = await sequelize.query<EventRow>(EVENTS_SQL, {
    type: QueryTypes.SELECT,
    replacements: { windowDays: EVENT_WINDOW_DAYS },
  });

  const decisions = await sequelize.query<DecisionRow>(DECISIONS_SQL, {
    type: QueryTypes.SELECT,
    replacements: { freshDays: DECISION_FRESH_DAYS },
  });

  // Reuse the tested caller-facing sentences rather than writing a second voice
  // for the same facts. 'engaged' is the widest view: it excludes only CONVERTED.
  const outreach = await getOutreach('engaged', POOL_LIMIT, { now: now.getTime() });

  const eventsByLead = groupBy(events, (e) => e.lead_id);
  const decisionByEnrollment = new Map(decisions.map((d) => [d.enrollment_id, d]));
  const reasonsByEmail = new Map(
    outreach.rows
      .filter((r) => r.email)
      .map((r) => [r.email.toLowerCase(), r.reasons]),
  );

  return base.map((row) => {
    const decision = row.enrollment_id
      ? decisionByEnrollment.get(row.enrollment_id) ?? null
      : null;

    const suppressed = row.lead_status
      && SUPPRESSED_LEAD_STATUSES.includes(row.lead_status);

    const input: JourneySummaryInput = {
      generatedAt: now,
      interest: row.interest_area?.trim() || null,
      signals: (row.email_normalized
        ? reasonsByEmail.get(row.email_normalized.toLowerCase())
        : undefined) ?? [],
      events: (eventsByLead.get(row.lead_id) ?? []).map((e) => ({
        at: new Date(e.at),
        kind: e.kind,
        subject: e.subject,
      })),
      nextStep: decision
        ? {
          action: actionLabel(decision.selected_action),
          reason: (decision.reason || '').trim() || 'No reason recorded',
          decidedOn: new Date(decision.decision_date),
        }
        : null,
      caution: suppressed ? { leadStatus: row.lead_status as string } : null,
    };

    return {
      leadId: row.lead_id,
      ghlContactId: row.ghl_contact_id,
      leadSource: row.lead_source,
      input,
    };
  });
}
