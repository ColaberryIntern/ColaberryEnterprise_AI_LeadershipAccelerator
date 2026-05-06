/**
 * authoritativeTaskQueue — produces the project-wide task list every
 * downstream consumer reads. Replaces fragmented sources of "what to do next".
 *
 * Pipeline:
 *   1. Per cap, generate candidate tasks (build/health/improve/UI/foundation)
 *   2. Score each task on 7 dimensions (priority, blocking, dependency,
 *      maturity_gain, readiness_gain, confidence, cost)
 *   3. Resolve dependencies → mark blocked vs ready
 *   4. Rank by composite score (priorityRanker)
 *   5. Return ordered AuthoritativeTask[] (ALL tasks — not just top 5;
 *      consumers can slice as needed)
 *
 * The queue is a function of (project, capabilities, scores) — pure and
 * deterministic. Same inputs → same output.
 */
import type {
  AuthoritativeTask,
  AuthoritativeTaskState,
  AuthoritativeTaskType,
  CapabilityScores,
  EngineCapabilityInput,
  EngineProjectInput,
} from '../types/systemState.types';
import { resolveDependencies } from './dependencyResolver';
import { rankTasks } from './priorityRanker';

export interface BuildQueueInput {
  readonly project: EngineProjectInput;
  readonly capabilities: ReadonlyArray<EngineCapabilityInput>;
  readonly capability_scores: ReadonlyArray<CapabilityScores>;
}

export function buildAuthoritativeQueue(input: BuildQueueInput): {
  readonly tasks: ReadonlyArray<AuthoritativeTask>;
  readonly cycles: ReadonlyArray<ReadonlyArray<string>>;
} {
  const candidates: AuthoritativeTask[] = [];

  // 1. Foundation kickoff task if all caps are still fresh
  const isFresh = input.capabilities.every(c => {
    const status = c.last_execution?.status;
    return !status || (status !== 'complete' && status !== 'verified' && status !== 'foundation_built');
  });

  if (isFresh && input.capabilities.length > 0) {
    candidates.push(buildFoundationTask(input.project));
  }

  // 2. Per-cap candidate tasks
  for (const cap of input.capabilities) {
    if (cap.applicability_status !== 'active') continue;
    if (cap.user_status === 'archived' || cap.user_status === 'verified') continue;

    const score = input.capability_scores.find(s => s.capability_id === cap.id);
    if (!score) continue;

    candidates.push(...generateCapTasks(cap, score, input.project));
  }

  // 3. Resolve dependencies
  const resolved = resolveDependencies(candidates);

  // 4. Rank
  const ranked = rankTasks(resolved.tasks);

  return { tasks: ranked, cycles: resolved.cycles };
}

// ---------------------------------------------------------------------------
// Task generators
// ---------------------------------------------------------------------------

function buildFoundationTask(project: EngineProjectInput): AuthoritativeTask {
  return {
    id: 'kickoff:project',
    project_id: project.id,
    bp_id: undefined,
    title: 'Kickoff: plan and build the foundation in one session',
    description: 'Verify CLAUDE.md and your Build Guide doc exist, plan all phases in plan mode, then execute every foundation phase end-to-end. One consolidated report at the very end.',
    type: 'foundation',
    priority_score: 100,
    blocking_score: 100,
    dependency_score: 100,
    maturity_gain: 50,
    readiness_gain: 60,
    confidence_score: 100,
    execution_cost: 80,
    dependencies: [],
    calculated_rank: 0,   // priorityRanker will set this
    state: 'ready' as AuthoritativeTaskState,
    reasoning: Object.freeze([
      'Project is fresh — no capability has been built yet.',
      'Kickoff covers all foundation phases in one Claude Code session.',
    ]),
  };
}

function generateCapTasks(
  cap: EngineCapabilityInput,
  score: CapabilityScores,
  project: EngineProjectInput,
): AuthoritativeTask[] {
  const tasks: AuthoritativeTask[] = [];

  const hasBackend = (cap.linked_backend_services || []).length > 0;
  const hasFrontend = (cap.linked_frontend_components || []).length > 0 || !!cap.frontend_route;
  const hasAgents = (cap.linked_agents || []).length > 0;

  // Backend gap
  if (!hasBackend && score.coverage < 100) {
    tasks.push(makeTask({
      id: `${cap.id}:build_backend`,
      project_id: project.id,
      bp_id: cap.id,
      title: `Build backend services for ${cap.name}`,
      description: `${cap.name} has no backend layer detected. Generate the route + service + model trio.`,
      type: 'backend',
      priority_score: 80,
      blocking_score: 60,
      dependency_score: 70,
      maturity_gain: 30,
      readiness_gain: 50,
      confidence_score: 90,
      execution_cost: 50,
      reasons: [
        `${cap.name} maturity is L${score.maturity_level}`,
        'No backend files linked',
      ],
    }));
  }

  // Frontend gap
  if (hasBackend && !hasFrontend) {
    tasks.push(makeTask({
      id: `${cap.id}:add_frontend`,
      project_id: project.id,
      bp_id: cap.id,
      title: `Add user interface for ${cap.name}`,
      description: 'Backend exists but no frontend pages or components are linked.',
      type: 'frontend',
      priority_score: 70,
      blocking_score: 40,
      dependency_score: 50,
      maturity_gain: 25,
      readiness_gain: 30,
      confidence_score: 85,
      execution_cost: 40,
      reasons: [
        'Backend layer present, frontend missing',
      ],
    }));
  }

  // Coverage gap (greenfield only — has requirements)
  if (cap.total_requirements > 0) {
    const unmatched = cap.total_requirements - cap.matched_requirements;
    if (unmatched > 0) {
      tasks.push(makeTask({
        id: `${cap.id}:implement_reqs`,
        project_id: project.id,
        bp_id: cap.id,
        title: `Implement ${unmatched} unmatched requirements for ${cap.name}`,
        description: `${unmatched} of ${cap.total_requirements} requirements are not yet matched to code.`,
        type: 'backend',
        priority_score: 75,
        blocking_score: 30,
        dependency_score: 60,
        maturity_gain: Math.min(50, unmatched * 5),
        readiness_gain: Math.min(50, unmatched * 3),
        confidence_score: 80,
        execution_cost: Math.min(80, 20 + unmatched * 4),
        reasons: [`${unmatched} requirements unmatched`],
      }));
    }
  }

  // UI review gap (Page BP only)
  if (cap.is_page_bp && score.coverage < 100) {
    const stepsRun = cap.ui_element_map?.steps || {};
    const allSteps = ['layout_hierarchy', 'usability', 'mobile_responsiveness'];
    const unrun = allSteps.filter(s => !stepsRun[s]?.run_at);
    if (unrun.length > 0) {
      tasks.push(makeTask({
        id: `${cap.id}:ui_review`,
        project_id: project.id,
        bp_id: cap.id,
        title: `Run UI Advisor on ${cap.name}`,
        description: `${unrun.length} of 3 visual review steps haven't run yet.`,
        type: 'ui_review',
        priority_score: 50,
        blocking_score: 20,
        dependency_score: 40,
        maturity_gain: 25,
        readiness_gain: 20,
        confidence_score: 75,
        execution_cost: 20,
        reasons: [`${unrun.length} UI Advisor steps pending`],
      }));
    }
  }

  // Verification gap (high coverage but not user-verified)
  if (score.coverage >= 90 && cap.user_status !== 'verified') {
    tasks.push(makeTask({
      id: `${cap.id}:verify`,
      project_id: project.id,
      bp_id: cap.id,
      title: `Verify ${cap.name}`,
      description: `${cap.name} is at ${score.coverage}% coverage. Mark verified to lock it in.`,
      type: 'validation',
      priority_score: 90,
      blocking_score: 80,
      dependency_score: 90,
      maturity_gain: 10,
      readiness_gain: 10,
      confidence_score: 95,
      execution_cost: 5,
      reasons: [`Coverage at ${score.coverage}% — ready to verify`],
    }));
  }

  // Optimization gap (mature cap with unverified PROGRESS.md mentions)
  const mentions = cap.last_execution?.progress_md_mentions || 0;
  if (score.coverage > 60 && score.health < 60 && mentions > 0) {
    tasks.push(makeTask({
      id: `${cap.id}:optimize_health`,
      project_id: project.id,
      bp_id: cap.id,
      title: `Improve health of ${cap.name}`,
      description: `${cap.name} has working code but health score is ${score.health}/100. Add tests, observability, or hardening.`,
      type: 'optimization',
      priority_score: 40,
      blocking_score: 10,
      dependency_score: 30,
      maturity_gain: 15,
      readiness_gain: 10,
      confidence_score: 70,
      execution_cost: 30,
      reasons: [`Health at ${score.health}, ${mentions} PROGRESS.md mentions`],
    }));
  }

  return tasks;
}

interface TaskShortInput {
  id: string;
  project_id: string;
  bp_id?: string;
  title: string;
  description: string;
  type: AuthoritativeTaskType;
  priority_score: number;
  blocking_score: number;
  dependency_score: number;
  maturity_gain: number;
  readiness_gain: number;
  confidence_score: number;
  execution_cost: number;
  reasons: string[];
  dependencies?: string[];
  state?: AuthoritativeTaskState;
}

function makeTask(input: TaskShortInput): AuthoritativeTask {
  return {
    id: input.id,
    project_id: input.project_id,
    bp_id: input.bp_id,
    title: input.title,
    description: input.description,
    type: input.type,
    priority_score: clamp(input.priority_score),
    blocking_score: clamp(input.blocking_score),
    dependency_score: clamp(input.dependency_score),
    maturity_gain: clamp(input.maturity_gain),
    readiness_gain: clamp(input.readiness_gain),
    confidence_score: clamp(input.confidence_score),
    execution_cost: clamp(input.execution_cost),
    dependencies: Object.freeze(input.dependencies || []),
    calculated_rank: 0,
    state: input.state || 'pending',
    reasoning: Object.freeze(input.reasons),
  };
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
