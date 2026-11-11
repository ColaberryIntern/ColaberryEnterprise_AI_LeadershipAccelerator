/**
 * Featured work (C130, phase 3 of the approved C127 design): the pieces a learner chooses to show on their public portfolio page.
 *
 * THE RULE (Ali, Wed 11 Nov 2026, asked and answered: "After review"). Featuring a piece shows it on the learner's own Preview at
 * once, but a STRANGER sees it only after a reviewer approves the page, the same gate the page's other learner-authored content
 * passes. So there are two sets:
 *   live     rows in `career_featured_work`, the learner's current choice; Preview and the reviewer read this
 *   frozen   `approved_identity.featured_work`, written by `decidePortfolioReview` at approval; the public page reads ONLY this
 * Each frozen entry carries a sha256 of the piece's title and stored content. If either changes after approval (a Claude Studio
 * resubmission updates its row in place), the hash no longer matches and the piece drops off the public page until the next review.
 * PUBLIC = APPROVED AND STILL FEATURED. Unfeaturing only ever makes the page less public, so it takes effect at once: every public
 * read intersects the frozen set with the live one (independent verifier, C130 attempt 1: an unfeatured piece stayed public).
 *
 * Nothing is public by default: no row, nothing featured; a page approved before this shipped has no `featured_work`, so nothing.
 * A public read of a piece answers null (the route's 404) for any id that is not in the frozen set of a viewable page, whether it
 * is someone else's piece, an unfeatured one, a changed one, or made up. Featuring is capped so the section stays a selection.
 */
import crypto from 'crypto';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { locateArtifactFile, type InternArtifactFile } from '../internship/internArtifactViewer';
import { asObject, toWorkItem, type WorkGroup, type WorkRow } from '../myWork/myWorkModel';
import { toPiece, type MyWorkPiece } from '../myWork/myWorkService';
import { findPageBySlug, publicViewDecision, type PortfolioPageStatus, type PortfolioPageVisibility } from './careerPortfolioPageAccess';

export const MAX_FEATURED = 12;

export interface FrozenFeature { artifact_id: string; content_sha256: string }
/** What the public page lists for a featured piece. Named fields only. */
export interface PublicFeaturedWork { id: string; group: WorkGroup; title: string; from: string; created_at: string }
/** A public work page: the viewer parts, never the learner's private status or leftover data. */
export type PublicFeaturedPiece = Omit<MyWorkPiece, 'state' | 'data' | 'kind'>;

/**
 * Which featured set buildPortfolio reads. ONLY the reviewer preview (approvedProjects === null) gets the live set (null); every
 * public read gets the approved identity, and a page with none counts as an empty one ({}), so a stranger can never see the live set.
 */
export function featuredSource(approvedProjects: unknown[] | null, approvedIdentity: unknown): unknown | null {
  return approvedProjects === null ? null : (approvedIdentity ?? {});
}

/** sha256 of what a stranger would read: the title and the stored content. JSONB returns keys in a normalized order. */
export function pieceHash(row: Pick<WorkRow, 'title' | 'content'>): string {
  return crypto.createHash('sha256').update(JSON.stringify({ title: row.title, content: row.content ?? {} })).digest('hex');
}

/** The frozen list on an approved page, or [] (approved before this shipped, or malformed). */
export function frozenFeaturedOf(approved: unknown): FrozenFeature[] {
  const list = asObject(approved).featured_work;
  if (!Array.isArray(list)) return [];
  return list.map((f) => asObject(f))
    .filter((f) => typeof f.artifact_id === 'string' && typeof f.content_sha256 === 'string')
    .map((f) => ({ artifact_id: f.artifact_id as string, content_sha256: f.content_sha256 as string }));
}

/**
 * The pieces a stranger may see: approved (in `frozen`), STILL FEATURED (in `live`), and unchanged since approval; in the approved
 * order. Pure.
 */
export function publicPieces(rows: WorkRow[], frozen: FrozenFeature[], live: readonly string[]): WorkRow[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const on = new Set(live);
  return frozen.filter((f) => on.has(f.artifact_id))
    .map((f) => ({ f, r: byId.get(f.artifact_id) }))
    .filter((x): x is { f: FrozenFeature; r: WorkRow } => !!x.r && pieceHash(x.r) === x.f.content_sha256)
    .map((x) => x.r);
}

export const toPublicListing = (r: WorkRow): PublicFeaturedWork => {
  const it = toWorkItem(r);
  return { id: it.id, group: it.group, title: it.title, from: it.from, created_at: it.createdAt };
};

export function toPublicPiece(r: WorkRow): PublicFeaturedPiece {
  const { state: _state, data: _data, kind: _kind, ...rest } = toPiece(r);
  return rest;
}

const ROWS_SQL = `SELECT id, kind, title, created_at, competencies, content FROM runtime_portfolio_artifacts
                   WHERE enrollment_id = :enrollmentId AND id IN (:ids)`;
async function rowsFor(enrollmentId: string, ids: string[]): Promise<WorkRow[]> {
  if (!ids.length) return [];
  return sequelize.query<WorkRow>(ROWS_SQL, { replacements: { enrollmentId, ids }, type: QueryTypes.SELECT });
}

/** The learner's live featured ids, oldest choice first. */
export async function liveFeaturedIds(enrollmentId: string): Promise<string[]> {
  const rows = await sequelize.query<{ artifact_id: string }>(
    'SELECT artifact_id FROM career_featured_work WHERE enrollment_id = :enrollmentId ORDER BY featured_at, artifact_id',
    { replacements: { enrollmentId }, type: QueryTypes.SELECT },
  );
  return rows.map((r) => r.artifact_id);
}

export type FeatureResult = { featured: boolean; count: number } | 'not_found' | 'limit';

/**
 * Feature or unfeature one of the learner's OWN pieces. Idempotent both ways (insert-or-nothing, delete-or-nothing). Another
 * learner's piece, or no such piece, is `not_found`; a 13th feature is `limit` and changes nothing.
 */
export async function setFeatured(enrollmentId: string, artifactId: string, featured: boolean): Promise<FeatureResult> {
  const own = await sequelize.query<{ id: string }>(
    'SELECT id FROM runtime_portfolio_artifacts WHERE id = :artifactId AND enrollment_id = :enrollmentId',
    { replacements: { artifactId, enrollmentId }, type: QueryTypes.SELECT },
  );
  if (!own.length) return 'not_found';
  if (featured) {
    const ids = await liveFeaturedIds(enrollmentId);
    if (!ids.includes(artifactId) && ids.length >= MAX_FEATURED) return 'limit';
    await sequelize.query(
      'INSERT INTO career_featured_work (enrollment_id, artifact_id) VALUES (:enrollmentId, :artifactId) ON CONFLICT DO NOTHING',
      { replacements: { enrollmentId, artifactId } },
    );
  } else {
    await sequelize.query('DELETE FROM career_featured_work WHERE enrollment_id = :enrollmentId AND artifact_id = :artifactId',
      { replacements: { enrollmentId, artifactId } });
  }
  return { featured, count: (await liveFeaturedIds(enrollmentId)).length };
}

/** At approval: the live set, each with the hash of the content the reviewer is approving. */
export async function freezeFeatured(enrollmentId: string): Promise<FrozenFeature[]> {
  const ids = await liveFeaturedIds(enrollmentId);
  const rows = await rowsFor(enrollmentId, ids);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.filter((id) => byId.has(id)).map((id) => ({ artifact_id: id, content_sha256: pieceHash(byId.get(id)!) }));
}

/**
 * The Featured work section. `approved` null = the LIVE set (Preview and the reviewer); an approved identity = its frozen set,
 * filtered to pieces whose content is unchanged.
 */
export async function featuredWorkFor(enrollmentId: string, approved: unknown | null): Promise<PublicFeaturedWork[]> {
  if (approved === null) {
    const ids = await liveFeaturedIds(enrollmentId);
    const byId = new Map((await rowsFor(enrollmentId, ids)).map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id)).filter((r): r is WorkRow => !!r).map(toPublicListing);
  }
  const frozen = frozenFeaturedOf(approved);
  if (!frozen.length) return [];
  const live = await liveFeaturedIds(enrollmentId);
  return publicPieces(await rowsFor(enrollmentId, frozen.map((f) => f.artifact_id)), frozen, live).map(toPublicListing);
}

/** For decidePortfolioReview: a failed read freezes nothing (nothing goes public), logged, never blocking the approval. */
export async function freezeFeaturedSafe(enrollmentId: string): Promise<FrozenFeature[]> {
  try {
    return await freezeFeatured(enrollmentId);
  } catch (err) {
    const e = err as Error;
    console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event: 'portfolio_featured_freeze_failed',
      outcome: 'partial', error_class: e?.constructor?.name ?? 'UnknownError', context: { enrollment_id: enrollmentId } }));
    return [];
  }
}

/** The section for buildPortfolio: a failure is a page without the section, never a 500 (same rule as its other reads). */
export async function featuredWorkSafe(enrollmentId: string, approved: unknown | null): Promise<PublicFeaturedWork[]> {
  try {
    return await featuredWorkFor(enrollmentId, approved);
  } catch (err) {
    const e = err as Error;
    console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event: 'public_portfolio_featured_work_unavailable',
      outcome: 'partial', error_class: e?.constructor?.name ?? 'UnknownError', context: { enrollment_id: enrollmentId } }));
    return [];
  }
}

/** For the learner's own work page: is it featured, and is it on the public page right now? */
export async function featureStatus(enrollmentId: string, artifactId: string): Promise<{ featured: boolean; onPublicPage: boolean }> {
  const live = await liveFeaturedIds(enrollmentId);
  const featured = live.includes(artifactId);
  if (!featured) return { featured, onPublicPage: false };
  const pages = await sequelize.query<{ status: PortfolioPageStatus; visibility: PortfolioPageVisibility; approved_identity: unknown }>(
    'SELECT status, visibility, approved_identity FROM career_portfolio_pages WHERE enrollment_id = :enrollmentId LIMIT 1',
    { replacements: { enrollmentId }, type: QueryTypes.SELECT },
  );
  const page = pages[0];
  if (!page || !publicViewDecision(page).viewable) return { featured, onPublicPage: false };
  const frozen = frozenFeaturedOf(page.approved_identity).filter((f) => f.artifact_id === artifactId);
  if (!frozen.length) return { featured, onPublicPage: false };
  return { featured, onPublicPage: publicPieces(await rowsFor(enrollmentId, [artifactId]), frozen, live).length === 1 };
}

/** The row behind a PUBLIC work page: a viewable page, the id in its frozen set, the content unchanged. Else null. */
async function publicRow(slug: string, artifactId: string): Promise<{ row: WorkRow; indexable: boolean } | null> {
  const page = await findPageBySlug(String(slug || '').trim());
  const decision = publicViewDecision(page);
  if (!page || !decision.viewable) return null;
  const frozen = frozenFeaturedOf(page.approved_identity).filter((f) => f.artifact_id === artifactId);
  if (!frozen.length) return null;
  const live = await liveFeaturedIds(page.enrollment_id);
  const row = publicPieces(await rowsFor(page.enrollment_id, [artifactId]), frozen, live)[0];
  return row ? { row, indexable: decision.indexable } : null;
}

export async function getPublicFeaturedPiece(slug: string, artifactId: string): Promise<{ piece: PublicFeaturedPiece; indexable: boolean } | null> {
  const hit = await publicRow(slug, artifactId);
  return hit ? { piece: toPublicPiece(hit.row), indexable: hit.indexable } : null;
}

export async function getPublicFeaturedFile(slug: string, artifactId: string): Promise<{ file: InternArtifactFile; piece: PublicFeaturedPiece } | null> {
  const hit = await publicRow(slug, artifactId);
  if (!hit) return null;
  const file = locateArtifactFile(hit.row.title, asObject(hit.row.content));
  return file ? { file, piece: toPublicPiece(hit.row) } : null;
}
