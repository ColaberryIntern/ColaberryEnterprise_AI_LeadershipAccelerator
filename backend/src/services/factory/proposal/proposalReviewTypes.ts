/**
 * proposalReviewTypes — shared, dependency-free types for the Proposal Studio review layer (P3): the six checks,
 * their scores + findings, the pass verdict, and the Shipley color-team gates. Kept pure-types so the version model,
 * the check runner, the pass rule and the gate store all share them without a cycle.
 */

/** The six checks a document version is scored on, mapped to the Shipley color-team review practice. */
export type CheckKey = 'coverage' | 'format' | 'fact' | 'evaluator' | 'proof' | 'clarity';

/** A finding from a check. `fatal` blocks export whatever the score (over page limit, price leak, missing required
 *  form/signature); the others are weaknesses to fix. */
export interface CheckFinding {
  check: CheckKey;
  severity: 'fatal' | 'major' | 'minor' | 'info';
  message: string;
  /** The document section the finding is about, when it is section-specific. */
  sectionKey?: string;
}

/** Each check's 0–100 score. */
export type CheckScores = Record<CheckKey, number>;

/** The result of running all checks on a version. */
export interface CheckRunResult {
  scores: CheckScores;
  findings: CheckFinding[];
  /** The fatal findings, pulled out for the pass rule and the export gate. */
  fatal: CheckFinding[];
  passes: boolean;
  /** Real PDF page count from the format render, when computed. */
  pageCount: number | null;
}

/** The Shipley color-team gates, in order. (Blue folds into Pink for small bids; Green is the admin price gate.) */
export type GovProposalGate = 'pink' | 'red' | 'gold' | 'white_glove';
export const GATE_ORDER: GovProposalGate[] = ['pink', 'red', 'gold', 'white_glove'];

export type GateStatus = 'pending' | 'approved' | 'returned';
export type VersionAuthorKind = 'agent' | 'human';
