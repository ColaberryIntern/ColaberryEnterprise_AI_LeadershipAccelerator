/**
 * govBidDecision — PURE, deterministic, EXPLAINABLE synthesis of "should we pursue this bid?" from the signals the
 * qualification workspace already has. It answers the one question the workspace never did: a scored recommendation
 * with the reasons in plain English. ADVISORY ONLY — it changes no gate and fabricates nothing; every factor is
 * shown with its own effect so the score is never a black box. No LLM, no IO; total.
 *
 * Framing (deliberate): a live opportunity whose requirements are captured and that has no HARD blocker is
 * pursuable by default — "needs work" is not "no-bid". The score leans toward "worth pursuing" and only drops to
 * caution/pass on real risks: a closed/tight deadline, unresolved pursuit blockers, no capability match, or
 * eligibility gates to verify. Un-evidenced requirements are surfaced as effort, not punished as a verdict.
 */
export type BidBand = 'strong' | 'pursue' | 'caution' | 'pass';
export type FactorSignal = 'good' | 'concern' | 'neutral';
export interface BidFactor { key: string; label: string; signal: FactorSignal; detail: string; }
export interface BidDecision { band: BidBand; score: number; headline: string; factors: BidFactor[]; }

export interface BidDecisionInput {
  establishedCount: number;
  /** true disqualifiers that block a PURSUIT (unknown applicability / un-evidenced dismissal). */
  pursuitBlockingCount: number;
  /** applicable submission requirements still needing evidence (expected work, not a blocker). */
  openSubmissionCount: number;
  /** eligibility/qualification gates flagged to verify (SAM, set-aside, clearance, cert, bonding…). */
  eligibilityGapCount: number;
  /** best capability match from Our Services against this opportunity. */
  capability: 'strong' | 'moderate' | 'none';
  /** whole days to the submission deadline; negative = closed; null = unknown. */
  daysLeft: number | null;
  /** estimated contract value in USD, if known. */
  estimatedValue: number | null;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Deterministic pursue-score + band + explainable factors. */
export function deriveBidDecision(i: BidDecisionInput): BidDecision {
  const factors: BidFactor[] = [];
  let score = 60; // baseline: a live, captured opportunity is pursuable until a real risk says otherwise

  // 1) Capability fit — a MISSING match is a caveat, not proof we can't do it (the matcher is keyword/NAICS-based).
  if (i.capability === 'strong') { score += 20; factors.push({ key: 'capability', label: 'Capability fit', signal: 'good', detail: 'strong match to a Colaberry service' }); }
  else if (i.capability === 'moderate') { score += 8; factors.push({ key: 'capability', label: 'Capability fit', signal: 'neutral', detail: 'moderate match to a Colaberry service — confirm' }); }
  else { score -= 5; factors.push({ key: 'capability', label: 'Capability fit', signal: 'concern', detail: 'no automatic match — the matcher is literal (and the opportunity carries no NAICS), so confirm our fit by hand' }); }

  // 2) Disqualifiers — real blockers.
  if (i.pursuitBlockingCount > 0) { score -= 35; factors.push({ key: 'blockers', label: 'Blocking requirements', signal: 'concern', detail: `${i.pursuitBlockingCount} requirement(s) of unknown applicability or dismissed without evidence — resolve before bidding` }); }
  else { factors.push({ key: 'blockers', label: 'Blocking requirements', signal: 'good', detail: 'none — nothing disqualifies a pursuit right now' }); }

  // 3) Eligibility gates to verify.
  if (i.eligibilityGapCount > 0) { score -= Math.min(15, i.eligibilityGapCount * 5); factors.push({ key: 'eligibility', label: 'Eligibility gates', signal: 'concern', detail: `${i.eligibilityGapCount} to verify (e.g. SAM / set-aside / clearance / certification) before bidding` }); }
  else if (i.establishedCount > 0) { factors.push({ key: 'eligibility', label: 'Eligibility gates', signal: 'good', detail: 'none flagged from the established requirements' }); }

  // 4) Effort — informational: un-evidenced requirements are expected, not a verdict.
  if (i.openSubmissionCount > 50) { score -= 5; factors.push({ key: 'effort', label: 'Effort', signal: 'neutral', detail: `${i.openSubmissionCount} submission requirements still need evidence — a heavy compliance lift` }); }
  else if (i.openSubmissionCount > 0) { factors.push({ key: 'effort', label: 'Effort', signal: 'neutral', detail: `${i.openSubmissionCount} submission requirement(s) still need evidence` }); }
  else if (i.establishedCount > 0) { score += 5; factors.push({ key: 'effort', label: 'Effort', signal: 'good', detail: 'all established requirements are evidenced' }); }

  // 5) Deadline.
  if (i.daysLeft === null) { factors.push({ key: 'deadline', label: 'Deadline', signal: 'neutral', detail: 'close date unknown' }); }
  else if (i.daysLeft < 0) { score -= 45; factors.push({ key: 'deadline', label: 'Deadline', signal: 'concern', detail: `closed ${Math.abs(i.daysLeft)} day(s) ago` }); }
  else if (i.daysLeft <= 3) { score -= 20; factors.push({ key: 'deadline', label: 'Deadline', signal: 'concern', detail: `very tight — ${i.daysLeft} day(s) to submission` }); }
  else if (i.daysLeft <= 7) { score -= 10; factors.push({ key: 'deadline', label: 'Deadline', signal: 'concern', detail: `tight — ${i.daysLeft} day(s) to submission` }); }
  else if (i.daysLeft <= 14) { score -= 3; factors.push({ key: 'deadline', label: 'Deadline', signal: 'neutral', detail: `${i.daysLeft} days to submission` }); }
  else { score += 5; factors.push({ key: 'deadline', label: 'Deadline', signal: 'good', detail: `${i.daysLeft} days to submission — comfortable runway` }); }

  // 6) Value — minor.
  if (i.estimatedValue !== null && i.estimatedValue >= 1_000_000) { score += 8; factors.push({ key: 'value', label: 'Value', signal: 'good', detail: 'high estimated value (unverified)' }); }
  else if (i.estimatedValue !== null && i.estimatedValue >= 250_000) { score += 4; factors.push({ key: 'value', label: 'Value', signal: 'good', detail: 'solid estimated value (unverified)' }); }

  score = clamp(score);
  const closed = i.daysLeft !== null && i.daysLeft < 0;
  let band: BidBand;
  if (closed || i.pursuitBlockingCount > 0 || score < 35) band = 'pass';
  else if (score >= 72) band = 'strong';
  else if (score >= 52) band = 'pursue';
  else band = 'caution';

  const headline = band === 'strong' ? 'Strong fit — pursue it.'
    : band === 'pursue' ? 'Worth pursuing — here is what it takes.'
    : band === 'caution' ? 'Pursuable, but verify the flagged risks first.'
    : closed ? 'Lean no-bid — the opportunity has closed.'
    : i.pursuitBlockingCount > 0 ? 'Lean no-bid until the blocking requirements are resolved.'
    : 'Lean no-bid — the fit and risks do not support a pursuit.';

  return { band, score, headline, factors };
}
