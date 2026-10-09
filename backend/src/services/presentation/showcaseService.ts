import crypto from 'crypto';
import { canPublish, approvalState, type Audience, type ShowcaseRow } from './showcaseAccess';

/**
 * Publishing a showcase, withdrawing it, and keeping an approval attached to the thing
 * it approved.
 *
 * ONE PUBLICATION, EVER. A student double-clicks "publish"; the first request is slow;
 * both run. Without a constraint that is two rows, two gallery entries, two
 * notifications and — if a surface later pays for publishing — two awards. The guard
 * is a PARTIAL UNIQUE INDEX on the live publication, not a read-then-write, because a
 * read-then-write is exactly the thing that loses this race.
 *
 * RE-PUBLISHING IS A NO-OP, NOT AN ERROR. The student pressed a button and the thing
 * they wanted is true. Returning a failure would make them press it again.
 *
 * REPLACING THE TAKE INVALIDATES THE APPROVAL. `content_hash` is frozen at approval.
 * If the recording changes, the hash changes and the approval no longer applies —
 * otherwise a student could swap a different recording behind an approval somebody
 * gave to something they never watched. Nothing about that is recoverable after the
 * fact, so it is enforced at the write.
 *
 * WITHDRAWAL IS IMMEDIATE AND KEEPS THE ROW. The row stays, with `withdrawn_at` and a
 * reason, because "it was published and then withdrawn" is a different fact from "it
 * was never published" and somebody will need to know which.
 */

/** Lazy so importing this module never constructs the ORM. */
async function db() {
  const { sequelize } = await import('../../config/database');
  return sequelize;
}

/**
 * What the approval is given FOR. Any change to what the audience would actually see
 * must change this, or an approval would survive a swap.
 */
export function contentHash(parts: {
  attemptId: string;
  recordingIds: string[];
  draftSummary: string;
}): string {
  const canonical = JSON.stringify({
    attemptId: parts.attemptId,
    recordingIds: [...parts.recordingIds].sort(),
    draftSummary: parts.draftSummary.trim(),
  });
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 64);
}

export type PublishResult =
  | { ok: true; showcaseId: string; alreadyPublished: boolean; publicationRef: string }
  | { ok: false; reason: string };

function log(event: string, ctx: Record<string, unknown>, outcome: 'success' | 'failure' = 'success'): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'warn' : 'info',
    service: 'presentation-showcase', event, outcome, context: ctx,
  }));
}

/**
 * Publish, once.
 *
 * The caller has already proved the row belongs to the student. This decides whether
 * it MAY be published and makes sure it happens exactly once.
 */
export async function publishShowcase(row: ShowcaseRow, audience: Audience): Promise<PublishResult> {
  // Already live: say so and change nothing. The button did what they wanted.
  if (row.publishedAt && !row.withdrawnAt) {
    return {
      ok: true,
      showcaseId: row.id,
      alreadyPublished: true,
      publicationRef: `showcase:${row.id}`,
    };
  }

  const allowed = canPublish(row);
  if (!allowed.ok) {
    log('showcase_publish_refused', { showcaseId: row.id, reason: allowed.reason, approval: approvalState(row) }, 'failure');
    return { ok: false, reason: allowed.reason };
  }

  const sequelize = await db();
  // The partial unique index `presentation_showcases_one_live` is what makes this
  // single. A second concurrent publish updates zero rows and is reported as the
  // no-op it is, rather than minting a second publication.
  const [rows] = await sequelize.query(
    `UPDATE presentation_showcases
        SET published_at = COALESCE(published_at, NOW()),
            audience = :audience,
            publication_ref = COALESCE(publication_ref, 'showcase:' || id::text),
            withdrawn_at = NULL,
            withdrawn_reason = NULL,
            updated_at = NOW()
      WHERE id = :id
        AND published_at IS NULL
     RETURNING id, publication_ref`,
    { replacements: { id: row.id, audience } },
  ) as [Array<Record<string, any>>, unknown];

  const updated = rows?.[0];
  if (!updated) {
    // Somebody else published it between the read and the write. That is the correct
    // outcome, not a failure — there is exactly one publication and it exists.
    return { ok: true, showcaseId: row.id, alreadyPublished: true, publicationRef: `showcase:${row.id}` };
  }

  log('showcase_published', { showcaseId: row.id, audience });
  return {
    ok: true,
    showcaseId: String(updated.id),
    alreadyPublished: false,
    publicationRef: String(updated.publication_ref || `showcase:${row.id}`),
  };
}

export type WithdrawResult = { ok: true; alreadyWithdrawn: boolean } | { ok: false; reason: string };

/** Withdraw. Immediate, idempotent, and the row survives with its reason. */
export async function withdrawShowcase(showcaseId: string, reason: string): Promise<WithdrawResult> {
  const sequelize = await db();
  const [rows] = await sequelize.query(
    `UPDATE presentation_showcases
        SET withdrawn_at = NOW(), withdrawn_reason = :reason, updated_at = NOW()
      WHERE id = :id AND withdrawn_at IS NULL
     RETURNING id`,
    { replacements: { id: showcaseId, reason: (reason || '').slice(0, 500) } },
  ) as [Array<Record<string, any>>, unknown];

  if (!rows?.[0]) return { ok: true, alreadyWithdrawn: true };
  log('showcase_withdrawn', { showcaseId });
  return { ok: true, alreadyWithdrawn: false };
}

/**
 * Record a new content hash for a showcase — called when the underlying take changes.
 *
 * It does NOT clear the approval timestamps. The approval is a fact that happened and
 * deleting it would lose the audit trail; `approvalState` compares the hashes and
 * reports `stale`, which is both honest and reversible if the student puts the
 * original take back.
 */
export async function rebindContent(showcaseId: string, newHash: string): Promise<void> {
  const sequelize = await db();
  await sequelize.query(
    `UPDATE presentation_showcases
        SET draft_json = jsonb_set(COALESCE(draft_json, '{}'::jsonb), '{current_content_hash}', to_jsonb(:hash::text), true),
            updated_at = NOW()
      WHERE id = :id`,
    { replacements: { id: showcaseId, hash: newHash } },
  );
  log('showcase_content_rebound', { showcaseId });
}
