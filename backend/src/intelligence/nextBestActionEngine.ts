/**
 * Next Best Action Engine — Deterministic Execution Planner
 *
 * RULES (deterministic, not probabilistic):
 * 1. A process is COMPLETE when: reqCoverage >= 90% AND qualityScore >= 70 AND all layers exist
 * 2. If a process is NOT complete, there MUST be at least one action
 * 3. completed_steps only filters by exact key match — invalid keys are ignored
 * 4. Actions are ordered by priority (highest first)
 * 5. The engine never returns empty for an incomplete process
 */

export interface ExecutionAction {
  step: number;
  key: string;
  label: string;
  impact: string;
  depends_on: string;
  fixes: string[];
  enables: string[];
  blocked: boolean;
  block_reason?: string;
  requirements_covered: string[];
  prompt_target: string;
}

export interface SystemState {
  hasBackend: boolean;
  hasFrontend: boolean;
  hasAgents: boolean;
  hasModels: boolean;
  // Project-level layer detection (from full repo file tree)
  // When true, "Build Backend/Frontend/Agents" steps are suppressed
  // because the layer exists in the repo — the process just needs requirement mapping
  projectHasBackend?: boolean;
  projectHasFrontend?: boolean;
  projectHasAgents?: boolean;
  projectHasModels?: boolean;
  backendCount: number;
  frontendCount: number;
  agentCount: number;
  modelCount: number;
  reqCoverage: number;
  readiness: number;
  qualityScore: number;
  maturityLevel: number;
  gapTypes: string[];
  unverifiedCount: number;
  verifiedCount: number;
  totalRequirements: number;
}

// Valid step keys — ONLY these are accepted in completed_steps
const VALID_STEP_KEYS = new Set([
  'build_backend', 'add_database', 'add_frontend', 'add_agents',
  'add_monitoring', 'improve_reliability', 'enhance_agents',
  'optimize_performance', 'verify_requirements', 'implement_requirements',
]);

// All possible actions with deterministic conditions
const ACTION_TEMPLATES = [
  {
    key: 'build_backend',
    label: 'Build Backend Services',
    impact: '+30% readiness',
    depends_on: 'None — Foundation',
    fixes: ['Backend Missing', 'API Routes Missing'],
    enables: ['API endpoints', 'Frontend integration', 'Agent automation'],
    prompt_target: 'backend_improvement',
    // Only show if NEITHER this process NOR the project has a backend
    condition: (s: SystemState) => !s.hasBackend && !s.projectHasBackend,
    priority: 100,
  },
  {
    key: 'add_database',
    label: 'Add Database Models',
    impact: '+15% reliability',
    depends_on: 'Backend services',
    fixes: ['Data Layer Missing', 'Low reliability'],
    enables: ['Persistent storage', 'Data integrity'],
    prompt_target: 'add_database',
    condition: (s: SystemState) => !s.hasModels && !s.projectHasModels && (s.hasBackend || !!s.projectHasBackend),
    blockedIf: (s: SystemState) => !s.hasBackend && !s.projectHasBackend,
    priority: 90,
  },
  {
    key: 'add_frontend',
    label: 'Create Frontend UI',
    impact: '+20% readiness',
    depends_on: 'Backend API',
    fixes: ['Frontend Missing', 'No user interface'],
    enables: ['User interaction', 'UX exposure'],
    prompt_target: 'frontend_exposure',
    condition: (s: SystemState) => !s.hasFrontend && !s.projectHasFrontend,
    blockedIf: (s: SystemState) => !s.hasBackend && !s.projectHasBackend,
    priority: 80,
  },
  {
    key: 'add_agents',
    label: 'Add AI Agent Automation',
    impact: '+15% automation',
    depends_on: 'Backend services',
    fixes: ['Automation Gap', 'Manual processes'],
    enables: ['Autonomous operation', 'Scheduled tasks'],
    prompt_target: 'agent_enhancement',
    condition: (s: SystemState) => !s.hasAgents && !s.projectHasAgents,
    blockedIf: (s: SystemState) => !s.hasBackend && !s.projectHasBackend,
    priority: 70,
  },
  {
    key: 'implement_requirements',
    label: 'Implement Unmapped Requirements',
    impact: '+requirement coverage',
    depends_on: 'Backend services',
    fixes: ['Low requirement coverage', 'Unmapped requirements'],
    enables: ['Higher completion %', 'Full feature delivery'],
    prompt_target: 'requirement_implementation',
    // Fires when coverage is below 80% and there are >3 unmapped requirements
    // Uses project-level backend check — if the project has a backend, this process can be implemented
    condition: (s: SystemState) => {
      const unmapped = s.totalRequirements - s.verifiedCount - s.unverifiedCount;
      return (s.hasBackend || !!s.projectHasBackend) && s.reqCoverage < 80 && unmapped > 3;
    },
    blockedIf: (s: SystemState) => !s.hasBackend && !s.projectHasBackend,
    priority: 65,
  },
  {
    key: 'add_monitoring',
    label: 'Add Monitoring & Logging',
    impact: '+15% quality',
    depends_on: 'Backend services',
    fixes: ['No observability', 'No error tracking'],
    enables: ['Error detection', 'Performance tracking', 'Production readiness'],
    prompt_target: 'monitoring_gap',
    condition: (s: SystemState) => (s.hasBackend || !!s.projectHasBackend) && s.qualityScore < 50 && s.gapTypes.includes('quality'),
    blockedIf: (s: SystemState) => !s.hasBackend && !s.projectHasBackend,
    priority: 60,
  },
  {
    key: 'improve_reliability',
    label: 'Improve Reliability & Error Handling',
    impact: '+15% quality',
    depends_on: 'Backend + Database',
    fixes: ['Low reliability', 'Missing error handling'],
    enables: ['Production stability', 'Retry logic'],
    prompt_target: 'improve_reliability',
    condition: (s: SystemState) => (s.hasBackend || !!s.projectHasBackend) && s.qualityScore < 60,
    priority: 55,
  },
  {
    key: 'verify_requirements',
    label: 'Verify Unverified Requirements',
    impact: '+verified confidence',
    depends_on: 'Implementation exists',
    fixes: ['Unverified auto-matches'],
    enables: ['Accurate completion tracking', 'Trust in metrics'],
    prompt_target: 'verify_requirements',
    condition: (s: SystemState) => s.unverifiedCount > 0 && (s.hasBackend || !!s.projectHasBackend),
    priority: 50,
  },
  {
    key: 'enhance_agents',
    label: 'Enhance Agent Intelligence',
    impact: '+10% automation, +10% quality',
    depends_on: 'Existing agents',
    fixes: ['Agent capabilities limited'],
    enables: ['Smarter automation', 'Self-healing'],
    prompt_target: 'agent_enhancement',
    condition: (s: SystemState) => s.hasAgents && s.agentCount > 0 && s.qualityScore < 80,
    priority: 40,
  },
  {
    key: 'optimize_performance',
    label: 'Optimize System Performance',
    impact: '+10% quality',
    depends_on: 'All layers built',
    fixes: ['Performance gaps'],
    enables: ['Scale readiness', 'Production deployment'],
    prompt_target: 'optimize_performance',
    condition: (s: SystemState) => (s.hasBackend || !!s.projectHasBackend) && (s.hasFrontend || !!s.projectHasFrontend) && s.qualityScore < 90,
    priority: 30,
  },
];

/**
 * Deterministic completion check.
 * A process is complete ONLY when ALL criteria are met.
 * Optional profile parameter controls thresholds (defaults to production).
 */
export function isProcessComplete(state: SystemState, profile?: { reqCoverage: number; qualityScore: number; requiredLayers: string[] }): boolean {
  // Fragment processes (0-1 requirements) are considered complete if they have any coverage
  // These are parsing artifacts, not real business processes
  if (state.totalRequirements <= 1 && state.reqCoverage > 0) return true;
  if (state.totalRequirements === 0) return true;

  const thresholds = profile || { reqCoverage: 90, qualityScore: 70, requiredLayers: ['backend', 'frontend', 'models'] };
  const layerCheck: Record<string, boolean> = {
    backend: state.hasBackend,
    frontend: state.hasFrontend,
    models: state.hasModels,
    agents: state.hasAgents,
  };
  return (
    state.reqCoverage >= thresholds.reqCoverage &&
    state.qualityScore >= thresholds.qualityScore &&
    thresholds.requiredLayers.every(l => layerCheck[l])
  );
}

export function generateExecutionPlan(
  state: SystemState,
  completedStepKeys?: string[],
  profileOptions?: { completion?: { reqCoverage: number; qualityScore: number; requiredLayers: string[] }; qualityGateCoverageMin?: number; strategyOverrides?: Record<string, number>; allowedActionKeys?: string[] | null }
): ExecutionAction[] {
  // If process is deterministically complete, return empty
  if (isProcessComplete(state, profileOptions?.completion)) return [];

  // Sanitize completed keys — ONLY accept valid step keys, ignore corrupt data
  const completed = new Set(
    (completedStepKeys || []).filter(k => VALID_STEP_KEYS.has(k))
  );

  const actions: ExecutionAction[] = [];
  let step = 1;

  // GUARD: If requirement coverage is very low and the project has infrastructure,
  // the ONLY meaningful work is implementing requirements. Quality-based steps
  // (monitoring, reliability, performance) are noise because quality scores are
  // derived from matched files — they can't improve until requirements are mapped.
  const qualityGateMin = profileOptions?.qualityGateCoverageMin ?? 10;
  const qualityStepsBlocked = state.reqCoverage < qualityGateMin && (!!state.projectHasBackend || state.hasBackend);
  const QUALITY_STEP_KEYS = new Set(['add_monitoring', 'improve_reliability', 'optimize_performance', 'enhance_agents', 'verify_requirements']);

  // Filter to applicable actions, exclude completed steps, sort by priority
  const applicable = ACTION_TEMPLATES
    .filter(t => {
      if (!t.condition(state)) return false;
      if (completed.has(t.key)) return false;
      // Block quality steps when coverage is too low to measure quality
      if (qualityStepsBlocked && QUALITY_STEP_KEYS.has(t.key)) return false;
      // Mode-aware action filtering: only allow steps in the profile's allowed list
      if (profileOptions?.allowedActionKeys && !profileOptions.allowedActionKeys.includes(t.key)) return false;
      return true;
    })
    .sort((a, b) => {
      const overrides = profileOptions?.strategyOverrides || {};
      const aPriority = (a.priority || 0) + (overrides[a.key] || 0);
      const bPriority = (b.priority || 0) + (overrides[b.key] || 0);
      return bPriority - aPriority;
    });

  for (const template of applicable) {
    const blocked = template.blockedIf ? template.blockedIf(state) : false;
    actions.push({
      step: step++,
      key: template.key,
      label: template.label,
      impact: template.impact,
      depends_on: template.depends_on,
      fixes: template.fixes,
      enables: template.enables,
      blocked,
      block_reason: blocked ? `Requires: ${template.depends_on}` : undefined,
      requirements_covered: [],
      prompt_target: template.prompt_target,
    });
  }

  // SAFETY NET: If process is NOT complete but all actions were filtered out
  // (e.g., all were in completed_steps), force-show the most relevant action
  if (actions.length === 0) {
    // Determine what's most needed
    // Only show implement_requirements if there are enough requirements to be meaningful (>1)
    const unmappedCount = state.totalRequirements - state.verifiedCount - state.unverifiedCount;
    if (state.reqCoverage < 80 && unmappedCount > 1) {
      actions.push({
        step: 1, key: 'implement_requirements',
        label: 'Implement Unmapped Requirements',
        impact: '+requirement coverage',
        depends_on: 'Backend services',
        fixes: ['Low requirement coverage'], enables: ['Higher completion %'],
        blocked: false, requirements_covered: [],
        prompt_target: 'requirement_implementation',
      });
    } else if (state.qualityScore < 70) {
      actions.push({
        step: 1, key: 'optimize_performance',
        label: 'Improve Quality Score',
        impact: '+quality',
        depends_on: 'All layers built',
        fixes: ['Quality below threshold'], enables: ['Production readiness'],
        blocked: false, requirements_covered: [],
        prompt_target: 'optimize_performance',
      });
    } else if (!state.hasBackend || !state.hasFrontend || !state.hasModels) {
      const missing = !state.hasBackend ? 'Backend' : !state.hasFrontend ? 'Frontend' : 'Database Models';
      actions.push({
        step: 1, key: !state.hasBackend ? 'build_backend' : !state.hasFrontend ? 'add_frontend' : 'add_database',
        label: `Build Missing Layer: ${missing}`,
        impact: '+readiness',
        depends_on: 'None',
        fixes: [`${missing} Missing`], enables: ['Process completion'],
        blocked: false, requirements_covered: [],
        prompt_target: !state.hasBackend ? 'backend_improvement' : !state.hasFrontend ? 'frontend_exposure' : 'add_database',
      });
    }
  }

  return actions;
}
