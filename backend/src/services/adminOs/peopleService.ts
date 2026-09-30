import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { LifecycleStage } from './lifecycle';
import { visibleStagesForSections } from './personScope';

/**
 * The People roster — one row per person, not per record.
 *
 * ── SCOPE IS ENFORCED IN THE QUERY ──────────────────────────────────────────
 *
 * The section gate answers "may you open People". It does NOT answer "whose
 * rows come back", and for a 360 view those are different questions. Support
 * holds only `students`, so it may open this surface — and without a row-level
 * filter the roster would hand it the entire acquisition database.
 *
 * So the caller's sections are turned into a lifecycle stage list and that list
 * is applied inside the SQL. Filtering in the API layer after selecting
 * everything would still ship the rows over the wire, and filtering in the UI
 * would ship them to the browser. Neither is access control.
 *
 * ── WHAT A PERSON IS HERE ───────────────────────────────────────────────────
 *
 * People we can name: leads and enrolments, keyed on normalised email — the
 * same key `identityResolution.normalizeEmail` uses, because a roster that
 * grouped differently from the matcher would disagree with the profile about
 * who is who.
 *
 * Anonymous visitors are deliberately excluded. 1,842 visitor rows against 63
 * with a lead means the roster would be almost entirely unnamed fingerprints,
 * and a fingerprint is not yet a person.
 *
 * ── STAGES THIS CAN AND CANNOT COMPUTE ──────────────────────────────────────
 *
 * `lapsed` is the stage this expression was missing, and getting it wrong was
 * expensive: before 2026-09-09 someone with a WITHDRAWN enrolment read as
 * `enrolled_student`, so the active-student count included 62 people who had
 * already left. For a business whose goal is keeping subscriptions active, that
 * is the one number that must not be flattering.
 *
 * `graduate` is never assigned, and that is the business model rather than a
 * gap: this is a subscription, so there is no completion — someone who stops has
 * LAPSED, not finished. See lifecycle.ts.
 *
 * `active_learner` and `returning_customer` are also never assigned: attendance
 * is unreliable, and there is no local payments source.
 */

export interface PersonRow {
  email: string;
  name: string | null;
  stage: LifecycleStage;
  /** Enrolment status when they have one, so 'withdrawn' is visible not hidden. */
  enrollmentStatus: string | null;
  /**
   * Whether this person can be traced back to an acquisition record.
   *
   * False for the 86 enrolments that match no lead. Surfaced per row rather than
   * only in an aggregate, because "we don't know where this student came from"
   * is a fact about that student that a reader should see on their line.
   */
  tracedToLead: boolean;
  firstSeen: string | null;
  lastSeen: string | null;
}

export interface PeopleRoster {
  rows: PersonRow[];
  total: number;
  /** The stages this caller may see, echoed back so the UI can say so. */
  visibleStages: LifecycleStage[];
  limit: number;
  offset: number;
}

export interface PeopleQuery {
  sections: readonly string[];
  search?: string;
  stage?: LifecycleStage;
  /** Only people with no acquisition record. Powers the identity-coverage drill-down. */
  untracedOnly?: boolean;
  /**
   * Only people enrolled in this campaign (campaign_leads), optionally in one of these
   * statuses. Powers the Campaign 360 KPI drill-downs: the roster must count exactly what the
   * card counted, which is campaign_leads rows by status.
   */
  campaignId?: string;
  campaignStatuses?: readonly CampaignLeadStatus[];
  limit?: number;
  offset?: number;
}

export const CAMPAIGN_LEAD_STATUSES = ['enrolled', 'active', 'paused', 'completed', 'removed'] as const;
export type CampaignLeadStatus = (typeof CAMPAIGN_LEAD_STATUSES)[number];

const MAX_LIMIT = 200;

/**
 * The stage expression, written once.
 *
 * Order matters: the most advanced evidence wins, so someone who is both a lead
 * and an enrolment reads as enrolled_student rather than as a lead.
 */
const STAGE_SQL = `
  CASE
    WHEN e.status = 'withdrawn' THEN 'lapsed'
    WHEN e.email IS NOT NULL THEN 'enrolled_student'
    WHEN l.pipeline_stage IS NOT NULL AND l.pipeline_stage <> 'new_lead' THEN 'applicant'
    ELSE 'lead'
  END`;
// Only three stages are reachable from leads and enrolments, and that is the
// honest set. 'identified_visitor' belongs to a VISITOR resolved to a lead — a
// different record entirely — and assigning it here would put people in a stage
// this query has no evidence for. 'graduate' and 'active_learner' cannot be
// computed at all (no completion status; attendance unreliable), and
// 'returning_customer' has no payment source, so none of them are guessed at.

/**
 * Read a page of the roster.
 *
 * Every filter is parameterised. None of `search`, `stage` or the scope list is
 * interpolated into the statement, because all three are caller-controlled and
 * one of them is the access control.
 */
export async function getPeopleRoster(query: PeopleQuery): Promise<PeopleRoster> {
  const visibleStages = visibleStagesForSections(query.sections);

  // Deny by default. No stages means no rows — not "all rows", which is what an
  // empty IN list would silently become if it were interpolated.
  if (visibleStages.length === 0) {
    return {
      rows: [],
      total: 0,
      visibleStages: [],
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    };
  }

  const limit = Math.min(Math.max(query.limit ?? 50, 1), MAX_LIMIT);
  const offset = Math.max(query.offset ?? 0, 0);

  const base = `
    FROM (
      SELECT lower(btrim(l.email)) AS email,
             max(l.name) AS name,
             max(l.pipeline_stage) AS pipeline_stage,
             min(l.created_at) AS first_seen,
             max(l.created_at) AS last_seen
      FROM leads l
      WHERE l.email IS NOT NULL AND btrim(l.email) <> '' AND position('@' in l.email) > 0
      GROUP BY lower(btrim(l.email))
    ) l
    FULL OUTER JOIN (
      SELECT lower(btrim(e.email)) AS email,
             max(e.full_name) AS name,
             -- Any CURRENT enrolment outranks a withdrawn one. Written as
             -- bool_or because max() is ALPHABETICAL: 'withdrawn' > 'active',
             -- so re-enrolled people were counted as lapsed. That mislabelled
             -- 29 of the 53 the roster reported on 2026-09-08.
             CASE
               WHEN bool_or(e.status::text = 'active') THEN 'active'
               WHEN bool_or(e.status::text = 'completed') THEN 'completed'
               ELSE 'withdrawn'
             END AS status,
             min(e.created_at) AS first_seen,
             max(e.created_at) AS last_seen
      FROM enrollments e
      WHERE e.email IS NOT NULL AND btrim(e.email) <> '' AND position('@' in e.email) > 0
      GROUP BY lower(btrim(e.email))
    ) e ON e.email = l.email
  `;

  // IN, not `= ANY`. Sequelize expands an array replacement into a bare comma
  // list — 'lead','applicant' — so `= ANY(:stages)` renders as
  // `= ANY('lead','applicant')`, which is a syntax error at the comma. IN takes
  // exactly that comma list.
  //
  // This shipped broken because the unit tests mock sequelize.query and assert
  // on the SQL TEXT, so the statement was never executed by anything until it
  // reached production. Asserting the string is not the same as running the
  // query, and only the second one proves it works.
  const filters: string[] = [`(${STAGE_SQL}) IN (:stages)`];
  const replacements: Record<string, unknown> = { stages: visibleStages, limit, offset };

  if (query.stage) {
    filters.push(`(${STAGE_SQL}) = :stage`);
    replacements.stage = query.stage;
  }
  if (query.untracedOnly) {
    // The 86: an enrolment with no matching lead.
    filters.push('e.email IS NOT NULL AND l.email IS NULL');
  }
  if (query.campaignId) {
    // Membership is by campaign_leads, joined back to the lead's email so it lines up with
    // the roster's own identity key. Statuses are an IN over a bound list, never text.
    const statuses = (query.campaignStatuses ?? []).filter((s) => (CAMPAIGN_LEAD_STATUSES as readonly string[]).includes(s));
    filters.push(
      `l.email IN (SELECT lower(btrim(ld.email)) FROM campaign_leads cl JOIN leads ld ON ld.id = cl.lead_id`
      + ` WHERE cl.campaign_id = :campaignId${statuses.length > 0 ? ' AND cl.status IN (:campaignStatuses)' : ''})`,
    );
    replacements.campaignId = query.campaignId;
    if (statuses.length > 0) replacements.campaignStatuses = statuses;
  }
  if (query.search && query.search.trim()) {
    filters.push('(COALESCE(l.email, e.email) ILIKE :search OR COALESCE(e.name, l.name) ILIKE :search)');
    replacements.search = `%${query.search.trim()}%`;
  }

  const where = `WHERE ${filters.join(' AND ')}`;

  const rows = await sequelize.query<PersonRow & { stage: LifecycleStage }>(
    `SELECT COALESCE(l.email, e.email) AS email,
            COALESCE(e.name, l.name) AS name,
            (${STAGE_SQL}) AS stage,
            e.status AS "enrollmentStatus",
            (l.email IS NOT NULL) AS "tracedToLead",
            LEAST(COALESCE(l.first_seen, e.first_seen), COALESCE(e.first_seen, l.first_seen)) AS "firstSeen",
            GREATEST(COALESCE(l.last_seen, e.last_seen), COALESCE(e.last_seen, l.last_seen)) AS "lastSeen"
     ${base} ${where}
     ORDER BY "lastSeen" DESC NULLS LAST
     LIMIT :limit OFFSET :offset`,
    { type: QueryTypes.SELECT, replacements },
  );

  const countRows = await sequelize.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total ${base} ${where}`,
    { type: QueryTypes.SELECT, replacements },
  );

  return {
    rows,
    // Counted with the SAME filters as the page, so the header and the list can
    // never disagree about how many people this is.
    total: Number(countRows[0]?.total ?? 0),
    visibleStages,
    limit,
    offset,
  };
}
