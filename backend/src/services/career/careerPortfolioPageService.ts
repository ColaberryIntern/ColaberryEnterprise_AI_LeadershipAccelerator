/**
 * careerPortfolioPageService — resolving /u/:slug, and the one rule about who may see it.
 *
 * THE VIEW DECISION LIVES IN EXACTLY ONE PURE FUNCTION. `publicViewDecision` below is
 * the only place that answers "may a stranger see this page?". It is exported and tested
 * on its own so that a second surface — a reviewer preview, an admin tool, an OG-image
 * renderer — cannot quietly grow a more generous idea of "viewable" than the public
 * reader has. Every caller asks it; nobody re-implements it.
 *
 * STATUS AND VISIBILITY ARE INDEPENDENT AXES, deliberately.
 *
 *   status      draft | published      has a human approved this page?
 *   visibility  private | unlisted | public    who did the LEARNER choose to show it to?
 *
 * Both must pass. A published page set back to `private` disappears, and an `unlisted`
 * page that was never approved was never visible in the first place. Collapsing these
 * into one column would make "approved" and "shared" the same act, and they are not:
 * a mentor approves that the work is ready, the learner decides the audience.
 *
 * `unlisted` RETURNS 200 AND ASKS NOT TO BE INDEXED. It is a real page for anyone
 * holding the link — that is the point of sharing one — but `indexable` is false, so the
 * route sends `X-Robots-Tag: noindex`. Only `public` is an opt-in to being findable.
 *
 * A PAGE THAT MAY NOT BE SEEN IS 404, NOT 403. A 403 confirms the slug exists and that
 * someone by that name has a portfolio; a 404 says nothing at all. For a page keyed on a
 * person's name that difference is the whole disclosure.
 *
 * FAILURE-FIRST. (1) A missing profile or a failed record query degrades to a shorter
 * page, never a 500 — the projection is defensive and a portfolio with no records is a
 * legitimate portfolio. (2) No retry: one DB read each, no external calls. (3) Recovery:
 * fix the underlying profile and the next request reflects it, because capabilities are
 * read live. (4) Handled: unknown slug, unapproved page, revoked visibility, missing
 * profile, unreadable records. Not handled: nothing that reaches the caller.
 */

import { sequelize } from '../../config/database';
import { getCareerProfile } from './careerProfileService';
import { projectPublicPortfolio, type PublicPortfolio } from './careerPortfolioPublicProjection';

export type PortfolioPageStatus = 'draft' | 'published';
export type PortfolioPageVisibility = 'private' | 'unlisted' | 'public';

export interface PortfolioPageRow {
  enrollment_id: string;
  slug: string;
  status: PortfolioPageStatus;
  visibility: PortfolioPageVisibility;
  approved_identity: unknown;
}

export interface ViewDecision {
  /** May a stranger holding this URL see the page at all? */
  viewable: boolean;
  /** May a search engine index it? Only ever true for an explicit `public` opt-in. */
  indexable: boolean;
}

/**
 * The whole access rule, in one pure function. No I/O, no clock, no request object.
 *
 * Written as a positive allow-list on both axes: an unrecognised status or visibility
 * (a value added next year, a typo, a hand-edited row) is NOT viewable. The safe default
 * for a page carrying a person's name is invisible.
 */
export function publicViewDecision(page: Pick<PortfolioPageRow, 'status' | 'visibility'> | null): ViewDecision {
  if (!page) return { viewable: false, indexable: false };
  const approved = page.status === 'published';
  if (!approved) return { viewable: false, indexable: false };

  switch (page.visibility) {
    case 'public':
      return { viewable: true, indexable: true };
    case 'unlisted':
      return { viewable: true, indexable: false };
    // 'private', and anything unrecognised, falls through to invisible.
    default:
      return { viewable: false, indexable: false };
  }
}

/** Slugs are compared case-insensitively; `/u/Ali` and `/u/ali` are the same address. */
async function findPageBySlug(slug: string): Promise<PortfolioPageRow | null> {
  const [rows] = await sequelize.query(
    `SELECT enrollment_id, slug, status, visibility, approved_identity
       FROM career_portfolio_pages
      WHERE LOWER(slug) = LOWER($1)
      LIMIT 1`,
    { bind: [slug] },
  );
  const row = (rows as any[])[0];
  return row ? (row as PortfolioPageRow) : null;
}

/**
 * The learner-authored fields a human approved, overlaid onto the live profile.
 *
 * This is why `approved_identity` exists. Capabilities and records are read live because
 * the system authored them; a headline is read from the review artifact because the
 * learner authored it and a reviewer signed off on that exact text.
 */
function withApprovedIdentity(profile: any, approved: unknown): any {
  if (!approved || typeof approved !== 'object') return profile;
  const a: any = approved;
  return {
    ...profile,
    identity: {
      ...(profile?.identity ?? {}),
      // Only these two are learner-authored. Everything else stays as the system has it.
      ...(typeof a.title === 'string' ? { title: a.title } : {}),
      ...(typeof a.avatar_data_url === 'string' ? { avatar_data_url: a.avatar_data_url } : {}),
    },
  };
}

export interface PublicPortfolioResult {
  portfolio: PublicPortfolio;
  indexable: boolean;
}

/**
 * Resolve a slug to a public payload, or null if it may not be seen.
 *
 * Null covers "no such slug" AND "exists but not viewable" on purpose — see the 404-not-403
 * note above. The caller cannot tell them apart, which is the intent.
 */
export async function getPublicPortfolioBySlug(
  slug: string,
  now: Date = new Date(),
): Promise<PublicPortfolioResult | null> {
  const page = await findPageBySlug(String(slug || '').trim());
  const decision = publicViewDecision(page);
  if (!page || !decision.viewable) return null;

  // A profile that fails to load is a shorter page, not a 500. The projection turns an
  // empty profile into an empty portfolio rather than throwing.
  let profile: unknown = null;
  try {
    profile = await getCareerProfile(page.enrollment_id);
  } catch (err: any) {
    console.warn(JSON.stringify({
      timestamp: now.toISOString(), level: 'warn', service: 'backend',
      event: 'public_portfolio_profile_unavailable', outcome: 'partial',
      error_class: err?.error_class || err?.name || 'Error',
      context: { slug: page.slug },
    }));
  }

  // ONLY published records. An unpublished record is never passed to the projection,
  // so the projection never has to know about draft work at all.
  let records: unknown = [];
  try {
    const [rows] = await sequelize.query(
      `SELECT slug, content_json->'system'->>'project_name' AS title, published_at
         FROM capstone_records
        WHERE enrollment_id = $1 AND status = 'published' AND visibility <> 'private'
        ORDER BY published_at DESC NULLS LAST`,
      { bind: [page.enrollment_id] },
    );
    records = rows;
  } catch (err: any) {
    console.warn(JSON.stringify({
      timestamp: now.toISOString(), level: 'warn', service: 'backend',
      event: 'public_portfolio_records_unavailable', outcome: 'partial',
      error_class: err?.error_class || err?.name || 'Error',
      context: { slug: page.slug },
    }));
  }

  return {
    portfolio: projectPublicPortfolio({
      profile: withApprovedIdentity(profile, page.approved_identity),
      records,
      generatedAt: now.toISOString(),
    }),
    indexable: decision.indexable,
  };
}
