// What an institution has actually been sold, and how much of it is being used.
//
// ## Why this module exists (C8.9)
//
// `org_cohorts` is the row that says "this institution sponsored seats on this cohort". It
// holds real rows, the admin API that writes it works, and the admin UI that drives it
// works. And until now **nothing read it except admin reporting counts** — so the
// institution that bought the seats could not see them. The manager-facing surface
// (`/api/portal/org/*`) exposes members, roster, overview and feed, and not one of those
// touches the cohort link. That is the licence-delivery hole C8.9 is actually about.
//
// ## The number this module refuses to report
//
// It would be easy, and wrong, to answer "how many learners does this institution have on
// this cohort?" with the cohort's enrollment count. `OrgCohort`'s own header says why:
// adding a cohort here does NOT move any person into it. Per-person placement stays on
// `enrollments.cohort_id`, and the two populations are not the same set.
//
// Concretely: the largest cohort in production, "Explorer - Prospects", carries 425 active
// enrollments and is a PROSPECT POOL. Counting it as an institution's learners would assert
// that 425 strangers belong to a customer. That is precisely the failure C8.9's own brief
// warns about — "a table with the right shape and zero records reads as capability and is
// not" — in its more dangerous form, where the table has plenty of records and they mean
// something else.
//
// So `members_placed` counts the intersection: people on THIS organization's roster
// (`org_members`) who are enrolled in THAT cohort. Nothing else can honestly be called
// theirs.
//
// ## Failure-first
//
// A read that cannot be completed returns `null` for the count rather than 0, because an
// institution reading "0 of 25 seats filled" would act on it. `seats_unfilled` is null
// whenever `seats_sponsored` was never recorded (it is nullable, and all four production
// rows have it null today) — an unknown entitlement minus a known placement is not a number.

import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { OrgMember } from '../models';

/** One cohort an institution has sponsored, with how much of it its own people occupy. */
export interface SponsoredCohort {
  cohort_id: string;
  name: string;
  status: string | null;
  /** `YYYY-MM-DD`, or null when the cohort has no start date set. */
  start_date: string | null;
  /** Seats the institution was sold. Null when none was recorded on the link. */
  seats_sponsored: number | null;
  /**
   * Members of THIS organization enrolled in THIS cohort. Never the cohort's own total.
   * Null means the placement read could not be completed — not zero.
   */
  members_placed: number | null;
  /** `seats_sponsored - members_placed`, floored at 0. Null when either side is unknown. */
  seats_unfilled: number | null;
  /** When the institution was linked to the cohort. */
  linked_at: string | null;
}

/** A raw `org_cohorts`-to-`cohorts` row, before placement is merged in. */
export interface SponsoredCohortLink {
  cohort_id: string;
  name: string;
  status: string | null;
  start_date: string | null;
  seats_sponsored: number | null;
  linked_at: string | null;
}

/**
 * Merge entitlement (what was sold) with placement (who is actually on it). PURE.
 *
 * Separated from the queries so the arithmetic that produces a customer-facing number is
 * testable without a database — including the cases that must yield null rather than a
 * confident zero.
 *
 * @param placedByCohort cohort_id -> count of this org's members enrolled in it. Pass `null`
 *   to mean "the placement read did not run", which propagates as null rather than 0.
 */
export function composeSponsoredCohorts(
  links: readonly SponsoredCohortLink[],
  placedByCohort: ReadonlyMap<string, number> | null,
): SponsoredCohort[] {
  return links.map((link) => {
    const members_placed = placedByCohort === null
      ? null
      : placedByCohort.get(link.cohort_id) ?? 0;

    const seats_unfilled =
      link.seats_sponsored === null || link.seats_sponsored === undefined || members_placed === null
        ? null
        : Math.max(0, link.seats_sponsored - members_placed);

    return {
      cohort_id: link.cohort_id,
      name: link.name,
      status: link.status ?? null,
      start_date: link.start_date ?? null,
      seats_sponsored: link.seats_sponsored ?? null,
      members_placed,
      seats_unfilled,
      linked_at: link.linked_at ?? null,
    };
  });
}

/** The cohorts linked to this organization, newest start first. */
async function readLinks(orgId: string): Promise<SponsoredCohortLink[]> {
  return sequelize.query(
    `SELECT c.id              AS cohort_id,
            c.name            AS name,
            c.status::text    AS status,
            to_char(c.start_date, 'YYYY-MM-DD')          AS start_date,
            oc.seats_sponsored                            AS seats_sponsored,
            to_char(oc.created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS linked_at
       FROM org_cohorts oc
       JOIN cohorts c ON c.id = oc.cohort_id
      WHERE oc.org_id = :orgId
      ORDER BY c.start_date DESC NULLS LAST, c.name ASC`,
    { replacements: { orgId }, type: QueryTypes.SELECT },
  ) as Promise<SponsoredCohortLink[]>;
}

/**
 * How many of this org's own members sit in each cohort.
 *
 * Two queries rather than one join, because `IN (:ids)` renders invalid SQL for an empty
 * list — a trap `orgService` already documents. An org with no linked enrollments skips the
 * second query entirely and every cohort correctly reads 0 placed.
 */
async function readPlacement(orgId: string): Promise<Map<string, number>> {
  const members = await OrgMember.findAll({
    where: { org_id: orgId },
    attributes: ['enrollment_id'],
  });
  const ids = members.map((m) => m.enrollment_id).filter((id): id is string => !!id);

  const placed = new Map<string, number>();
  if (ids.length === 0) return placed;

  const rows = (await sequelize.query(
    `SELECT cohort_id::text AS cohort_id, COUNT(*)::int AS n
       FROM enrollments
      WHERE id IN (:ids) AND cohort_id IS NOT NULL
      GROUP BY cohort_id`,
    { replacements: { ids }, type: QueryTypes.SELECT },
  )) as Array<{ cohort_id: string; n: number }>;

  for (const r of rows) placed.set(r.cohort_id, r.n);
  return placed;
}

/**
 * Everything this institution has been sold, with its own occupancy.
 *
 * The caller supplies `orgId` from `req.org.id`, which `requireOrgManager` derives from the
 * AUTHENTICATED enrollment and never from a route parameter. That is the property that makes
 * this safe without a tenant filter: there is no id for a caller to substitute. Do not add an
 * overload that takes an org id off the request.
 */
export async function getSponsoredCohorts(orgId: string): Promise<SponsoredCohort[]> {
  const links = await readLinks(orgId);
  if (links.length === 0) return [];

  let placedByCohort: Map<string, number> | null = null;
  try {
    placedByCohort = await readPlacement(orgId);
  } catch (err) {
    // Degrade the count, not the response. An institution seeing its entitlements with an
    // unknown occupancy is strictly better than a 500, and far better than a zero it would
    // act on. Matches orgService's documented posture: metric reads degrade a section.
    console.warn(JSON.stringify({
      level: 'warn',
      service: 'backend',
      event: 'org_sponsored_cohorts_placement_read_failed',
      outcome: 'partial',
      error_class: (err as Error)?.constructor?.name ?? 'Error',
      context: { org_id: orgId, links: links.length },
    }));
  }

  return composeSponsoredCohorts(links, placedByCohort);
}
