/**
 * proposalHardGates — the PURE submission-readiness gate for Proposal Studio (spec R1 hard gates). This is the layer
 * that was missing behind the 22/100 review: a per-document quality meter ("7 of 8 documents pass") is NOT the same
 * as "this proposal can be submitted." Submission readiness is gated by FIVE hard blockers that hold regardless of any
 * numeric score:
 *
 *   - MANDATORY_BLOCKED : a missing/unsigned required form, too few eligible references, no priced offer, a page-limit
 *                         violation, an unresolved fatal contradiction, or an invalid/superseded source version.
 *   - EVIDENCE_BLOCKED  : an unapproved invented/specific claim or an unsupported contractual/security guarantee.
 *   - PACKAGE_BLOCKED   : the final package could not be assembled/verified (missing/failed/stale/unreadable file).
 *   - APPROVAL_BLOCKED  : no authorized Gold Go bound to the exact final fingerprint, or a separation-of-duties failure.
 *   - REVIEW_BLOCKED    : an essential evaluator did not run, material requirements are unreviewed, or a serious
 *                         independent-reviewer disagreement is unresolved.
 *
 * When ANY blocker holds: the overall rubric score is PROVISIONAL and "Export final submission package" is DISABLED.
 * This is "no silent green" — a checker that did not run, or a mandatory input that is absent, BLOCKS; it never passes.
 *
 * Several inputs are REQUIRED POSITIVE CONFIRMATIONS (pricing provided, Gold on the final fingerprint, the essential
 * evaluator ran, material requirements reviewed, source version valid, separation of duties met): anything other than
 * an explicit `true` blocks, so an absent/unknown mandatory input can never read as satisfied. No I/O; fully testable.
 */

export type HardGate =
  | 'MANDATORY_BLOCKED'
  | 'EVIDENCE_BLOCKED'
  | 'PACKAGE_BLOCKED'
  | 'APPROVAL_BLOCKED'
  | 'REVIEW_BLOCKED';

export type BlockerOwner = 'human' | 'agent' | 'admin';

export interface HardGateBlocker {
  gate: HardGate;
  reason: string;
  owner: BlockerOwner;
}

export interface SubmissionReadinessInput {
  // --- MANDATORY ---
  /** Required forms/exhibits that are absent or unsigned (e.g. "Exhibit B", "HSP"). Any entry blocks. */
  missingRequiredForms?: string[];
  /** An authorized priced offer exists. REQUIRED POSITIVE CONFIRMATION — anything but true blocks. */
  pricingProvided?: boolean;
  /** How many eligible government references the solicitation requires (0/undefined = none required). */
  requiredReferenceCount?: number;
  /** How many QUALIFIED/eligible references are actually on file. Shortfall blocks. */
  eligibleReferenceCount?: number;
  /** Documents over their page limit (any entry blocks). */
  pageLimitViolations?: string[];
  /** Unresolved fatal contradictions across the proposal (>0 blocks). */
  unresolvedFatalContradictions?: number;
  /** The RFP source version/hash is valid and current (not superseded by an unapplied amendment). REQUIRED true. */
  sourceVersionValid?: boolean;

  // --- EVIDENCE ---
  /** Specific invented claims a reviewer flagged material and that remain unapproved (>0 blocks). */
  unapprovedInventedClaims?: number;
  /** Unsupported contractual/security guarantees (>0 blocks). */
  unsupportedGuarantees?: number;

  // --- PACKAGE ---
  /** The final package assembled and verified. REQUIRED true. */
  packageOk?: boolean;
  /** The package assembly's own blocking reasons, surfaced for the operator. */
  packageBlocking?: string[];

  // --- APPROVAL ---
  /** An authorized Gold Go bound to the EXACT final package fingerprint. REQUIRED true. */
  goldOnFinalFingerprint?: boolean;
  /** Separation of duties held (the approver is not the author). REQUIRED true. */
  separationOfDutiesOk?: boolean;

  // --- REVIEW ---
  /** The essential proposal-level evaluator actually ran. REQUIRED true. */
  essentialEvaluatorRan?: boolean;
  /** Every material requirement was reviewed. REQUIRED true. */
  materialRequirementsReviewed?: boolean;
  /** A serious independent-reviewer disagreement is unresolved (true blocks). */
  unresolvedReviewerDisagreement?: boolean;
}

export interface SubmissionReadiness {
  blockers: HardGateBlocker[];
  /** True if ANY hard gate blocks. */
  blocked: boolean;
  /** Export is enabled ONLY when nothing blocks. */
  exportEnabled: boolean;
  /** The overall rubric score must be shown as PROVISIONAL while blocked. */
  provisional: boolean;
}

const isTrue = (v: boolean | undefined): boolean => v === true;

/** PURE: compute the five hard gates from the submission state. Required positive confirmations block unless exactly
 *  true, so an absent mandatory input never reads as satisfied (no silent green). */
export function evaluateSubmissionReadiness(input: SubmissionReadinessInput): SubmissionReadiness {
  const b: HardGateBlocker[] = [];
  const i = input ?? {};

  // MANDATORY
  for (const f of i.missingRequiredForms ?? []) b.push({ gate: 'MANDATORY_BLOCKED', reason: `Required form not signed/attached: ${f}.`, owner: 'human' });
  if (!isTrue(i.pricingProvided)) b.push({ gate: 'MANDATORY_BLOCKED', reason: 'No authorized priced offer is on file.', owner: 'human' });
  const reqRefs = i.requiredReferenceCount ?? 0;
  const haveRefs = i.eligibleReferenceCount ?? 0;
  if (reqRefs > 0 && haveRefs < reqRefs) b.push({ gate: 'MANDATORY_BLOCKED', reason: `${haveRefs} of ${reqRefs} required eligible government references on file.`, owner: 'human' });
  for (const p of i.pageLimitViolations ?? []) b.push({ gate: 'MANDATORY_BLOCKED', reason: `Over page limit: ${p}.`, owner: 'agent' });
  if ((i.unresolvedFatalContradictions ?? 0) > 0) b.push({ gate: 'MANDATORY_BLOCKED', reason: `${i.unresolvedFatalContradictions} unresolved fatal contradiction(s).`, owner: 'agent' });
  if (!isTrue(i.sourceVersionValid)) b.push({ gate: 'MANDATORY_BLOCKED', reason: 'The RFP source version is unverified or superseded.', owner: 'agent' });

  // EVIDENCE
  if ((i.unapprovedInventedClaims ?? 0) > 0) b.push({ gate: 'EVIDENCE_BLOCKED', reason: `${i.unapprovedInventedClaims} unapproved invented/specific claim(s).`, owner: 'human' });
  if ((i.unsupportedGuarantees ?? 0) > 0) b.push({ gate: 'EVIDENCE_BLOCKED', reason: `${i.unsupportedGuarantees} unsupported contractual/security guarantee(s).`, owner: 'human' });

  // PACKAGE
  if (!isTrue(i.packageOk)) b.push({ gate: 'PACKAGE_BLOCKED', reason: `The final package is not assembled/verified${(i.packageBlocking?.length) ? ` (${i.packageBlocking.join('; ')})` : ''}.`, owner: 'agent' });

  // APPROVAL
  if (!isTrue(i.goldOnFinalFingerprint)) b.push({ gate: 'APPROVAL_BLOCKED', reason: 'No authorized Gold Go bound to the final package fingerprint.', owner: 'human' });
  if (!isTrue(i.separationOfDutiesOk)) b.push({ gate: 'APPROVAL_BLOCKED', reason: 'Separation of duties is not satisfied (approver must not be the author).', owner: 'admin' });

  // REVIEW
  if (!isTrue(i.essentialEvaluatorRan)) b.push({ gate: 'REVIEW_BLOCKED', reason: 'An essential evaluator did not run.', owner: 'agent' });
  if (!isTrue(i.materialRequirementsReviewed)) b.push({ gate: 'REVIEW_BLOCKED', reason: 'Material requirements are not all reviewed.', owner: 'agent' });
  if (i.unresolvedReviewerDisagreement === true) b.push({ gate: 'REVIEW_BLOCKED', reason: 'A serious independent-reviewer disagreement is unresolved.', owner: 'human' });

  const blocked = b.length > 0;
  return { blockers: b, blocked, exportEnabled: !blocked, provisional: blocked };
}

/** Convenience: the distinct hard gates currently blocking. */
export function blockingGates(r: SubmissionReadiness): HardGate[] {
  return Array.from(new Set(r.blockers.map((x) => x.gate)));
}
