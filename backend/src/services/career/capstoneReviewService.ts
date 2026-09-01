/**
 * capstoneReviewService — the approval gate the Capstone Record is missing.
 *
 * CONVERGENCE, 2026-08-25 (Ali's call). Two public student portfolios were built in
 * parallel by two sessions: the Capstone Record at `/p/:slug`, which shipped and is live,
 * and a `/talent/:slug` surface built here. Rather than ship two shareable portfolio URLs
 * with different publishing rules, `/p/:slug` wins and this file supplies the half it
 * lacked.
 *
 * WHAT WAS DROPPED, and why it is not a loss: `career_publications` and
 * `career_publication_snapshots` duplicated `capstone_records` and
 * `capstone_record_versions` almost field for field. Both designs independently landed on
 * "store the compiled record whole, keep a versions table" — so the duplicate was deleted
 * rather than reconciled. All three tables were empty in production, so nothing migrated.
 *
 * WHAT SURVIVED, because Capstone genuinely lacked it:
 *   - a review gate. Before this, a record went to `published` with no human in the loop.
 *   - an approval audit: who decided what, about which exact version.
 *   - mentor scoping, so a mentor reviews only the learners they are over.
 *
 * TWO AXES STAY SEPARATE, which is Capstone's own rule and a good one:
 *   status     draft | published | archived     <- earned, requires approval
 *   visibility private | unlisted | public      <- the LEARNER's choice, always theirs
 *
 * A reviewer approves that the work is publishable. The learner decides who can see it.
 * Conflating them would mean approval silently made someone searchable.
 */
import { Op } from 'sequelize';
import { sequelize } from '../../config/database';
import CapstoneReviewApproval, { type CapstoneDecision } from '../../models/CapstoneReviewApproval';
import { canReview, visibleEnrollmentIds, type ReviewerIdentity } from './careerMentorScopeService';

function fail(status: number, message: string, errorClass: string): Error {
  return Object.assign(new Error(message), { status, error_class: errorClass });
}

interface CapstoneRow {
  id: string;
  enrollment_id: string;
  slug: string;
  status: string;
  visibility: string;
  version: number;
}

/** Capstone owns its own tables; we read them rather than re-modelling them. */
async function findRecordByEnrollment(enrollmentId: string): Promise<CapstoneRow | null> {
  const [row] = await sequelize.query(
    `SELECT id, enrollment_id, slug, status, visibility, version
       FROM capstone_records WHERE enrollment_id = :eid LIMIT 1`,
    { replacements: { eid: enrollmentId }, type: (sequelize as any).QueryTypes?.SELECT ?? 'SELECT' },
  ) as unknown as CapstoneRow[];
  return row || null;
}

async function findRecordById(recordId: string): Promise<CapstoneRow | null> {
  const [row] = await sequelize.query(
    `SELECT id, enrollment_id, slug, status, visibility, version
       FROM capstone_records WHERE id = :id LIMIT 1`,
    { replacements: { id: recordId }, type: (sequelize as any).QueryTypes?.SELECT ?? 'SELECT' },
  ) as unknown as CapstoneRow[];
  return row || null;
}

export type CapstoneReviewState = 'no_record' | 'draft' | 'in_review' | 'published' | 'changes_requested';

/**
 * "In review" is DERIVED: a record sitting at `draft` with a pending review request and no
 * decision yet. Deriving it rather than adding a fourth `status` value keeps Capstone's
 * status enum exactly as its author designed it, so nothing else that reads
 * `capstone_records.status` has to learn a new value.
 */
export async function getReviewState(enrollmentId: string) {
  const record = await findRecordByEnrollment(enrollmentId);
  if (!record) return { state: 'no_record' as CapstoneReviewState, slug: null, version: null, visibility: null, last_review: null };

  const pending = await CapstoneReviewApproval.findOne({
    where: { record_id: record.id, decision: { [Op.is]: null } as any },
    order: [['requested_at', 'DESC']],
  });

  const lastDecided = await CapstoneReviewApproval.findOne({
    where: { record_id: record.id, decision: { [Op.not]: null } as any },
    order: [['decided_at', 'DESC']],
  });

  let state: CapstoneReviewState = record.status === 'published' ? 'published' : 'draft';
  if (pending) state = 'in_review';
  else if (record.status !== 'published' && lastDecided?.decision === 'changes_requested') state = 'changes_requested';

  return {
    state,
    slug: record.slug,
    version: record.version,
    visibility: record.visibility,
    public_url: record.status === 'published' ? `/p/${record.slug}` : null,
    last_review: lastDecided
      ? { decision: lastDecided.decision, notes: lastDecided.reviewer_notes, decided_at: lastDecided.decided_at }
      : null,
  };
}

/**
 * Learner asks for review of the version currently compiled into their record.
 *
 * Idempotent: asking twice while one is pending returns the existing request rather than
 * queueing a reviewer a second copy of the same thing.
 */
export async function requestCapstoneReview(enrollmentId: string) {
  const record = await findRecordByEnrollment(enrollmentId);
  if (!record) throw fail(404, 'You do not have a capstone record yet', 'NotFoundError');
  if (record.status === 'published') throw fail(409, 'Your record is already published', 'AlreadyPublished');

  // ── the narrative is written HERE, and nowhere else ──────────────────────
  //
  // Asking for review is the only moment a model writes prose for this record. That is
  // deliberate: it puts the generated text in front of the reviewer who is about to
  // approve it, so a human reads the exact sentence that will publish. Generating at
  // compile time instead would let approved prose be silently replaced by prose nobody
  // has read, which is the failure the whole review gate exists to prevent.
  //
  // Best-effort throughout. A model that is slow or unavailable must never block a
  // learner from asking for review, so every failure leaves the record exactly as it was.
  await writeNarrativeForReview(enrollmentId, record).catch((e: any) => {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'backend',
      event: 'narrative_generation_skipped', outcome: 'partial',
      error_class: e?.error_class || e?.name || 'Error',
      context: { enrollment_id: enrollmentId, message: e?.message },
    }));
  });

  /**
   * findOne + create, NOT findOrCreate.
   *
   * `findOrCreate` merges its `where` clause into the values it inserts, so a where
   * containing an operator — `decision: { [Op.is]: null }`, which is exactly how "still
   * pending" is expressed here — makes Sequelize try to write that operator OBJECT into a
   * string column. It fails with "string violation: decision cannot be an array or an
   * object" and 500s. Found by Ali clicking the button in production; the unit tests
   * mocked `findOrCreate` and so asserted this function's logic while never exercising
   * Sequelize's actual behaviour.
   *
   * Idempotency does not depend on this code path being careful: the partial unique index
   * `capstone_review_pending_unique ... WHERE decision IS NULL` still allows at most one
   * pending review per record, so a race loses at the database.
   */
  const existing = await CapstoneReviewApproval.findOne({
    where: { record_id: record.id, decision: { [Op.is]: null } as any },
    order: [['requested_at', 'DESC']],
  });
  if (existing) {
    return { review_id: existing.id, version: existing.version, state: 'in_review' as const, deduplicated: true };
  }

  const approval = await CapstoneReviewApproval.create({
    record_id: record.id,
    enrollment_id: record.enrollment_id,
    version: record.version,
  } as any);

  return { review_id: approval.id, version: record.version, state: 'in_review' as const, deduplicated: false };
}

export interface CapstoneDecisionInput {
  recordId: string;
  decision: CapstoneDecision;
  reviewer: ReviewerIdentity;
  notes?: string | null;
}

/**
 * A human decides. THE ONLY path that sets `status = 'published'`.
 *
 * Note what approval does NOT touch: `visibility`. Approving says the work is publishable,
 * not that it should be indexed. The learner keeps that choice.
 */
export async function recordCapstoneDecision(input: CapstoneDecisionInput) {
  const record = await findRecordById(input.recordId);
  if (!record) throw fail(404, 'Record not found', 'NotFoundError');

  if (!await canReview(input.reviewer, record.enrollment_id)) {
    throw fail(403, 'That learner is outside your mentor scope', 'OutsideScope');
  }

  const pending = await CapstoneReviewApproval.findOne({
    where: { record_id: record.id, decision: { [Op.is]: null } as any },
    order: [['requested_at', 'DESC']],
  });
  if (!pending) throw fail(409, 'That record is not awaiting review', 'NotInReview');

  await pending.update({
    decision: input.decision,
    reviewer_id: input.reviewer.sub,
    reviewer_email: input.reviewer.email ?? null,
    reviewer_notes: input.notes ?? null,
    decided_at: new Date(),
  });

  if (input.decision === 'approved') {
    await sequelize.query(
      `UPDATE capstone_records SET status = 'published', published_at = NOW(), updated_at = NOW()
        WHERE id = :id`,
      { replacements: { id: record.id } },
    );
  }
  // changes_requested / rejected leave status alone. The learner keeps building and asks
  // again; the decision record stays exactly as it was written.

  return { decision: input.decision, published: input.decision === 'approved' };
}

/**
 * The learner's own control over who can see an APPROVED record.
 *
 * Ali, 2026-08-25: default noindex, the learner opts in to being indexable. `public` is
 * that opt-in. Deliberately not a reviewer's decision — a mentor approves the work, the
 * learner chooses the audience.
 */
export async function setVisibility(enrollmentId: string, visibility: 'private' | 'unlisted' | 'public') {
  const record = await findRecordByEnrollment(enrollmentId);
  if (!record) throw fail(404, 'You do not have a capstone record yet', 'NotFoundError');

  await sequelize.query(
    `UPDATE capstone_records SET visibility = :v, updated_at = NOW() WHERE id = :id`,
    { replacements: { v: visibility, id: record.id } },
  );
  return { visibility, indexable: visibility === 'public' };
}

/** The reviewer's queue, scoped to the learners they are over. */
export async function listCapstoneReviewQueue(reviewer: ReviewerIdentity, limit = 50) {
  const scope = await visibleEnrollmentIds(reviewer);
  // `[]` means a mentor with no grants and must return nothing; `null` means unscoped admin.
  if (scope !== null && scope.length === 0) return [];

  const pending = await CapstoneReviewApproval.findAll({
    where: {
      decision: { [Op.is]: null } as any,
      ...(scope !== null ? { enrollment_id: { [Op.in]: scope } } : {}),
    },
    order: [['requested_at', 'ASC']],
    limit,
    raw: true,
  }) as unknown as Array<{ id: string; record_id: string; enrollment_id: string; version: number; requested_at: Date }>;

  if (!pending.length) return [];

  const rows = await sequelize.query(
    `SELECT r.id, r.slug, r.visibility, e.full_name
       FROM capstone_records r
       JOIN enrollments e ON e.id = r.enrollment_id
      WHERE r.id IN (:ids)`,
    { replacements: { ids: pending.map((p) => p.record_id) }, type: (sequelize as any).QueryTypes?.SELECT ?? 'SELECT' },
  ) as unknown as Array<{ id: string; slug: string; visibility: string; full_name: string }>;
  const byId = new Map(rows.map((r) => [r.id, r]));

  return pending.map((p) => {
    const r = byId.get(p.record_id);
    return {
      review_id: p.id,
      record_id: p.record_id,
      enrollment_id: p.enrollment_id,
      version: p.version,
      requested_at: p.requested_at,
      slug: r?.slug ?? null,
      visibility: r?.visibility ?? null,
      full_name: r?.full_name ?? null,
    };
  });
}

/**
 * The record a reviewer is being asked to decide on.
 *
 * Deliberately NOT the public reader. `publicViewDecision` requires both status and
 * visibility to pass, and EVERY record in a review queue is by definition not yet
 * published — so the public path 404s on all of them. The review page originally linked
 * a reviewer to `/p/:slug` and it could never have worked once (found by Ali, 2026-08-25:
 * every "Open record" click landed on "Not found", in the public marketing shell).
 *
 * Scope-checked exactly like a decision: a mentor may read only the records of learners
 * they are over. Reading someone's unpublished portfolio is as sensitive as deciding on
 * it, so it gets the same gate rather than a weaker one.
 */
export async function getRecordForReview(recordId: string, reviewer: ReviewerIdentity) {
  const record = await findRecordById(recordId);
  if (!record) throw fail(404, 'Record not found', 'NotFoundError');

  if (!await canReview(reviewer, record.enrollment_id)) {
    throw fail(403, 'That learner is outside your mentor scope', 'OutsideScope');
  }

  const [row] = await sequelize.query(
    `SELECT content_json FROM capstone_records WHERE id = :id LIMIT 1`,
    { replacements: { id: recordId }, type: (sequelize as any).QueryTypes?.SELECT ?? 'SELECT' },
  ) as unknown as Array<{ content_json: any }>;

  return {
    record_id: record.id,
    slug: record.slug,
    version: record.version,
    status: record.status,
    visibility: record.visibility,
    // The stored snapshot, exactly as it would publish. A reviewer must approve the thing
    // that will actually go live, not a fresh render that may already have moved on.
    content: row?.content_json ?? null,
  };
}

/**
 * Generate the narrative and store it on the record, ready for a reviewer to read.
 *
 * Stored directly rather than via `compileAndStore`, because the compiler carries the
 * narrative FORWARD from the prior record and never generates one. Writing it here and
 * letting the next compile carry it is what makes "approved prose stays approved" hold.
 *
 * Returns without writing when there is not enough evidence to say anything, which is the
 * common case and an honest one — a paragraph that says nothing is worse than silence.
 */
async function writeNarrativeForReview(enrollmentId: string, record: any): Promise<void> {
  const content = record?.content_json;
  if (!content) return;

  const { readRepoSignals } = await import('../sbp/repoSignals');
  const { inferSkills } = await import('../sbp/skillInference');
  const { generateNarrative } = await import('./portfolioNarrativeService');
  const { default: GitHubConnection } = await import('../../models/GitHubConnection');

  const conn: any = await GitHubConnection.findOne({ where: { enrollment_id: enrollmentId } });
  const tree = conn?.file_tree_json?.tree;
  const signals = Array.isArray(tree) ? readRepoSignals(tree) : null;

  const skills = Array.isArray(content.skills) && content.skills.length
    ? content.skills
    : inferSkills({
      signals: signals ?? { languages: [], structure: [], file_count: 0,
        practices: { containerised: false, tested: false, documented: false,
          continuous_integration: false, typed: false, full_stack: false } },
      paths: Array.isArray(tree)
        ? tree.filter((e: any) => e && typeof e.path === 'string').map((e: any) => String(e.path).toLowerCase())
        : [],
    });

  const result = await generateNarrative({
    full_name: content?.identity?.full_name ?? 'This engineer',
    project: {
      name: content?.system?.project_name ?? null,
      problem: content?.system?.problem ?? null,
      what_it_does: content?.system?.what_it_does ?? null,
      organization: content?.system?.organization ?? null,
      industry: content?.system?.industry ?? null,
    },
    skills,
    signals,
  });

  if (!result.narrative) return;

  await record.update({
    content_json: { ...content, narrative: result.narrative },
    updated_at: new Date(),
  });
}
