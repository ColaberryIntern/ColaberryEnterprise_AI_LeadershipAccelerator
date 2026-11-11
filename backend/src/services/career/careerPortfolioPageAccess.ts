/**
 * Who may see a person-level portfolio page, and the one lookup that finds it by slug. Split out of careerPortfolioPageService.ts
 * (C130) VERBATIM so featured work can apply the exact same access rule without importing the whole page service (and with it
 * every career model). careerPortfolioPageService re-exports all of this, so no existing import changes.
 */
import { sequelize } from '../../config/database';

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
export async function findPageBySlug(slug: string): Promise<PortfolioPageRow | null> {
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
