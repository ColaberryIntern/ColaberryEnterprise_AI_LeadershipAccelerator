/**
 * factoryContract — the source-of-truth typed contracts for the AI Project Factory.
 *
 * Modeled on sbp/planContract.ts: TypeScript is the contract, a JSON-schema mirror
 * (factoryContractSchema.ts) is kept in lockstep for the parts an LLM will later fill
 * (Phase 2), and a round-trip test asserts the two agree. Phase 1 defines these shapes and
 * validates one hand-built sample against them; no LLM, no generation code, no UI here.
 *
 * The design is the NuOrg model (from the emailed teardown), with the deterministic half
 * kept verbatim in spirit and the probabilistic half (decomposition) deferred to Phase 2:
 *  - Evidence is the unit of truth: every task cites the requirement source blocks it derives
 *    from; coverage is checked in both directions (factoryValidate SOURCE_COVERAGE).
 *  - Three separate decisions: the task, the role that performs it, and the executor
 *    (person | team | agent) that fills the role. An agent/system executor always needs a
 *    human ACCOUNTABLE or APPROVER; a system may never BE approver/accountable.
 *  - "Don't know" is a first-class value, never a guess (UNKNOWN effort basis, null executor,
 *    UNSPECIFIED-style placeholders, open questions).
 *  - Numbers carry a basis. Approval is transactional (version + hash + expected_version CAS,
 *    fork-on-edit). Ids are idempotent from source identity (factoryIds).
 */

// ── enumerations (unions, mirrored in factoryContractSchema.ts) ────────────────

/** Which of a contract's two first-class workstreams a record belongs to. */
export type ContractTrackType = 'proposal' | 'solution_build';

/** The evidence status a proposal claim / capability carries — never present planned as done. */
export type EvidenceState = 'demonstrated' | 'tested' | 'planned' | 'assumption' | 'missing';

/** A solicitation requirement's nature. Administrative may be proposal-only; technical can span both. */
export type RequirementKind = 'administrative' | 'technical' | 'compliance' | 'management' | 'pricing';

export type RequirementPriority = 'must' | 'should';

/** Process-flow node kind. */
export type TaskKind = 'START' | 'TASK' | 'DECISION' | 'END';

/** RACI-style responsibility of a role on a task. */
export type Responsibility =
  | 'PERFORMER' | 'APPROVER' | 'ACCOUNTABLE' | 'CONTRIBUTOR' | 'CONSULTED' | 'INFORMED';

/** What fills a role: exactly one of these, or null when unknown. A system/agent is 'agent'. */
export type ExecutorType = 'person' | 'team' | 'agent';

/** Every number that appears must say how it was arrived at. */
export type EffortBasis = 'UNKNOWN' | 'ESTIMATED' | 'MEASURED';

/** How a task/attribute was derived — the precedence tag the LLM (Phase 2) must set. */
export type DecompositionMethod = 'EXPLICIT' | 'INFERRED' | 'LLM';

/** How much human judgment the task inherently needs — drives the human-or-AI score. */
export type JudgmentLevel = 'none' | 'low' | 'medium' | 'high';

/** The decision authority the task carries. */
export type DecisionAuthority = 'none' | 'recommend' | 'decide_bounded' | 'decide_full';

/** Structured sensitivity of the data the task touches (NuOrg keeps this as free text; we type it). */
export type DataSensitivity = 'public' | 'internal' | 'confidential' | 'regulated';

/** Approval maturity: the process is right (documented) vs everyone is assigned too (full). */
export type ApprovalLevel = 'documented' | 'full';

// ── evidence + requirements ────────────────────────────────────────────────────

/**
 * One addressable block of the source a requirement/task derives from. The requirement (or
 * an SOP, or a solicitation) is split into blocks with stable ids BEFORE anything reads it,
 * so a task can cite `source_evidence: [block.id, ...]` and coverage is a deterministic query.
 */
export interface SourceBlock {
  id: string;
  /** page / section / table / row — where it came from. */
  locator: string;
  text: string;
  /** classification once resolved; 'unresolved' blocks approval (SOURCE_CLASSIFICATION). */
  kind: 'requirement' | 'context' | 'constraint' | 'out_of_scope' | 'unresolved';
}

/** A solicitation requirement — the compliance-matrix row. Canonical id shared across tracks. */
export interface ContractRequirement {
  /** canonical requirement id; the same id links proposal sections and solution stories. */
  id: string;
  statement: string;
  kind: RequirementKind;
  priority: RequirementPriority;
  /** which track(s) this requirement bears on; a technical requirement may span both. */
  tracks: ContractTrackType[];
  source_document: string;
  /** amendment / version of the source, so a later amendment can invalidate reviews. */
  amendment_version: string;
  section: string;
  extracted_text: string;
  /** the human interpretation of the requirement; null until someone writes it. */
  interpretation: string | null;
  /** a human has confirmed the interpretation. Unclear requirements stay flagged (false). */
  human_confirmed: boolean;
  /** the evidence status of the proposal claim answering this requirement. */
  evidence_state: EvidenceState;
  /** source block ids this requirement was extracted from. */
  source_evidence: string[];
}

// ── process + task decomposition ────────────────────────────────────────────────

/** The mandatory process record produced before implementation stories (spec §3). */
export interface ProcessRecord {
  id: string;
  business_outcome: string;
  success_criterion: string;
  trigger: string;
  inputs: string[];
  outputs: string[];
  decision_branches: string[];
  /** the accountable human owner of the future-state process. */
  future_owner_role_id: string | null;
  exceptions: string[];
}

/**
 * One task in the process. Granularity rule (enforced by the Phase-2 LLM, shaped here):
 * one verb, one object, one outcome, one performer. Carries the attributes NuOrg lacks so a
 * human-or-AI allocation can actually be decided.
 */
export interface FactoryTask {
  id: string;
  process_id: string;
  title: string;
  description: string;
  kind: TaskKind;
  stage_id: string;
  /** block ids this task derives from — the SOURCE_COVERAGE anchor. Empty is a validation error. */
  source_evidence: string[];
  /** skill ids from the ontology (not free text). Empty = unknown, allowed and visible. */
  required_skills: string[];
  judgment_level: JudgmentLevel;
  decision_authority: DecisionAuthority;
  data_sensitivity: DataSensitivity;
  /** who/what it interacts with and over what channel, e.g. "customer, email". */
  interaction_pattern: string | null;
  /** how often the task runs, e.g. "per case", "daily". */
  frequency: string | null;
  effort_minutes: number | null;
  effort_basis: EffortBasis;
  /** 0..1 model confidence; null on an EXPLICIT (rule-derived) task. */
  confidence: number | null;
  method: DecompositionMethod;
}

/** A process-scoped role. Definition lives per process revision, NOT a global catalog. */
export interface Role {
  id: string;
  name: string;
  /** what the role is, in this process. A missing performer becomes an explicit placeholder. */
  definition: string;
}

/**
 * role + responsibility + executor target. Executor is exactly one of person/team/agent (or
 * null when unknown). An 'agent' executor is legal only where a human holds ACCOUNTABLE or
 * APPROVER on the same task (factoryValidate OVERSIGHT); a system may never BE approver/accountable.
 */
export interface Assignment {
  id: string;
  task_id: string;
  role_id: string;
  responsibility: Responsibility;
  executor: { type: ExecutorType; id: string } | null;
  minutes: number | null;
  basis: EffortBasis;
  evidence_note: string | null;
}

/** A flow edge. A backward edge is legal only when is_rework (factoryValidate LOOP). */
export interface TransitionEdge {
  id: string;
  from_task_id: string;
  to_task_id: string;
  condition: string | null;
  is_rework: boolean;
}

// ── tracks, approval, and the assembled project ─────────────────────────────────

/** One of the two workstreams of a contract project, hung off a delivery_projects row. */
export interface ContractTrack {
  id: string;
  /** the parent — a delivery_projects.id (NOT a student projects.id). */
  delivery_project_id: string;
  track_type: ContractTrackType;
  status: string;
  owner_identity_id: string | null;
  /** for a solution_build track: the linked student projects.id (via DeliveryProjectSourceLink). */
  solution_student_project_id: string | null;
}

/**
 * A transactional approval record. version + content_hash make history reproducible;
 * expected_version is the compare-and-swap guard (stale ⇒ refused); fork-on-edit means a new
 * version supersedes rather than mutating the approved snapshot.
 */
export interface ApprovalRecord {
  id: string;
  /** what is being approved, e.g. "process:PID" | "proposal:PID" | "release:RID". */
  subject_ref: string;
  version: number;
  /** the version the writer believed current; a mismatch is a 409, not a silent overwrite. */
  expected_version: number;
  /** SHA-256 over (org/link revision id + the approved document). */
  content_hash: string;
  level: ApprovalLevel;
  /** decoupled from level: "the process is right" vs "everyone is assigned". */
  enrichment_status: 'pending' | 'partial' | 'resolved';
  superseded_by_id: string | null;
  approved_at: string | null;
  approved_by: string | null;
}

/** One row of the human/AI allocation matrix, for the rendered review. */
export interface AllocationRow {
  task_id: string;
  execution_class: 'human' | 'ai_with_approval' | 'ai_autonomous' | 'deterministic_software';
  rationale: string;
  accountable_role_id: string | null;
}

/** One row of the old→new role map. */
export interface RoleMapRow {
  previous_function: string;
  ai_contribution: string;
  new_role_id: string;
  retained_responsibilities: string[];
}

/**
 * The assembled contract-project instance factoryValidate() runs over. This is the shape the
 * Phase-1 sample is built as and later phases generate.
 */
export interface FactoryProject {
  delivery_project_id: string;
  tracks: ContractTrack[];
  source_blocks: SourceBlock[];
  requirements: ContractRequirement[];
  processes: ProcessRecord[];
  tasks: FactoryTask[];
  roles: Role[];
  assignments: Assignment[];
  transitions: TransitionEdge[];
  allocation: AllocationRow[];
  role_map: RoleMapRow[];
}

/** The union of executor types, for exhaustiveness checks and the schema mirror. */
export const EXECUTOR_TYPES: ReadonlyArray<ExecutorType> = ['person', 'team', 'agent'];
export const RESPONSIBILITIES: ReadonlyArray<Responsibility> =
  ['PERFORMER', 'APPROVER', 'ACCOUNTABLE', 'CONTRIBUTOR', 'CONSULTED', 'INFORMED'];
export const EVIDENCE_STATES: ReadonlyArray<EvidenceState> =
  ['demonstrated', 'tested', 'planned', 'assumption', 'missing'];
