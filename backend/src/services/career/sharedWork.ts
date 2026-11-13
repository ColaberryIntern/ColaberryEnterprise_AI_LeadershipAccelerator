/**
 * Shared work (C138, phase 4 of the approved C127 design): the pieces a learner chooses to show their CLASSMATES in the Showcase.
 *
 * THE RULES.
 *   Its own opt-in (C127 decision Q1 A, Ali, Tue 10 Nov 2026): sharing is a separate choice from featuring. Featuring
 *     (`career_featured_work`, C130) is the public page; sharing (`career_shared_work`, here) is the Showcase. Neither table is
 *     read or written by the other's code, so one switch can never flip the other.
 *   Own cohort only (Ali, Wed 11 Nov 2026, asked and answered): a shared piece is visible to signed-in learners whose
 *     `enrollments.cohort_id` equals the owner's. The viewer's cohort is read from `enrollments`, never from the token, so a
 *     stale token cannot widen it. A viewer with no cohort sees nothing shared, never everything.
 *   At once, no review: classmates are signed-in learners in the same cohort, and nothing here ever reaches a stranger.
 *   Nothing is shared by default: no row, not shared. Unsharing deletes the row, so it leaves the Showcase on the next read.
 *
 * Every read joins the share row to the piece on BOTH the piece id AND the owner's enrollment, so a share row can only ever
 * expose a piece of the learner who made it. Anything not visible (another cohort, unshared, deleted, made up) answers null,
 * which the route turns into one identical 404, so the id space cannot be probed.
 *
 * Failure modes: a failing query throws to the route (500, logged there). A missing upload behind a shared file is reported by
 * the viewer (`file.available: false`), never thrown.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { locateArtifactFile, type InternArtifactFile } from '../internship/internArtifactViewer';
import { asObject, toWorkItem, type WorkGroup, type WorkRow } from '../myWork/myWorkModel';
import { toPublicPiece, type PublicFeaturedPiece } from './featuredWork';

/** A ceiling for one cohort's Showcase, not a page size (production, 11 Nov 2026: 820 pieces across 48 learners in total). */
export const MAX_SHOWCASE = 300;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** One card in the Showcase. Named fields only: never the owner's private status, leftover data or enrollment id. */
export interface ShowcaseWork {
  id: string;
  group: WorkGroup;
  title: string;
  from: string;
  createdAt: string;
  week: number | null;
  project: string | null;
  skills: string[];
  author: string;
  sharedAt: string;
  /** The viewer's own piece (they shared it), so the card can say "You". */
  mine: boolean;
}
export type ShowcasePiece = PublicFeaturedPiece & { author: string; sharedAt: string; mine: boolean };

type SharedRow = WorkRow & { shared_at: string | Date; author_name: string | null; mine: boolean };

const authorOf = (name: string | null): string => (name && name.trim() ? name.trim() : 'A classmate');

export function toShowcaseWork(r: SharedRow): ShowcaseWork {
  const it = toWorkItem(r);
  return {
    id: it.id, group: it.group, title: it.title, from: it.from, createdAt: it.createdAt, week: it.week, project: it.project,
    skills: it.skills, author: authorOf(r.author_name), sharedAt: new Date(r.shared_at).toISOString(), mine: r.mine === true,
  };
}

/**
 * "New this week" (the design's "Featured this week" has no curator, so it is never an invented pick): the most recently shared
 * piece in the last 7 days, or null. Pure. `items` arrive newest share first.
 */
export function newThisWeek(items: ShowcaseWork[], now: Date = new Date()): ShowcaseWork | null {
  const cutoff = now.getTime() - WEEK_MS;
  return items.find((it) => new Date(it.sharedAt).getTime() >= cutoff) ?? null;
}

/** The viewer's cohort, from enrollments. Null when they have none. */
export async function viewerCohort(enrollmentId: string): Promise<string | null> {
  const rows = await sequelize.query<{ cohort_id: string | null }>(
    'SELECT cohort_id FROM enrollments WHERE id = :enrollmentId',
    { replacements: { enrollmentId }, type: QueryTypes.SELECT },
  );
  return rows[0]?.cohort_id ? String(rows[0].cohort_id) : null;
}

/** The learner's own shared ids, oldest first. */
export async function sharedIds(enrollmentId: string): Promise<string[]> {
  const rows = await sequelize.query<{ artifact_id: string }>(
    'SELECT artifact_id FROM career_shared_work WHERE enrollment_id = :enrollmentId ORDER BY shared_at, artifact_id',
    { replacements: { enrollmentId }, type: QueryTypes.SELECT },
  );
  return rows.map((r) => r.artifact_id);
}

export type ShareResult = { shared: boolean; count: number } | 'not_found';

/** Share or unshare one of the learner's OWN pieces. Idempotent both ways. Another learner's piece, or none, is `not_found`. */
export async function setShared(enrollmentId: string, artifactId: string, shared: boolean): Promise<ShareResult> {
  const own = await sequelize.query<{ id: string }>(
    'SELECT id FROM runtime_portfolio_artifacts WHERE id = :artifactId AND enrollment_id = :enrollmentId',
    { replacements: { artifactId, enrollmentId }, type: QueryTypes.SELECT },
  );
  if (!own.length) return 'not_found';
  if (shared) {
    await sequelize.query(
      'INSERT INTO career_shared_work (enrollment_id, artifact_id) VALUES (:enrollmentId, :artifactId) ON CONFLICT DO NOTHING',
      { replacements: { enrollmentId, artifactId } },
    );
  } else {
    await sequelize.query('DELETE FROM career_shared_work WHERE enrollment_id = :enrollmentId AND artifact_id = :artifactId',
      { replacements: { enrollmentId, artifactId } });
  }
  return { shared, count: (await sharedIds(enrollmentId)).length };
}

/** The share row is joined to the piece on the id AND the owner, and to the owner's enrollment for the cohort. */
const FROM = `FROM career_shared_work s
  JOIN runtime_portfolio_artifacts r ON r.id = s.artifact_id AND r.enrollment_id = s.enrollment_id
  JOIN enrollments e ON e.id = s.enrollment_id
 WHERE e.cohort_id = :cohortId`;

const LIST_SQL = `SELECT r.id, r.kind, r.title, r.created_at, r.competencies,
       r.content - 'body_html' - 'sections' - 'adr' - 'receipt' - 'reflection' AS content,
       s.shared_at, e.full_name AS author_name, (s.enrollment_id = :viewerId) AS mine
  ${FROM}
 ORDER BY s.shared_at DESC, r.id
 LIMIT ${MAX_SHOWCASE}`;

const ONE_SQL = `SELECT r.id, r.kind, r.title, r.created_at, r.competencies, r.content,
       s.shared_at, e.full_name AS author_name, (s.enrollment_id = :viewerId) AS mine
  ${FROM} AND s.artifact_id = :artifactId`;

/** Every piece shared in the viewer's cohort (their own included), newest share first. No cohort, nothing. */
export async function listCohortShowcase(viewerId: string): Promise<{ items: ShowcaseWork[]; newThisWeek: ShowcaseWork | null }> {
  const cohortId = await viewerCohort(viewerId);
  if (!cohortId) return { items: [], newThisWeek: null };
  const rows = await sequelize.query<SharedRow>(LIST_SQL, { replacements: { cohortId, viewerId }, type: QueryTypes.SELECT });
  const items = rows.map(toShowcaseWork);
  return { items, newThisWeek: newThisWeek(items) };
}

async function visibleRow(viewerId: string, artifactId: string): Promise<SharedRow | null> {
  const cohortId = await viewerCohort(viewerId);
  if (!cohortId) return null;
  const rows = await sequelize.query<SharedRow>(ONE_SQL, { replacements: { cohortId, viewerId, artifactId }, type: QueryTypes.SELECT });
  return rows[0] ?? null;
}

/** One shared piece, read-only, for a classmate: the viewer parts only. Null unless shared AND in the viewer's cohort. */
export async function getCohortSharedPiece(viewerId: string, artifactId: string): Promise<ShowcasePiece | null> {
  const row = await visibleRow(viewerId, artifactId);
  if (!row) return null;
  return { ...toPublicPiece(row), author: authorOf(row.author_name), sharedAt: new Date(row.shared_at).toISOString(), mine: row.mine === true };
}

/** The uploaded file behind a shared piece the viewer may see, for streaming. Null otherwise. */
export async function getCohortSharedFile(viewerId: string, artifactId: string): Promise<{ file: InternArtifactFile; piece: ShowcasePiece } | null> {
  const row = await visibleRow(viewerId, artifactId);
  if (!row) return null;
  const file = locateArtifactFile(row.title, asObject(row.content));
  if (!file) return null;
  return { file, piece: { ...toPublicPiece(row), author: authorOf(row.author_name), sharedAt: new Date(row.shared_at).toISOString(), mine: row.mine === true } };
}

/** For the owner's own work page: is it shared? */
export async function shareStatus(enrollmentId: string, artifactId: string): Promise<{ shared: boolean }> {
  return { shared: (await sharedIds(enrollmentId)).includes(artifactId) };
}
