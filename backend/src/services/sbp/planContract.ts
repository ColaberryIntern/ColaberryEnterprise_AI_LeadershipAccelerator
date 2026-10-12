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
  /**
   * Which parts of the student's confirmed truth caused this requirement.
   *
   * ## Why dimensions and not per-item ids
   *
   * Truth items are stored as a JSONB array with no stable id, so "fact key"
   * here means the canonical DIMENSION - `approval_points`, `systems`,
   * `current_workflow`. Those names are stable, shared with AI Flotation, and
   * already the vocabulary the whole contract is built on. Citing a
   * per-item id would be more precise and would break the first time a student
   * corrected a word.
   *
   * ## What this is for
   *
   * A student reading a requirement they do not recognise can see which of
   * their own answers produced it, and a requirement citing nothing is visible
   * as exactly that: something the model added on its own. The brief asks that
   * generated artefacts retain traceability to the facts that caused them, and
   * this is the honest granularity available today.
   *
   * OPTIONAL, permanently. Every plan generated before this existed carries
   * none, and absence means "unknown", never "caused by nothing".
   */
  from_dimensions?: string[];
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

/**
 * Whether a story reaches a human, and where.
 *
 * ## MODEL-EMITTED, unlike everything in `StoryReferences`
 *
 * P6-T3 put every lifecycle reference in the server-populated bucket on the grounds that none
 * is model-knowable. That was right about a blueprint hash and WRONG about this one, and the
 * distinction is worth stating because it is the whole reason this type exists separately:
 *
 *   - a blueprint `content_sha256` IDENTIFIES AN EXISTING ROW. A model asked for one returns a
 *     plausible 64-character string with nothing behind it. That is fabrication.
 *   - "does this story reach user-visible output, or is it background work?" is a CLASSIFICATION
 *     OF THE STORY'S OWN CONTENT. The model wrote the story and is decomposing the product; it
 *     knows whether the work yields a page. Nothing is being invented.
 *
 * ## Why it had to move
 *
 * `release_review` exists because of a measured production failure on a STUDENT build - 20 of 20
 * stories finished and platform-verified, twelve of fourteen services unreachable, because the
 * releases were layered by pipeline stage. Its rule reads this field.
 *
 * But a student build has no workspace model: `ManifestRefs.surfaces` is written by no adapter,
 * and workspaces live on the Factory/delivery side where there are no stories at all
 * (`build_plans.project_id` is a `projects` id). So as a server-populated field this was
 * unfeedable on the one side the rule was built for, and `release_review` could only ever report
 * "unassessed" - blocking every project forever. Decided 2026-10-10.
 */
export interface StoryWorkspace {
  /**
   * `headless` is a FIRST-CLASS answer, not a missing value.
   *
   * Background work is legitimate and common. If headless were not expressible the model would
   * either invent a page or omit the field, and omission is what made this unmeasurable before.
   */
  kind: 'workspace' | 'headless';
  /** The page or surface a user reaches, or the job/queue name when headless. */
  ref: string;
  /** The action within that surface, when the story is one action rather than the whole page. */
  action?: string | null;
}

/**
 * Where a story sits in the governed lifecycle — the references `request.md:245` requires every
 * story to carry, for the ones it does not already have.
 *
 * ## NOT MODEL-EMITTED, and that is the whole design
 *
 * This interface is deliberately absent from `BUILD_PLAN_JSON_SCHEMA`, following `BuildPlan.agents`
 * below, which is "populated by scopeAgents, never by the model". Two reasons, and the first is the
 * serious one:
 *
 * 1. **Every field here identifies a record the model cannot know.** A blueprint revision and its
 *    content hash, a business-task id, an approved design decision — these are
 *    facts about rows that exist. A language model asked to emit a `content_sha256` would produce a
 *    plausible hex string, which is fabrication of exactly the kind this programme keeps catching.
 *    The server resolves them or they are absent.
 * 2. The schema is OpenAI strict structured output, where every key in `properties` must also
 *    appear in `required`. Adding six reference fields there would force the model to emit all of
 *    them on every story of every plan, including plans generated before any blueprint exists.
 *
 * ## Absent means "not established", never "none"
 *
 * Legacy plans have no `references` at all, and plans generated before their project has an
 * approved blueprint will not either. Nothing may read absence as a negative finding — the same
 * rule `RenderContext.repoWriteAccess` already states for the same reason.
 */
export interface StoryReferences {
  /**
   * Business-task ids this story implements, from the approved process contract.
   *
   * Empty is meaningful and is not the same as absent: empty says the link was looked for and none
   * was found, which is worth seeing on a story that claims to implement a business process.
   */
  business_task_ids: string[];
  /**
   * The approved blueprint this story was decomposed FROM, pinned by revision and content hash.
   *
   * Both, not either: the revision says which one, the hash says that it has not changed
   * underneath. `blueprintApproval.manifestContentHash` is the producer.
   */
  blueprint: { revision: number; content_sha256: string };
  /** Approved design decisions and policies this story must honour, by id. */
  design_refs: string[];
  /**
   * The CODING agent that builds this story.
   *
   * SEPARATE FROM `owner_agent` ON PURPOSE. `owner_agent` names a `PlanAgent` — "one unit of
   * autonomous work in the system the student is building", a runtime employee of the built
   * system. The thing that writes the code is a different actor, and `request.md:245` forbids
   * overloading one field with both. The manifest keyspace already separates these as
   * `agents.runtime` and `agents.builder`; this follows that convention rather than inventing a
   * second one for the same distinction.
   */
  builder_agent?: string | null;
  /** What has to be true, and observable, before this story counts as delivered. */
  acceptance_evidence: string[];
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
  /**
   * Whether this story reaches a human, and where. See `StoryWorkspace`.
   *
   * REQUIRED in the JSON schema and OPTIONAL here, which is this file's existing house pattern
   * (see `from_dimensions`): OpenAI strict output demands every property appear in `required`,
   * so the model always emits it - while every plan generated before 2026-10-10 has none, and
   * nothing re-validates a stored plan on read.
   */
  workspace?: StoryWorkspace;
  /** story_ids that must be complete first (release gating). */
  blocked_by?: string[];
  /**
   * Lifecycle references, when they have been resolved. ABSENT on every plan generated before
   * 2026-10-09, and absent on any plan whose project has no approved blueprint — see
   * `StoryReferences` for why absence is never read as a negative.
   */
  references?: StoryReferences;
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
        required: ['id', 'statement', 'kind', 'priority', 'cluster', 'from_dimensions'],
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
          /*
           * Required in the SCHEMA and optional in TypeScript, which is the
           * house pattern: OpenAI strict output demands every property appear
           * in `required`, so the model emits [] when a requirement traces to
           * nothing rather than omitting the key.
           *
           * An empty array is meaningful and is NOT the same as absent. Empty
           * says the model was asked and cited nothing, which is worth seeing:
           * a requirement nobody's answer produced is one the model invented.
           */
          from_dimensions: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Canonical truth dimensions that caused this requirement, e.g. '
              + '["approval_points","systems"]. Cite only what the student actually said. '
              + 'Empty is correct when nothing they told you produced this.',
          },
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
          'workspace',
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
          // THE RELEASE-LEVEL SIGNAL. `release_review` asks whether a release demonstrates a
          // business workflow a human can see; without this it had nothing to read and blocked
          // every project. The model classifies its OWN story rather than resolving a foreign
          // identifier - see `StoryWorkspace` for why that distinction makes this safe to emit.
          workspace: {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'ref', 'action'],
            properties: {
              kind: {
                type: 'string',
                enum: ['workspace', 'headless'],
                description:
                  "'workspace' when finishing this story gives a person something to open, " +
                  "click or see. 'headless' when it is background work no page shows - a job, " +
                  'a sync, a queue consumer. Headless is legitimate and must be used honestly: ' +
                  'a release in which EVERY story is headless demonstrates nothing to a user, ' +
                  'which is the failure this field exists to make visible.',
              },
              ref: {
                type: 'string',
                description:
                  'The page or surface a user reaches, named as the product names it ' +
                  '("Intake review", "Client dashboard"). When headless, the job or queue name.',
              },
              action: {
                type: ['string', 'null'],
                description:
                  'The action within that surface when the story is one action rather than the ' +
                  'whole page ("approve", "export"). Emit null when the story IS the page.',
              },
            },
          },
        },
      },
    },
  },
} as const;
