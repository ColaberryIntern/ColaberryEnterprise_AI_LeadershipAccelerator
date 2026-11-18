/**
 * proposalReviewTypes — shared, dependency-free types for the Proposal Studio review layer (P3): the six checks,
 * their scores + findings, the pass verdict, and the Shipley color-team gates. Kept pure-types so the version model,
 * the check runner, the pass rule and the gate store all share them without a cycle.
 */

/** The six checks a document version is scored on, mapped to the Shipley color-team review practice. */
export type CheckKey = 'coverage' | 'format' | 'fact' | 'evaluator' | 'proof' | 'clarity';

/** Who resolves a finding: the AI fixes it on the next revision, or a human must supply an input first. */
export type FindingResolver = 'agent' | 'human';

/** The kinds of input only a human can give (v3 operating model: AI builds + judges, the human supplies these).
 *  `record` is the GROUPED kind: a past-performance reference (client + scope + period + outcome) or a key person
 *  answered as ONE unit, so Client/Scope/Period never fragment into independent atomic facts. */
export type HumanNeedKind = 'fact' | 'decision' | 'file' | 'signature' | 'approval' | 'confirm_rule' | 'setting' | 'record';

/** What a `record` need collects as a unit. `reference` -> gov_company_references; `personnel` -> gov_company_personnel. */
export type RecordType = 'reference' | 'personnel';

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
  /** Present iff `kind === 'record'`: whether this groups a past-performance reference or a key person, and the
   *  field keys the answer form collects (e.g. reference: client, scope, contractValue, dates, contact). Optional so
   *  every existing need literal and fixture stays valid — the grouped sources set them. */
  recordType?: RecordType;
  recordFields?: string[];
  /** Semantic grouping layer (CC-20261117-q8k3). Set at draft time and used to fold needs into the dossier's
   *  groups and to keep records from being interchangeable. All optional and serialized in the `need` JSONB, so
   *  every pre-existing need stays valid and groups lazily (recomputed on read when absent).
   *  - `groupSlug`  : the taxonomy group this need folds into (past_performance, registrations, solicitation, ...).
   *  - `conceptId`  : the canonical concept within the group, so near-duplicate phrasings collapse to one.
   *  - `subject`    : what the requirement is ABOUT (reporting, recruiting, ...); a reporting reference must not
   *                   satisfy a recruiting requirement. 'general' when subject-agnostic. */
  groupSlug?: string;
  conceptId?: string;
  subject?: string;
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
