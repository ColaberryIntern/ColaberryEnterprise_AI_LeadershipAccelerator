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

  // 2b. Agent-stack proposals (added 2026-05-19). Runs as a separate
  // pass because it's the EXPLICIT next-tier ask AFTER a cap is built
  // — including verified caps which the main per-cap loop skips. The
  // operator's instruction was: "fires when a cap crosses readiness
  // >= 80 AND has no monitoring stack." Verified caps are by definition
  // the strongest candidates for this — they're done, what comes next?
  for (const cap of input.capabilities) {
    if (cap.applicability_status !== 'active') continue;
    if (cap.user_status === 'archived') continue;
    const score = input.capability_scores.find(s => s.capability_id === cap.id);
    if (!score) continue;
    const agentStackTask = generateAgentStackTask(cap, score, input.project);
    if (agentStackTask) candidates.push(agentStackTask);
  }

  // 2c. Triage proposals (added 2026-05-19). Brownfield caps that were
  // discovered from code but have no requirements attached. The system
  // has nothing concrete to ask the operator to BUILD because nothing
  // is specified. Fallback ask: "decide what this is."
  //
  // Fires when no CONCRETE actionable task already exists for the cap.
  // Concrete = build_backend, add_frontend, implement_reqs, ui_review,
  // verify, agent_stack. NOT optimization tasks — those are themselves
  // fallbacks and surfacing them alongside triage is redundant noise
  // ("improve observability for X" + "triage X" for the same cap).
  // When triage fires, also REMOVE any optimization tasks for that cap
  // from candidates — triage IS the operator action; optimization is
  // premature until the cap is spec'd.
  //
  // Priority 35 — above ui_review (25) since triage is a decision the
  // operator must make to unblock downstream work, below agent_stack
  // (50) and any build task (70-80) since those have concrete actions.
  const concreteTaskBpIds = new Set<string>();
  for (const t of candidates) {
    if (!t.bp_id) continue;
    if (t.type === 'optimization') continue;
    concreteTaskBpIds.add(t.bp_id);
  }
  for (const cap of input.capabilities) {
    if (cap.applicability_status !== 'active') continue;
    if (cap.user_status === 'archived' || cap.user_status === 'verified') continue;
    const score = input.capability_scores.find(s => s.capability_id === cap.id);
    if (!score) continue;
    if (concreteTaskBpIds.has(cap.id)) continue;
    const triageTask = generateTriageTask(cap, score, input.project);
    if (triageTask) {
      candidates.push(triageTask);
      // Suppress any optimization tasks for this cap — they're noise
      // when triage is the operator action.
      for (let i = candidates.length - 1; i >= 0; i--) {
        const c = candidates[i];
        if (c.bp_id === cap.id && c.type === 'optimization' && c.id !== triageTask.id) {
          candidates.splice(i, 1);
        }
      }
    }
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
  //
  // Actionability gate (2026-05-19): the generic "Add tests, observability,
  // or hardening" suggestion is only meaningful when at least one
  // applicable dimension is BOTH low AND actionable — otherwise this
  // duplicates the more specific improve_<weakest> task, and when no
  // dim is actionable the suggestion is empty ("improve health" with
  // nothing concrete to fix).
  //
  // Surfaced by the operator's 3rd walk: 5 of top 10 were borderline
  // "Improve health of X" tasks against caps whose only low dims had
  // already been gated as non-actionable (determinism for
  // intelligence-layer caps, ux_exposure for brownfield-embedded
  // components). With those gates, optimize_health was effectively
  // un-actionable for the same caps.
  const mentions = cap.last_execution?.progress_md_mentions || 0;
  if (score.coverage > 60 && score.health < 60 && mentions > 0) {
    const hbForGate = score.health_breakdown;
    const hasActionableLowDim = !!hbForGate && hbForGate.applicable_dimensions.some(d => {
      // Same dimension actionability logic as the gap-driven generator
      // below (kept inline for now; refactor if a third caller appears).
      // Threshold (2026-05-19, cycle 3): aligned with improve_<weakest>
      // at < 50. The generic "Add tests, observability, or hardening"
      // suggestion is only worth surfacing when at least one actionable
      // dim is truly weak (not just sub-70). Below this threshold, the
      // suggestion is too vague to be useful — if the cap has dims in
      // the 50-70 range with nothing under 50, it's "fine but could be
      // tighter," which isn't an actionable priority.
      const value = (hbForGate as any)[d] as number;
      if (typeof value !== 'number' || value >= 50) return false;
      switch (d) {
        case 'ux_exposure': {
          if (!frontendAddEligible) return false;
          const beCount = (cap.linked_backend_services || []).length;
          const feCount = (cap.linked_frontend_components || []).length;
          if (cap.source === 'brownfield_discovered' && !cap.frontend_route && feCount <= 3) return false;
          if (feCount === 0 && beCount < 2) return false;
          return true;
        }
        case 'automation': {
          if (kind !== 'service' || looksInternal) return false;
          const agCount = (cap.linked_agents || []).length;
          if (agCount > 0) return false;
          const ev = cap.code_evidence;
          if (ev && !ev.automation_applicable) return false;
          return true;
        }
        case 'determinism': {
          const beCount = (cap.linked_backend_services || []).length;
          const agCount = (cap.linked_agents || []).length;
          if (beCount === 0) return false;
          if (agCount > beCount) return false;
          return true;
        }
        default:
          return true;
      }
    });
    if (hasActionableLowDim) {
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
        case 'ux_exposure': {
          // Base gate: only suggest improving UX on caps that legitimately
          // should have a UI (service, non-internal, non-page). Otherwise
          // the suggestion repeats add_frontend's false positive.
          if (!frontendAddEligible) return false;
          // Brownfield-specific gate (2026-05-19): for brownfield-discovered
          // service caps, having linked_frontend_components does NOT prove
          // the cap intends to own a user-facing route. Those components
          // may be embedded widgets consumed by other pages (admin
          // dashboards, ops panels). "Improve ux_exposure" — which
          // suggests linking a route or adding components — is a false
          // positive in that case.
          //
          // Require positive evidence of own-surface intent:
          //   - explicit frontend_route declared, OR
          //   - rich-enough UI presence (>3 components, satisfies the
          //     scoring threshold for a "loaded" frontend)
          //
          // Surfaced by the operator's 3rd walk: 4 of top 10 were
          // brownfield service caps with 1-3 embedded components.
          const beCount = (cap.linked_backend_services || []).length;
          const feCount = (cap.linked_frontend_components || []).length;
          if (cap.source === 'brownfield_discovered' && !cap.frontend_route && feCount <= 3) {
            return false;
          }
          // Pure backend caps (no fe at all): only actionable if the cap
          // has enough backend logic to plausibly warrant a user surface.
          // A single backend file with no UI is more likely an internal
          // helper than a missing-UI candidate.
          if (feCount === 0 && beCount < 2) return false;
          return true;
        }
        case 'automation': {
          // Base: only service-kind, non-internal-named caps (page/component
          // never own their own agents; agent-kind already IS an agent).
          if (kind !== 'service' || looksInternal) return false;
          // Tightened gate (2026-05-19, 3rd walk): if the cap already has
          // linked agents, "improve automation" effectively means "add MORE
          // agents" — which is rarely the operator's intent. The cap has
          // already chosen its agent footprint. Only fire when the cap has
          // NO agents AND positive evidence agents would help (scheduled
          // jobs or queue handlers in the linked files, surfaced via
          // code_evidence). Without code_evidence, fall back to the
          // legacy "no agents, kind=service, non-internal" gate.
          const agCount = (cap.linked_agents || []).length;
          if (agCount > 0) return false;
          const ev = cap.code_evidence;
          if (ev && !ev.automation_applicable) return false;
          return true;
        }
        case 'determinism': {
          // Determinism gate (2026-05-19): the "add rule-based fallbacks
          // where the agent currently makes the call" suggestion only
          // makes sense when the cap COULD be made more deterministic.
          // For caps that are intelligence-layer by design — agents
          // outnumber backend files — that suggestion misses the point.
          // The cap exists specifically to leverage LLMs.
          //
          // Surfaced by the operator's 2nd walk: 3 of top 10 were
          // intelligence-layer caps (Query, Verification, Verification
          // Framework) with 4-5x more agent files than backend files.
          // Gate: backend must outnumber agents AND there must be some
          // backend at all.
          const beCount = (cap.linked_backend_services || []).length;
          const agCount = (cap.linked_agents || []).length;
          if (beCount === 0) return false;
          if (agCount > beCount) return false;
          return true;
        }
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

/**
 * Agent-stack proposal generator (added 2026-05-19). Fires when a cap
 * is mature enough that the next-tier ask is "what agents should run
 * on or around it." Covers both directions the operator described:
 *
 *   PAGES (kind=page) at coverage >= 100: UI Advisor is done, the page
 *     ships, time to layer monitoring + alerting + follow-up agents
 *     (page-load tracking, conversion alerts, error capture).
 *
 *   SERVICES (kind=service) at readiness >= 80: the cap is built and
 *     stable enough that backend agents become the right next move
 *     (scheduled jobs, workflow automation, data monitors, alert
 *     triggers).
 *
 * Both fire under the same generator so a project rolling out a new
 * module gets BOTH page-side and service-side proposals at the same
 * readiness threshold — matches the operator's "triggered at the same
 * time" instruction. Skipped when the cap already has linked_agents
 * (it chose its agent footprint; "propose more" mirrors the
 * improve_automation false-positive shape we just gated). Lives in
 * its own loop in buildAuthoritativeQueue so verified caps — the
 * strongest candidates — aren't excluded by the main per-cap skip.
 *
 * Priority 50 — above ui_review (25) and optimization (40-45), below
 * build/implement (70-80).
 */
function generateAgentStackTask(
  cap: EngineCapabilityInput,
  score: CapabilityScores,
  project: EngineProjectInput,
): AuthoritativeTask | null {
  const kind = cap.kind || 'service';
  const linkedAgentCount = (cap.linked_agents || []).length;
  // Role-aware gate (2026-05-19, Tier-2 #4) layered on top of the
  // count-based gate. When code_evidence has classified the cap's
  // agents into roles (monitor/alert/follow_up/core), we use missing
  // roles instead of pure count:
  //   - Stack complete = monitor AND alert roles both present →
  //     suppress regardless of count
  //   - Stack incomplete = either role missing → fire even if count
  //     reaches floor
  // When role classification isn't available (no code_evidence, no
  // files inspected), fall back to the count-based floor of 3.
  const AGENT_STACK_FLOOR = 3;
  const roleEvidence = cap.code_evidence?.agent_roles;
  const detectedRoles = new Set<string>(roleEvidence?.detected || []);
  const hasMonitor = detectedRoles.has('monitor');
  const hasAlert = detectedRoles.has('alert');
  const haveRoleEvidence = !!roleEvidence && roleEvidence.files_inspected > 0;
  if (haveRoleEvidence && hasMonitor && hasAlert) return null; // stack complete by roles
  if (!haveRoleEvidence && linkedAgentCount >= AGENT_STACK_FLOOR) return null; // fallback floor
  const matureForAgentStack =
    (kind === 'page' && score.coverage >= 100)
    || (kind === 'service' && score.readiness >= 80);
  if (!matureForAgentStack) return null;
  // Same internal-suffix filter the rest of the queue uses.
  const looksInternal = /\s(service|engine|controller|middleware|logging|emission|validation|ingestion|detection|tracker|monitor|logger|reconciliation|normalization|verification|snapshot|forwarding|registration|registry|integration|composer|generation|optimization|estimator|planner|mapping|definition|tracking|reporting|automation|orchestration|framework|parser|handling)$/i.test(cap.name || '');
  if (kind === 'service' && looksInternal) return null;

  // Agent-layer self-reference filter (2026-05-19, walk-5 finding):
  // skip caps whose NAME implies they ARE the monitoring/agent layer
  // already. "Propose monitoring stack for System Health Monitoring"
  // is recursive; same for "agent stack for Autonomous Decision Making"
  // (the cap IS an agent system). Word-level match anywhere in the
  // name, not just suffix — these tokens carry the meaning regardless
  // of position. The existing looksInternal regex only catches them
  // as suffixes preceded by whitespace, which misses single-word and
  // mid-name occurrences.
  const isAgentLayerNamed = /\b(monitoring|autonomous|advisor|orchestrator|orchestration|telemetry|alerting|decision\s+making|policy\s+enforcer|governance)\b/i.test(cap.name || '');
  if (isAgentLayerNamed) return null;

  // Description: specific when we have role evidence, generic otherwise.
  // Role-aware path enumerates which roles are present (operator can
  // see what's covered) and which are missing (operator knows exactly
  // what to add).
  //
  // Honest degradation (Tier-3 A+E 2026-05-20): when role evidence
  // comes from a persisted classification, also surface the age and
  // any drift. If classified_at > 7 days OR the agent_paths snapshot
  // doesn't match current linked_agents, append "(classification N
  // days old — re-scan to refresh)" so the operator knows when data
  // is degraded rather than silently using stale roles.
  const hasSomeAgent = linkedAgentCount > 0;
  let stackPrefix: string;
  let askSuffix: string;
  let stalenessSuffix = '';
  if (haveRoleEvidence) {
    const classifiedAt = roleEvidence?.classified_at;
    if (classifiedAt) {
      const ageMs = Date.now() - new Date(classifiedAt).getTime();
      const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
      const cachedPaths = new Set(roleEvidence?.agent_paths || []);
      const currentPaths = new Set(cap.linked_agents || []);
      const drifted = cachedPaths.size !== currentPaths.size
        || [...currentPaths].some(p => !cachedPaths.has(p));
      if (drifted) {
        stalenessSuffix = ` ⚠ Agent file set drifted since last classification — re-scan to refresh role detection.`;
      } else if (ageDays > 7) {
        stalenessSuffix = ` ⚠ Classification is ${ageDays} days old — re-scan to refresh role detection.`;
      }
    }
    const presentList = [...detectedRoles].sort().join(', ') || 'none';
    const allRoles: Array<'monitor' | 'alert' | 'follow_up'> = ['monitor', 'alert', 'follow_up'];
    const missing = allRoles.filter(r => !detectedRoles.has(r));
    const missingList = missing.join(', ');
    stackPrefix = hasSomeAgent
      ? `${cap.name} has ${linkedAgentCount} agent${linkedAgentCount === 1 ? '' : 's'} (roles detected: ${presentList}).`
      : `${cap.name} has no agent layer linked.`;
    askSuffix = missing.length > 0
      ? ` Missing roles: ${missingList}. Add agent${missing.length === 1 ? '' : 's'} to cover ${missing.length === 1 ? 'this role' : 'these roles'}.`
      : ` Stack roles look covered; consider adding follow-up or specialized agents.`;
  } else {
    stackPrefix = hasSomeAgent
      ? `${cap.name} has ${linkedAgentCount} agent${linkedAgentCount === 1 ? '' : 's'} but role classification hasn't run yet for this cap.`
      : `${cap.name} has no agent layer linked.`;
    askSuffix = kind === 'page'
      ? ' Propose the rest of the stack: page-load monitoring, error capture, conversion alerts, follow-up sequences.'
      : ' Propose the backend agents that extend it: scheduled jobs, workflow automation, data monitors, alert triggers.';
  }
  const description = kind === 'page'
    ? `${cap.name} is built and reviewed (coverage ${score.coverage}%). ${stackPrefix}${askSuffix}${stalenessSuffix}`
    : `${cap.name} is built (readiness ${score.readiness}%). ${stackPrefix}${askSuffix}${stalenessSuffix}`;

  return makeTask({
    id: `${cap.id}:propose_agent_stack`,
    project_id: project.id,
    bp_id: cap.id,
    title: `Propose agent stack for ${cap.name}`,
    description,
    type: 'agent_stack',
    // Priority 70 (was 50→60→70, settled 2026-05-20): a first attempt
    // at 60 still let a max-size triage cap (with size boost cap=15
    // AND triage's lower exec_cost=15 vs agent_stack's 40) edge out a
    // small agent_stack cap by 0.05. The exec_cost differential
    // (5-point composite swing) was the unaccounted factor. Priority
    // 70 widens the gap to 35*0.30=10.5, comfortably above the worst
    // case where triage outscores by ~9 on combined boost + exec_cost.
    // Still ranks below implement_reqs (75) and build_backend (80)
    // since those represent required build work, not elective next-
    // tier additions.
    priority_score: 70,
    // Maturity-aware (Tier-2 #5): bigger caps within the agent_stack
    // tier rank higher. Same shape as the triage scaling.
    blocking_score: 20 + Math.min(15, (cap.linked_backend_services || []).length + (cap.linked_frontend_components || []).length),
    dependency_score: 40,
    maturity_gain: 25 + Math.min(15, (cap.linked_backend_services || []).length + (cap.linked_frontend_components || []).length),
    readiness_gain: 15,
    confidence_score: 75,
    execution_cost: 40,
    reasons: [
      kind === 'page'
        ? `coverage=${score.coverage}% (page is shipped — next tier is the agent layer)`
        : `readiness=${score.readiness}% (service is built — next tier is the agent layer)`,
      haveRoleEvidence
        ? `agent roles detected: [${[...detectedRoles].join(', ') || 'none'}] (${roleEvidence?.files_inspected} file${roleEvidence?.files_inspected === 1 ? '' : 's'} inspected)`
        : `linked_agents=${linkedAgentCount} (below stack floor of ${AGENT_STACK_FLOOR}; no role evidence available)`,
    ],
    cap, cap_score: score,
  });
}

/**
 * Triage task generator (added 2026-05-19). For brownfield-discovered
 * service caps that have linked code but no requirements specified —
 * the system has nothing concrete to BUILD because nothing is spec'd.
 * The operator's action is a DECISION: spec requirements, mark
 * verified, or archive.
 *
 * Gates:
 *   - kind=service (pages get ui_review, agents are their own thing,
 *     components live inside pages)
 *   - !looksInternal (loggers/validators/normalizers aren't candidates
 *     for operator-driven requirement specification)
 *   - !isAgentLayerNamed (same exclusion as agent_stack)
 *   - source=brownfield_discovered (only auto-discovered caps; spec-
 *     driven caps already have requirements by definition)
 *   - total_requirements === 0 (no spec attached yet)
 *
 * Fires only when no other concrete task is firing for the cap (gate
 * lives in the caller). Triage is the fallback that drains the
 * "discovered-but-undecided" pollution out of the queue.
 *
 * Priority 35 — above ui_review (25), below agent_stack (50) and
 * build/implement tasks (70-80). The signal: "you need to decide
 * what this cap is, but it's not blocking immediate next-tier work."
 */
function generateTriageTask(
  cap: EngineCapabilityInput,
  score: CapabilityScores,
  project: EngineProjectInput,
): AuthoritativeTask | null {
  const kind = cap.kind || 'service';
  if (kind !== 'service') return null;
  if (cap.is_page_bp) return null;
  if (cap.source !== 'brownfield_discovered') return null;
  if (cap.total_requirements > 0) return null;

  const looksInternal = /\s(service|engine|controller|middleware|logging|emission|validation|ingestion|detection|tracker|monitor|logger|reconciliation|normalization|verification|snapshot|forwarding|registration|registry|integration|composer|generation|optimization|estimator|planner|mapping|definition|tracking|reporting|automation|orchestration|framework|parser|handling)$/i.test(cap.name || '');
  if (looksInternal) return null;
  const isAgentLayerNamed = /\b(monitoring|autonomous|advisor|orchestrator|orchestration|telemetry|alerting|decision\s+making|policy\s+enforcer|governance)\b/i.test(cap.name || '');
  if (isAgentLayerNamed) return null;

  const beCount = (cap.linked_backend_services || []).length;
  const feCount = (cap.linked_frontend_components || []).length;
  const agCount = (cap.linked_agents || []).length;
  const totalFiles = beCount + feCount + agCount;
  const fileSummary = [
    beCount > 0 ? `${beCount} backend file${beCount === 1 ? '' : 's'}` : null,
    feCount > 0 ? `${feCount} frontend component${feCount === 1 ? '' : 's'}` : null,
    agCount > 0 ? `${agCount} agent${agCount === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(', ') || 'no linked files';

  const description = `${cap.name} was discovered from code (${fileSummary}) but has no requirements specified. Decide: (a) spec 3-5 requirements to drive implementation and verification, (b) mark verified if it's complete as-is, or (c) archive if it's not real work.`;

  // Maturity-aware scoring (2026-05-19, Tier-2 #5): within the triage
  // tier, caps with more accumulated code represent more unspec'd
  // work and rank higher. Operator sees the biggest decisions first.
  // Bounded so a 50-file cap doesn't completely dominate the queue.
  //
  // Boost cap reduced 20→15 (2026-05-20) to preserve tier ordering:
  // agent_stack (priority 60) now always outranks triage (priority 35)
  // because triage max boost (15*0.25 + 15*0.15 = 6) < priority gap
  // (25 * 0.30 = 7.5). Triage still has size differentiation within
  // its own tier, just doesn't break into the agent_stack tier above.
  const sizeBoost = Math.min(15, totalFiles);  // 0-15 boost
  const maturityGain = 10 + sizeBoost;          // 10-25
  const blockingScore = 25 + sizeBoost;         // 25-40

  return makeTask({
    id: `${cap.id}:triage`,
    project_id: project.id,
    bp_id: cap.id,
    title: `Triage ${cap.name} — no requirements specified`,
    description,
    type: 'triage',
    priority_score: 35,
    blocking_score: blockingScore,
    dependency_score: 30,
    maturity_gain: maturityGain,
    readiness_gain: 15,
    confidence_score: 70,
    execution_cost: 15,
    reasons: [
      `source=brownfield_discovered with 0 requirements (${fileSummary})`,
      `no other actionable task fires for this cap — triage is the floor`,
      sizeBoost > 0 ? `accumulated work bonus: +${sizeBoost} (total ${totalFiles} files)` : 'no accumulated-work bonus',
    ],
    cap, cap_score: score,
  });
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
