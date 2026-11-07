/**
 * proposalReviewTypes — shared, dependency-free types for the Proposal Studio review layer (P3): the six checks,
 * their scores + findings, the pass verdict, and the Shipley color-team gates. Kept pure-types so the version model,
 * the check runner, the pass rule and the gate store all share them without a cycle.
 */

/** The six checks a document version is scored on, mapped to the Shipley color-team review practice. */
export type CheckKey = 'coverage' | 'format' | 'fact' | 'evaluator' | 'proof' | 'clarity';

/** Who resolves a finding: the AI fixes it on the next revision, or a human must supply an input first. */
export type FindingResolver = 'agent' | 'human';

/** The kinds of input only a human can give (v3 operating model: AI builds + judges, the human supplies these). */
export type HumanNeedKind = 'fact' | 'decision' | 'file' | 'signature' | 'approval' | 'confirm_rule' | 'setting';

/**
 * A typed request for exactly what a human must provide, why, and what it unblocks. Produced whenever a finding is
 * `resolver: 'human'` (and also directly from blueprint/build/package sources by the needs aggregator). `key` is a
 * stable dedupe key so one ask shared across documents collapses to a single need.
 */
export interface HumanNeed {
  kind: HumanNeedKind;
  key: string;
  ask: string;
  why: string;
  usedIn: Array<{ docKey: string; sectionKey?: string }>;
  format: string;
  options?: string[];
  blocking: 'fatal' | 'score';
  source?: { quote: string; file: string; page?: number };
}

/** A finding from a check. `fatal` blocks export whatever the score (over page limit, price leak, missing required
 *  form/signature); the others are weaknesses to fix.
 *
 *  v3: every finding also carries WHO resolves it (`resolver`). An agent-fixable finding gives the next revision a
 *  `fixHint`; a human-needed finding carries the typed `need`. These are optional so older rows and callers that have
 *  not been migrated still type-check; the classifier fills them. */
export interface CheckFinding {
  check: CheckKey;
  severity: 'fatal' | 'major' | 'minor' | 'info';
  message: string;
  /** The document section the finding is about, when it is section-specific. */
  sectionKey?: string;
  /** v3: who resolves this — the agent on the next pass, or a human via a typed need. */
  resolver?: FindingResolver;
  /** v3: present iff `resolver === 'human'` — the exact ask routed to the needs inbox. */
  need?: HumanNeed;
  /** v3: present iff `resolver === 'agent'` — guidance for the agent's next revision. */
  fixHint?: string;
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
