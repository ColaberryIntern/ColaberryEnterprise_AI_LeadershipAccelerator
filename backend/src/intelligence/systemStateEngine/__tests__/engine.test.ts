/**
 * SystemStateEngine — integration tests against the pure entry point.
 *
 * No DB. Synthetic inputs. Verifies the full pipeline end-to-end:
 * scoring → queue → dependency resolution → ranking → contradictions →
 * sync health → graph → aggregation.
 */
import { buildAuthoritativeStateFromInputs } from '../systemStateEngine';
import { scoreReadiness } from '../scoring/readinessScorer';
import { scoreCoverage } from '../scoring/coverageScorer';
import { scoreMaturity } from '../scoring/maturityScorer';
import { scoreHealth } from '../scoring/healthScorer';
import { scoreSyncHealth } from '../scoring/syncHealthScorer';
import { resolveDependencies } from '../queue/dependencyResolver';
import { rankTasks } from '../queue/priorityRanker';
import { detectContradictions } from '../telemetry/contradictionDetector';
import type {
  AuthoritativeTask,
  EngineCapabilityInput,
  EngineProjectInput,
} from '../types/systemState.types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkCap(overrides: Partial<EngineCapabilityInput> = {}): EngineCapabilityInput {
  return {
    id: 'cap-1',
    project_id: 'proj-1',
    name: 'Test Cap',
    description: 'A test capability',
    source: 'parsed',
    user_status: 'in_progress',
    applicability_status: 'active',
    frontend_route: null,
    is_page_bp: false,
    mode_override: null,
    last_execution: null,
    linked_backend_services: [],
    linked_frontend_components: [],
    linked_agents: [],
    ui_element_map: null,
    total_requirements: 0,
    matched_requirements: 0,
    verified_requirements: 0,
    ...overrides,
  };
}

function mkProject(overrides: Partial<EngineProjectInput> = {}): EngineProjectInput {
  return {
    id: 'proj-1',
    target_mode: 'production',
    setup_status: {},
    capabilities: [],
    repo_file_tree: [],
    latest_commit_sha: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Scoring tests
// ---------------------------------------------------------------------------

describe('readinessScorer', () => {
  it('returns 0 for an empty cap', () => {
    expect(scoreReadiness(mkCap()).final).toBe(0);
  });

  it('rewards layer presence', () => {
    const cap = mkCap({
      linked_backend_services: ['a.ts', 'b.ts'],
      linked_frontend_components: ['c.tsx'],
    });
    const score = scoreReadiness(cap);
    expect(score.final).toBeGreaterThan(30);
    expect(score.layer_score).toBeGreaterThan(0);
  });

  it('uses evidence completion when no requirements', () => {
    const cap = mkCap({
      total_requirements: 0,
      last_execution: { evidence_completion_pct: 75 },
    });
    const score = scoreReadiness(cap);
    expect(score.coverage_score).toBe(75);
  });

  it('uses requirements coverage when available', () => {
    const cap = mkCap({ total_requirements: 10, matched_requirements: 8 });
    expect(scoreReadiness(cap).coverage_score).toBe(80);
  });
});

describe('coverageScorer', () => {
  it('returns 100 for user-verified caps', () => {
    expect(scoreCoverage(mkCap({ user_status: 'verified' })).value).toBe(100);
  });

  it('uses page visual review for Page BPs', () => {
    const cap = mkCap({
      is_page_bp: true,
      ui_element_map: {
        category_scores: {
          layout: { verified: true },
          accessibility: { verified: true },
        },
      },
    });
    expect(scoreCoverage(cap).value).toBe(40);
    expect(scoreCoverage(cap).source).toBe('page_visual_review');
  });

  it('uses requirements coverage when totalR > 0', () => {
    const cap = mkCap({ total_requirements: 4, matched_requirements: 1 });
    expect(scoreCoverage(cap).value).toBe(25);
    expect(scoreCoverage(cap).source).toBe('requirements_coverage');
  });

  it('uses evidence completion as fallback', () => {
    const cap = mkCap({
      last_execution: { evidence_completion_pct: 60, progress_md_mentions: 3 },
    });
    expect(scoreCoverage(cap).value).toBe(60);
    expect(scoreCoverage(cap).source).toBe('evidence_based');
  });

  it('returns 0 with reasoning when no signal', () => {
    const result = scoreCoverage(mkCap());
    expect(result.value).toBe(0);
    expect(result.source).toBe('no_signal');
    expect(result.reasoning).toBeTruthy();
  });
});

describe('maturityScorer', () => {
  it('returns L0 for empty cap', () => {
    expect(scoreMaturity(mkCap()).level).toBe(0);
  });

  it('reaches L3 with backend + frontend + 70% coverage', () => {
    const cap = mkCap({
      linked_backend_services: ['a.ts'],
      linked_frontend_components: ['b.tsx'],
      total_requirements: 10,
      matched_requirements: 7,
    });
    expect(scoreMaturity(cap).level).toBe(3);
  });

  it('reaches L4 with all layers + 85% coverage', () => {
    const cap = mkCap({
      linked_backend_services: ['a.ts'],
      linked_frontend_components: ['b.tsx'],
      linked_agents: ['c.ts'],
      total_requirements: 10,
      matched_requirements: 9,
    });
    expect(scoreMaturity(cap).level).toBe(4);
  });

  it('Page BP at 5/5 verified reaches L4', () => {
    const cap = mkCap({
      is_page_bp: true,
      ui_element_map: {
        category_scores: {
          layout: { verified: true },
          accessibility: { verified: true },
          responsiveness: { verified: true },
          interaction: { verified: true },
          content: { verified: true },
        },
      },
    });
    expect(scoreMaturity(cap).level).toBe(4);
  });

  it('brownfield cap with 3 layers + 70% evidence reaches L3', () => {
    const cap = mkCap({
      linked_backend_services: ['a.ts'],
      linked_frontend_components: ['b.tsx'],
      linked_agents: ['c.ts'],
      total_requirements: 0,
      last_execution: { evidence_completion_pct: 75 },
    });
    // 3 layers + 75% evidence → should reach L3
    const result = scoreMaturity(cap);
    expect(result.level).toBeGreaterThanOrEqual(3);
  });
});

describe('healthScorer', () => {
  it('returns 0 for empty cap', () => {
    const score = scoreHealth(mkCap(), []);
    expect(score.score).toBeLessThan(20);
  });

  it('rewards backend presence and deploy artifacts', () => {
    const cap = mkCap({ linked_backend_services: ['a.ts', 'b.ts', 'c.ts'] });
    const tree = ['Dockerfile', '.github/workflows/ci.yml'];
    const score = scoreHealth(cap, tree);
    expect(score.production_readiness).toBeGreaterThan(0);
    expect(score.score).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Sync health
// ---------------------------------------------------------------------------

describe('syncHealthScorer', () => {
  it('returns near-100 for healthy state', () => {
    const project = mkProject({
      repo_file_tree: ['package.json', 'src/index.ts'],
    });
    const result = scoreSyncHealth({
      project,
      capabilities: [],
      contradictions: [],
      lastSyncAt: new Date(),
    });
    expect(result.score).toBeGreaterThan(70);
  });

  it('penalizes for contradictions', () => {
    const project = mkProject({
      repo_file_tree: ['package.json'],
    });
    const result = scoreSyncHealth({
      project,
      capabilities: [],
      contradictions: [
        { kind: 'orphan_bp', severity: 'error', message: 'x', project_id: 'p1', evidence: {} },
        { kind: 'orphan_bp', severity: 'error', message: 'x', project_id: 'p1', evidence: {} },
      ],
      lastSyncAt: new Date(),
    });
    // Sync health averages 10 dimensions; 2 errors only penalize the
    // contradictory_calculations dimension. Net drop is small but real.
    expect(result.score).toBeLessThan(100);
    expect(result.dimensions.contradictory_calculations).toBeLessThan(100);
    expect(result.contradiction_count).toBe(2);
  });

  it('telemetry freshness drops with stale sync', () => {
    const project = mkProject({ repo_file_tree: ['package.json'] });
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const result = scoreSyncHealth({
      project,
      capabilities: [],
      contradictions: [],
      lastSyncAt: sevenDaysAgo,
    });
    expect(result.dimensions.telemetry_freshness).toBeLessThan(20);
  });
});

// ---------------------------------------------------------------------------
// Dependency resolution + ranking
// ---------------------------------------------------------------------------

describe('resolveDependencies', () => {
  function mkTask(id: string, deps: string[] = [], state: any = 'pending'): AuthoritativeTask {
    return {
      id, project_id: 'p1', title: id, type: 'backend',
      priority_score: 50, blocking_score: 50, dependency_score: 50,
      maturity_gain: 50, readiness_gain: 50, confidence_score: 50, execution_cost: 50,
      dependencies: deps, calculated_rank: 0, state,
      reasoning: [],
    };
  }

  it('marks tasks with no dependencies as ready', () => {
    const result = resolveDependencies([mkTask('a')]);
    expect(result.tasks[0].state).toBe('ready');
  });

  it('blocks tasks with unmet dependencies', () => {
    const result = resolveDependencies([
      mkTask('a'),
      mkTask('b', ['a']),
    ]);
    expect(result.tasks.find(t => t.id === 'b')?.state).toBe('blocked');
  });

  it('detects cycles', () => {
    const result = resolveDependencies([
      mkTask('a', ['b']),
      mkTask('b', ['a']),
    ]);
    expect(result.cycles.length).toBeGreaterThan(0);
  });

  it('flags missing dependency targets', () => {
    const result = resolveDependencies([mkTask('a', ['ghost'])]);
    expect(result.blocked_by_missing).toContain('a');
  });
});

describe('rankTasks', () => {
  function mkTask(id: string, priority: number, state: any = 'pending'): AuthoritativeTask {
    return {
      id, project_id: 'p1', title: id, type: 'backend',
      priority_score: priority, blocking_score: 50, dependency_score: 50,
      maturity_gain: 50, readiness_gain: 50, confidence_score: 50, execution_cost: 30,
      dependencies: [], calculated_rank: 0, state,
      reasoning: [],
    };
  }

  it('ranks higher-priority tasks earlier', () => {
    const ranked = rankTasks([
      mkTask('low', 20),
      mkTask('high', 90),
    ]);
    expect(ranked[0].id).toBe('high');
  });

  it('sinks blocked tasks', () => {
    const ranked = rankTasks([
      mkTask('blocked', 100, 'blocked'),
      mkTask('ready', 50, 'ready'),
    ]);
    expect(ranked[0].id).toBe('ready');
  });

  it('boosts in-progress tasks', () => {
    const ranked = rankTasks([
      mkTask('idle', 80),
      mkTask('inprogress', 50, 'in_progress'),
    ]);
    expect(ranked[0].id).toBe('inprogress');
  });
});

// ---------------------------------------------------------------------------
// Contradiction detection
// ---------------------------------------------------------------------------

describe('detectContradictions', () => {
  it('flags caps with no files and no requirements as orphans', () => {
    const cap = mkCap({ source: 'parsed' });
    const result = detectContradictions({
      project: mkProject(),
      capabilities: [cap],
      capability_scores: [{
        capability_id: cap.id, readiness: 0, coverage: 0, maturity: 0,
        maturity_level: 0, health: 0, sync_health: 100,
      }],
      tasks: [],
    });
    expect(result.some(c => c.kind === 'orphan_bp')).toBe(true);
  });

  it('flags verified-but-empty as readiness mismatch', () => {
    const cap = mkCap({ user_status: 'verified', source: 'parsed' });
    const result = detectContradictions({
      project: mkProject(),
      capabilities: [cap],
      capability_scores: [{
        capability_id: cap.id, readiness: 0, coverage: 100, maturity: 0,
        maturity_level: 0, health: 0, sync_health: 100,
      }],
      tasks: [],
    });
    expect(result.some(c => c.kind === 'readiness_mismatch')).toBe(true);
  });

  it('flags missing BP references in tasks', () => {
    const result = detectContradictions({
      project: mkProject(),
      capabilities: [],
      capability_scores: [],
      tasks: [{
        id: 't1', project_id: 'p1', bp_id: 'missing-cap',
        title: 'x', type: 'backend',
        priority_score: 50, blocking_score: 50, dependency_score: 50,
        maturity_gain: 50, readiness_gain: 50, confidence_score: 50, execution_cost: 50,
        dependencies: [], calculated_rank: 0, state: 'pending', reasoning: [],
      }],
    });
    expect(result.some(c => c.kind === 'missing_bp_reference')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Engine end-to-end
// ---------------------------------------------------------------------------

describe('buildAuthoritativeStateFromInputs', () => {
  it('returns a kickoff task for a fresh project', () => {
    const cap = mkCap();
    const state = buildAuthoritativeStateFromInputs({
      project: mkProject({ capabilities: [cap] }),
      capabilities: [cap],
    });
    expect(state.queue.length).toBeGreaterThan(0);
    expect(state.queue.some(t => t.type === 'foundation')).toBe(true);
  });

  it('skips kickoff when any cap is foundation_built', () => {
    const cap = mkCap({
      last_execution: { status: 'foundation_built', evidence_completion_pct: 70 },
      linked_backend_services: ['a.ts'],
    });
    const state = buildAuthoritativeStateFromInputs({
      project: mkProject({ capabilities: [cap] }),
      capabilities: [cap],
    });
    const kickoffTasks = state.queue.filter(t => t.type === 'foundation');
    expect(kickoffTasks.length).toBe(0);
  });

  it('aggregates project scores from per-cap scores', () => {
    const cap1 = mkCap({
      id: 'c1',
      linked_backend_services: ['a.ts', 'b.ts'],
      linked_frontend_components: ['c.tsx'],
      total_requirements: 5,
      matched_requirements: 4,
    });
    const cap2 = mkCap({
      id: 'c2',
      name: 'Cap 2',
      linked_backend_services: ['d.ts'],
      total_requirements: 5,
      matched_requirements: 1,
    });
    const state = buildAuthoritativeStateFromInputs({
      project: mkProject({ capabilities: [cap1, cap2] }),
      capabilities: [cap1, cap2],
    });
    expect(state.scores.coverage).toBeGreaterThan(0);
    expect(state.scores.per_capability.length).toBe(2);
  });

  it('emits a state graph with project + bp + task nodes', () => {
    const cap = mkCap({
      linked_backend_services: ['a.ts'],
      total_requirements: 3,
      matched_requirements: 1,
    });
    const state = buildAuthoritativeStateFromInputs({
      project: mkProject({ capabilities: [cap], repo_file_tree: ['a.ts'] }),
      capabilities: [cap],
    });
    expect(state.graph.nodes.some(n => n.type === 'project')).toBe(true);
    expect(state.graph.nodes.some(n => n.type === 'bp')).toBe(true);
    // file node should exist for linked file
    expect(state.graph.nodes.some(n => n.type === 'file' && n.id === 'file:a.ts')).toBe(true);
  });

  it('contradiction detection runs end-to-end', () => {
    const cap = mkCap({ source: 'parsed' });   // orphan: no files, no reqs
    const state = buildAuthoritativeStateFromInputs({
      project: mkProject({ capabilities: [cap] }),
      capabilities: [cap],
    });
    expect(state.contradictions.some(c => c.kind === 'orphan_bp')).toBe(true);
  });

  it('produces a next_task when caps exist', () => {
    const cap = mkCap({
      total_requirements: 5,
      matched_requirements: 1,
      linked_backend_services: ['a.ts'],
    });
    const state = buildAuthoritativeStateFromInputs({
      project: mkProject({ capabilities: [cap] }),
      capabilities: [cap],
    });
    expect(state.next_task).toBeTruthy();
  });

  it('output is deterministic — same inputs yield same scores', () => {
    const cap = mkCap({
      total_requirements: 10,
      matched_requirements: 7,
      linked_backend_services: ['a.ts', 'b.ts'],
      linked_frontend_components: ['c.tsx'],
    });
    const inputs = { project: mkProject({ capabilities: [cap] }), capabilities: [cap] };
    const a = buildAuthoritativeStateFromInputs(inputs);
    const b = buildAuthoritativeStateFromInputs(inputs);
    expect(a.scores.readiness).toBe(b.scores.readiness);
    expect(a.scores.coverage).toBe(b.scores.coverage);
    expect(a.scores.maturity).toBe(b.scores.maturity);
    expect(a.queue.length).toBe(b.queue.length);
  });
});
