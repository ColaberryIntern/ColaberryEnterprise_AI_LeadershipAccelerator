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
  DecisionTrace,
  EngineCapabilityInput,
  EngineProjectInput,
} from '../types/systemState.types';
import { scoreCoverage } from '../scoring/coverageScorer';
import { scoreMaturity } from '../scoring/maturityScorer';
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
    decision_trace: Object.freeze({
      readiness_inputs: { current: 0, target: 60, gap: 60 },
      coverage_inputs: { current: 0, source: 'no_signal' as const, target: 60, gap: 60 },
      maturity_inputs: { current_level: 0 as const, target_level: 1 as const, next_level_gap: 'No capability has been executed yet — kickoff scaffolds everything.' },
      dependency_inputs: { count: 0, unmet: Object.freeze([]), cycles: Object.freeze([]) },
      blocking_inputs: { is_blocking: true, downstream_count: project.capabilities.length, reason: 'No per-BP work can start until the foundation is in place.' },
      confidence_inputs: { confidence: 100, basis: 'Foundation tasks always run with full confidence.' },
      formulas_used: Object.freeze([
        'priority_score=100 (foundation tasks always max-priority)',
        'blocking_score=100 (everything downstream depends on this)',
        'composite = priority*0.30 + blocking*0.25 + ... - cost*0.20',
      ]),
      reasoning_chain: Object.freeze([
        'Project has no executed capabilities (isFreshProject() === true).',
        'Foundation task is the only valid next-step on fresh projects.',
        'All other per-BP tasks would be premature.',
      ]),
    }),
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

  // kind-based gating (added 2026-05-18). Backend-build is only meaningful
  // for kind='service'. Pages don't have a backend layer to build;
  // agents ARE the backend (the linked_agents row IS the implementation);
  // components are UI bits embedded in pages.
  // is_page_bp kept as a defensive guard — if either signal says "not a
  // backend service", skip. Engine mapping should keep them aligned, but
  // belt-and-suspenders covers older code paths and tests.
  const kind = cap.kind || 'service';
  const backendBuildEligible = kind === 'service' && !cap.is_page_bp;

  // Internal-service heuristic (2026-05-18): caps named like backend
  // infrastructure (*Service, *Engine, *Controller, *Middleware, *Logging,
  // *Emission, *Validation, *Ingestion, *Detection, *Tracker, *Monitor,
  // *Logger, *Reconciliation, *Normalization) don't need their own UI —
  // operators interact with them through admin dashboards, which are
  // separate caps. Only fire add_frontend for these if they have
  // POSITIVE frontend evidence (frontend_route declared or some
  // linked_frontend_components already shipped).
  // Internal-service suffixes — caps whose names end with any of these are
  // backend infrastructure consumed by other surfaces (admin dashboards,
  // ops monitors) and don't need their own UIs. Operators encountering
  // "Add UI for Webhook Integration" / "Add UI for Executive Narrative
  // Composer" are seeing a queue bug, not a real ask.
  // Extended 2026-05-18 audit pass: added integration|composer|generation|
  // optimization|estimator|planner|mapping|definition|tracking|reporting|
  // automation|orchestration|management|framework|parser to cover the
  // residual backend-infra patterns surfaced by the top-50 review.
  const looksInternal = /\s(service|engine|controller|middleware|logging|emission|validation|ingestion|detection|tracker|monitor|logger|reconciliation|normalization|verification|snapshot|forwarding|registration|registry|integration|composer|generation|optimization|estimator|planner|mapping|definition|tracking|reporting|automation|orchestration|framework|parser|handling|composer)$/i.test(cap.name || '');

  // Positive frontend signal: explicit route declaration OR existing UI
  // components. Either is operator-declared "this cap wants a UI" intent.
  const hasUserSurface = !!cap.frontend_route || (cap.linked_frontend_components || []).length > 0;

  // Brownfield-only caps with no UI signal: these were discovered by the
  // code scanner from backend file patterns. If they were user-facing,
  // either a frontend route would be declared or components would already
  // exist. Without either, treat them as internal backend services —
  // operators interact with them through other dashboards. Surfaced
  // 2026-05-18 audit by caps like Query / Verification / Lead Scoring /
  // Discovery / Execution Planning / Runtime Threat Monitoring whose
  // descriptions explicitly call them backend services.
  const isBrownfieldOnlyWithoutUISignal =
    cap.source === 'brownfield_discovered' && !hasUserSurface;

  // add_frontend gating:
  //   kind=service, non-internal-named, NOT brownfield-without-UI-signal → fire
  //   kind=service, internal-named → skip (backend infra)
  //   kind=service, brownfield-discovered without UI signal → skip (backend infra)
  //   kind=agent → skip (consumed by governance/ops dashboards)
  //   kind=component → skip (handled by kind exclusion)
  //   kind=page → skip via is_page_bp
  const frontendAddEligible =
    kind === 'service' &&
    !looksInternal &&
    !cap.is_page_bp &&
    !isBrownfieldOnlyWithoutUISignal;

  // Backend gap. Skip for Page BPs — pages are frontend routes with no
  // backend layer to "build" (Not Found Page, Pricing Page, etc.).
  // Their progress is measured by ui_review, not backend coverage.
  // Added 2026-05-18 after the queue surfaced "Build backend for Trust
  // Badges Page" as the operator's #1 priority.
  // Extended same day: also skip for kind='agent' (the agent code IS the
  // backend) and kind='component' (UI widgets don't have backends).
  if (!hasBackend && score.coverage < 100 && backendBuildEligible) {
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
      cap, cap_score: score,
    }));
  }

  // Frontend gap. Skip for Page BPs (they ARE the frontend), for
  // kind='component' (already part of a frontend), and for kind='agent'
  // unless explicitly expecting a UI surface. Agents get the option since
  // some agent surfaces have admin UIs (governance, monitoring).
  // frontendAddEligible already excludes 'component' and 'page'.
  if (hasBackend && !hasFrontend && frontendAddEligible) {
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
      cap, cap_score: score,
    }));
  }

  // Coverage gap (greenfield only — has operator-actionable requirements).
  // Uses operator_unmatched_requirements (NOT total - matched) so that
  // autonomy-engine-generated rows don't surface here — they have their
  // own tracking surface and counting them twice confuses operators.
  // Falls back to (total - matched) for older engine inputs.
  // Task type follows cap kind: Page BPs get frontend work, services get
  // backend work.
  if (cap.total_requirements > 0) {
    const unmatched = cap.operator_unmatched_requirements ?? (cap.total_requirements - cap.matched_requirements);
    if (unmatched > 0) {
      tasks.push(makeTask({
        id: `${cap.id}:implement_reqs`,
        project_id: project.id,
        bp_id: cap.id,
        title: `Implement ${unmatched} unmatched requirement${unmatched === 1 ? '' : 's'} for ${cap.name}`,
        description: `${unmatched} of ${cap.total_requirements} requirements are not yet matched to code.`,
        type: cap.is_page_bp ? 'frontend' : 'backend',
        priority_score: 75,
        blocking_score: 30,
        dependency_score: 60,
        maturity_gain: Math.min(50, unmatched * 5),
        readiness_gain: Math.min(50, unmatched * 3),
        confidence_score: 80,
        execution_cost: Math.min(80, 20 + unmatched * 4),
        reasons: [`${unmatched} requirements unmatched`],
        cap, cap_score: score,
      }));
    }
  }

  // UI review gap (Page BP only) — operator-bounded polish, NOT a build task.
  // Re-ranked 2026-05-19 to surface BELOW system-actionable optimization
  // tasks. Operator framing: "pages were built with Claude Code outside this
  // process; UI Advisor is enhancement/audit, not building. Should come
  // after any work the system itself can drive." Lowering priority + maturity
  // + readiness so the composite ranks below optimization tasks (~23pts)
  // while staying above truly low-value work.
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
        priority_score: 25,   // was 50 — explicit deprioritization
        blocking_score: 10,   // was 20 — review doesn't block downstream builds
        dependency_score: 20, // was 40 — doesn't gate other work
        maturity_gain: 15,    // was 25 — moves the needle less than build work
        readiness_gain: 10,   // was 20 — same rationale
        confidence_score: 75,
        execution_cost: 20,
        reasons: [`${unrun.length} UI Advisor steps pending (polish — operator-bounded)`],
        cap, cap_score: score,
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
      cap, cap_score: score,
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
      cap, cap_score: score,
    }));
  }

  // Phase C (2026-05-19): gap-driven task — for caps that aren't
  // operator-bounded but have a specific weak dimension, surface it as
  // an actionable task. Targets the dimension scoring lowest among the
  // cap's actionable dimensions. Only fires when the cap is otherwise
  // built (has backend OR frontend) and isn't operator-bounded.
  // Total transparency principle: every score gap should have either
  // a task that would close it or a label saying "needs operator".
  const isBuilt = hasBackend || hasFrontend;
  const isOperatorBounded = !!score.operator_bounded;
  const hb = score.health_breakdown;
  if (isBuilt && !isOperatorBounded && hb && hb.applicable_dimensions.length > 0 && score.health < 70) {
    // Per-dimension actionability gate. A dimension may APPLY to a cap's
    // kind (so it counts in the average) but still not be actionable to
    // ASK the operator to improve. ux_exposure for an internal-named
    // service is a typical case: the dim applies (frontend isn't loaded),
    // but "add UI to Lead Ingestion Controller" is wrong because that
    // cap isn't meant to have its own UI.
    const isDimActionable = (dim: string): boolean => {
      switch (dim) {
        case 'ux_exposure':
          // Same gate as add_frontend: only suggest improving UX on caps
          // that legitimately should have a UI (service, non-internal,
          // non-page). Otherwise the suggestion repeats add_frontend's
          // false positive in a different shape.
          return frontendAddEligible;
        case 'automation':
          // Suggest adding agents only for service-kind caps (page/component
          // never own their own agents; agent-kind already IS an agent).
          return kind === 'service' && !looksInternal;
        case 'determinism':
        case 'reliability':
        case 'observability':
        case 'production_readiness':
          // These apply broadly — any built cap can benefit from harder
          // error handling, more logging, fuller deploy artifacts.
          return true;
        default:
          return true;
      }
    };

    // Find the lowest-scoring ACTIONABLE applicable dimension
    const dimValues = hb.applicable_dimensions
      .filter(d => isDimActionable(d))
      .map(d => ({ name: d, value: (hb as any)[d] as number }));
    dimValues.sort((a, b) => a.value - b.value);
    const weakest = dimValues[0];
    if (weakest && weakest.value < 50) {
      const dimLabels: Record<string, { ask: string }> = {
        determinism:          { ask: 'add rule-based fallbacks where the agent currently makes the call' },
        reliability:          { ask: 'add try/catch + retry + idempotency to the main path' },
        observability:        { ask: 'add structured logging + metrics + correlation IDs' },
        ux_exposure:          { ask: 'either link a frontend_route or add components' },
        automation:           { ask: 'either link an existing agent or add one' },
        production_readiness: { ask: 'check deploy artifacts (Dockerfile, env, secrets) and any missing layers' },
      };
      const label = dimLabels[weakest.name] || { ask: 'review the dimension and address gaps' };
      tasks.push(makeTask({
        id: `${cap.id}:improve_${weakest.name}`,
        project_id: project.id,
        bp_id: cap.id,
        title: `Improve ${weakest.name.replace(/_/g, ' ')} for ${cap.name}`,
        description: `${cap.name}'s ${weakest.name} dimension is at ${weakest.value}/100. Action: ${label.ask}.`,
        type: 'optimization',
        priority_score: 45,
        blocking_score: 15,
        dependency_score: 35,
        maturity_gain: 15,
        readiness_gain: 10,
        confidence_score: 75,
        execution_cost: 25,
        reasons: [
          `${weakest.name} at ${weakest.value}/100 (weakest actionable dimension)`,
          `kind=${cap.kind || 'service'}`,
        ],
        cap, cap_score: score,
      }));
    }
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
  // Optional: provide cap context to populate decision_trace.
  cap?: EngineCapabilityInput;
  cap_score?: CapabilityScores;
  // Deep-link target route (added 2026-05-19) — for ui_review tasks
  // this is the cap's frontend_route so consumers can pre-fill the
  // Critique page route field instead of asking the operator to retype.
  frontend_route?: string;
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
    decision_trace: input.cap ? buildDecisionTrace(input) : undefined,
    frontend_route: input.frontend_route || input.cap?.frontend_route || undefined,
  };
}

function buildDecisionTrace(input: TaskShortInput): DecisionTrace {
  const cap = input.cap!;
  const score = input.cap_score;
  const coverage = scoreCoverage(cap);
  const maturity = scoreMaturity(cap);

  const targetReadiness = input.readiness_gain + (score?.readiness || 0);
  const targetCoverage = input.maturity_gain + (score?.coverage || 0);

  const reasoningChain: string[] = [];
  reasoningChain.push(`${cap.name} is at maturity L${maturity.level}.`);
  reasoningChain.push(`Coverage source: ${coverage.source} → ${coverage.value}%.`);
  if (input.priority_score >= 80) reasoningChain.push('High priority — gap is concrete and addressable.');
  if (input.blocking_score >= 60) reasoningChain.push('Blocking score is high — other work waits on this.');
  if (input.execution_cost >= 70) reasoningChain.push(`Higher execution cost (${input.execution_cost}) — non-trivial Claude Code session.`);
  for (const r of input.reasons) reasoningChain.push(r);

  const formulas: string[] = [
    `composite = priority_score*0.30 + blocking_score*0.25 + maturity_gain*0.15 + readiness_gain*0.15 + dependency_score*0.10 + confidence_score*0.05 - execution_cost*0.20`,
    `state_adjustment: ready=+25, in_progress=+50, blocked=-100, failed=-100`,
    `calculated_rank = -composite (lower = earlier)`,
  ];
  if (coverage.source === 'evidence_based') {
    formulas.push('coverage = evidence_completion_pct (brownfield path — no requirements doc)');
  } else if (coverage.source === 'requirements_coverage') {
    formulas.push('coverage = matched_requirements / total_requirements * 100');
  } else if (coverage.source === 'page_visual_review') {
    formulas.push('coverage = verified_categories / 5 * 100 (Page BP visual review)');
  }

  // Phase 3: explicit explainability payload.
  const score_breakdown: Record<string, number> = {
    priority: Math.round(input.priority_score * 0.30),
    blocking: Math.round(input.blocking_score * 0.25),
    maturity_gain: Math.round(input.maturity_gain * 0.15),
    readiness_gain: Math.round(input.readiness_gain * 0.15),
    dependency: Math.round(input.dependency_score * 0.10),
    confidence: Math.round(input.confidence_score * 0.05),
    execution_cost_penalty: -Math.round(input.execution_cost * 0.20),
  };
  const projectedLevel = Math.min(4, maturity.level + 1) as 0 | 1 | 2 | 3 | 4;

  // Telemetry sources used: heuristic baseline always; manifest/validation
  // labels added by the engine when those layers contributed (engine sets the
  // hint via global state — Phase 4 will thread this through cleanly).
  const telemetry_sources_used: Array<'manifest' | 'validation' | 'declared_map' | 'repo_evidence'> = ['repo_evidence'];

  // expected_outcomes: short, action-oriented bullets the UI can render.
  const expected_outcomes: string[] = [];
  if (input.readiness_gain > 0) expected_outcomes.push(`+${input.readiness_gain} readiness`);
  if (input.maturity_gain > 0) expected_outcomes.push(`closer to L${projectedLevel} maturity`);
  if (input.blocking_score >= 60) expected_outcomes.push('unblocks downstream work');

  return Object.freeze({
    readiness_inputs: {
      current: score?.readiness || 0,
      target: Math.min(100, targetReadiness),
      gap: Math.max(0, targetReadiness - (score?.readiness || 0)),
    },
    coverage_inputs: {
      current: coverage.value,
      source: coverage.source,
      target: Math.min(100, targetCoverage),
      gap: Math.max(0, targetCoverage - coverage.value),
    },
    maturity_inputs: {
      current_level: maturity.level,
      target_level: projectedLevel,
      next_level_gap: maturity.next_level_gap,
    },
    dependency_inputs: {
      count: (input.dependencies || []).length,
      unmet: Object.freeze([]),    // resolveDependencies populates these later
      cycles: Object.freeze([]),
    },
    blocking_inputs: {
      is_blocking: input.blocking_score >= 60,
      downstream_count: 0,         // could be filled by future graph analysis
      reason: input.blocking_score >= 60 ? 'Score >=60 — gates downstream work.' : undefined,
    },
    confidence_inputs: {
      confidence: input.confidence_score,
      basis: input.reasons.join('; '),
    },
    formulas_used: Object.freeze(formulas),
    reasoning_chain: Object.freeze(reasoningChain),

    // Phase 3 explainability payload
    score_breakdown: Object.freeze(score_breakdown),
    dependency_chain: Object.freeze([...(input.dependencies || [])]),
    missing_requirements: Object.freeze([]),       // populated by Phase 4 telemetry inspection
    expected_outcomes: Object.freeze(expected_outcomes),
    projected_maturity_gain: Object.freeze({
      current_level: maturity.level,
      projected_level: projectedLevel,
      delta: projectedLevel - maturity.level,
    }),
    affected_systems: Object.freeze(cap ? [`bp:${cap.id}`] : []),
    telemetry_sources_used: Object.freeze(telemetry_sources_used),
  });
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
