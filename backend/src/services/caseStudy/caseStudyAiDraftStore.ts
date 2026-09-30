/**
 * Case Study OS — the AI draft quarantine.
 *
 * THE CHOICE THIS FILE IMPLEMENTS, AND WHY IT WAS MADE.
 *
 * `STORY_STUDIO_CURRENT_STATE.md` A-8 records a real gap: the publish gate's
 * `collectNarrative` reads 15 prose paths, its vocabulary is closed to five
 * token classes, and several structured free-text fields — metric labels,
 * `measurement.methodology`, `identity.programLabel`, contributor roles — are
 * never scanned at all. Adding an AI drafting feature on top of that makes it
 * materially more dangerous, because the volume of unreviewed prose goes up.
 *
 * There were two available responses. WE DID BOTH, BUT THE LOAD-BEARING ONE IS
 * QUARANTINE, and the ordering matters:
 *
 *   QUARANTINE (this file) is PRIMARY because it is structural and unbounded.
 *   An AI-generated value lives in `case_study_ai_drafts` and is not in
 *   `case_study_snapshots.content`, so it cannot be projected, cannot be
 *   published, and cannot be scanned — because it is not there. This holds for
 *   every sentence a model can produce, including the ones no scanner could
 *   ever recognise. The file's own admission is the argument: "a false sentence
 *   that uses none of the scanned vocabulary passes, and no deterministic rule
 *   could reach it."
 *
 *   EXTENDING THE SCAN (`caseStudyPublishClaimScan.ts`, this same change) is
 *   SECONDARY because it is deterministic but bounded. It widens a net whose
 *   mesh is fixed. It earns its place at the point quarantine ends — after a
 *   human has promoted a value and taken responsibility for it — because that
 *   is exactly when the structural control stops applying and a figure in
 *   `measurement.methodology` becomes reachable.
 *
 * Relying on the scan alone would have been the wrong answer, and specifically
 * the comfortable wrong answer: a longer path list looks like more safety while
 * leaving the unbounded case untouched.
 *
 * WHY PROMOTION WRITES `human_override` AND NOT `ai_draft`.
 *
 * It would be tidier-looking to preserve the machine tier into content. It
 * would also be wrong. `applyHumanOverride` means "a named human is accountable
 * for this value", and a human who reads a proposed sentence and presses
 * Promote is doing precisely that. The human is not inheriting the model's
 * credibility — the model never had any, which is why `ai_draft` is the weakest
 * of the seven precedence tiers. The machine's part of the record is not erased
 * either: `generated_by` on the draft row keeps it forever, and the promoted
 * row records which human decided and when.
 */

import { randomUUID } from 'crypto';
import { CaseStudyAiDraft as DraftModel } from '../../models';
import type {
  CaseStudyAiDraft, CaseStudyAiDraftProposal, CaseStudyAiDraftStatus,
} from '../../types/caseStudyStory';
import { classifyAiForbiddenPath } from './caseStudyProvenance';
import { CaseStudyAdminError } from './caseStudyAdminStore';
import { applyHumanOverride } from './caseStudyAdminReview';

/**
 * Spec §37-style bound. A generator that proposes 900 fields has misunderstood
 * its job, and a reviewer facing 900 decisions will approve them in bulk —
 * which is the failure this whole module exists to prevent.
 */
export const MAX_DRAFTS_PER_RUN = 40;

/** Same cap `applyHumanOverride` applies, so nothing can be proposed that could not be promoted. */
export const MAX_DRAFT_VALUE_CHARS = 4000;

export interface ProposeDraftsInput {
  readonly caseStudyId: string;
  readonly proposals: readonly CaseStudyAiDraftProposal[];
  /** Model identifier, or `deterministic`. Recorded, never trusted. */
  readonly generatedBy: string;
}

export interface ProposeDraftsResult {
  readonly stored: readonly CaseStudyAiDraft[];
  /** Proposals refused, each with the reason. Never silently dropped. */
  readonly refused: readonly { readonly path: string; readonly reason: string }[];
}

const toContract = (row: DraftModel): CaseStudyAiDraft => ({
  id: row.id,
  caseStudyId: row.case_study_id,
  path: row.draft_path,
  value: row.draft_value,
  status: row.status as CaseStudyAiDraftStatus,
  generatedBy: row.generated_by,
  rationale: row.rationale,
  createdAt: row.created_at.toISOString(),
  decidedBy: row.decided_by,
  decidedAt: row.decided_at ? row.decided_at.toISOString() : null,
});

/**
 * THE REFUSAL THAT MATTERS, and it fires before anything is stored.
 *
 * `classifyAiForbiddenPath` is the existing six-class screen — metric,
 * organization_identity, quote, consent, production_claim, roi. A draft at any
 * of those paths is refused HERE rather than at publish time, because a
 * proposal that reaches a reviewer's screen is a proposal somebody may promote,
 * and "the gate would have caught it" is not a control an operator can see.
 *
 * The publish gate still refuses these independently. Two gates, deliberately,
 * and neither is load-bearing alone.
 */
function refusalFor(proposal: CaseStudyAiDraftProposal): string | null {
  const path = String(proposal.path ?? '').trim();
  if (path.length === 0) return 'An empty path cannot be proposed.';
  if (path.length > 255) return 'The path exceeds 255 characters.';

  const forbidden = classifyAiForbiddenPath(path);
  if (forbidden) {
    return `AI may never propose a value at a ${forbidden.replace(/_/g, ' ')} path. `
      + 'This is one of the six field classes no model is permitted to write.';
  }

  const value = String(proposal.value ?? '').trim();
  if (value.length === 0) return 'An empty value cannot be proposed.';
  if (value.length > MAX_DRAFT_VALUE_CHARS) {
    return `The value exceeds ${MAX_DRAFT_VALUE_CHARS} characters.`;
  }
  if (String(proposal.rationale ?? '').trim().length === 0) {
    return 'A proposal with no stated rationale cannot be reviewed, so it is not stored.';
  }
  return null;
}

/**
 * Store proposals. WRITES NOTHING TO SNAPSHOT CONTENT — this function does not
 * import the snapshot store and could not reach it.
 *
 * IDEMPOTENCY. `cs_ai_drafts_one_proposal_per_path` is a partial unique index
 * over `(case_study_id, draft_path) WHERE status = 'proposed'`, so re-running a
 * generator supersedes the live proposal for a path rather than stacking a
 * second one. Running the same generation twice therefore leaves the same end
 * state: one live proposal per path. Decided rows are outside the index and are
 * kept, so the history of what was rejected survives.
 */
export async function proposeDrafts(input: ProposeDraftsInput): Promise<ProposeDraftsResult> {
  const proposals = input.proposals.slice(0, MAX_DRAFTS_PER_RUN);
  const refused: { path: string; reason: string }[] = [];
  const stored: CaseStudyAiDraft[] = [];

  if (input.proposals.length > MAX_DRAFTS_PER_RUN) {
    refused.push({
      path: '(run)',
      reason: `A generation run is capped at ${MAX_DRAFTS_PER_RUN} proposals; `
        + `${input.proposals.length - MAX_DRAFTS_PER_RUN} were not stored.`,
    });
  }

  for (const proposal of proposals) {
    const reason = refusalFor(proposal);
    if (reason) {
      refused.push({ path: String(proposal.path ?? '(none)'), reason });
      continue;
    }

    const path = proposal.path.trim();
    // Supersede rather than stack. The previous live proposal for this path
    // becomes `rejected` with no decider, which reads as "the generator
    // replaced it" and is distinguishable from a human rejection because
    // `decided_by` stays NULL.
    await DraftModel.update(
      { status: 'rejected' },
      { where: { case_study_id: input.caseStudyId, draft_path: path, status: 'proposed' } },
    );

    const row = await DraftModel.create({
      id: randomUUID(),
      case_study_id: input.caseStudyId,
      draft_path: path,
      draft_value: proposal.value.trim(),
      status: 'proposed',
      generated_by: input.generatedBy,
      rationale: proposal.rationale.trim(),
    });
    stored.push(toContract(row));
  }

  return { stored, refused };
}

/** Every draft for a record, newest first. Includes decided history. */
export async function listDrafts(
  caseStudyId: string, status?: CaseStudyAiDraftStatus,
): Promise<readonly CaseStudyAiDraft[]> {
  const rows = await DraftModel.findAll({
    where: { case_study_id: caseStudyId, ...(status ? { status } : {}) },
    order: [['created_at', 'DESC']],
  });
  return rows.map(toContract);
}

export interface PromoteDraftResult {
  readonly outcome: 'promoted' | 'already_decided';
  readonly draft: CaseStudyAiDraft;
  /** The new snapshot version the override created, when one was created. */
  readonly snapshotVersion: number | null;
}

/**
 * Promote one proposal into snapshot content, as a human act.
 *
 * `actor` is REQUIRED and is written as the override's actor, so the resulting
 * provenance entry names the person and not the model. There is no code path
 * through this module that can call `applyHumanOverride` without one — the
 * parameter has no default and no fallback to a service account.
 *
 * IDEMPOTENT on two axes. A draft that is already decided returns
 * `already_decided` without writing again; and `applyHumanOverride` itself
 * returns `outcome: 'unchanged'` when the resulting content hash matches, so
 * promoting the same text twice produces one snapshot version, not two.
 */
export async function promoteDraft(input: {
  readonly caseStudyId: string;
  readonly draftId: string;
  readonly actor: string;
  readonly correlationId?: string;
}): Promise<PromoteDraftResult> {
  if (!input.actor || input.actor.trim().length === 0) {
    throw new CaseStudyAdminError(
      'ValidationError',
      'A draft can only be promoted by a named human. No actor was supplied.',
      { field: 'actor' },
    );
  }

  const row = await DraftModel.findOne({
    where: { id: input.draftId, case_study_id: input.caseStudyId },
  });
  if (!row) {
    throw new CaseStudyAdminError('CaseStudyNotFound', 'That AI draft does not exist on this record.', {
      draftId: input.draftId,
    });
  }
  if (row.status !== 'proposed') {
    return { outcome: 'already_decided', draft: toContract(row), snapshotVersion: null };
  }

  // Re-screen at the boundary. The row was screened when it was stored, but the
  // forbidden-class rules can change between those two moments and the cheaper
  // assumption is the one that publishes a quote.
  const forbidden = classifyAiForbiddenPath(row.draft_path);
  if (forbidden) {
    throw new CaseStudyAdminError(
      'ValidationError',
      `This draft targets a ${forbidden.replace(/_/g, ' ')} path, which no AI-drafted value may be promoted into.`,
      { path: row.draft_path, forbiddenClass: forbidden },
    );
  }

  const result = await applyHumanOverride({
    caseStudyId: input.caseStudyId,
    path: row.draft_path,
    value: row.draft_value,
    // The note is what makes the machine's involvement visible in the
    // provenance record forever, rather than only in this table.
    note: `Promoted from an AI draft generated by ${row.generated_by}.`,
    actor: input.actor,
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
  });

  row.status = 'promoted';
  row.decided_by = input.actor;
  row.decided_at = new Date();
  await row.save();

  return { outcome: 'promoted', draft: toContract(row), snapshotVersion: result.version };
}

/** Refuse a proposal. Kept, never deleted, so the record shows what was declined. */
export async function rejectDraft(input: {
  readonly caseStudyId: string;
  readonly draftId: string;
  readonly actor: string;
}): Promise<CaseStudyAiDraft> {
  const row = await DraftModel.findOne({
    where: { id: input.draftId, case_study_id: input.caseStudyId },
  });
  if (!row) {
    throw new CaseStudyAdminError('CaseStudyNotFound', 'That AI draft does not exist on this record.', {
      draftId: input.draftId,
    });
  }
  if (row.status === 'proposed') {
    row.status = 'rejected';
    row.decided_by = input.actor;
    row.decided_at = new Date();
    await row.save();
  }
  return toContract(row);
}
