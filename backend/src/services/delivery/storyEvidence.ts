import {
  evaluateQualityGate,
  type QualityEvidenceInput,
  type QualityGateResult,
} from './deliveryQualityGate';
import { validateStoryContract, type DeliveryStoryContract } from './deliveryStoryContract';
import { deliveryEvidenceKey } from '../../modules/delivery/deliveryEvidence';

/**
 * storyEvidence — persist stories and evidence, and run the Gate 9 quality gate on them.
 *
 * ## Why this exists
 *
 * `evaluateQualityGate` had **zero production callers**. So did the Story Contract
 * validator, in the sense that nothing ever produced a persisted story to validate:
 * Gate 7 shipped the contract as pure logic and `delivery_stories` did not exist as a
 * table at all. `delivery_evidence` did exist, and **nothing wrote to it**.
 *
 * The result was a quality gate that could not be asked about anything real. Its
 * `evidence: []` path — the one that fails closed and blocks a release — had never been
 * reached by a running system, only by tests.
 *
 * ## The gate is never told what it wants to hear
 *
 * Evidence is read from the database, not passed in by the caller asking for the verdict.
 * A caller that supplied its own evidence list could pass the gate by describing a
 * healthier world than the one that exists, which would make the gate a formality. The
 * only inputs the caller controls are *which* story and *which* commit.
 */

export interface RecordEvidenceInput {
  projectId: string;
  storyId: string | null;
  dimension: string;
  evidenceType: string;
  outcome: string;
  subjectSha?: string | null;
  sourceRef?: string | null;
  payload?: Record<string, unknown> | null;
  recordedByIdentityId?: string | null;
  models: any;
}

export interface RecordEvidenceResult {
  recorded: boolean;
  evidenceId: string;
  /** True when an identical record already existed and this call changed nothing. */
  deduped: boolean;
}

/**
 * Record one piece of evidence, idempotently.
 *
 * The idempotency key is the Gate 9 helper's, not a new scheme: master plan §15 requires
 * a **replayed execution callback to produce no duplicate evidence**, and a runner that
 * retries a webhook is the normal case rather than the exceptional one. Two rows for one
 * measurement would let a single test run satisfy a dimension twice.
 */
export async function recordEvidence(input: RecordEvidenceInput): Promise<RecordEvidenceResult> {
  const { models } = input;

  const idempotencyKey = deliveryEvidenceKey({
    deliveryProjectId: input.projectId,
    storyId: input.storyId,
    evidenceType: input.evidenceType as never,
    sourceRef: input.sourceRef ?? '',
  });

  const existing = await models.DeliveryEvidence.findOne({
    where: { idempotency_key: idempotencyKey },
  });
  if (existing) {
    return { recorded: true, evidenceId: existing.id, deduped: true };
  }

  const row = await models.DeliveryEvidence.create({
    delivery_project_id: input.projectId,
    story_id: input.storyId,
    dimension: input.dimension,
    evidence_type: input.evidenceType,
    outcome: input.outcome,
    subject_sha: input.subjectSha ?? null,
    source_ref: input.sourceRef ?? null,
    payload: input.payload ?? null,
    recorded_by_identity_id: input.recordedByIdentityId ?? null,
    idempotency_key: idempotencyKey,
  });

  return { recorded: true, evidenceId: row.id, deduped: false };
}

export interface StoryGateResult {
  storyKey: string;
  candidateSha: string | null;
  evidenceCount: number;
  gate: QualityGateResult;
}

/**
 * Run the quality gate for one story against the evidence actually recorded for it.
 *
 * `candidateSha` matters more than it looks: SHA-pinned dimensions require the
 * measurement to have run against the commit being asked about, so evidence from an
 * earlier commit does not silently satisfy a later one. Passing the wrong sha does not
 * make the gate lenient — it makes it refuse, which is the correct direction to fail.
 */
export async function evaluateStoryGate(input: {
  projectId: string;
  storyKey: string;
  candidateSha?: string | null;
  models: any;
}): Promise<StoryGateResult | null> {
  const { models } = input;

  const story = await models.DeliveryStory.findOne({
    where: { delivery_project_id: input.projectId, story_key: input.storyKey },
  });
  if (!story) return null;

  // Read, never accept. A caller supplying its own evidence could pass the gate by
  // describing a healthier world than the one that exists.
  const rows = await models.DeliveryEvidence.findAll({
    where: { delivery_project_id: input.projectId, story_id: story.id },
  });

  const evidence: QualityEvidenceInput[] = rows.map((r: any) => ({
    dimension: r.dimension,
    evidenceType: r.evidence_type,
    outcome: r.outcome,
    subjectSha: r.subject_sha,
    sourceRef: r.source_ref,
  }));

  const gate = evaluateQualityGate({
    story: story.contract as DeliveryStoryContract,
    evidence,
    candidateSha: input.candidateSha ?? null,
    isUiStory: story.is_ui_story,
  });

  return {
    storyKey: story.story_key,
    candidateSha: input.candidateSha ?? null,
    evidenceCount: rows.length,
    gate,
  };
}

export interface UpsertStoryResult {
  storyId: string;
  storyKey: string;
  created: boolean;
  /** Contract problems. Blocking ones prevent the write. */
  issues: ReturnType<typeof validateStoryContract>;
}

/**
 * Create or update a story from a contract.
 *
 * **The contract is validated before it is stored, and blocking issues refuse the
 * write.** Gate 7's validator distinguishes blocking from warning on whether the problem
 * would *mislead about what is being built*; storing a contract that misleads would mean
 * the quality gate later reasons about a story that does not describe reality, and every
 * verdict after that is worthless.
 *
 * Warnings are returned and stored, because a thin contract is still a real one.
 */
export async function upsertStory(input: {
  projectId: string;
  contract: DeliveryStoryContract;
  isUiStory?: boolean;
  actorIdentityId?: string | null;
  models: any;
}): Promise<UpsertStoryResult | { refused: true; issues: ReturnType<typeof validateStoryContract> }> {
  const { models } = input;
  const issues = validateStoryContract(input.contract);

  if (issues.some((i) => i.severity === 'blocking')) {
    return { refused: true, issues };
  }

  const existing = await models.DeliveryStory.findOne({
    where: { delivery_project_id: input.projectId, story_key: input.contract.storyId },
  });

  const fields = {
    title: input.contract.title,
    risk_level: input.contract.riskLevel ?? null,
    is_ui_story: input.isUiStory ?? false,
    contract: input.contract,
  };

  if (existing) {
    // A replayed create is an update, not a duplicate: the unique index would reject the
    // second row anyway, and failing there would report a conflict for what is really a
    // retry.
    await existing.update(fields);
    return { storyId: existing.id, storyKey: existing.story_key, created: false, issues };
  }

  const row = await models.DeliveryStory.create({
    delivery_project_id: input.projectId,
    story_key: input.contract.storyId,
    status: 'proposed',
    created_by_identity_id: input.actorIdentityId ?? null,
    ...fields,
  });

  return { storyId: row.id, storyKey: row.story_key, created: true, issues };
}
