/**
 * postConsentService — the learner's per-post consent to appear on a public page.
 *
 * WHY THIS EXISTS. `readSharedPosts` has always filtered on `shared_to_portfolio = true`,
 * and **nothing anywhere could set it**. The column could only ever be false, so 39 ritual
 * posts from 19 learners were unreachable by any surface: written, visible on the cohort
 * wall, and structurally unable to reach the page they were written to feed.
 *
 * THE RULE THAT MAKES REVOCATION REAL. Granting or revoking consent RECOMPILES the record
 * in the same request. Without that, "I unshared it" means a column changed while the
 * published page keeps serving the old snapshot — the post stays live, and the learner has
 * been told otherwise. A consent control that does not take effect is worse than none,
 * because it is believed.
 *
 * Recompiling is safe to do inline: `compileAndStore` is deterministic and returns
 * `unchanged` without writing when nothing moved, so a redundant call costs one comparison.
 *
 * THE LEARNER IS ALWAYS THE CALLER. Every function here takes the enrollment from the
 * token; none accepts a member id or a post owner from the request. A learner can only
 * ever change consent on their own posts, and ownership is verified against the post row
 * rather than assumed from the id.
 *
 * FAILURE-FIRST. (1) A failed recompile must not silently leave consent changed with a
 * stale page: the consent write and the recompile are reported together, and a recompile
 * failure surfaces rather than being swallowed. (2) No retry — both halves are local
 * writes. (3) Recovery: call again; it is idempotent. (4) Handled: no community member,
 * post not owned, post removed by moderation, unknown post, recompile failure, no project.
 */

import { sequelize } from '../../config/database';

export interface PostConsentRow {
  id: string;
  week: number | null;
  ritual: string | null;
  headline: string | null;
  /** First line of the post, so a learner can tell which one they are consenting to. */
  excerpt: string | null;
  shared: boolean;
  /** Moderation removed it. Consent cannot resurrect it, so the UI must say so. */
  removed: boolean;
}

function err(status: number, message: string, error_class: string) {
  return Object.assign(new Error(message), { status, error_class });
}

/** Their posts, with the current consent state of each. */
export async function listPostConsent(enrollmentId: string): Promise<PostConsentRow[]> {
  const [rows] = await sequelize.query(
    `SELECT p.id, p.week, p.ritual_meta, p.body, p.shared_to_portfolio, p.status
       FROM community_posts p
       JOIN community_members m ON m.id = p.member_id
      WHERE m.enrollment_id = $1
      ORDER BY p.week ASC NULLS LAST, p.updated_at ASC`,
    { bind: [enrollmentId] },
  );

  return (rows as any[]).map((r) => {
    const meta = r.ritual_meta && typeof r.ritual_meta === 'object' ? r.ritual_meta : {};
    return {
      id: String(r.id),
      week: typeof r.week === 'number' ? r.week : null,
      ritual: meta.ritual ?? null,
      headline: meta.headline ?? meta.title ?? null,
      excerpt: typeof r.body === 'string' && r.body.trim()
        ? r.body.trim().split('\n')[0].slice(0, 180)
        : null,
      shared: r.shared_to_portfolio === true,
      removed: r.status !== 'visible',
    };
  });
}

/**
 * Set consent on one post, then recompile so the published page matches.
 *
 * Ownership is checked in the UPDATE itself, joined through `community_members`, so a
 * learner cannot flip consent on somebody else's post by guessing an id. Zero rows updated
 * means "not yours, or does not exist" — reported as 404 so the two are indistinguishable.
 */
export async function setPostConsent(
  enrollmentId: string,
  postId: string,
  shared: boolean,
): Promise<{ post: PostConsentRow; recompiled: boolean }> {
  const [, meta] = await sequelize.query(
    `UPDATE community_posts p
        SET shared_to_portfolio = $3, updated_at = NOW()
       FROM community_members m
      WHERE m.id = p.member_id
        AND m.enrollment_id = $1
        AND p.id = $2`,
    { bind: [enrollmentId, postId, shared] },
  );

  if (!(meta as any)?.rowCount) {
    throw err(404, 'Not found', 'NotFound');
  }

  // RECOMPILE IN THE SAME REQUEST. This is the whole point: without it, revoking consent
  // changes a column while the live page keeps serving the previous snapshot.
  let recompiled = false;
  try {
    const [projects] = await sequelize.query(
      `SELECT id FROM projects WHERE enrollment_id = $1 AND archived_at IS NULL
        ORDER BY created_at ASC`,
      { bind: [enrollmentId] },
    );
    const { compileAndStore } = await import('./capstoneRecordStore');
    for (const row of projects as any[]) {
      // Every project, not just the first: a post is the learner's, and each of their
      // records carries the same posts band. Recompiling one would leave the others
      // publishing a post the learner just revoked.
      const result = await compileAndStore(String(row.id));
      if (result.outcome === 'updated') recompiled = true;
    }
  } catch (e: any) {
    // Surfaced, never swallowed. Consent HAS changed; the page may not have. The caller
    // needs to know that, because telling a learner their post is hidden when it is still
    // live is the failure this whole service exists to prevent.
    throw err(
      500,
      'Your choice was saved, but the published page could not be rebuilt. Please try again.',
      'RecompileFailed',
    );
  }

  const rows = await listPostConsent(enrollmentId);
  const post = rows.find((r) => r.id === String(postId));
  if (!post) throw err(404, 'Not found', 'NotFound');
  return { post, recompiled };
}
