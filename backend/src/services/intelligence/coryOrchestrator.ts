/**
 * Cory Orchestrator — Unified Decision Engine
 *
 * Single source of truth for task prioritization across all tabs.
 * Aggregates tasks from Build, Health, Improve, and UI sources,
 * scores them deterministically, applies mode-aware weighting and
 * blocking rules, and returns the Top 5 actions.
 *
 * Design rules:
 * - Uses EXISTING enriched capability data (no new DB queries)
 * - Pure deterministic logic (no LLM calls)
 * - Additive — does not modify or replace existing engines
 * - Each task carries a decision_trace explaining WHY
 */

import type {
  CoryTask,
  SystemState,
  ProjectMode,
  TaskType,
  SystemLayer,
} from './coryTaskTypes';

// ─── SYSTEM STATE EXTRACTION ───────────────────────────────────────────────

export function getSystemState(enriched: any, projectMode: string): SystemState {
  const u = enriched.usability || {};
  const q = enriched.quality || {};
  const m = enriched.metrics || {};
  const lastExec = enriched.last_execution || {};

  return {
    backend_exists: u.backend === 'ready' || u.backend === 'partial',
    backend_partial: u.backend === 'partial',
    frontend_exists: u.frontend === 'ready' || u.frontend === 'partial',
    frontend_partial: u.frontend === 'partial',
    agents_exist: u.agent === 'ready',
    has_models: (enriched.implementation_links?.models || []).length > 0,
    coverage: m.requirements_coverage || 0,
    readiness: m.system_readiness || 0,
    quality_score: m.quality_score || 0,
    quality: {
      determinism: q.determinism || 0,
      reliability: q.reliability || 0,
      observability: q.observability || 0,
      ux_exposure: q.ux_exposure || 0,
      automation: q.automation || 0,
      production_readiness: q.production_readiness || 0,
    },
    maturity_level: enriched.maturity?.level || 0,
    mode: (projectMode || enriched.effective_mode || 'production') as ProjectMode,
    completed_steps: lastExec.completed_steps || [],
    has_frontend_route: !!enriched.frontend_route,
    has_ui_pages: (enriched.ui_element_map?.elements || []).length > 0,
  };
}

// ─── TASK ADAPTERS ─────────────────────────────────────────────────────────
// Each adapter reads from enriched capability data — no new DB queries

function makeTrace(reason: string, state: SystemState): CoryTask['decision_trace'] {
  return {
    reason,
    inputs: {
      coverage: state.coverage,
      readiness: state.readiness,
      quality: state.quality_score,
      mode: state.mode,
      layer_status: `B:${state.backend_exists ? (state.backend_partial ? 'partial' : 'ready') : 'missing'} F:${state.frontend_exists ? (state.frontend_partial ? 'partial' : 'ready') : 'missing'} A:${state.agents_exist ? 'ready' : 'missing'}`,
    },
    confidence: state.coverage > 50 ? 80 : state.coverage > 0 ? 60 : 40,
  };
}

export function getBuildTasks(enriched: any, state: SystemState): CoryTask[] {
  const tasks: CoryTask[] = [];
  const execPlan = enriched.execution_plan || [];
  const completedSet = new Set(state.completed_steps);

  for (let i = 0; i < Math.min(execPlan.length, 5); i++) {
    const step = execPlan[i];
    if (!step || step.blocked || completedSet.has(step.key)) continue;

    const target = step.prompt_target || 'backend_improvement';
    const isBackend = target === 'backend_improvement' || target === 'add_database';
    const isFrontend = target === 'frontend_exposure';
    const isAgent = target === 'agent_enhancement';
    const layer: SystemLayer = isAgent
      ? (state.frontend_exists ? 'agents_frontend' : 'agents_backend')
      : isFrontend ? 'frontend' : 'backend';

    // Title: component-specific, not generic step label
    const stepLabel = step.label || 'Build';
    const title = stepLabel.toLowerCase().includes(enriched.name?.toLowerCase() || '___')
      ? stepLabel
      : `${stepLabel} for ${enriched.name}`;

    tasks.push({
      id: `build-${step.key || i}-${enriched.id?.substring(0, 8)}`,
      title,
      description: `${state.backend_partial ? 'Backend partially built' : !state.backend_exists ? 'No backend detected' : state.coverage < 50 ? `${state.coverage}% coverage — gaps remain` : 'Advancing toward production readiness'}`,
      source: 'build',
      type: 'foundational',
      impact: Math.max(50, 100 - (i * 15)),
      urgency: isBackend && !state.backend_exists ? 95 : isFrontend && !state.frontend_exists ? 75 : 60 - (i * 5),
      confidence: state.coverage > 30 ? 75 : 50,
      blocking: i === 0 && !state.backend_exists,
      blocked: false,
      dependencies: step.depends_on || [],
      system_layer: layer,
      mode_relevance: { mvp: 90, production: 80, enterprise: 70, autonomous: 60 },
      color: isAgent ? '#8b5cf6' : isFrontend ? '#10b981' : '#3b82f6',
      prompt_target: target,
      component_id: enriched.id,
      decision_trace: makeTrace(
        i === 0
          ? `Highest priority build step — ${!state.backend_exists ? 'no backend detected' : state.backend_partial ? 'backend partially built' : 'advancing component'}`
          : `Queued build step ${i + 1} — ${step.label}`,
        state
      ),
    });
  }

  return tasks;
}

export function getHealthTasks(enriched: any, state: SystemState): CoryTask[] {
  const tasks: CoryTask[] = [];
  const q = state.quality;

  const healthChecks: Array<{ field: keyof typeof q; title: string; desc: string; layer: SystemLayer; threshold: number }> = [
    { field: 'determinism', title: 'Improve determinism', desc: 'Move logic from LLM responses to deterministic code paths.', layer: 'backend', threshold: 3 },
    { field: 'reliability', title: 'Add error handling and retry logic', desc: 'Improve graceful failure recovery and data persistence.', layer: 'data', threshold: 3 },
    { field: 'observability', title: 'Add monitoring and logging', desc: 'No observability detected — add structured logging and metrics.', layer: 'observability', threshold: 3 },
    { field: 'ux_exposure', title: 'Improve UI coverage', desc: 'Frontend exists but UX exposure is low — expand page functionality.', layer: 'frontend', threshold: 3 },
    { field: 'automation', title: 'Add automation agents', desc: 'Manual operation detected — add agents for self-managing behavior.', layer: 'agents_backend', threshold: 3 },
    { field: 'production_readiness', title: 'Improve production readiness', desc: 'System not production-ready — address missing layers and quality gaps.', layer: 'backend', threshold: 5 },
  ];

  for (const check of healthChecks) {
    const score = q[check.field];
    if (score >= check.threshold) continue;
    // Skip UX check if no frontend, skip automation if no backend
    if (check.field === 'ux_exposure' && !state.frontend_exists) continue;
    if (check.field === 'automation' && !state.backend_exists) continue;

    tasks.push({
      id: `health-${check.field}`,
      title: check.title,
      description: check.desc,
      source: 'health',
      type: 'fix',
      impact: (check.threshold - score) * 15, // worse = higher impact
      urgency: check.field === 'production_readiness' ? 70 : 50,
      confidence: 70,
      blocking: false,
      blocked: false,
      dependencies: [],
      system_layer: check.layer,
      mode_relevance: { mvp: 20, production: 60, enterprise: 80, autonomous: 50 },
      color: '#f59e0b',
      prompt_target: check.field === 'reliability' ? 'improve_reliability' : check.field === 'observability' ? 'monitoring_gap' : 'backend_improvement',
      component_id: enriched.id,
      decision_trace: makeTrace(
        `${check.field} score is ${score}/10 (threshold: ${check.threshold}) — needs improvement`,
        state
      ),
    });
  }

  return tasks;
}

export function getImproveTasks(enriched: any, state: SystemState): CoryTask[] {
  const tasks: CoryTask[] = [];
  const gaps = enriched.autonomy_gaps || [];

  // Backend agents — don't need frontend
  if (!state.agents_exist && state.backend_exists) {
    tasks.push({
      id: 'improve-agents-backend',
      title: 'Add server-side automation agents',
      description: 'Add autonomous backend agents for data processing, scheduling, monitoring, and decision-making.',
      source: 'improve',
      type: 'enhancement',
      impact: 70,
      urgency: state.frontend_exists ? 60 : 50,
      confidence: 65,
      blocking: false,
      blocked: false,
      dependencies: ['backend'],
      system_layer: 'agents_backend',
      mode_relevance: { mvp: 10, production: 40, enterprise: 60, autonomous: 95 },
      color: '#8b5cf6',
      prompt_target: 'agent_enhancement',
      component_id: enriched.id,
      decision_trace: makeTrace(
        'No agents detected. Backend exists — server-side agents can be added immediately without frontend.',
        state
      ),
    });
  }

  // Frontend agents — need frontend to exist
  if (!state.agents_exist && state.backend_exists && state.frontend_exists) {
    tasks.push({
      id: 'improve-agents-frontend',
      title: 'Add client-side tracking and personalization',
      description: 'Add frontend agents for user behavior tracking, session recording, A/B testing, and UI personalization.',
      source: 'improve',
      type: 'enhancement',
      impact: 55,
      urgency: 40,
      confidence: 60,
      blocking: false,
      blocked: false,
      dependencies: ['backend', 'frontend'],
      system_layer: 'agents_frontend',
      mode_relevance: { mvp: 5, production: 30, enterprise: 50, autonomous: 80 },
      color: '#8b5cf6',
      prompt_target: 'agent_enhancement',
      component_id: enriched.id,
      decision_trace: makeTrace(
        'Frontend exists — client-side tracking and personalization agents can instrument the UI.',
        state
      ),
    });
  }

  // Autonomy gaps (from gapDetectionEngine)
  for (let i = 0; i < Math.min(gaps.length, 3); i++) {
    const gap = gaps[i];
    tasks.push({
      id: `improve-gap-${gap.gap_id || i}`,
      title: gap.title,
      description: gap.description?.substring(0, 200) || 'Autonomy gap detected.',
      source: 'improve',
      type: 'enhancement',
      impact: (gap.severity || 5) * 10,
      urgency: (gap.severity || 5) * 8,
      confidence: 60,
      blocking: false,
      blocked: false,
      dependencies: state.backend_exists ? [] : ['backend'],
      system_layer: gap.suggested_agent?.type === 'monitoring' ? 'agents_backend' : 'agents_backend',
      mode_relevance: { mvp: 5, production: 20, enterprise: 50, autonomous: 90 },
      color: '#8b5cf6',
      prompt_target: 'agent_enhancement',
      component_id: enriched.id,
      decision_trace: makeTrace(
        `Autonomy gap: ${gap.gap_type} — severity ${gap.severity}/10. ${gap.title}`,
        state
      ),
    });
  }

  return tasks;
}

export function getUITasks(enriched: any, state: SystemState): CoryTask[] {
  const tasks: CoryTask[] = [];
  if (!state.frontend_exists) return tasks;

  const uiActions: Array<{ id: string; title: string; desc: string; feedback: string; impact: number }> = [
    { id: 'ui-layout', title: 'Improve page layout and hierarchy', desc: 'Analyze spacing, visual hierarchy, and component structure.', feedback: 'Improve the page layout, spacing, and visual hierarchy', impact: 60 },
    { id: 'ui-ux', title: 'Fix usability issues', desc: 'Detect broken interactions, missing feedback, and accessibility gaps.', feedback: 'Find and fix usability issues and broken interactions', impact: 55 },
    { id: 'ui-responsive', title: 'Check mobile responsiveness', desc: 'Ensure the UI works across all screen sizes and devices.', feedback: 'Make the layout responsive for mobile and tablet', impact: 45 },
  ];

  for (const action of uiActions) {
    tasks.push({
      id: action.id,
      title: action.title,
      description: action.desc,
      source: 'ui',
      type: 'experience',
      impact: action.impact,
      urgency: 30,
      confidence: 55,
      blocking: false,
      blocked: false,
      dependencies: ['frontend'],
      system_layer: 'frontend',
      mode_relevance: { mvp: 40, production: 60, enterprise: 50, autonomous: 30 },
      color: '#10b981',
      prompt_target: 'frontend_exposure',
      component_id: enriched.id,
      decision_trace: makeTrace(
        `Frontend exists — UI quality can be improved. ${action.desc}`,
        state
      ),
    });
  }

  return tasks;
}

// ─── BLOCKING RULES ────────────────────────────────────────────────────────

export function applyBlockingRules(tasks: CoryTask[], state: SystemState): CoryTask[] {
  return tasks.map(task => {
    // Rule 1: No backend → block everything except backend tasks
    if (!state.backend_exists && task.system_layer !== 'backend' && task.system_layer !== 'data') {
      return { ...task, blocked: true, block_reason: 'Backend must be built first' };
    }

    // Rule 2: No frontend → block frontend-dependent tasks (UI + frontend agents)
    if (!state.frontend_exists && (task.system_layer === 'frontend' || task.system_layer === 'agents_frontend')) {
      return { ...task, blocked: true, block_reason: 'Frontend must exist for this task' };
    }

    // Rule 3: Backend agents DON'T need frontend — they're unblocked when backend exists
    // (This is the key distinction — agents_backend vs agents_frontend)

    return task;
  });
}

// ─── MODE-AWARE WEIGHTING ──────────────────────────────────────────────────

const MODE_WEIGHTS: Record<ProjectMode, Record<TaskType | string, number>> = {
  mvp:        { foundational: 30, experience: 10, enhancement: 5, fix: 5 },
  production: { fix: 30, foundational: 20, experience: 10, enhancement: 5 },
  enterprise: { fix: 25, foundational: 20, enhancement: 15, experience: 10 },
  autonomous: { enhancement: 35, fix: 15, foundational: 10, experience: 5 },
};

const LAYER_MODE_BOOST: Record<ProjectMode, Partial<Record<SystemLayer, number>>> = {
  mvp:        {},
  production: {},
  enterprise: { observability: 20, data: 15 },
  autonomous: { agents_backend: 25, agents_frontend: 15 },
};

export function applyModeWeighting(task: CoryTask, mode: ProjectMode): number {
  const typeWeight = MODE_WEIGHTS[mode]?.[task.type] || 0;
  const layerBoost = LAYER_MODE_BOOST[mode]?.[task.system_layer] || 0;
  return typeWeight + layerBoost;
}

// ─── PRIORITY SCORING ──────────────────────────────────────────────────────

export function calculatePriority(task: CoryTask, state: SystemState, mode: ProjectMode): number {
  const modeWeight = applyModeWeighting(task, mode);

  const priority =
    (task.impact * 0.4) +
    (task.urgency * 0.3) +
    (task.confidence * 0.1) +
    (task.blocking ? 20 : 0) +
    (modeWeight * 0.2);

  // Coverage boost: low coverage = foundational tasks more urgent
  const coverageBoost = state.coverage < 30 && task.type === 'foundational' ? 15 : 0;

  // Quality penalty: low quality = fix tasks more urgent
  const qualityBoost = state.quality_score < 40 && task.type === 'fix' ? 10 : 0;

  return Math.round(priority + coverageBoost + qualityBoost);
}

// ─── DEDUPLICATION ─────────────────────────────────────────────────────────

function deduplicateTasks(tasks: CoryTask[]): CoryTask[] {
  const seen = new Map<string, CoryTask>();
  for (const task of tasks) {
    // Key: system_layer + type (e.g., "backend:foundational")
    const key = `${task.system_layer}:${task.type}`;
    const existing = seen.get(key);
    if (!existing || (task.priority || 0) > (existing.priority || 0)) {
      seen.set(key, task);
    }
  }
  return Array.from(seen.values());
}

// ─── MAIN ORCHESTRATOR ─────────────────────────────────────────────────────

export function getTopTasks(enriched: any, projectMode: string): CoryTask[] {
  const state = getSystemState(enriched, projectMode);

  // Step 1: Gather all tasks from adapters
  const allTasks: CoryTask[] = [
    ...getBuildTasks(enriched, state),
    ...getHealthTasks(enriched, state),
    ...getImproveTasks(enriched, state),
    ...getUITasks(enriched, state),
  ];

  // Step 2: Apply blocking rules
  const withBlocking = applyBlockingRules(allTasks, state);

  // Step 3: Calculate priority for each task
  const scored = withBlocking.map(task => {
    const priority = calculatePriority(task, state, state.mode);
    return {
      ...task,
      priority,
      decision_trace: {
        ...task.decision_trace,
        scoring_breakdown: {
          impact_score: Math.round(task.impact * 0.4),
          urgency_score: Math.round(task.urgency * 0.3),
          confidence_score: Math.round(task.confidence * 0.1),
          blocking_bonus: task.blocking ? 20 : 0,
          mode_weight: Math.round(applyModeWeighting(task, state.mode) * 0.2),
          total: priority,
        },
      },
    };
  });

  // Step 4: Filter blocked tasks (keep them but sort to bottom)
  const unblocked = scored.filter(t => !t.blocked);
  const blocked = scored.filter(t => t.blocked);

  // Step 5: Deduplicate unblocked tasks
  const deduped = deduplicateTasks(unblocked);

  // Step 6: Sort by priority descending
  deduped.sort((a, b) => (b.priority || 0) - (a.priority || 0));

  // Step 7: Return top 5 (unblocked first, then up to 1 blocked with reason)
  const result = deduped.slice(0, 5);

  // If fewer than 5 and there are blocked tasks, show top blocked task with explanation
  if (result.length < 5 && blocked.length > 0) {
    result.push(blocked[0]);
  }

  return result;
}

// ─── PROJECT-WIDE ORCHESTRATOR (for Blueprint) ─────────────────────────────
// Runs getTopTasks across ALL enriched capabilities and returns the global Top 5

export function getProjectTopTasks(enrichedCapabilities: any[], projectMode: string): CoryTask[] {
  const allTasks: CoryTask[] = [];

  for (const enriched of enrichedCapabilities) {
    // Skip complete components
    const coverage = enriched.metrics?.requirements_coverage || 0;
    const readiness = enriched.metrics?.system_readiness || 0;
    if (coverage >= 90 && readiness >= 90) continue;

    const componentTasks = getTopTasks(enriched, projectMode);
    // Tag each task with component name for cross-BP context
    for (const task of componentTasks) {
      task.component_id = enriched.id;
    }
    allTasks.push(...componentTasks);
  }

  // Global scoring: re-sort all tasks across all components
  allTasks.sort((a, b) => (b.priority || 0) - (a.priority || 0));

  // Deduplicate across components: avoid 5 "build backend" from different BPs
  const seen = new Map<string, CoryTask>();
  const result: CoryTask[] = [];
  for (const task of allTasks) {
    if (result.length >= 5) break;
    // Key: one task per component (pick highest priority per BP)
    const compKey = task.component_id || 'unknown';
    if (seen.has(compKey)) continue; // only 1 task per component in global view
    seen.set(compKey, task);
    result.push(task);
  }

  return result;
}
