/**
 * planContract — the shape of a Student Build Pipeline plan.
 *
 * This is the contract between the decomposer (which produces a plan from a
 * brief + requirements document) and everything downstream: the traceability
 * gate, the document renderers, the repo writer, and prompt assembly.
 *
 * Pure types + the JSON schema used for structured model output. No I/O, no
 * imports from services. See docs/BUILD_PIPELINE_REQUIREMENTS.md (SBP-REQ-v1)
 * FR-006 (requirements), FR-008 (releases), FR-009 (stories).
 */

/**
 * Requirement kinds.
 *
 * CONSTRAINT is load-bearing and is the fix for a real production defect: the
 * pilot typed "the system must connect to Postgres" and "the system must use
 * Mandrill" as FUNC/must. The gate's every-must-needs-a-story rule then
 * manufactured layer stories ("System connects to Postgres for data access")
 * to satisfy them. A constraint is a named technology, vendor, datastore or
 * protocol the system must use — it is CONTEXT on the stories that use it, not
 * a work item, and it is exempt from story coverage. See planGate.
 */
export const REQUIREMENT_KINDS = ['FUNC', 'SAFE', 'REL', 'NFR', 'OBS', 'CONSTRAINT'] as const;
export type RequirementKind = typeof REQUIREMENT_KINDS[number];

export const PRIORITIES = ['must', 'should'] as const;
export type Priority = typeof PRIORITIES[number];

export interface PlanRequirement {
  /** REQ-001, REQ-002, … sequential and stable for a given document version. */
  id: string;
  /** One sentence, testable, in the system's own domain language. */
  statement: string;
  kind: RequirementKind;
  priority: Priority;
  /** Capability this belongs to; becomes a Capability row and a task list grouping. */
  cluster: string;
}

export interface PlanRelease {
  /** r0, r1, … r0 is the walking skeleton and proves the trust spine. */
  key: string;
  name: string;
  goal: string;
  /** What you can show a person when this release lands. */
  demo: string;
  week_start: number;
  week_end: number;
}

export interface PlanStory {
  /** STORY-001, … sequential. */
  id: string;
  /** A release key. */
  release: string;
  /** User-visible behaviour, never a layer. */
  title: string;
  /** "As a <role>, I want <capability>, so that <outcome>." */
  narrative: string;
  /** Requirement ids this story fulfils. */
  fulfills: string[];
  owner_agent: string;
  /** >=3 Gherkin lines; exactly one starts with "Trust". */
  acceptance: string[];
  /** Concrete implementation direction for THIS story. */
  task_guidance: string;
  /** Specific failure modes this story must handle. */
  failure_paths: string[];
  /** story_ids that must be complete first (release gating). */
  blocked_by?: string[];
}

/**
 * One unit of autonomous work in the system the student is building — not a
 * person and not a department. Scoped from the requirements AFTER the plan is
 * gate-clean (see scopeAgents), so it is optional: a plan that predates
 * scoping, or one whose scoping call failed, is still a valid plan.
 */
export interface PlanAgent {
  /** AGENT-001, … sequential. */
  id: string;
  /** What it DOES ("Agreement Reader"), never a job title ("Contract Manager"). */
  name: string;
  purpose: string;
  trigger_type: 'event' | 'schedule' | 'manual';
  trigger: string;
  inputs: string[];
  outputs: string[];
  /** The LEAST autonomy the requirements permit. */
  autonomy_level: 'suggests' | 'acts_with_approval' | 'acts_autonomously';
  /**
   * SAFE requirements this agent's own stories touch. Populated by scopeAgents,
   * never by the model: an agent with a gate here cannot be autonomous.
   */
  approval_gates: string[];
  escalation_rules: string[];
  skills: string[];
  /** Story ids this agent owns. */
  owns: string[];
}

export interface BuildPlan {
  project_name: string;
  descriptor: string;
  requirements: PlanRequirement[];
  releases: PlanRelease[];
  stories: PlanStory[];
  /** The AI team, when it has been scoped. Absent on older plans. */
  agents?: PlanAgent[];
}

/** True when this requirement is an implementation constraint (exempt from story coverage). */
export function isConstraint(r: Pick<PlanRequirement, 'kind'>): boolean {
  return r.kind === 'CONSTRAINT';
}

/** Requirements subject to the coverage rule: `must` priority and not a constraint. */
export function requiresStoryCoverage(r: PlanRequirement): boolean {
  return r.priority === 'must' && !isConstraint(r);
}

/**
 * JSON schema for structured model output. Kept adjacent to the types so the
 * two cannot drift — enforced by the round-trip test in
 * __tests__/planContract.test.ts, which fails if any declared field is
 * unrepresentable under `additionalProperties: false`.
 *
 * NOTE ON `required`: OpenAI strict structured output demands that every key in
 * `properties` also appear in `required`. Optional-in-TypeScript fields
 * (`blocked_by`) are therefore required here and the model emits `[]` when
 * empty — which is why the round-trip test checks representability, not
 * optionality parity.
 */
export const BUILD_PLAN_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['project_name', 'descriptor', 'requirements', 'releases', 'stories'],
  properties: {
    project_name: { type: 'string' },
    descriptor: { type: 'string' },
    requirements: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'statement', 'kind', 'priority', 'cluster'],
        properties: {
          id: { type: 'string', description: 'REQ-001, REQ-002, … sequential' },
          statement: {
            type: 'string',
            description:
              "One sentence, testable, in the system's own domain language. Name real entities. " +
              '"The system must provide a user-friendly interface" is a failure.',
          },
          kind: {
            type: 'string',
            enum: [...REQUIREMENT_KINDS],
            description:
              'CONSTRAINT = a named technology, vendor, datastore or protocol the system must use ' +
              '(e.g. "must use PaySimple for payments"). Constraints are context for the stories that ' +
              'use them, NOT work items, and must not be typed FUNC.',
          },
          priority: { type: 'string', enum: [...PRIORITIES] },
          cluster: { type: 'string', description: 'Capability name this belongs to' },
        },
      },
    },
    releases: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'name', 'goal', 'demo', 'week_start', 'week_end'],
        properties: {
          key: { type: 'string', description: 'r0, r1, r2, …' },
          name: { type: 'string' },
          goal: { type: 'string' },
          demo: {
            type: 'string',
            description:
              "What you can show a person when this lands. For r0 this must show the system's " +
              'correctness guarantee holding, not just a happy path.',
          },
          week_start: { type: 'integer' },
          week_end: { type: 'integer' },
        },
      },
    },
    stories: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id', 'release', 'title', 'narrative', 'fulfills',
          'owner_agent', 'acceptance', 'task_guidance', 'failure_paths', 'blocked_by',
        ],
        properties: {
          id: { type: 'string', description: 'STORY-001, … sequential' },
          release: { type: 'string', description: 'a release key' },
          title: {
            type: 'string',
            description:
              'User-visible behaviour, end to end. Never a layer ("System connects to Postgres", ' +
              '"Send emails via Mandrill", "Establish trust spine") — those are rejected.',
          },
          narrative: { type: 'string', description: 'As a <role>, I want <capability>, so that <outcome>.' },
          fulfills: { type: 'array', items: { type: 'string' }, description: 'REQ ids' },
          owner_agent: { type: 'string' },
          acceptance: {
            type: 'array',
            items: { type: 'string' },
            description:
              '>=3 Gherkin lines: a happy path, a failure/boundary path, and exactly one line ' +
              'starting "Trust" asserting the audit or guardrail behaviour.',
          },
          task_guidance: {
            type: 'string',
            description: 'Concrete implementation direction for THIS story: name real entities, endpoints, tables.',
          },
          failure_paths: {
            type: 'array',
            items: { type: 'string' },
            description: '3-5 specific failure modes this story must handle',
          },
          // Release gating. Without this the gate's dangling_blocked_by and
          // r0_not_ungated rules are unreachable on generated output, because
          // `additionalProperties: false` forbids the model emitting a field the
          // schema does not declare. Emit [] for an ungated story.
          blocked_by: {
            type: 'array',
            items: { type: 'string' },
            description:
              'story_ids that must be complete before this one can start. Every story in release ' +
              'r(n) is blocked by the key (last) story of r(n-1). r0 stories emit [].',
          },
        },
      },
    },
  },
} as const;
