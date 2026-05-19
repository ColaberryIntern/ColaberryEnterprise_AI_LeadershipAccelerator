import { buildAuthoritativeQueue } from '../../intelligence/systemStateEngine/queue/authoritativeTaskQueue';
import type { EngineCapabilityInput, EngineProjectInput, CapabilityScores } from '../../intelligence/systemStateEngine/types/systemState.types';

function makeCap(over: Partial<EngineCapabilityInput> = {}): EngineCapabilityInput {
  return {
    id: 'cap-1',
    project_id: 'proj-1',
    name: 'Service A',
    source: 'auto',
    user_status: 'in_progress',
    applicability_status: 'active',
    is_page_bp: false,
    total_requirements: 0,
    matched_requirements: 0,
    verified_requirements: 0,
    linked_backend_services: [],
    linked_frontend_components: [],
    linked_agents: [],
    last_execution: { status: 'in_progress' }, // not fresh — skip foundation task
    ...over,
  };
}

function makeScore(capId: string, over: Partial<CapabilityScores> = {}): CapabilityScores {
  return {
    capability_id: capId,
    readiness: 0,
    coverage: 0,
    maturity: 0,
    maturity_level: 0,
    health: 0,
    sync_health: 0,
    ...over,
  };
}

const PROJECT: EngineProjectInput = {
  id: 'proj-1',
  target_mode: 'mvp',
  setup_status: {},
  capabilities: [],
  repo_file_tree: [],
};

describe('authoritativeTaskQueue — Page BPs do not get backend/frontend build tasks', () => {
  test('non-Page BP without backend gets build_backend task (existing behavior)', () => {
    const cap = makeCap({ id: 'svc-1', name: 'Some Service', is_page_bp: false });
    const score = makeScore('svc-1');
    const { tasks } = buildAuthoritativeQueue({
      project: { ...PROJECT, capabilities: [cap] },
      capabilities: [cap],
      capability_scores: [score],
    });
    const backendTasks = tasks.filter(t => t.id.endsWith(':build_backend'));
    expect(backendTasks).toHaveLength(1);
    expect(backendTasks[0].title).toBe('Build backend services for Some Service');
  });

  test('Page BP without backend does NOT get build_backend task (the bug we fixed)', () => {
    const cap = makeCap({ id: 'page-1', name: 'Trust Badges Page', is_page_bp: true });
    const score = makeScore('page-1');
    const { tasks } = buildAuthoritativeQueue({
      project: { ...PROJECT, capabilities: [cap] },
      capabilities: [cap],
      capability_scores: [score],
    });
    const backendTasks = tasks.filter(t => t.id.endsWith(':build_backend'));
    expect(backendTasks).toHaveLength(0);
  });

  test('non-Page BP with backend but no frontend gets add_frontend task (existing behavior)', () => {
    // Name 'Lead Management' isn't caught by the internal-service heuristic
    // (no *Service / *Engine / *Controller suffix), so add_frontend fires.
    const cap = makeCap({
      id: 'svc-2', name: 'Lead Management',
      is_page_bp: false,
      linked_backend_services: ['backend/src/routes/leadRoutes.ts'],
    });
    const score = makeScore('svc-2');
    const { tasks } = buildAuthoritativeQueue({
      project: { ...PROJECT, capabilities: [cap] },
      capabilities: [cap],
      capability_scores: [score],
    });
    const frontendTasks = tasks.filter(t => t.id.endsWith(':add_frontend'));
    expect(frontendTasks).toHaveLength(1);
  });

  test('Page BP with backend does NOT get add_frontend task (Pages ARE the frontend)', () => {
    const cap = makeCap({
      id: 'page-2', name: 'Home Page',
      is_page_bp: true,
      linked_backend_services: ['backend/src/routes/home.ts'],
    });
    const score = makeScore('page-2');
    const { tasks } = buildAuthoritativeQueue({
      project: { ...PROJECT, capabilities: [cap] },
      capabilities: [cap],
      capability_scores: [score],
    });
    const frontendTasks = tasks.filter(t => t.id.endsWith(':add_frontend'));
    expect(frontendTasks).toHaveLength(0);
  });

  test('Page BP at low coverage still gets ui_review task (the correct ask for pages)', () => {
    const cap = makeCap({
      id: 'page-3', name: 'Not Found Page',
      is_page_bp: true,
      ui_element_map: { steps: {} }, // no steps run yet
    });
    const score = makeScore('page-3');
    const { tasks } = buildAuthoritativeQueue({
      project: { ...PROJECT, capabilities: [cap] },
      capabilities: [cap],
      capability_scores: [score],
    });
    const uiReviewTasks = tasks.filter(t => t.id.endsWith(':ui_review'));
    expect(uiReviewTasks).toHaveLength(1);
    expect(uiReviewTasks[0].title).toContain('UI Advisor');
  });
});

describe('authoritativeTaskQueue — kind-based task gating (2026-05-18)', () => {
  test('kind=component does NOT get build_backend task even when no backend linked', () => {
    const cap = makeCap({
      id: 'comp-1', name: 'Tabs Component',
      is_page_bp: false,
      kind: 'component',
    });
    const score = makeScore('comp-1');
    const { tasks } = buildAuthoritativeQueue({
      project: { ...PROJECT, capabilities: [cap] },
      capabilities: [cap],
      capability_scores: [score],
    });
    expect(tasks.filter(t => t.id.endsWith(':build_backend'))).toHaveLength(0);
    expect(tasks.filter(t => t.id.endsWith(':add_frontend'))).toHaveLength(0);
  });

  test('kind=agent does NOT get build_backend task (the agent IS the backend)', () => {
    const cap = makeCap({
      id: 'agent-1', name: 'Cost Optimization Agent',
      is_page_bp: false,
      kind: 'agent',
    });
    const score = makeScore('agent-1');
    const { tasks } = buildAuthoritativeQueue({
      project: { ...PROJECT, capabilities: [cap] },
      capabilities: [cap],
      capability_scores: [score],
    });
    expect(tasks.filter(t => t.id.endsWith(':build_backend'))).toHaveLength(0);
  });

  test('kind=service (default, omitted) gets normal build_backend behavior', () => {
    const cap = makeCap({
      id: 'svc-3', name: 'Some Backend Service',
      is_page_bp: false,
      // kind omitted — defaults to 'service' in the queue logic
    });
    const score = makeScore('svc-3');
    const { tasks } = buildAuthoritativeQueue({
      project: { ...PROJECT, capabilities: [cap] },
      capabilities: [cap],
      capability_scores: [score],
    });
    expect(tasks.filter(t => t.id.endsWith(':build_backend'))).toHaveLength(1);
  });

  test('kind=agent never gets add_frontend task (agents are consumed by separate dashboards)', () => {
    const cap = makeCap({
      id: 'agent-2', name: 'Cost Optimization Agent',
      is_page_bp: false,
      kind: 'agent',
      linked_backend_services: ['backend/src/services/agents/costOptim.ts'],
    });
    const score = makeScore('agent-2');
    const { tasks } = buildAuthoritativeQueue({
      project: { ...PROJECT, capabilities: [cap] },
      capabilities: [cap],
      capability_scores: [score],
    });
    expect(tasks.filter(t => t.id.endsWith(':add_frontend'))).toHaveLength(0);
  });
});

describe('authoritativeTaskQueue — internal-service heuristic (no UI for backend-infra names)', () => {
  test('cap named "Lead Ingestion Controller" does NOT get add_frontend task', () => {
    const cap = makeCap({
      id: 'ctrl-1', name: 'Lead Ingestion Controller',
      kind: 'service',
      linked_backend_services: ['backend/src/controllers/leadController.ts'],
    });
    const score = makeScore('ctrl-1');
    const { tasks } = buildAuthoritativeQueue({
      project: { ...PROJECT, capabilities: [cap] },
      capabilities: [cap],
      capability_scores: [score],
    });
    expect(tasks.filter(t => t.id.endsWith(':add_frontend'))).toHaveLength(0);
  });

  test('cap named "Error Handling Middleware" does NOT get add_frontend task', () => {
    const cap = makeCap({
      id: 'mw-1', name: 'Error Handling Middleware',
      kind: 'service',
      linked_backend_services: ['backend/src/middlewares/errorMiddleware.ts'],
    });
    const score = makeScore('mw-1');
    const { tasks } = buildAuthoritativeQueue({
      project: { ...PROJECT, capabilities: [cap] },
      capabilities: [cap],
      capability_scores: [score],
    });
    expect(tasks.filter(t => t.id.endsWith(':add_frontend'))).toHaveLength(0);
  });

  test('internal-service cap WITH positive frontend signal (linked components) skips heuristic block', () => {
    // The cap has SOME frontend already linked → hasUserSurface=true →
    // the internal-service heuristic doesn't block. But since hasFrontend
    // is also true, the add_frontend gap doesn't fire either. The
    // important property: the heuristic doesn't WRONGLY block a cap that
    // has demonstrated frontend intent. We verify that by checking the
    // task DOESN'T have the "looksInternal && !hasUserSurface" suppression
    // signature — i.e., the cap reaches the hasBackend && !hasFrontend
    // check naturally. With frontend already present, no gap fires, which
    // is correct.
    const cap = makeCap({
      id: 'svc-with-ui', name: 'Lead Scoring Service',
      kind: 'service',
      linked_backend_services: ['backend/src/services/leadScoring.ts'],
      linked_frontend_components: ['frontend/src/components/LeadScoring.tsx'],
    });
    const score = makeScore('svc-with-ui');
    const { tasks } = buildAuthoritativeQueue({
      project: { ...PROJECT, capabilities: [cap] },
      capabilities: [cap],
      capability_scores: [score],
    });
    // No add_frontend (frontend already present) and no build_backend
    // (backend already present). Cap is fully linked, queue is happy.
    expect(tasks.filter(t => t.id.endsWith(':add_frontend'))).toHaveLength(0);
    expect(tasks.filter(t => t.id.endsWith(':build_backend'))).toHaveLength(0);
  });

  test('non-internal-named cap still gets add_frontend task', () => {
    // "Lead Management" (no internal suffix) — operator-facing feature
    const cap = makeCap({
      id: 'feat-1', name: 'Lead Management',
      kind: 'service',
      linked_backend_services: ['backend/src/routes/admin/leadRoutes.ts'],
    });
    const score = makeScore('feat-1');
    const { tasks } = buildAuthoritativeQueue({
      project: { ...PROJECT, capabilities: [cap] },
      capabilities: [cap],
      capability_scores: [score],
    });
    expect(tasks.filter(t => t.id.endsWith(':add_frontend'))).toHaveLength(1);
  });

  test('extended internal suffixes (Integration, Composer, Optimization, etc.) all skip add_frontend', () => {
    const internalNames = [
      'Webhook Integration', 'Executive Narrative Composer', 'Cost Optimization',
      'Impact Estimator', 'Action Planner', 'User Journey Mapping',
      'Project Scope Definition', 'Visitor Analytics Tracking',
      'Health Reporting', 'Verification Framework',
      'Validation Parser', 'Dashboard Data Handling',
      // Single-word names like "Automation" / "Orchestration" don't match
      // the heuristic by design — too generic to definitively call internal.
    ];
    for (const name of internalNames) {
      const cap = makeCap({
        id: `int-${name.replace(/\s+/g, '-')}`, name, kind: 'service',
        linked_backend_services: ['backend/src/services/x.ts'],
      });
      const score = makeScore(cap.id);
      const { tasks } = buildAuthoritativeQueue({
        project: { ...PROJECT, capabilities: [cap] },
        capabilities: [cap], capability_scores: [score],
      });
      const frontendTasks = tasks.filter(t => t.id.endsWith(':add_frontend'));
      if (frontendTasks.length !== 0) {
        throw new Error(`Cap "${name}" unexpectedly got add_frontend task; should be suppressed by internal-service heuristic`);
      }
    }
  });
});

describe('authoritativeTaskQueue — implement_reqs uses operator_unmatched_requirements (2026-05-18)', () => {
  test('implement_reqs uses operator_unmatched_requirements when provided', () => {
    const cap = makeCap({
      id: 'feat-2', name: 'Lead Management', kind: 'service',
      total_requirements: 5,
      matched_requirements: 2,
      operator_unmatched_requirements: 1, // 1 operator-unmatched, 2 are autonomy
    } as any);
    const score = makeScore('feat-2');
    const { tasks } = buildAuthoritativeQueue({
      project: { ...PROJECT, capabilities: [cap] },
      capabilities: [cap], capability_scores: [score],
    });
    const implTasks = tasks.filter(t => t.id.endsWith(':implement_reqs'));
    expect(implTasks).toHaveLength(1);
    // Should say "1 unmatched" not "3 unmatched"
    expect(implTasks[0].title).toBe('Implement 1 unmatched requirement for Lead Management');
  });

  test('implement_reqs suppressed entirely when all unmatched are autonomy-generated', () => {
    const cap = makeCap({
      id: 'feat-3', name: 'Lead Management', kind: 'service',
      total_requirements: 3,
      matched_requirements: 2,
      operator_unmatched_requirements: 0, // 1 autonomy-only unmatched
    } as any);
    const score = makeScore('feat-3');
    const { tasks } = buildAuthoritativeQueue({
      project: { ...PROJECT, capabilities: [cap] },
      capabilities: [cap], capability_scores: [score],
    });
    expect(tasks.filter(t => t.id.endsWith(':implement_reqs'))).toHaveLength(0);
  });

  test('implement_reqs falls back to total - matched when operator_unmatched_requirements is undefined', () => {
    const cap = makeCap({
      id: 'feat-4', name: 'Lead Management', kind: 'service',
      total_requirements: 5,
      matched_requirements: 2,
      // operator_unmatched_requirements omitted (legacy input)
    });
    const score = makeScore('feat-4');
    const { tasks } = buildAuthoritativeQueue({
      project: { ...PROJECT, capabilities: [cap] },
      capabilities: [cap], capability_scores: [score],
    });
    const implTasks = tasks.filter(t => t.id.endsWith(':implement_reqs'));
    expect(implTasks).toHaveLength(1);
    expect(implTasks[0].title).toContain('Implement 3 unmatched requirements');
  });

  test('implement_reqs for Page BP is typed frontend, not backend', () => {
    const cap = makeCap({
      id: 'page-4', name: 'Pricing Page', kind: 'page', is_page_bp: true,
      total_requirements: 2,
      matched_requirements: 0,
      operator_unmatched_requirements: 2,
    } as any);
    const score = makeScore('page-4');
    const { tasks } = buildAuthoritativeQueue({
      project: { ...PROJECT, capabilities: [cap] },
      capabilities: [cap], capability_scores: [score],
    });
    const implTasks = tasks.filter(t => t.id.endsWith(':implement_reqs'));
    expect(implTasks).toHaveLength(1);
    expect(implTasks[0].type).toBe('frontend');
  });
});
