/**
 * govNextStep — PURE: derive the single clearest "do this next" directive for the gov Qualification workspace
 * from its current state, so the reviewer is never left guessing which of the ten cards to act on.
 *
 * Priority order (first match wins): already-decided -> a flagged change to review -> no requirements captured ->
 * ZIP not attested -> a blocking disqualifier -> ready to approve -> fallback. Advisory: it only names the next
 * action, it never changes a gate. No IO; total; deterministic.
 */
export type NextStepTone = 'info' | 'success' | 'warning';
export interface NextStepInput {
  decision: string | null | undefined;
  establishedCount: number;
  zipAttested: boolean;
  canApprove: boolean;
  canApprovePursuit: boolean;
  changed: boolean; // changedSource OR a daily-sync flagged change
}
export interface NextStep { title: string; detail: string; tone: NextStepTone; }

export function deriveNextStep(i: NextStepInput): NextStep {
  const d = String(i.decision ?? '').toLowerCase();
  if (d === 'approved_bid_pursuit' || d === 'rfi_response') {
    return { title: 'Pursuit approved', detail: 'The two-track project (Proposal + Build) is created. Next: work the build side and evidence the open requirements before a bid is submitted.', tone: 'success' };
  }
  if (d === 'no_bid') {
    return { title: 'Marked no-bid', detail: 'No further action here — reopen the decision if that changes.', tone: 'info' };
  }
  if (i.changed) {
    return { title: 'Review a flagged change', detail: 'The source or deadline changed since this was last reviewed. Review it — and if the solicitation changed, re-download the ZIP and re-attest — before proceeding.', tone: 'warning' };
  }
  if (i.establishedCount <= 0) {
    return { title: 'Next: capture the requirements', detail: 'Upload the solicitation ZIP under “Extract requirements”, run Extract, then tick the real requirements and Establish them. (This is also what fills the “what they want vs what we offer” match.)', tone: 'info' };
  }
  if (!i.zipAttested) {
    return { title: 'Next: attest the solicitation ZIP', detail: 'Open “Attest the solicitation ZIP” and upload the ZIP — it becomes the evidence of record. The Approve button unlocks once it is attested.', tone: 'info' };
  }
  if (!i.canApprovePursuit) {
    return { title: 'Next: resolve the blocking requirements', detail: 'One or more requirements have unknown applicability, or were dismissed without evidence. Resolve those in “Requirements by due stage” before the pursuit can be approved.', tone: 'warning' };
  }
  if (i.canApprove) {
    return { title: 'Next: approve the bid pursuit', detail: 'In “Qualification actions”, click Approve bid pursuit — as a different person than the reviewer who established the requirements (separation of duties).', tone: 'success' };
  }
  return { title: 'Next: review the requirements and evidence', detail: 'Work through the requirements and evidence; approval unlocks when coverage is sufficient and nothing blocks.', tone: 'info' };
}
