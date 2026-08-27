/**
 * careerPortfolioPageWriteService — claiming a slug, choosing an audience, and the one
 * path that publishes a person-level portfolio.
 *
 * Separate from `careerPortfolioPageService` on purpose: that file answers "may a
 * stranger see this?", this one answers "who may change it?". Different questions,
 * different blast radius, different reviewers.
 *
 * THREE ACTORS, THREE DIFFERENT RIGHTS.
 *
 *   LEARNER   claims a slug, sets visibility, asks for review. Never publishes.
 *   REVIEWER  approves or declines. The ONLY path to status='published'.
 *   NOBODY    can publish automatically. Plan §21: AI does not approve publication.
 *
 * WHY THE LEARNER CANNOT PUBLISH BY SETTING VISIBILITY. Visibility and status are
 * independent axes and both must pass `publicViewDecision`. A learner setting `public`
 * on a `draft` page changes nothing a stranger can see. That is what makes it safe to
 * give them the visibility control outright.
 *
 * IDEMPOTENT THROUGHOUT. `getOrCreatePage` is findOne-then-insert with the unique index
 * as the real guard, NOT `findOrCreate` — which merges its `where` clause into the insert
 * values and, earlier in this workstream, wrote a Sequelize operator object into a
 * VARCHAR column and produced a live 500. Asking for review twice returns the existing
 * request. Approving twice is a no-op that does not re-freeze the identity.
 *
 * FAILURE-FIRST. (1) A slug collision under concurrency surfaces as a unique-violation
 * and is retried once with a numbered suffix, then reported rather than looping.
 * (2) Retry is bounded at one attempt; there is no backoff because there is no upstream.
 * (3) Recovery: the learner picks a different slug. (4) Handled: collision, missing
 * profile, unknown enrollment, double-request, double-approve, unrecognised decision.
 */

import { sequelize } from '../../config/database';
import { getCareerProfile } from './careerProfileService';
import type { PortfolioPageVisibility } from './careerPortfolioPageService';
import { visibleEnrollmentIds, type ReviewerIdentity } from './careerMentorScopeService';

const VISIBILITIES: PortfolioPageVisibility[] = ['private', 'unlisted', 'public'];

export function isVisibility(v: unknown): v is PortfolioPageVisibility {
  return typeof v === 'string' && (VISIBILITIES as string[]).includes(v);
}

/** A slug is an address: lowercase, hyphenated, no leading or trailing hyphen. */
export function slugify(input: string): string {
  return String(input || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

/**
 * Addresses nobody may hold.
 *
 * `share` is the load-bearing one: `/portfolio/share/:token` is a real route, and React
 * Router ranks its static segment above `/portfolio/:slug`. A learner who minted the
 * slug `share` would get an address that silently resolves to somebody else's page
 * forever. The rest are reserved because they read as system pages rather than people.
 */
const RESERVED_SLUGS = new Set([
  'share', 'admin', 'api', 'login', 'logout', 'signup', 'portal', 'new', 'edit',
  'settings', 'search', 'about', 'help', 'support', 'p', 'u', 'me',
]);

function err(status: number, message: string, error_class: string) {
  return Object.assign(new Error(message), { status, error_class });
}

export interface PortfolioPageState {
  slug: string;
  status: 'draft' | 'published';
  visibility: PortfolioPageVisibility;
  review_requested_at: string | null;
  approved_at: string | null;
  /** Where it lives once it is viewable. Present regardless, so the learner can see it. */
  public_path: string;
}

async function readPage(enrollmentId: string): Promise<PortfolioPageState | null> {
  const [rows] = await sequelize.query(
    `SELECT slug, status, visibility, review_requested_at, approved_at
       FROM career_portfolio_pages WHERE enrollment_id = $1 LIMIT 1`,
    { bind: [enrollmentId] },
  );
  const r: any = (rows as any[])[0];
  if (!r) return null;
  return {
    slug: r.slug,
    status: r.status,
    visibility: r.visibility,
    review_requested_at: r.review_requested_at ? new Date(r.review_requested_at).toISOString() : null,
    approved_at: r.approved_at ? new Date(r.approved_at).toISOString() : null,
    public_path: `/portfolio/${r.slug}`,
  };
}

/**
 * The learner's page, created on first look.
 *
 * Creating it is safe because a new page is `draft` + `unlisted`, which
 * `publicViewDecision` treats as invisible. Existing simply reserves their name.
 */
export async function getOrCreatePage(enrollmentId: string): Promise<PortfolioPageState> {
  const existing = await readPage(enrollmentId);
  if (existing) return existing;

  const profile: any = await getCareerProfile(enrollmentId).catch(() => null);
  const base = slugify(profile?.identity?.full_name || '') || `learner-${enrollmentId.slice(0, 8)}`;

  // One retry with a numbered suffix. The unique index is the real guard, so a race
  // between two requests for the same person resolves to one row either way.
  // A reserved base is suffixed rather than rejected: the learner's name is not their
  // fault, and `share-2` is a working address where `share` would be a dead one.
  const safeBase = RESERVED_SLUGS.has(base) ? `${base}-page` : base;

  for (const candidate of [safeBase, `${safeBase}-2`]) {
    try {
      await sequelize.query(
        `INSERT INTO career_portfolio_pages (enrollment_id, slug)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        { bind: [enrollmentId, candidate] },
      );
      const made = await readPage(enrollmentId);
      if (made) return made;
    } catch {
      // Fall through to the next candidate; a collision is expected, not exceptional.
    }
  }
  throw err(409, 'Could not reserve a portfolio address', 'SlugCollision');
}

/**
 * The learner's own choice of audience. Ali, 2026-08-25: default noindex, the learner
 * opts in. `public` IS that opt-in, which is why this is a learner action and not a
 * reviewer one — a mentor approves that the work is ready, the audience stays theirs.
 */
export async function setPortfolioVisibility(
  enrollmentId: string,
  visibility: PortfolioPageVisibility,
): Promise<PortfolioPageState> {
  await getOrCreatePage(enrollmentId);
  await sequelize.query(
    `UPDATE career_portfolio_pages
        SET visibility = $2, updated_at = NOW()
      WHERE enrollment_id = $1`,
    { bind: [enrollmentId, visibility] },
  );
  return (await readPage(enrollmentId))!;
}

/** Asking twice while a request is open is a no-op, not a second thing in a queue. */
export async function requestPortfolioReview(enrollmentId: string): Promise<PortfolioPageState> {
  const page = await getOrCreatePage(enrollmentId);
  if (page.review_requested_at && page.status !== 'published') return page;

  await sequelize.query(
    `UPDATE career_portfolio_pages
        SET review_requested_at = NOW(), updated_at = NOW()
      WHERE enrollment_id = $1`,
    { bind: [enrollmentId] },
  );
  return (await readPage(enrollmentId))!;
}

export type PortfolioDecision = 'approved' | 'changes_requested';

/**
 * The ONLY path to `status = 'published'`.
 *
 * On approval the learner-authored fields are FROZEN into `approved_identity`, read from
 * the profile at this moment. That is the whole point of the column: what the reviewer
 * read is what a stranger sees, so a headline cannot be edited into something else after
 * a human signed off on it.
 *
 * Approving an already-published page does NOT re-freeze the identity — that would
 * silently republish whatever the headline says today under the old approval.
 */
export async function decidePortfolioReview(args: {
  enrollmentId: string;
  decision: PortfolioDecision;
  reviewerEmail: string;
}): Promise<PortfolioPageState> {
  const { enrollmentId, decision, reviewerEmail } = args;
  const page = await readPage(enrollmentId);
  if (!page) throw err(404, 'No portfolio page for this learner', 'NotFound');

  if (decision === 'changes_requested') {
    await sequelize.query(
      `UPDATE career_portfolio_pages
          SET status = 'draft', review_requested_at = NULL, updated_at = NOW()
        WHERE enrollment_id = $1`,
      { bind: [enrollmentId] },
    );
    return (await readPage(enrollmentId))!;
  }

  if (page.status === 'published') return page; // idempotent approve

  const profile: any = await getCareerProfile(enrollmentId).catch(() => null);
  const frozen = {
    title: profile?.identity?.title ?? null,
    avatar_data_url: profile?.identity?.avatar_data_url ?? null,
  };

  await sequelize.query(
    `UPDATE career_portfolio_pages
        SET status = 'published',
            approved_identity = $2::jsonb,
            approved_at = NOW(),
            approved_by = $3,
            review_requested_at = NULL,
            updated_at = NOW()
      WHERE enrollment_id = $1`,
    { bind: [enrollmentId, JSON.stringify(frozen), reviewerEmail] },
  );
  return (await readPage(enrollmentId))!;
}

/** The Studio panel's read: where do I stand, and where does my page live? */
export async function getPortfolioPageState(enrollmentId: string): Promise<PortfolioPageState> {
  return getOrCreatePage(enrollmentId);
}

export interface PortfolioQueueItem {
  enrollment_id: string;
  slug: string;
  full_name: string | null;
  requested_at: string;
  public_path: string;
}

/**
 * The reviewer's queue of portfolio pages awaiting a decision.
 *
 * THIS EXISTS BECAUSE ITS ABSENCE WAS A SHIPPED DEAD END. `requestPortfolioReview` writes
 * `career_portfolio_pages.review_requested_at`, but the reviewer surface only ever queried
 * `capstone_review_approvals` — a different table, for records. So a learner could ask for
 * review, see "waiting on a mentor", and no mentor would ever see it. Ali hit this within
 * minutes of the deploy. A request that nothing reads is worse than no button at all,
 * because it tells the learner something is happening.
 *
 * Scoped with `visibleEnrollmentIds`, the SAME function the record queue uses: `null`
 * means admin and no filter, `[]` means a mentor with no grants who must see nothing.
 * Those two must never be conflated — an empty array meaning "no filter" would show every
 * learner on the platform to a mentor with no grants at all.
 */
export async function listPortfolioReviewQueue(
  reviewer: ReviewerIdentity,
): Promise<PortfolioQueueItem[]> {
  const visible = await visibleEnrollmentIds(reviewer);
  if (visible !== null && visible.length === 0) return [];

  const scoped = visible === null ? '' : ' AND p.enrollment_id = ANY($1::uuid[])';
  const [rows] = await sequelize.query(
    // enrollments carries `full_name`, not first/last -- checked against the live schema
    // rather than assumed. LEFT JOIN so a queue item still renders if the enrollment row
    // is missing: a reviewer seeing "Unnamed" is recoverable, an empty queue is not.
    `SELECT p.enrollment_id, p.slug, p.review_requested_at, e.full_name
       FROM career_portfolio_pages p
       LEFT JOIN enrollments e ON e.id = p.enrollment_id
      WHERE p.review_requested_at IS NOT NULL
        AND p.status <> 'published'${scoped}
      ORDER BY p.review_requested_at ASC`,
    visible === null ? {} : { bind: [visible] },
  );

  return (rows as any[]).map((r) => ({
    enrollment_id: r.enrollment_id,
    slug: r.slug,
    full_name: r.full_name ?? null,
    requested_at: new Date(r.review_requested_at).toISOString(),
    public_path: `/portfolio/${r.slug}`,
  }));
}
