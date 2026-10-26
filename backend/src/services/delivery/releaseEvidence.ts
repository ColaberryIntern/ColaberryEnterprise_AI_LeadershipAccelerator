/**
 * releaseEvidence - the join between a release and the evidence it ships (C8.11).
 *
 * WHAT WAS MISSING AND WHY IT MATTERS. C8.11's second acceptance criterion is "handover
 * carries the evidence trail with it". `delivery_evidence` already has a `release_id`
 * column and an index on it (`idx_delivery_evidence_release`), and the model declares the
 * field. Nothing has ever written it: `recordEvidence` sets `story_id` only, so every
 * evidence row in the ledger is attached to a story and to no release.
 *
 * The consequence is subtle rather than obvious. A handover does carry *something* today
 * - the client projection builds its `evidence_summary` from the release row's own
 * `check_results` and `waived_categories` JSONB. But that is the gate's verdict, not the
 * evidence behind it. A check that says "tests: pass" is an assertion; the evidence rows
 * recording which suite ran against which SHA are the trail. The column to connect them
 * was cut and left empty.
 *
 * THE CLAIM MODEL. Evidence is recorded against a story as work happens, before anyone
 * knows which release will ship it. So the release claims its evidence at the moment it
 * is cut, rather than evidence being written with a release it cannot yet know.
 *
 * ALREADY-CLAIMED EVIDENCE IS NEVER REASSIGNED. A row that belongs to release 1 stays
 * with release 1 when release 2 is cut, because the question each row answers is "what
 * did we know when we shipped that one", and moving it would rewrite the history of a
 * release that has already been judged. This also makes the operation idempotent for
 * free: claiming twice claims nothing the second time.
 */

/** Structured, because a silent failure here produces a handover with a thin trail. */
const log = (event: string, context: Record<string, unknown>): void => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    service: 'delivery-release-evidence',
    event,
    outcome: 'failure',
    ...context,
  }));
};

export interface ClaimResult {
  claimed: number;
  /** False when the claim could not run at all, so a caller can tell 0 from unknown. */
  ran: boolean;
}

/**
 * Attach every unclaimed evidence row for a project to this release.
 *
 * Returns `{ ran: false }` rather than `{ claimed: 0 }` when it could not run, because
 * those are different facts and a handover that reports "no evidence" when it means "we
 * did not look" is the failure this whole initiative keeps finding.
 */
export async function claimEvidenceForRelease(input: {
  releaseId: string;
  projectId: string;
  models: any;
}): Promise<ClaimResult> {
  const { models } = input;
  if (!models?.DeliveryEvidence) {
    return { claimed: 0, ran: false };
  }

  try {
    const result = await models.DeliveryEvidence.update(
      { release_id: input.releaseId },
      {
        where: {
          delivery_project_id: input.projectId,
          // Only unclaimed rows. See the header: a row already on a release stays there.
          release_id: null,
        },
      },
    );
    // Sequelize returns [affectedCount] for an update.
    const claimed = Array.isArray(result) ? Number(result[0]) || 0 : 0;
    return { claimed, ran: true };
  } catch (err) {
    log('release_evidence_claim_failed', {
      error_class: (err as Error)?.name ?? 'UnexpectedError',
      release_id: input.releaseId,
      delivery_project_id: input.projectId,
      message: (err as Error)?.message,
    });
    return { claimed: 0, ran: false };
  }
}

export interface ReleaseEvidenceLine {
  id: string;
  dimension: string | null;
  evidenceType: string | null;
  outcome: string | null;
  subjectSha: string | null;
  sourceRef: string | null;
  storyId: string | null;
  recordedAt: string | null;
}

/**
 * The evidence a release actually carries.
 *
 * Deliberately NOT merged into the client projection here. That surface is governed by
 * an allowlist with a fail-closed tripwire, and widening what an external reviewer sees
 * is a separate decision from recording the join correctly. This read is for the admin
 * side; the client-facing question is left to whoever makes that call.
 */
export async function readReleaseEvidence(input: {
  releaseId: string;
  models: any;
}): Promise<ReleaseEvidenceLine[]> {
  const { models } = input;
  if (!models?.DeliveryEvidence) return [];

  const rows = await models.DeliveryEvidence.findAll({
    where: { release_id: input.releaseId },
    order: [['created_at', 'ASC']],
  });

  return (rows ?? []).map((r: any): ReleaseEvidenceLine => ({
    id: r.id,
    dimension: r.dimension ?? null,
    evidenceType: r.evidence_type ?? null,
    outcome: r.outcome ?? null,
    subjectSha: r.subject_sha ?? null,
    sourceRef: r.source_ref ?? null,
    storyId: r.story_id ?? null,
    recordedAt: r.created_at ? new Date(r.created_at).toISOString() : null,
  }));
}

/**
 * Does this release's claimed evidence actually support its own check results?
 *
 * A release can pass its gate on `check_results` alone, because the gate reads the
 * verdicts rather than the trail. This reports, per dimension the gate says passed,
 * whether any evidence row exists for it. It ASSERTS NOTHING and blocks nothing: the
 * point is to make a thin trail visible at handover rather than to add a second gate,
 * and a dimension with no evidence row is reported as `unevidenced`, never as a failure.
 */
export function summarizeTrailCoverage(input: {
  checkResults: Array<{ category?: string; outcome?: string }>;
  evidence: ReleaseEvidenceLine[];
}): Array<{ category: string; checkOutcome: string; evidenceRows: number; unevidenced: boolean }> {
  const byDimension = new Map<string, number>();
  for (const e of input.evidence) {
    const d = (e.dimension ?? '').trim();
    if (!d) continue;
    byDimension.set(d, (byDimension.get(d) ?? 0) + 1);
  }

  return (input.checkResults ?? [])
    .filter((c) => typeof c?.category === 'string' && c.category)
    .map((c) => {
      const rows = byDimension.get(String(c.category)) ?? 0;
      return {
        category: String(c.category),
        checkOutcome: String(c.outcome ?? 'unknown'),
        evidenceRows: rows,
        unevidenced: rows === 0,
      };
    });
}
