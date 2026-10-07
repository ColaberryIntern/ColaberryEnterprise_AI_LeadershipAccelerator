/**
 * govBuildEvidence — the student's Build-story completion hand-in (P3-T3).
 *
 * submitBuildStoryEvidence records a student's evidence for one story as `submitted` — ALWAYS `submitted`, never
 * `verified`: the hand-in is the student's claim, and only a reviewer with `evidence.verify` (which the student's
 * associate_builder role does NOT grant) may later verify it. The route guards submission with `story.execute`
 * (the builder's perm); this service additionally hard-codes the status so no caller can submit a pre-verified
 * record. listBuildStoryEvidence returns the hand-ins for a project so the workspace can surface them per story.
 */
import GovBuildStoryEvidence, { type GovBuildStoryEvidenceAttributes } from '../../models/GovBuildStoryEvidence';

export interface SubmitEvidenceInput {
  deliveryProjectId: string;
  storyId: string;
  canonicalReqId: string;
  description: string;
  artifactRef?: string | null;
  submittedByIdentityId: string;
}

export interface EvidenceView {
  id: string;
  storyId: string;
  canonicalReqId: string;
  description: string;
  artifactRef: string | null;
  status: 'submitted' | 'verified' | 'rejected';
  submittedAt: string | null;
}

function toView(row: GovBuildStoryEvidenceAttributes): EvidenceView {
  return {
    id: String(row.id),
    storyId: row.story_id,
    canonicalReqId: row.canonical_req_id,
    description: row.description,
    artifactRef: row.artifact_ref ?? null,
    status: row.status,
    submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
  };
}

export class EvidenceInputError extends Error {}

/** Record a student's evidence hand-in for a story. Status is ALWAYS 'submitted' — never a self-verification. */
export async function submitBuildStoryEvidence(input: SubmitEvidenceInput): Promise<EvidenceView> {
  const description = String(input.description ?? '').trim();
  if (!input.deliveryProjectId || !input.storyId || !input.canonicalReqId) throw new EvidenceInputError('Missing story/project identifiers.');
  if (!description) throw new EvidenceInputError('Evidence description is required.');
  if (!input.submittedByIdentityId) throw new EvidenceInputError('A submitting identity is required.');
  const row = await GovBuildStoryEvidence.create({
    delivery_project_id: input.deliveryProjectId,
    story_id: input.storyId,
    canonical_req_id: input.canonicalReqId,
    description,
    artifact_ref: input.artifactRef ? String(input.artifactRef).trim() : null,
    status: 'submitted', // the hand-in is a CLAIM; verification is a separate, reviewer-only act
    submitted_by_identity_id: input.submittedByIdentityId,
    reviewed_by_identity_id: null,
    reviewed_at: null,
  });
  return toView(row.get({ plain: true }) as GovBuildStoryEvidenceAttributes);
}

/** All evidence hand-ins for a delivery project, newest first — to surface per story in the workspace/projection. */
export async function listBuildStoryEvidence(deliveryProjectId: string): Promise<EvidenceView[]> {
  if (!deliveryProjectId) return [];
  const rows = await GovBuildStoryEvidence.findAll({ where: { delivery_project_id: deliveryProjectId }, order: [['submitted_at', 'DESC']] });
  return rows.map((r) => toView(r.get({ plain: true }) as GovBuildStoryEvidenceAttributes));
}
