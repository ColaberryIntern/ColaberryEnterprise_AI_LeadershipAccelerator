/**
 * humanEdit — v3 §V2, T14. The editor's "Edit" path: a person edits a document, we save a sanitized HUMAN version,
 * the judge re-scores it, and the agent is resumed ONLY if the new version is below the bar. A human edit that already
 * passes is left alone (no needless cycle); one that still falls short hands back to the agent to keep improving.
 *
 * `resumeAfterEdit` is the pure decision; `applyHumanEditCore` is the orchestration with injected save/recheck/resume
 * so it is unit-testable without the DB, the model, or the cycle runner. `applyHumanEdit` wires the real services
 * (draftProposalDocument saves + records the human version via the store, runProposalDocumentChecks re-judges, and the
 * bounded resumeUnblocked kicks the cycle).
 */
import type { CheckRunResult } from './proposalReviewTypes';

/** PURE: resume the agent only when the re-scored version does NOT pass (below the bar). */
export function resumeAfterEdit(result: { passes?: boolean } | null | undefined): boolean {
  return !!result && !result.passes;
}

export interface HumanEditDeps {
  /** Save the sanitized human edit as a new human version. */
  save: (html: string) => Promise<void>;
  /** Re-score the new version (records scores + gates). Null when there is nothing to score. */
  recheck: () => Promise<CheckRunResult | null>;
  /** Fire the bounded resume cycle — called ONLY when the version is below bar. */
  resume: () => void;
}

export interface HumanEditResult { saved: boolean; passes: boolean; resumed: boolean }

/** Save → re-judge → resume-if-below-bar. Pure orchestration over injected deps. */
export async function applyHumanEditCore(html: string, deps: HumanEditDeps): Promise<HumanEditResult> {
  await deps.save(html);
  const result = await deps.recheck();
  const resumed = resumeAfterEdit(result);
  if (resumed) deps.resume();
  return { saved: true, passes: !!result?.passes, resumed };
}

export interface ApplyHumanEditOpts { identityId: string | null; canVerify: boolean }

/** Wire the real services for a human edit of one document. */
export async function applyHumanEdit(deliveryProjectId: string, docKey: string, html: string, opts: ApplyHumanEditOpts): Promise<HumanEditResult> {
  const { draftProposalDocument } = await import('./govProposalDocumentActions');
  const { runProposalDocumentChecks } = await import('./runProposalDocumentChecks');
  const { resumeUnblocked } = await import('./resumeCycles');
  return applyHumanEditCore(html, {
    save: async (h) => { await draftProposalDocument({ deliveryProjectId, docKey, identityId: opts.identityId, canVerify: opts.canVerify, manualHtml: h }); },
    recheck: () => runProposalDocumentChecks(deliveryProjectId, docKey),
    resume: () => { void resumeUnblocked(deliveryProjectId, [docKey], { identityId: opts.identityId }).catch(() => undefined); },
  });
}
