/**
 * blogReadGateService — the I/O shell for the blog read gate. Persists the
 * continuous-dwell ReadState to blog_post_views.read_state (keyed on
 * enrollment + blog_post_id — the same key the ambient feed already uses) and
 * awards points once the 2-minute bar is cleared.
 *
 * Ambient blogs have no timeline_card / TimelineCardProgress row, so this is a
 * separate store from the video watch gate (watchProgressService), but it mirrors
 * that gate's shape: recordReadBeat (accumulate), assertReadSatisfied (422), and
 * a collect that awards idempotently. Fail-soft on reads; the collect is the only
 * side-effecting call and is guarded by the points flag.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { accumulateRead, meetsReadRequirement, type ReadState } from './blogReadGateMath';
import { award } from '../pointsService';
import { env } from '../../config/env';

/** Points a blog read awards. Matches the blog type's learning_xp in the registry. */
export const BLOG_READ_POINTS = 10;

export interface ReadVerdict { read_s: number; required_s: number; met: boolean; }

async function loadReadState(enrollmentId: string, blogId: string): Promise<ReadState | null> {
  const rows = await sequelize.query<{ read_state: ReadState | null }>(
    `SELECT read_state FROM blog_post_views WHERE enrollment_id = :eid AND blog_post_id = :bid`,
    { replacements: { eid: enrollmentId, bid: blogId }, type: QueryTypes.SELECT },
  );
  return rows[0]?.read_state ?? null;
}

/** Fold a read beat into the student's continuous-dwell state and return the verdict. */
export async function recordReadBeat(enrollmentId: string, blogId: string, beat: { delta_s: number }): Promise<ReadVerdict> {
  const prev = await loadReadState(enrollmentId, blogId);
  const next = accumulateRead(prev, beat, new Date().toISOString());
  // Upsert on the same (enrollment_id, blog_post_id) unique key the ambient feed
  // uses. FK to blog_posts guarantees a real blog; a bad id surfaces as an error.
  await sequelize.query(
    `INSERT INTO blog_post_views (id, enrollment_id, blog_post_id, first_seen_at, last_seen_at, seen_count, read_state)
       VALUES (gen_random_uuid(), :eid, :bid, NOW(), NOW(), 1, :rs::jsonb)
     ON CONFLICT (enrollment_id, blog_post_id)
       DO UPDATE SET read_state = :rs::jsonb, last_seen_at = NOW()`,
    { replacements: { eid: enrollmentId, bid: blogId, rs: JSON.stringify(next) }, type: QueryTypes.INSERT },
  );
  return meetsReadRequirement(next);
}

/** Gate: throw 422 (same shape as the watch gate) if the 2-minute read isn't met. */
export async function assertReadSatisfied(enrollmentId: string, blogId: string): Promise<void> {
  const verdict = meetsReadRequirement(await loadReadState(enrollmentId, blogId));
  if (verdict.met) return;
  const left = Math.max(1, verdict.required_s - verdict.read_s);
  throw Object.assign(
    new Error(`Keep reading — spend about ${left}s more on the post to collect your points (2 minutes total).`),
    { status: 422, code: 'read_requirement', read_s: verdict.read_s, required_s: verdict.required_s },
  );
}

/** Collect a blog's points once the read gate is met. Idempotent per blog. */
export async function collectBlog(enrollmentId: string, blogId: string): Promise<{ points_awarded: number; already: boolean }> {
  await assertReadSatisfied(enrollmentId, blogId);
  if (!env.portalPointsAwardEnabled) return { points_awarded: 0, already: false };
  const res = await award(enrollmentId, {
    eventType: 'card_complete',
    eventKey: `blog:${blogId}`,               // same ref the feed uses ⇒ once-per-blog
    points: BLOG_READ_POINTS,
    metadata: { blog_post_id: blogId, source: 'blog_read' },
  });
  return { points_awarded: res.awarded ? res.points : 0, already: !res.awarded };
}
