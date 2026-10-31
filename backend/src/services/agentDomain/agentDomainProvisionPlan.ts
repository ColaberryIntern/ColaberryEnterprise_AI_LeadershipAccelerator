/**
 * What provisioning one agent-domain project WOULD write, computed without touching a database.
 *
 * Run `20261007-school-agent-factory` (T14), session CC-20261006-a4k7.
 *
 * Separated from the executor so the row set can be asserted exhaustively in a unit test, and so
 * the write-set is a value other code can read rather than a claim in a comment.
 *
 * ## Correction C — "anchor first" is not possible, and something better is
 *
 * The plan says to insert the `agent_domain_projects` anchor FIRST, so that "the unique index is
 * the thing that stops a duplicate, rather than a code check that can be raced".
 *
 * The anchor cannot go first. `agent_domain_projects.student_project_id` is
 * `UUID NOT NULL REFERENCES projects(id)` (`ensureAgentDomainProjectSchema.ts`), declared without
 * `DEFERRABLE`, so Postgres checks it at statement time: inserting the anchor before its project
 * raises a foreign-key violation, every time. The ordering in the plan describes a transaction
 * that cannot commit.
 *
 * The property the plan actually wanted survives intact, because **every id here is derived**. The
 * `projects` row is inserted at `derivedProjectId(domainKey)` — a UUID v5 of the domain key — so
 * what stops a second insert is the table's PRIMARY KEY, which is enforced by the database and
 * cannot be raced. The anchor's `uq_agent_domain_key (tenant_id, domain_key)` then stops a
 * duplicate anchor independently. Two database-level guards instead of one, in the only order the
 * schema permits. Nothing relies on a read-then-write check.
 *
 * ## Why no build authorization is written
 *
 * `agent_domain_build_authorizations` is in the declared write-set and this phase writes **zero
 * rows** to it, because an authorization row records a named human's approval and no human has
 * approved a build. Writing one with a placeholder approver would be the fabrication this whole
 * programme exists to avoid. `TABLES_WRITTEN_THIS_PHASE` states that explicitly rather than
 * leaving a reader to infer it from an empty table.
 */

import { factoryId } from '../factory/factoryIds';
import { POST_APPROVAL_STAGES, type LifecycleStage } from '../lifecycle/lifecycleStages';
import { AGENT_DOMAIN_KEYS, AGENT_DOMAIN_ENTRY_POINT, getAgentDomain } from './agentDomainRegistry';
import {
  planForDomain,
  type GeneratedStory,
  type GeneratedRelease,
  type StoryKind,
} from './agentDomainStoryTemplates';
import { loadDomainMatrix } from './capabilityRecord';

/** The tenant an agent-domain project belongs to, resolved by slug at runtime — never hardcoded. */
export const TENANT_SLUG = 'colaberry';

/**
 * The program blueprint these ten projects belong to, pinned by id.
 *
 * `projects.program_id` is NOT NULL and references `program_blueprints`. T02 seeded one row for
 * exactly this purpose -- "Internal AI Employee Operations", at the derived id
 * `uuid5('program_blueprint:internal_ai_employee_operations')` -- so that internal AI-employee
 * work does not hang off a customer programme.
 *
 * IT IS PINNED BECAUSE THE ALTERNATIVE WAS MEASURED WRONG. The resolver used to take
 * `ORDER BY created_at ASC LIMIT 1`, and in production that returns
 * `b6de87b3-e116-4bbd-a109-52ede7785ff1` -- "Enterprise AI Leadership Accelerator", created
 * 2026-03-08, the real student programme. Nothing would have failed: ten internal projects would
 * have been created against the customer accelerator, and the only trace would have been a
 * `program_id` nobody reads.
 *
 * Absence is a named refusal, not a fallback. A fallback is what turned a missing prerequisite
 * into a confidently wrong answer.
 */
export const AGENT_DOMAIN_PROGRAM_BLUEPRINT_ID = '8660090e-1f6f-51cf-ae46-483bfa8903c5';

/** The name that id carries, asserted at resolve time so a reused id cannot pass silently. */
export const AGENT_DOMAIN_PROGRAM_BLUEPRINT_NAME = 'Internal AI Employee Operations';

/**
 * Every table this provisioner is permitted to write. Exported so the test and the execution
 * contract cannot drift: the test extracts the tables named in the executor's SQL and compares.
 */
export const PROVISIONER_WRITE_SET: ReadonlyArray<string> = Object.freeze([
  'projects',
  'agent_domain_projects',
  'agent_domain_build_authorizations',
  'project_lifecycle_states',
  'student_task_lists',
  'student_tasks',
]);

/**
 * Of the declared six, the five this phase actually writes — and why the sixth is empty.
 *
 * `project_lifecycle_states` is in this list, but the provisioner does NOT write it directly: it
 * is written by `studentProjectLifecycleHook` inside the provisioner's own transaction, when
 * `Project.findOrCreate` creates the project. Upstream's LC-01 tripwire forbids a raw insert into
 * `projects` for exactly that reason — a raw insert fires neither the tenant hook nor the
 * lifecycle hook, and a parallel hand-written lifecycle row is the bypass the hook exists to stop.
 * The table stays in the list because a row lands in it as a direct consequence of this
 * transaction, and the integration suite reads it back rather than assuming the hook ran.
 */
export const TABLES_WRITTEN_THIS_PHASE: ReadonlyArray<string> = Object.freeze([
  'projects',
  'agent_domain_projects',
  'project_lifecycle_states',
  'student_task_lists',
  'student_tasks',
]);

export const TABLE_DELIBERATELY_UNWRITTEN = Object.freeze({
  table: 'agent_domain_build_authorizations',
  reason: 'an authorization row records a named human approval, and no human has approved a build',
});

/**
 * Symbols this module must never reach. Each one would take the provisioner past the boundary the
 * owner set, and each is grepped for by a test rather than trusted.
 *
 *  - `createNewProjectForEnrollment` (`projectService.ts:121`) always creates AND ACTIVATES.
 *  - `publishBuild` materialises a plan into a student's live portal.
 *  - `enrollments.active_project_id` moves a person's portal to a different project.
 *  - `AGENT_REGISTRY` / `ai_agents` would build or register an agent, which this phase forbids.
 */
export const FORBIDDEN_SYMBOLS: ReadonlyArray<string> = Object.freeze([
  'createNewProjectForEnrollment',
  'publishBuild',
  'active_project_id',
  'AGENT_REGISTRY',
  'markTaskVerifiedComplete',
]);

/** The only stage a provisioned project may be born at. */
export const PROVISION_STAGE: LifecycleStage = 'discovery';

/**
 * Stages provisioning must never emit. A DELIBERATE SUPERSET of the repo's own
 * `POST_APPROVAL_STAGES` (`lifecycleStages.ts:56`, which begins at `blueprint_approved`): it also
 * excludes `awaiting_blueprint_approval`, because a project sitting in an approval queue reads to a
 * human as further along than a project nobody has looked at, and nothing here has been looked at.
 *
 * Conditions are not stages (`lifecycleStages.ts:12`), so `failed` and `blocked` are correctly
 * absent from this set.
 */
export const FORBIDDEN_STAGES: ReadonlySet<string> = new Set<string>([
  ...POST_APPROVAL_STAGES,
  'awaiting_blueprint_approval',
]);

/** The id kinds, named once so a derivation cannot drift between the plan and the executor. */
export const ID_KINDS = Object.freeze({
  project: 'agent_domain_student_project',
  anchor: 'agent_domain_project',
  release: 'agent_domain_release',
  story: 'agent_domain_story',
});

export function derivedProjectId(domainKey: string): string {
  return factoryId(ID_KINDS.project, [domainKey]);
}
export function derivedAnchorId(domainKey: string): string {
  return factoryId(ID_KINDS.anchor, [domainKey]);
}
export function derivedReleaseId(domainKey: string, cluster: string): string {
  return factoryId(ID_KINDS.release, [domainKey, cluster]);
}
export function derivedStoryId(domainKey: string, storyId: string): string {
  return factoryId(ID_KINDS.story, [domainKey, storyId]);
}

export interface PlannedRelease {
  readonly id: string;
  readonly cluster: string;
  readonly title: string;
  readonly position: number;
}

export interface PlannedStory {
  readonly id: string;
  readonly release_cluster: string;
  readonly story_id: string;
  readonly kind: StoryKind;
  readonly title: string;
  readonly narrative: string;
  /** The full domain-specific Claude Code prompt. `build` is the field the portal's
   *  "Copy prompt" reads (`materializeTasks.ts:11-12`), so it is stored WITH the task. */
  readonly build: string;
  readonly position: number;
  readonly capability_id: string | null;
  readonly release_key: string;
  /**
   * The rung this story sits on, namespaced `autonomy:R0`..`autonomy:R9`.
   *
   * Phase 2 of `AUTONOMY_RELEASE_MIGRATION.md`, item 7. Until this existed the provisioner
   * computed a story's rung, rendered it into the prompt PROSE, and dropped it -- so no surface
   * could answer "which rung is this agent on" without re-parsing a 6,000-character string.
   */
  readonly autonomy_stage: string;
  /**
   * Acceptance criteria written WITH the row, where the source data carries them.
   *
   * Non-empty only for `release_behaviour` stories, whose criteria are recorded per rung in the
   * capability records. The other kinds were backfilled by AF10.2 and are left to it: the first
   * 503 stories shipped with this column null and needed two repair scripts, which is the thing
   * this field exists to stop happening to the next 964.
   */
  readonly acceptance: ReadonlyArray<string>;
}

/**
 * What goes in `build` for a story that is HUMAN work rather than a Claude Code build.
 *
 * The five research stories and the one legacy-migration story per domain carry no
 * `claude_code_prompt`, deliberately: discovery is a conversation with a manager, not a coding
 * task. But `build` is the field the portal's "Copy prompt" button reads, and an empty string
 * would hand the person a blank box with no explanation. `materializeTasks.ts:286` already set the
 * precedent for this repo -- "prep tasks are human work, not a Claude Code prompt, say so plainly"
 * -- so this says so plainly too, rather than inventing a prompt to fill the field.
 */
export const HUMAN_WORK_STATEMENT =
  'This story is human work, not a Claude Code build, and it carries no prompt on purpose.\n\n'
  + 'It is research or a conversation with the accountable manager. Record what you find in the '
  + 'story body. Nothing here authorizes an outbound message: do not send an invitation, and do '
  + 'not record a meeting as booked. A capability stays `draft` until the manager has actually '
  + 'reviewed it, and that review is the output of this story.';

export interface ProvisionPlan {
  readonly domain_key: string;
  readonly project_id: string;
  readonly anchor_id: string;
  readonly stage: LifecycleStage;
  readonly entry_point: string;
  readonly manager_identity_id: string;
  /** MEASURED reachability, carried onto the anchor row. Never defaulted to true. */
  readonly manager_can_reach: boolean;
  /** The named reason a manager cannot reach the surface, or null when they can. */
  readonly manager_blocker: string | null;
  readonly accountable_human: string;
  readonly intended_builder: string | null;
  readonly intended_builder_state: string | null;
  readonly agent_id: string | null;
  readonly releases: ReadonlyArray<PlannedRelease>;
  readonly stories: ReadonlyArray<PlannedStory>;
}

function titleFor(r: GeneratedRelease): string {
  return r.name.slice(0, 255);
}

/**
 * The width of `student_tasks.story_id`, which this module truncates to.
 *
 * Declared here rather than imported from `db/ensureAgentDomainStoryLadderSchema`, because that
 * module imports `sequelize` and this one's whole contract is that it is pure -- no database, no
 * clock, no randomness. The two numbers are instead pinned together by a unit test that compares
 * them, the same way the registry and its `CHECK` constraint are set-compared both ways rather
 * than one importing the other. A test that fails is better than a purity violation that does not.
 */
export const STORY_ID_MAX = 120;

function plannedStory(domainKey: string, s: GeneratedStory, position: number): PlannedStory {
  return {
    id: derivedStoryId(domainKey, s.story_id),
    release_cluster: s.release_key,
    // 120, matching the widened column. The slice stays because a slice that never cuts is a
    // guard, and the one that used to cut at 60 was silently producing truncated ids while the
    // row id above was derived from the FULL string -- so two stories could land as two rows
    // carrying one `story_id`. See `db/ensureAgentDomainStoryLadderSchema.ts`.
    story_id: s.story_id.slice(0, STORY_ID_MAX),
    kind: s.kind,
    title: s.title.slice(0, 500),
    narrative: s.body,
    build: s.claude_code_prompt.length > 0 ? s.claude_code_prompt : HUMAN_WORK_STATEMENT,
    position,
    capability_id: s.capability_id,
    release_key: s.release_key.slice(0, 60),
    autonomy_stage: s.autonomy_stage,
    acceptance: s.acceptance,
  };
}

/** The complete row set for one domain. Pure: no database, no clock, no randomness. */
export function planProvision(domainKey: string): ProvisionPlan {
  if (!AGENT_DOMAIN_KEYS.includes(domainKey as never)) {
    throw new Error(`not an agent domain: '${domainKey}'`);
  }
  // `intended_builder` and its state live in the REGISTRY, not in the capability matrix. Reading
  // them from the matrix would have returned undefined for every domain and silently provisioned
  // ten projects with no builder recorded -- the matrix carries the manager, not the intern.
  const domain = getAgentDomain(domainKey);
  if (!domain) throw new Error(`no registry entry for agent domain '${domainKey}'`);
  const matrix = loadDomainMatrix(domainKey);
  const plan = planForDomain(domainKey);

  const byCluster = new Map<string, number>();
  const stories = plan.stories.map((s) => {
    const n = byCluster.get(s.release_key) ?? 0;
    byCluster.set(s.release_key, n + 1);
    return plannedStory(domainKey, s, n);
  });

  return {
    domain_key: domainKey,
    project_id: derivedProjectId(domainKey),
    anchor_id: derivedAnchorId(domainKey),
    stage: PROVISION_STAGE,
    entry_point: AGENT_DOMAIN_ENTRY_POINT,
    manager_identity_id: matrix.manager_identity_id,
    manager_can_reach: domain.can_reach_surface,
    manager_blocker: domain.blocker,
    accountable_human: matrix.accountable_human,
    intended_builder: domain.intended_builder,
    intended_builder_state: domain.intended_builder_state,
    agent_id: domain.agent_id ?? null,
    releases: plan.releases.map((r) => ({
      id: derivedReleaseId(domainKey, r.cluster),
      cluster: r.cluster.slice(0, 50),
      title: titleFor(r),
      position: r.position,
    })),
    stories,
  };
}

/**
 * The three values `ck_agent_domain_builder_state` admits. Kept here so a registry state the
 * schema would reject is caught by a unit test rather than by a constraint violation in the middle
 * of a production transaction.
 */
export const PERMITTED_BUILDER_STATES: ReadonlyArray<string> = Object.freeze([
  'verified_active', 'onboarding_pending', 'unassigned',
]);

export function planAllProvisions(): ProvisionPlan[] {
  return AGENT_DOMAIN_KEYS.map((k) => planProvision(k));
}

/** Every id the ten plans would write, for the rollback record the plan requires before T19. */
export function allPlannedIds(): {
  readonly projects: ReadonlyArray<string>;
  readonly anchors: ReadonlyArray<string>;
  readonly releases: ReadonlyArray<string>;
  readonly stories: ReadonlyArray<string>;
} {
  const plans = planAllProvisions();
  return {
    projects: plans.map((p) => p.project_id),
    anchors: plans.map((p) => p.anchor_id),
    releases: plans.flatMap((p) => p.releases.map((r) => r.id)),
    stories: plans.flatMap((p) => p.stories.map((s) => s.id)),
  };
}
