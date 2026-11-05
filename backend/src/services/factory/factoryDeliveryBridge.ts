/**
 * factoryDeliveryBridge — turn a settled decomposition into delivery stories and a release
 * verdict, through the contracts that already exist (L10.8).
 *
 * ## Why a bridge rather than a new story format
 *
 * The factory decides WHAT the work is, who performs it, which agent team owns each AI task and
 * which surface each human task lands on. `services/delivery` already owns what a shippable
 * story is (`deliveryStoryContract`) and whether a release may go (`releaseGate`). Without this
 * module the spine stops at a diagram: correct, tested, and producing nothing anybody can ship.
 *
 * ## It DERIVES; it does not invent
 *
 * Every field below is computed from something the decomposition already decided, and the
 * mapping is written down so a reader can disagree with it. Where the decomposition does not
 * determine a field, the story carries `null` and the gap is REPORTED, rather than filled with
 * a plausible value. A plausible value is the worse outcome: it is indistinguishable from a
 * real one.
 *
 * Five autonomy/risk vocabularies already exist at four granularities, so this module adds
 * none. It uses `ExecutionPolicy` and `ApprovalPolicy` from `deliveryStoryContract`,
 * `DeliveryRiskLevel` from `modules/delivery/deliveryRiskLevels`, `DeliveryEvidenceType` from
 * `modules/delivery/deliveryEvidence`, and the INPACT dimensions the team itself declared.
 *
 * NOTE on the two R-scales, because they look identical and are not: `DeliveryRiskLevel` is
 * `R0..R5` and describes how consequential a story is. `AutonomyStage` is `autonomy:R0..R9` and
 * describes how much latitude an agent has. A team's autonomy stage is NOT a story's risk level
 * and is never copied across.
 *
 * ## What this module does NOT do
 *
 * It has no caller yet. Nothing in the system turns a factory project into delivery stories in
 * production, and wiring it means changing an API response shape with real consumers. That is
 * the next ticket's work, named in the run handoff rather than left to be discovered.
 */
import type {
  FactoryProject, FactoryTask, AgentTeam, Surface, AllocationRow,
} from './contracts/factoryContract';
import {
  validateStoryContract, findDeliveryTraceabilityGaps,
  type DeliveryStoryContract, type StoryIssue, type TraceabilityGap,
  type ExecutionPolicy, type ApprovalPolicy,
} from '../delivery/deliveryStoryContract';
import {
  evaluateReleaseGate, assertDeploymentAuthorized,
  type ReleaseGateResult, type DeploymentAuthorizationRefusal,
} from '../delivery/releaseGate';
import type { ReleaseCheckResult } from '../../modules/delivery/releaseChecks';
import type { DeliveryRiskLevel } from '../../modules/delivery/deliveryRiskLevels';
import type { DeliveryEvidenceType } from '../../modules/delivery/deliveryEvidence';

/** A gap the bridge could not fill from the decomposition. Reported, never guessed. */
export interface BridgeGap {
  rule: 'AI_TASK_WITHOUT_TEAM' | 'HUMAN_TASK_WITHOUT_SURFACE' | 'REQUIREMENT_LINK_UNAVAILABLE';
  ref: string;
  detail: string;
}

export interface BridgeResult {
  stories: DeliveryStoryContract[];
  /** Per-story contract issues, from `validateStoryContract`. Not re-judged here. */
  storyIssues: StoryIssue[];
  traceabilityGaps: TraceabilityGap[];
  gaps: BridgeGap[];
  release: ReleaseGateResult;
  /**
   * Why this may not deploy. `assertDeploymentAuthorized` ALWAYS returns at least one refusal
   * by policy, which is the ready-versus-authorized distinction L10.8 asks for: a release can
   * be ready and still not authorized, and the two are different questions.
   */
  deploymentRefusals: DeploymentAuthorizationRefusal[];
}

export interface BridgeInput {
  project: Pick<FactoryProject,
    'delivery_project_id' | 'tasks' | 'allocation' | 'requirements' | 'agent_teams' | 'surfaces'>;
  /** Release profile. Pinned by the caller; `mandatoryChecksFor` silently widens an unknown key. */
  profileKey: string;
  /** Check results from the pipeline. The bridge NEVER manufactures these. */
  checkResults?: readonly ReleaseCheckResult[];
  /**
   * Which cited source block corresponds to which canonical requirement id.
   *
   * The factory anchors a task to SOURCE BLOCK ids, and `ContractRequirement` carries no block
   * back-reference, so there is no way to derive this from the project record. Supplied, the
   * stories trace to requirement ids; omitted, they trace to block ids and
   * REQUIREMENT_LINK_UNAVAILABLE is reported so nobody reads block ids as requirement ids.
   */
  blockToRequirement?: Readonly<Record<string, string>>;
  approvedByIdentityId?: string | null;
}

const AI_CLASSES: readonly AllocationRow['execution_class'][] = ['ai_with_approval', 'ai_autonomous'];

/**
 * Story risk, from what the task itself records.
 *
 * The table rather than a judgement call, so two runs over the same decomposition agree:
 *   regulated or confidential data, or decide_full authority  -> R4
 *   decide_bounded authority                                  -> R3
 *   recommend authority, or internal data                     -> R2
 *   anything else                                             -> R1
 * R0 is never assigned: a task that exists in a contract decomposition is not risk-free, and
 * R5 is never assigned, because nothing in a task record justifies the top of the scale.
 */
export function riskLevelFor(task: FactoryTask): DeliveryRiskLevel {
  const sensitivity = task.data_sensitivity;
  const authority = task.decision_authority;
  if (sensitivity === 'regulated' || sensitivity === 'confidential' || authority === 'decide_full') return 'R4';
  if (authority === 'decide_bounded') return 'R3';
  if (authority === 'recommend' || sensitivity === 'internal') return 'R2';
  return 'R1';
}

/**
 * Evidence a story must produce, from the existing `DeliveryEvidenceType` vocabulary.
 *
 * Agent work earns `ai_eval` because an agent's output is the thing whose quality is in
 * question; everything gets `commit` and `test_run` because nothing in this repo is done
 * without them. `ai_autonomous` additionally earns `security_scan`: work no human approves
 * before it lands is the case where the scan is the only thing standing between a mistake and
 * production.
 */
export function evidenceFor(executionClass: AllocationRow['execution_class'] | undefined): DeliveryEvidenceType[] {
  const base: DeliveryEvidenceType[] = ['commit', 'test_run'];
  if (executionClass === 'ai_with_approval') return [...base, 'ai_eval'];
  if (executionClass === 'ai_autonomous') return [...base, 'ai_eval', 'security_scan'];
  return base;
}

function policiesFor(
  cls: AllocationRow['execution_class'] | undefined,
  team: AgentTeam | undefined,
): { executionPolicy: ExecutionPolicy | null; approvalPolicy: ApprovalPolicy | null } {
  // An AI task's policies are the OWNING TEAM's policies. That is the point of a team: the
  // governance is declared once, for a subject, rather than per task.
  if (cls && AI_CLASSES.includes(cls)) {
    if (!team) return { executionPolicy: null, approvalPolicy: null };
    return { executionPolicy: team.execution_policy, approvalPolicy: team.approval_policy };
  }
  // Human work is manual_only by derivation, not by assumption: no agent performs it.
  // approvalPolicy stays null because nothing in the decomposition states who reviews a human's
  // work, and `internal_review` would be a guess wearing a policy's name.
  if (cls === 'human') return { executionPolicy: 'manual_only', approvalPolicy: null };
  return { executionPolicy: null, approvalPolicy: null };
}

export function buildDeliveryStories(input: BridgeInput): {
  stories: DeliveryStoryContract[];
  gaps: BridgeGap[];
} {
  const { project } = input;
  const gaps: BridgeGap[] = [];
  const classOf = new Map(project.allocation.map((a) => [a.task_id, a.execution_class]));

  const teamOf = new Map<string, AgentTeam>();
  for (const t of project.agent_teams ?? []) {
    for (const id of t.task_ids) if (!teamOf.has(id)) teamOf.set(id, t);
  }
  const surfaceOf = new Map<string, Surface>();
  for (const s of project.surfaces ?? []) {
    for (const id of s.task_ids) if (!surfaceOf.has(id)) surfaceOf.set(id, s);
  }

  const map = input.blockToRequirement;
  let unmappedCited = 0;

  const stories: DeliveryStoryContract[] = [];
  for (const task of project.tasks) {
    if (task.kind === 'START' || task.kind === 'END') continue;

    const cls = classOf.get(task.id);
    const team = teamOf.get(task.id);
    const isAi = cls !== undefined && AI_CLASSES.includes(cls);

    if (isAi && !team) {
      gaps.push({
        rule: 'AI_TASK_WITHOUT_TEAM',
        ref: task.id,
        detail: `${task.id} is ${cls} and belongs to no agent team, so its execution and approval policy cannot be derived.`,
      });
    }
    if (cls === 'human' && !surfaceOf.has(task.id)) {
      gaps.push({
        rule: 'HUMAN_TASK_WITHOUT_SURFACE',
        ref: task.id,
        detail: `${task.id} is human work with no surface, so the story cannot say where it is performed.`,
      });
    }

    const cited = task.source_evidence ?? [];
    const fulfills = cited.map((id) => {
      const mapped = map?.[id];
      if (mapped === undefined) unmappedCited += 1;
      return mapped ?? id;
    });

    const { executionPolicy, approvalPolicy } = policiesFor(cls, team);

    stories.push({
      storyId: `story-${task.id}`,
      title: task.title,
      fulfills,
      businessReason: task.description || null,
      // The team is the agent this story implements or evaluates. This is the field
      // `findDeliveryTraceabilityGaps` reads for the production-agent trust rule, paired with
      // trustDimensions below - which is why a team's INPACT dimensions are carried through
      // rather than summarised.
      agentImpacts: team ? [team.id] : null,
      trustDimensions: team ? [...team.trust_dimensions] : null,
      riskLevel: riskLevelFor(task),
      acceptance: [`${task.title} is complete and its performer is the one the allocation names.`],
      failurePaths: isAi
        ? ['The agent produces an unusable result and the named approver rejects it.']
        : ['The performer is unavailable and the task misses its window.'],
      testRequirements: [isAi ? 'An evaluation of the agent output.' : 'A check that the output meets the stated acceptance.'],
      evidenceRequired: evidenceFor(cls),
      executionPolicy,
      approvalPolicy,
    });
  }

  if (map === undefined && unmappedCited > 0) {
    gaps.push({
      rule: 'REQUIREMENT_LINK_UNAVAILABLE',
      ref: project.delivery_project_id,
      detail: `No block-to-requirement map was supplied, so ${unmappedCited} citation(s) trace to SOURCE BLOCK ids rather than canonical requirement ids. `
        + 'Block ids are not requirement ids; traceability against must-requirements will report gaps until the map is provided.',
    });
  }

  return { stories, gaps };
}

/**
 * The whole bridge: stories, their contract issues, traceability, and the release verdict.
 *
 * `checkResults` defaults to EMPTY rather than to something passing. An empty result set makes
 * every mandatory check a blocker and `ready` false, which is the correct answer for a release
 * nobody has run checks on.
 */
export function bridgeFactoryToDelivery(input: BridgeInput): BridgeResult {
  const { stories, gaps } = buildDeliveryStories(input);

  const storyIssues = stories.flatMap((s) => validateStoryContract(s));

  const mustRequirementIds = input.project.requirements
    .filter((r) => r.priority === 'must')
    .map((r) => r.id);

  // One trust requirement per (team, dimension). Carried into the traceability check so the
  // ticket's rule holds: a declared trust dimension that no story implements is a gap.
  const productionAgentTrustRequirements = (input.project.agent_teams ?? []).flatMap((t) =>
    t.trust_dimensions.map((dimension) => ({ agentId: t.id, dimension })),
  );

  const traceabilityGaps = findDeliveryTraceabilityGaps({
    stories,
    mustRequirementIds,
    approvedDesignDecisionIds: [],
    productionAgentTrustRequirements,
  });

  const release = evaluateReleaseGate({
    profileKey: input.profileKey,
    results: input.checkResults ?? [],
    approvedByIdentityId: input.approvedByIdentityId ?? null,
  });

  const deploymentRefusals = assertDeploymentAuthorized({
    release,
    approvedByIdentityId: input.approvedByIdentityId ?? null,
  });

  return { stories, storyIssues, traceabilityGaps, gaps, release, deploymentRefusals };
}
