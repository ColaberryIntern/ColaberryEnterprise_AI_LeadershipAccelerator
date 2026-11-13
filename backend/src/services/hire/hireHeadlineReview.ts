/**
 * hireHeadlineReview - the admin side of the studio's "headline" box (kit §3.1).
 *
 * A candidate's headline on Hire is learner-authored text that a human signed off on: it is
 * `career_portfolio_pages.approved_identity.title`, frozen from their profile title
 * (`enrollments.title`) when their page was approved. The studio therefore never edits it; it
 * stores `hire_profile_intro.headline_draft`, and the copy there says the live headline does
 * not change until the Colaberry team approves it. This module is that approval.
 *
 *   list     every draft that differs from the live headline, oldest first.
 *   approve  the reviewed text becomes the live headline in BOTH places in one transaction:
 *            the frozen copy (so Hire shows it now, without re-freezing anything else the
 *            reviewer has not read) and the profile title (so the next portfolio approval,
 *            which re-freezes from the profile, keeps it instead of quietly reverting it).
 *   reject   the draft is cleared; the live headline is untouched.
 *
 * Both decisions carry the draft text the reviewer read. If the candidate changed it since,
 * nothing is written and the answer is a 409, so a reviewer can never approve text they did
 * not see. Re-sending the same decision after it landed is also a 409 (the draft is gone),
 * which the admin page treats as "already handled" by reloading.
 */
import { sequelize } from '../../config/database';

export interface HeadlineDraft {
  readonly enrollmentId: string;
  readonly name: string;
  readonly slug: string | null;
  /** What Hire shows today: the frozen headline, else the profile title. */
  readonly live: string | null;
  readonly draft: string;
  readonly updatedAt: string;
}

export type HeadlineDecision = 'approve' | 'reject';

export class HeadlineReviewError extends Error {
  constructor(message: string, readonly status: number, readonly error_class: string) {
    super(message);
    this.name = 'HeadlineReviewError';
  }
}

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

export function toHeadlineDraft(r: Row): HeadlineDraft {
  return {
    enrollmentId: String(r.enrollment_id),
    name: String(r.full_name ?? ''),
    slug: str(r.slug),
    live: str(r.approved_title) ?? str(r.title),
    draft: String(r.headline_draft ?? '').trim(),
    updatedAt: new Date(r.updated_at as string).toISOString(),
  };
}

export async function listHeadlineDrafts(): Promise<HeadlineDraft[]> {
  const [rows] = await sequelize.query(
    `SELECT i.enrollment_id, e.full_name, e.title, p.slug, p.approved_identity->>'title' AS approved_title,
            i.headline_draft, i.updated_at
       FROM hire_profile_intro i
       JOIN enrollments e ON e.id = i.enrollment_id
       LEFT JOIN career_portfolio_pages p ON p.enrollment_id = i.enrollment_id
      WHERE NULLIF(btrim(i.headline_draft), '') IS NOT NULL
        AND btrim(i.headline_draft) IS DISTINCT FROM COALESCE(p.approved_identity->>'title', e.title)
      ORDER BY i.updated_at ASC
      LIMIT 200`,
  );
  return (Array.isArray(rows) ? rows : []).map((r) => toHeadlineDraft(r as Row));
}

export async function decideHeadline(
  enrollmentId: string, decision: HeadlineDecision, reviewedDraft: string, reviewer: string,
): Promise<void> {
  const draft = reviewedDraft.trim();
  await sequelize.transaction(async (transaction) => {
    // Clear the draft ONLY if it is still exactly what the reviewer read.
    const [cleared] = await sequelize.query(
      `UPDATE hire_profile_intro SET headline_draft = NULL, updated_at = NOW()
        WHERE enrollment_id = $1 AND btrim(headline_draft) = $2
        RETURNING enrollment_id`,
      { bind: [enrollmentId, draft], transaction },
    );
    if (!Array.isArray(cleared) || !cleared.length) {
      throw new HeadlineReviewError('This headline changed or was already decided; reload the list', 409, 'StaleDraft');
    }
    if (decision === 'reject') return;
    await sequelize.query('UPDATE enrollments SET title = $2 WHERE id = $1', { bind: [enrollmentId, draft], transaction });
    await sequelize.query(
      `UPDATE career_portfolio_pages
          SET approved_identity = jsonb_set(approved_identity, '{title}', to_jsonb($2::text)), updated_at = NOW()
        WHERE enrollment_id = $1 AND approved_identity IS NOT NULL AND jsonb_typeof(approved_identity) = 'object'`,
      { bind: [enrollmentId, draft], transaction },
    );
  });
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'info', service: 'backend',
    event: 'hire_headline_decided', outcome: 'success',
    context: { enrollment_id: enrollmentId, decision, reviewer },
  }));
}
