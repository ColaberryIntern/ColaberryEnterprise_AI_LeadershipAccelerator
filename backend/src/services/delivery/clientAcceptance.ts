import { decideAcceptance, type AcceptanceSubmission } from './clientAcceptanceService';

/**
 * clientAcceptance — the writer scenario B's second half needed.
 *
 * `clientAcceptanceService.ts` shipped as pure logic — transitions, validation,
 * `decideAcceptance` — and was imported by exactly one file: its own test. Nothing wrote a
 * `delivery_client_acceptances` row, so B's stated observable (*a row whose
 * `promised_acceptance`, `preview_ref` and `evidence_summary` snapshots match what the
 * client actually saw*) had nothing to observe.
 *
 * ## The snapshot is built here, never accepted from the client
 *
 * This is the whole point of the record. If the request carried
 * `promised_acceptance`/`evidence_summary`, the client would be attesting to whatever their
 * browser sent — and an acceptance is only worth keeping if it pins **what was actually put
 * in front of them**. So the snapshot is assembled server-side from the release or story
 * being accepted, and the request supplies only the decision, the comments and any
 * exceptions.
 *
 * A year from now the useful question is "what did they see when they signed this", and
 * that question is unanswerable if the answer came from the signer.
 *
 * ## Scope is exactly one thing
 *
 * `validateAcceptance` already refuses a row scoped to both a release and a story, because
 * such a row is ambiguous about what was signed off. This composes that rather than
 * restating it.
 */

export interface ClientAcceptanceRefusal {
  ok: false;
  reason: 'no_such_scope' | 'invalid' | 'already_recorded';
  message: string;
  issues?: Array<{ rule: string; detail: string; severity: string }>;
}

export interface ClientAcceptanceResult {
  ok: true;
  acceptanceId: string;
  status: string;
  /** What the client was shown, as stored. Returned so a caller can display it back. */
  snapshot: {
    promisedAcceptance: unknown[];
    previewRef: string | null;
    evidenceSummary: unknown[];
  };
}

/**
 * Build the snapshot from what the system actually holds for the thing being accepted.
 *
 * Returns null when the scope target does not exist — an acceptance against a release or
 * story that is not there would be a signature on nothing.
 */
async function buildSnapshot(input: {
  projectId: string;
  scopeKind: string;
  releaseId?: string | null;
  storyId?: string | null;
  models: any;
}): Promise<ClientAcceptanceResult['snapshot'] | null> {
  const { models } = input;

  if (input.scopeKind === 'release') {
    const release = await models.DeliveryRelease.findOne({
      where: { id: input.releaseId, delivery_project_id: input.projectId },
    });
    if (!release) return null;
    return {
      // The gate's own results are the promise: these are the checks that had to hold.
      promisedAcceptance: (release.check_results ?? []) as unknown[],
      previewRef: release.candidate_sha ? `sha:${release.candidate_sha}` : `version:${release.version}`,
      evidenceSummary: [
        { kind: 'release', version: release.version, status: release.status },
        // Waivers travel INTO the snapshot deliberately. A client accepting a release with
        // a waived check should have that on the record they signed, not only on the
        // release row where it can be read separately.
        ...(((release.waived_categories ?? []) as unknown[]).map((w) => ({ kind: 'waiver', waiver: w }))),
      ],
    };
  }

  const story = await models.DeliveryStory.findOne({
    where: { id: input.storyId, delivery_project_id: input.projectId },
  });
  if (!story) return null;

  const evidence = await models.DeliveryEvidence.findAll({
    where: { delivery_project_id: input.projectId, story_id: story.id },
  });

  return {
    // The acceptance criteria as they stood at signing. Read from the stored contract, so
    // a later edit to the story cannot change what the client is recorded as accepting.
    promisedAcceptance: (story.contract?.acceptance ?? []) as unknown[],
    previewRef: `story:${story.story_key}`,
    evidenceSummary: evidence.map((e: any) => ({
      dimension: e.dimension,
      evidenceType: e.evidence_type,
      outcome: e.outcome,
      recordedAt: e.created_at,
    })),
  };
}

/**
 * Record a client's acceptance decision.
 *
 * Idempotent on `(project, scope, target)` while a decision already stands: a client
 * clicking twice has not accepted twice, and a second row would make it ambiguous which
 * decision is current.
 */
export async function recordClientAcceptance(input: {
  projectId: string;
  scopeKind: string;
  releaseId?: string | null;
  storyId?: string | null;
  status: string;
  acceptedByIdentityId: string | null;
  comments?: string | null;
  exceptions?: unknown[] | null;
  models: any;
}): Promise<ClientAcceptanceResult | ClientAcceptanceRefusal> {
  const { models } = input;

  const snapshot = await buildSnapshot(input);
  if (!snapshot) {
    return {
      ok: false,
      reason: 'no_such_scope',
      message: 'The release or story being accepted does not exist on this project.',
    };
  }

  const submission: AcceptanceSubmission = {
    scopeKind: input.scopeKind as AcceptanceSubmission['scopeKind'],
    releaseId: input.releaseId ?? null,
    storyId: input.storyId ?? null,
    promisedAcceptance: snapshot.promisedAcceptance,
    previewRef: snapshot.previewRef,
    evidenceSummary: snapshot.evidenceSummary,
    acceptedByIdentityId: input.acceptedByIdentityId,
    comments: input.comments ?? null,
    exceptions: input.exceptions ?? null,
    status: input.status as AcceptanceSubmission['status'],
  };

  const decision = decideAcceptance(submission);
  if (!decision.valid) {
    // Nothing is written. An acceptance that failed validation but left a row behind would
    // read later as a real sign-off.
    return {
      ok: false,
      reason: 'invalid',
      message: 'This acceptance would not mean anything on the record.',
      issues: decision.issues,
    };
  }

  const where: Record<string, unknown> = {
    delivery_project_id: input.projectId,
    scope_kind: input.scopeKind,
  };
  if (input.scopeKind === 'release') where.release_id = input.releaseId;
  else where.story_id = input.storyId;

  const existing = await models.DeliveryClientAcceptance.findOne({ where });
  if (existing) {
    return {
      ok: true,
      acceptanceId: existing.id,
      status: existing.status,
      snapshot: {
        promisedAcceptance: (existing.promised_acceptance ?? []) as unknown[],
        previewRef: existing.preview_ref ?? null,
        evidenceSummary: (existing.evidence_summary ?? []) as unknown[],
      },
    };
  }

  const row = await models.DeliveryClientAcceptance.create({
    delivery_project_id: input.projectId,
    scope_kind: input.scopeKind,
    release_id: input.releaseId ?? null,
    story_id: input.storyId ?? null,
    promised_acceptance: snapshot.promisedAcceptance,
    preview_ref: snapshot.previewRef,
    evidence_summary: snapshot.evidenceSummary,
    accepted_by_identity_id: input.acceptedByIdentityId,
    accepted_at: new Date(),
    comments: input.comments ?? null,
    exceptions: input.exceptions ?? null,
    status: input.status,
  });

  return { ok: true, acceptanceId: row.id, status: row.status, snapshot };
}
