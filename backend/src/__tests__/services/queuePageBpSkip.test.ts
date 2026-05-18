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
    const cap = makeCap({
      id: 'svc-2', name: 'API Service',
      is_page_bp: false,
      linked_backend_services: ['backend/src/routes/api.ts'],
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

  test('kind=agent gets add_frontend task when backend exists (agent may need admin UI)', () => {
    const cap = makeCap({
      id: 'agent-2', name: 'Governance Agent',
      is_page_bp: false,
      kind: 'agent',
      linked_backend_services: ['backend/src/services/agents/governanceAgent.ts'],
    });
    const score = makeScore('agent-2');
    const { tasks } = buildAuthoritativeQueue({
      project: { ...PROJECT, capabilities: [cap] },
      capabilities: [cap],
      capability_scores: [score],
    });
    expect(tasks.filter(t => t.id.endsWith(':add_frontend'))).toHaveLength(1);
  });
});
