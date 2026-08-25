/**
 * careerPublicationService — Gate 10 (versioned publication) + Gate 9b (review).
 *
 * The one rule everything here serves (build plan §23):
 *
 *   The private Career Studio changes constantly. The public portfolio is an
 *   IMMUTABLE APPROVED SNAPSHOT. New work must never silently change what an
 *   employer already looked at.
 *
 * So `requestReview` FREEZES the studio payload into `career_publication_snapshots`
 * and the public reader only ever reads that frozen row — never `getCareerProfile`.
 *
 * Publishing is earned, not automatic (plan §20/§21): a snapshot cannot be created
 * unless readiness policy is met, and only a human decision moves it live. Nothing in
 * this file approves anything.
 */
import crypto from 'crypto';
import { Op } from 'sequelize';
import CareerPublication, { type CareerPublicationStatus } from '../../models/CareerPublication';
import CareerPublicationSnapshot from '../../models/CareerPublicationSnapshot';
import CareerPublicationApproval, { type ReviewDecision } from '../../models/CareerPublicationApproval';
import { getCareerProfile } from './careerProfileService';

const SLUG_MAX = 60;

function fail(status: number, message: string, errorClass: string): Error {
  return Object.assign(new Error(message), { status, error_class: errorClass });
}

/** Stable sha256 over the frozen payload — the basis for unchanged-resubmission detection. */
export function hashPayload(payload: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/**
 * `Jane Doe` → `jane-doe`. Falls back to a neutral stem rather than leaking an email
 * local-part into a public URL when a name is unusable (non-Latin script, punctuation
 * only, empty).
 */
export function slugify(fullName: string): string {
  const base = (fullName || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX);
  return base || 'member';
}

/**
 * Collision handling (plan §58). Two people genuinely do share names, so the second one
 * gets `jane-doe-2`, not a 500. Bounded: after 50 attempts we fall back to a random
 * suffix rather than looping while a public request waits.
 */
export async function mintUniqueSlug(fullName: string): Promise<string> {
  const base = slugify(fullName);
  const taken = await CareerPublication.findAll({
    where: { slug: { [Op.like]: `${base}%` } },
    attributes: ['slug'],
    raw: true,
  }) as unknown as Array<{ slug: string }>;
  const used = new Set(taken.map((r) => r.slug));
  if (!used.has(base)) return base;
  for (let n = 2; n <= 50; n += 1) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${crypto.randomBytes(3).toString('hex')}`;
}

/** Get-or-create the learner's publication row. Idempotent. */
export async function ensurePublication(enrollmentId: string, fullName: string) {
  const existing = await CareerPublication.findOne({ where: { enrollment_id: enrollmentId } });
  if (existing) return existing;
  return CareerPublication.create({
    enrollment_id: enrollmentId,
    slug: await mintUniqueSlug(fullName),
    status: 'draft' as CareerPublicationStatus,
  });
}

/**
 * The payload frozen into a snapshot.
 *
 * Deliberately a SUBSET of the studio payload. `degraded`, `generated_at` and the raw
 * band scores are operational detail, and per plan §24 raw gamification must never
 * reach an employer-facing surface. Resume filename is dropped too — an employer has no
 * business seeing what a learner named their file.
 */
export function buildSnapshotPayload(profile: Awaited<ReturnType<typeof getCareerProfile>>) {
  return {
    identity: profile.identity && {
      full_name: profile.identity.full_name,
      title: profile.identity.title,
      company: profile.identity.company,
      linkedin_url: profile.identity.linkedin_url,
      avatar_data_url: profile.identity.avatar_data_url,
      cohort_name: profile.identity.cohort_name,
    },
    narrative: profile.narrative,
    capabilities: profile.capabilities.map((c) => ({
      skill_id: c.skill_id,
      name: c.name,
      evidence_level: c.evidence_level,
      evidence_count: c.evidence_count,
      last_demonstrated_at: c.last_demonstrated_at,
      // NOTE: no `bands`, no `proficiency`. Employer-readable capability + provenance
      // only — never a score an employer could mistake for a grade.
    })),
    artifacts: profile.artifacts.map((a) => ({
      kind: a.kind, title: a.title, summary: a.summary, competencies: a.competencies, created_at: a.created_at,
    })),
    projects: profile.projects.map((p) => ({
      name: p.name, organization_name: p.organization_name, industry: p.industry,
      business_problem: p.business_problem, github_repo_url: p.github_repo_url,
    })),
    readiness_at_submission: profile.readiness && {
      score: profile.readiness.score,
      met_count: profile.readiness.met_count,
      total_count: profile.readiness.total_count,
    },
  };
}

export interface RequestReviewResult {
  snapshot_id: string;
  version: number;
  status: CareerPublicationStatus;
  /** True when an identical pending snapshot already existed (idempotent replay). */
  deduplicated: boolean;
}

/**
 * Learner asks for review. Freezes the current studio into a new immutable snapshot.
 *
 * Three refusals, all deliberate:
 *  - readiness policy unmet → 422. Publishing is earned (plan §20).
 *  - already in review → 409. A reviewer must not be handed two versions of the same
 *    portfolio to read.
 *  - content unchanged since the pending snapshot → returns the existing one rather
 *    than minting v2 of identical bytes (plan §61 "same publication retry → one version").
 */
export async function requestReview(enrollmentId: string): Promise<RequestReviewResult> {
  const profile = await getCareerProfile(enrollmentId);
  if (!profile.identity) throw fail(404, 'Career profile not found', 'NotFoundError');
  if (!profile.readiness?.meets_policy) {
    throw fail(422, 'Your portfolio does not meet the readiness bar yet', 'ReadinessNotMet');
  }

  const publication = await ensurePublication(enrollmentId, profile.identity.full_name);

  const payload = buildSnapshotPayload(profile);
  const content_hash = hashPayload(payload);

  const latest = await CareerPublicationSnapshot.findOne({
    where: { publication_id: publication.id },
    order: [['version', 'DESC']],
  });

  if (publication.status === 'in_review' && latest) {
    // Same content resubmitted → hand back the pending snapshot, do not queue a second.
    if (latest.content_hash === content_hash) {
      return { snapshot_id: latest.id, version: latest.version, status: publication.status, deduplicated: true };
    }
    throw fail(409, 'Your portfolio is already awaiting review', 'AlreadyInReview');
  }

  const snapshot = await CareerPublicationSnapshot.create({
    publication_id: publication.id,
    version: (latest?.version ?? 0) + 1,
    payload,
    content_hash,
  });

  await publication.update({ status: 'in_review' });

  return { snapshot_id: snapshot.id, version: snapshot.version, status: 'in_review', deduplicated: false };
}

export interface ReviewInput {
  snapshotId: string;
  decision: ReviewDecision;
  reviewerId: string;
  reviewerEmail?: string | null;
  notes?: string | null;
}

/**
 * A human decides. THE ONLY path that can make a portfolio public.
 *
 * The unique index on `career_publication_approvals.snapshot_id` is what makes a
 * double-clicked Approve safe: the second insert loses at the database, and we return
 * the decision that actually stuck rather than pretending the second click won.
 */
export async function recordReviewDecision(input: ReviewInput): Promise<{ decision: ReviewDecision; duplicate: boolean }> {
  const snapshot = await CareerPublicationSnapshot.findByPk(input.snapshotId);
  if (!snapshot) throw fail(404, 'Snapshot not found', 'NotFoundError');

  const publication = await CareerPublication.findByPk(snapshot.publication_id);
  if (!publication) throw fail(404, 'Publication not found', 'NotFoundError');

  const [approval, created] = await CareerPublicationApproval.findOrCreate({
    where: { snapshot_id: snapshot.id },
    defaults: {
      snapshot_id: snapshot.id,
      publication_id: publication.id,
      decision: input.decision,
      reviewer_id: input.reviewerId,
      reviewer_email: input.reviewerEmail ?? null,
      reviewer_notes: input.notes ?? null,
    } as any,
  });

  if (!created) {
    // Already decided. Report the decision on record, not the one just attempted.
    return { decision: approval.decision, duplicate: true };
  }

  if (input.decision === 'approved') {
    await publication.update({ status: 'published', current_snapshot_id: snapshot.id });
  } else {
    // Changes requested / rejected → back to draft. The snapshot is NOT edited; the
    // learner keeps working and submits a new one, so the review record stays intact.
    await publication.update({ status: 'draft' });
  }

  return { decision: input.decision, duplicate: false };
}

/**
 * Staff withdraw a live portfolio. Keeps `current_snapshot_id` so restoring is a status
 * change rather than a re-review — suspension is not a deletion.
 */
export async function suspendPublication(enrollmentId: string): Promise<{ status: CareerPublicationStatus }> {
  const publication = await CareerPublication.findOne({ where: { enrollment_id: enrollmentId } });
  if (!publication) throw fail(404, 'Publication not found', 'NotFoundError');
  await publication.update({ status: 'suspended' });
  return { status: 'suspended' };
}

/**
 * The public read. Renders ONLY the approved frozen snapshot.
 *
 * Note what this function does NOT call: `getCareerProfile`. That is the entire point —
 * if the public page read live data, every new class activity would silently rewrite
 * what an employer saw, which §23 forbids.
 *
 * Returns null for unknown slug, unpublished, and suspended alike, so a guess cannot
 * distinguish "no such person" from "suspended" — the same non-enumerable 404 behaviour
 * the existing project share link already has.
 */
export async function getPublicSnapshotBySlug(slug: string): Promise<{ version: number; published_at: Date; payload: any } | null> {
  const publication = await CareerPublication.findOne({ where: { slug, status: 'published' } });
  if (!publication?.current_snapshot_id) return null;

  const snapshot = await CareerPublicationSnapshot.findByPk(publication.current_snapshot_id);
  if (!snapshot) return null;

  const approval = await CareerPublicationApproval.findOne({ where: { snapshot_id: snapshot.id } });
  return { version: snapshot.version, published_at: approval?.decided_at ?? snapshot.requested_at, payload: snapshot.payload };
}

/**
 * "7 verified updates since v3" (plan §23). Compares the learner's CURRENT studio against
 * the published snapshot so they can see what a new version would add — without any of
 * it leaking into the live public page.
 */
export async function getUnpublishedChanges(enrollmentId: string): Promise<{ has_changes: boolean; published_version: number | null } | null> {
  const publication = await CareerPublication.findOne({ where: { enrollment_id: enrollmentId } });
  if (!publication?.current_snapshot_id) return null;

  const snapshot = await CareerPublicationSnapshot.findByPk(publication.current_snapshot_id);
  if (!snapshot) return null;

  const profile = await getCareerProfile(enrollmentId);
  const currentHash = hashPayload(buildSnapshotPayload(profile));
  return { has_changes: currentHash !== snapshot.content_hash, published_version: snapshot.version };
}

export interface ReviewQueueItem {
  snapshot_id: string;
  publication_id: string;
  enrollment_id: string;
  slug: string;
  version: number;
  requested_at: Date;
  full_name: string | null;
  readiness_score: number | null;
  capability_count: number;
  artifact_count: number;
}

/**
 * The reviewer's queue: every snapshot awaiting a decision, oldest first.
 *
 * "Awaiting a decision" is derived — a snapshot with no row in
 * `career_publication_approvals` — rather than stored as a status on the snapshot.
 * That keeps the snapshot table append-only (see the model header) AND means the
 * queue cannot drift out of sync with the approvals it is derived from.
 *
 * Summary counts come from the frozen payload, not from a live re-read, so what a
 * reviewer sees in the queue is exactly what they will see when they open it.
 */
export async function listReviewQueue(
  limit = 50,
  /**
   * Enrollment ids this reviewer may see. `null` means unscoped (admin/owner);
   * `[]` means a mentor with no grants, who must see NOTHING. The two are
   * deliberately different — treating an empty scope as "no filter" is exactly how
   * a scoped surface accidentally shows everyone.
   */
  visibleEnrollmentIds: string[] | null = null,
): Promise<ReviewQueueItem[]> {
  if (visibleEnrollmentIds !== null && visibleEnrollmentIds.length === 0) return [];

  const pending = await CareerPublicationSnapshot.findAll({
    where: {
      publication_id: {
        [Op.in]: (await CareerPublication.findAll({
          where: {
            status: 'in_review',
            ...(visibleEnrollmentIds !== null
              ? { enrollment_id: { [Op.in]: visibleEnrollmentIds } }
              : {}),
          },
          attributes: ['id'],
          raw: true,
        }) as unknown as Array<{ id: string }>).map((p) => p.id),
      },
    },
    order: [['requested_at', 'ASC']],
    limit,
  });
  if (!pending.length) return [];

  const decided = new Set(
    (await CareerPublicationApproval.findAll({
      where: { snapshot_id: { [Op.in]: pending.map((s) => s.id) } },
      attributes: ['snapshot_id'],
      raw: true,
    }) as unknown as Array<{ snapshot_id: string }>).map((a) => a.snapshot_id),
  );

  const pubs = new Map(
    (await CareerPublication.findAll({
      where: { id: { [Op.in]: pending.map((s) => s.publication_id) } },
      attributes: ['id', 'enrollment_id', 'slug'],
      raw: true,
    }) as unknown as Array<{ id: string; enrollment_id: string; slug: string }>).map((p) => [p.id, p]),
  );

  return pending
    .filter((s) => !decided.has(s.id))
    .map((s) => {
      const pub = pubs.get(s.publication_id);
      const payload: any = s.payload || {};
      return {
        snapshot_id: s.id,
        publication_id: s.publication_id,
        enrollment_id: pub?.enrollment_id ?? '',
        slug: pub?.slug ?? '',
        version: s.version,
        requested_at: s.requested_at,
        full_name: payload.identity?.full_name ?? null,
        readiness_score: payload.readiness_at_submission?.score ?? null,
        capability_count: Array.isArray(payload.capabilities) ? payload.capabilities.length : 0,
        artifact_count: Array.isArray(payload.artifacts) ? payload.artifacts.length : 0,
      };
    });
}

/** The learner's own view of where their publication stands. */
export async function getPublicationStatus(enrollmentId: string) {
  const publication = await CareerPublication.findOne({ where: { enrollment_id: enrollmentId } });
  if (!publication) {
    return { status: 'draft' as CareerPublicationStatus, slug: null, published_version: null, public_url: null, has_unpublished_changes: false, last_review: null };
  }

  const [snapshot, lastApproval] = await Promise.all([
    publication.current_snapshot_id ? CareerPublicationSnapshot.findByPk(publication.current_snapshot_id) : null,
    CareerPublicationApproval.findOne({ where: { publication_id: publication.id }, order: [['decided_at', 'DESC']] }),
  ]);

  const changes = await getUnpublishedChanges(enrollmentId);

  return {
    status: publication.status,
    slug: publication.slug,
    published_version: snapshot?.version ?? null,
    // Only a genuinely published portfolio gets a URL handed back.
    public_url: publication.status === 'published' ? `/talent/${publication.slug}` : null,
    has_unpublished_changes: changes?.has_changes ?? false,
    last_review: lastApproval
      ? { decision: lastApproval.decision, notes: lastApproval.reviewer_notes, decided_at: lastApproval.decided_at }
      : null,
  };
}
