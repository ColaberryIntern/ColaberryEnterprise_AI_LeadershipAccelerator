/**
 * Phase 4 tests — pure helpers + the new contradiction detectors.
 *
 * Coverage:
 *   - manifestCompletenessChecker (req checklist + scoring)
 *   - buildCompletionValidator (DoD gate)
 *   - gitDiffTelemetryAnalyzer (file → manifest field inference)
 *   - autoManifestGenerator (assembly + repair suggestions)
 *   - 8 telemetry contradiction detectors
 *   - queueHistoryWriter.computeQueueDiff (rank delta math)
 *   - refreshTriggers debouncer (timing semantics — pure logic)
 *   - snapshotRetentionSweeper edge cases (existing — already covered in phase 3 file)
 */
import { checkManifestCompleteness } from '../execution/manifestCompletenessChecker';
import { assertBuildComplete, TelemetryValidationError } from '../execution/buildCompletionValidator';
import { analyzeDiff, parseGitDiffNameStatus } from '../execution/gitDiffTelemetryAnalyzer';
import { generateManifestDraft, suggestRepairs } from '../execution/autoManifestGenerator';
import { computeQueueDiff } from '../execution/queueHistoryWriter';
import { detectContradictions } from '../telemetry/contradictionDetector';
import type { AuthoritativeTask } from '../types/systemState.types';

const VALID_PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const VALID_BP_ID =      '22222222-2222-4222-8222-222222222222';
const VALID_TASK_ID =    '33333333-3333-4333-8333-333333333333';

function validManifest(overrides: any = {}): any {
  return {
    manifest_version: '1.0',
    telemetry_version: '1.0',
    task_id: VALID_TASK_ID,
    bp_id: VALID_BP_ID,
    project_id: VALID_PROJECT_ID,
    execution_timestamp: '2026-05-01T12:00:00Z',
    files_created: [],
    files_modified: [],
    files_deleted: [],
    database_changes: [],
    apis_added: [],
    apis_modified: [],
    frontend_routes_added: [],
    ui_components_added: [],
    ui_components_modified: [],
    tests_added: [],
    tests_modified: [],
    validation_results: [],
    dependencies_added: [],
    packages_added: [],
    system_impacts: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// manifestCompletenessChecker
// ---------------------------------------------------------------------------

describe('checkManifestCompleteness', () => {
  it('rejects empty manifest as blocking', () => {
    const r = checkManifestCompleteness('backend', validManifest());
    expect(r.blocking).toBe(true);
    expect(r.missing_requirements.length).toBeGreaterThan(0);
    expect(r.missing_requirements.some(m => m.kind === 'empty_manifest')).toBe(true);
  });

  it('backend task with files + tests + validation passes (with API warning)', () => {
    const r = checkManifestCompleteness('backend', validManifest({
      files_created: ['backend/src/services/x.ts'],
      tests_added: [{ file: 'backend/src/__tests__/x.test.ts', type: 'unit' }],
      validation_results: [{ check: 'tsc', status: 'pass' }],
    }));
    expect(r.blocking).toBe(false);
    // API is recommended for backend, not required → warning only
    expect(r.warnings.some(w => w.kind === 'apis_declared')).toBe(true);
  });

  it('database task without database_changes is blocking', () => {
    const r = checkManifestCompleteness('database', validManifest({
      files_created: ['backend/src/migrations/001-x.ts'],
      validation_results: [{ check: 'manual', status: 'pass' }],
    }));
    expect(r.blocking).toBe(true);
    expect(r.missing_requirements.some(m => m.kind === 'database_changes_declared')).toBe(true);
  });

  it('testing task without tests_added is blocking', () => {
    const r = checkManifestCompleteness('testing', validManifest({
      validation_results: [{ check: 'jest', status: 'pass' }],
    }));
    expect(r.blocking).toBe(true);
    expect(r.missing_requirements.some(m => m.kind === 'tests_added')).toBe(true);
  });

  it('score reflects severity weighting (required miss = -25)', () => {
    const r = checkManifestCompleteness('backend', validManifest({
      files_created: ['x.ts'],
      // missing tests_added (required for backend)
      // missing validation_results (required)
      // missing apis_added (recommended) — warning
    }));
    expect(r.score).toBeLessThanOrEqual(50);
  });
});

// ---------------------------------------------------------------------------
// buildCompletionValidator
// ---------------------------------------------------------------------------

describe('assertBuildComplete', () => {
  it('throws TelemetryValidationError on blocking', () => {
    expect(() => assertBuildComplete({ task_type: 'backend', manifest: validManifest() })).toThrow(TelemetryValidationError);
  });

  it('returns acceptance on a complete backend manifest', () => {
    const r = assertBuildComplete({
      task_type: 'backend',
      manifest: validManifest({
        files_created: ['x.ts'],
        tests_added: [{ file: 'x.test.ts', type: 'unit' }],
        validation_results: [{ check: 'tsc', status: 'pass' }],
      }),
    });
    expect(r.accepted).toBe(true);
  });

  it('strict=false returns the report without throwing', () => {
    const r = assertBuildComplete({ task_type: 'backend', manifest: validManifest() }, { strict: false });
    expect(r.accepted).toBe(false);
    expect(r.report.blocking).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// gitDiffTelemetryAnalyzer
// ---------------------------------------------------------------------------

describe('analyzeDiff', () => {
  it('partitions files by status', () => {
    const r = analyzeDiff([
      { path: 'a.ts', status: 'added' },
      { path: 'b.ts', status: 'modified' },
      { path: 'c.ts', status: 'deleted' },
    ]);
    expect(r.files_created).toEqual(['a.ts']);
    expect(r.files_modified).toEqual(['b.ts']);
    expect(r.files_deleted).toEqual(['c.ts']);
  });

  it('infers UI page from frontend/src/pages/*.tsx', () => {
    const r = analyzeDiff([{ path: 'frontend/src/pages/AdminDashboard.tsx', status: 'added' }]);
    expect(r.inferred_frontend_routes_added.length).toBe(1);
    expect(r.inferred_ui_components_added.length).toBe(1);
    expect(r.inferred_ui_components_added[0].category).toBe('page');
  });

  it('infers test file from __tests__ pattern', () => {
    const r = analyzeDiff([{ path: 'backend/src/__tests__/x.test.ts', status: 'added' }]);
    expect(r.inferred_tests_added.length).toBe(1);
    expect(r.inferred_tests_added[0].type).toBe('unit');
  });

  it('infers e2e test from tests/systemV2/', () => {
    const r = analyzeDiff([{ path: 'tests/systemV2/x.spec.ts', status: 'added' }]);
    expect(r.inferred_tests_added[0].type).toBe('e2e');
  });

  it('infers DB seed change', () => {
    const r = analyzeDiff([{ path: 'backend/src/seeds/seedThings.ts', status: 'added' }]);
    expect(r.inferred_database_changes.length).toBe(1);
  });

  it('skips inference for deleted files', () => {
    const r = analyzeDiff([{ path: 'frontend/src/pages/Dead.tsx', status: 'deleted' }]);
    expect(r.inferred_frontend_routes_added.length).toBe(0);
    expect(r.inferred_ui_components_added.length).toBe(0);
  });
});

describe('parseGitDiffNameStatus', () => {
  it('parses standard A/M/D status output', () => {
    const stdout = 'A\tnew.ts\nM\tmodified.ts\nD\tgone.ts\n';
    const r = parseGitDiffNameStatus(stdout);
    expect(r).toEqual([
      { path: 'new.ts', status: 'added' },
      { path: 'modified.ts', status: 'modified' },
      { path: 'gone.ts', status: 'deleted' },
    ]);
  });

  it('ignores rename / copy entries', () => {
    const stdout = 'R100\told.ts\tnew.ts\nA\twin.ts\n';
    const r = parseGitDiffNameStatus(stdout);
    expect(r).toEqual([{ path: 'win.ts', status: 'added' }]);
  });

  it('handles empty stdout', () => {
    expect(parseGitDiffNameStatus('')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// autoManifestGenerator
// ---------------------------------------------------------------------------

describe('generateManifestDraft', () => {
  it('builds a draft from diff alone', () => {
    const r = generateManifestDraft({
      task_id: VALID_TASK_ID,
      bp_id: VALID_BP_ID,
      project_id: VALID_PROJECT_ID,
      diff: [
        { path: 'backend/src/services/x.ts', status: 'added' },
        { path: 'backend/src/__tests__/x.test.ts', status: 'added' },
      ],
    });
    expect(r.manifest.files_created).toContain('backend/src/services/x.ts');
    expect(r.manifest.tests_added.length).toBe(1);
    expect(r.source_summary.diff_files_used).toBe(2);
  });

  it('prefers parsed validation report routes over inferred', () => {
    const r = generateManifestDraft({
      task_id: VALID_TASK_ID,
      bp_id: VALID_BP_ID,
      project_id: VALID_PROJECT_ID,
      diff: [{ path: 'backend/src/routes/userRoutes.ts', status: 'added' }],
      parsed_validation_report: {
        routes: [{ method: 'POST', path: '/api/users' }],
      },
    });
    expect(r.manifest.apis_added.length).toBe(1);
    expect(r.manifest.apis_added[0]).toEqual(expect.objectContaining({ method: 'POST', path: '/api/users' }));
  });

  it('synthesizes validation_results from report status', () => {
    const r = generateManifestDraft({
      task_id: VALID_TASK_ID,
      bp_id: VALID_BP_ID,
      project_id: VALID_PROJECT_ID,
      diff: [{ path: 'x.ts', status: 'added' }],
      parsed_validation_report: { status: 'COMPLETE' },
    });
    expect(r.manifest.validation_results.length).toBe(1);
    expect(r.manifest.validation_results[0].status).toBe('pass');
  });
});

describe('suggestRepairs', () => {
  it('flags missing files', () => {
    const tips = suggestRepairs({ files_created: [], files_modified: [] }, 'backend');
    expect(tips.some(t => /file changes/i.test(t))).toBe(true);
  });

  it('flags missing validation_results', () => {
    const tips = suggestRepairs({ files_created: ['x.ts'], validation_results: [] }, 'backend');
    expect(tips.some(t => /validation_results/.test(t))).toBe(true);
  });

  it('flags database task without DB changes', () => {
    const tips = suggestRepairs({ files_created: ['x.ts'], validation_results: [{}], database_changes: [] }, 'database');
    expect(tips.some(t => /database/i.test(t))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phase 4 contradiction detectors
// ---------------------------------------------------------------------------

describe('telemetry contradiction detectors', () => {
  function mkCap(overrides: any = {}) {
    return {
      id: 'cap-1',
      project_id: 'proj-1',
      name: 'Cap',
      description: '',
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
  function mkProject(overrides: any = {}) {
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

  it('missing_telemetry: cap user-verified but no manifest', () => {
    const cap = mkCap({ user_status: 'verified', linked_backend_services: ['x.ts'] });
    const flags = detectContradictions({
      project: mkProject({ capabilities: [cap] }),
      capabilities: [cap],
      capability_scores: [{ capability_id: cap.id, readiness: 80, coverage: 80, maturity: 60, maturity_level: 3, health: 70, sync_health: 0 }],
      tasks: [],
      manifests: [],
    });
    expect(flags.some(f => f.kind === 'missing_telemetry')).toBe(true);
  });

  it('missing_telemetry: silent when manifest exists for the cap', () => {
    const cap = mkCap({ user_status: 'verified' });
    const flags = detectContradictions({
      project: mkProject({ capabilities: [cap] }),
      capabilities: [cap],
      capability_scores: [{ capability_id: cap.id, readiness: 80, coverage: 80, maturity: 60, maturity_level: 3, health: 70, sync_health: 0 }],
      tasks: [],
      manifests: [{ id: 'm1', bp_id: cap.id, execution_timestamp: new Date().toISOString() }],
    });
    expect(flags.some(f => f.kind === 'missing_telemetry')).toBe(false);
  });

  it('stale_telemetry: surfaces manifest older than 30d', () => {
    const cap = mkCap();
    const veryOld = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const flags = detectContradictions({
      project: mkProject({ capabilities: [cap] }),
      capabilities: [cap],
      capability_scores: [{ capability_id: cap.id, readiness: 50, coverage: 50, maturity: 30, maturity_level: 1, health: 50, sync_health: 0 }],
      tasks: [],
      manifests: [{ id: 'm1', bp_id: cap.id, execution_timestamp: veryOld, database_changes: [], apis_added: [], frontend_routes_added: [] }],
    });
    expect(flags.some(f => f.kind === 'stale_telemetry')).toBe(true);
  });

  it('telemetry_drift: API handler file not in repo file tree', () => {
    const cap = mkCap();
    const flags = detectContradictions({
      project: mkProject({ capabilities: [cap], repo_file_tree: ['package.json'] }),
      capabilities: [cap],
      capability_scores: [{ capability_id: cap.id, readiness: 50, coverage: 50, maturity: 30, maturity_level: 1, health: 50, sync_health: 0 }],
      tasks: [],
      manifests: [{
        id: 'm1', bp_id: cap.id, execution_timestamp: new Date().toISOString(),
        apis_added: [{ method: 'GET', path: '/api/x', handler_file: 'backend/src/services/missing.ts' }],
        database_changes: [], frontend_routes_added: [],
      }],
    });
    expect(flags.some(f => f.kind === 'telemetry_drift')).toBe(true);
  });

  it('graph_drift: manifest references unknown bp_id', () => {
    const cap = mkCap();
    const flags = detectContradictions({
      project: mkProject({ capabilities: [cap] }),
      capabilities: [cap],
      capability_scores: [{ capability_id: cap.id, readiness: 50, coverage: 50, maturity: 30, maturity_level: 1, health: 50, sync_health: 0 }],
      tasks: [],
      manifests: [{ id: 'm1', bp_id: 'orphan-bp-id', execution_timestamp: new Date().toISOString() }],
    });
    expect(flags.some(f => f.kind === 'graph_drift')).toBe(true);
  });

  it('ui_drift: cap has frontend_route not declared by any manifest', () => {
    const cap = mkCap({ frontend_route: '/admin/x' });
    const flags = detectContradictions({
      project: mkProject({ capabilities: [cap] }),
      capabilities: [cap],
      capability_scores: [{ capability_id: cap.id, readiness: 50, coverage: 50, maturity: 30, maturity_level: 1, health: 50, sync_health: 0 }],
      tasks: [],
      manifests: [{ id: 'm1', bp_id: cap.id, execution_timestamp: new Date().toISOString(), frontend_routes_added: [{ route: '/different' }] }],
    });
    expect(flags.some(f => f.kind === 'ui_drift')).toBe(true);
  });

  it('low_confidence_validation: any failed validation result raises', () => {
    const cap = mkCap();
    const flags = detectContradictions({
      project: mkProject({ capabilities: [cap] }),
      capabilities: [cap],
      capability_scores: [{ capability_id: cap.id, readiness: 50, coverage: 50, maturity: 30, maturity_level: 1, health: 50, sync_health: 0 }],
      tasks: [],
      manifests: [{
        id: 'm1', bp_id: cap.id, execution_timestamp: new Date().toISOString(),
        validation_results: [{ check: 'tsc', status: 'fail' }],
      }],
    });
    expect(flags.some(f => f.kind === 'low_confidence_validation')).toBe(true);
  });

  it('telemetry_conflict: surfaces resolved conflicts', () => {
    const cap = mkCap();
    const flags = detectContradictions({
      project: mkProject({ capabilities: [cap] }),
      capabilities: [cap],
      capability_scores: [{ capability_id: cap.id, readiness: 50, coverage: 50, maturity: 30, maturity_level: 1, health: 50, sync_health: 0 }],
      tasks: [],
      manifests: [],
      resolvedConflicts: [{ project_id: 'proj-1', bp_id: cap.id, description: 'File a.ts re-created after deletion' }],
    });
    expect(flags.some(f => f.kind === 'telemetry_conflict')).toBe(true);
  });

  it('produces no telemetry contradictions when no telemetry inputs are passed', () => {
    const cap = mkCap();
    const flags = detectContradictions({
      project: mkProject({ capabilities: [cap] }),
      capabilities: [cap],
      capability_scores: [{ capability_id: cap.id, readiness: 50, coverage: 50, maturity: 30, maturity_level: 1, health: 50, sync_health: 0 }],
      tasks: [],
      // no manifests, no resolvedConflicts
    });
    expect(flags.some(f => f.kind === 'telemetry_drift')).toBe(false);
    expect(flags.some(f => f.kind === 'graph_drift')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// queueHistoryWriter.computeQueueDiff
// ---------------------------------------------------------------------------

describe('computeQueueDiff', () => {
  function mkTask(id: string, title: string, state: string = 'ready'): AuthoritativeTask {
    return Object.freeze({
      id, project_id: 'proj-1', bp_id: 'bp-1', title, type: 'backend',
      priority_score: 50, blocking_score: 50, dependency_score: 50,
      maturity_gain: 50, readiness_gain: 50, confidence_score: 80, execution_cost: 30,
      dependencies: Object.freeze([]),
      calculated_rank: 0, state: state as any,
      reasoning: Object.freeze([]),
    }) as AuthoritativeTask;
  }

  it('reports new tasks with previous_rank=null', () => {
    const diff = computeQueueDiff([], [mkTask('a', 'A')]);
    expect(diff.length).toBe(1);
    expect(diff[0].previous_rank).toBeNull();
    expect(diff[0].rank_delta).toBe(0);
  });

  it('computes negative rank_delta when a task moved earlier', () => {
    const prev = [mkTask('a', 'A'), mkTask('b', 'B'), mkTask('c', 'C')];
    const next = [mkTask('c', 'C'), mkTask('a', 'A'), mkTask('b', 'B')];
    const diff = computeQueueDiff(prev, next);
    const cEntry = diff.find(d => d.task_id === 'c')!;
    expect(cEntry.previous_rank).toBe(2);
    expect(cEntry.rank).toBe(0);
    expect(cEntry.rank_delta).toBe(-2);
  });

  it('reports state transitions', () => {
    const prev = [mkTask('a', 'A', 'pending')];
    const next = [mkTask('a', 'A', 'in_progress')];
    const diff = computeQueueDiff(prev, next);
    expect(diff[0].previous_state).toBe('pending');
    expect(diff[0].state).toBe('in_progress');
  });
});

// ---------------------------------------------------------------------------
// refreshTriggers debouncer (semantic — uses async timing)
// ---------------------------------------------------------------------------

describe('refreshSystemState debouncer (Phase 4 stability)', () => {
  // The debouncer's behavior is best validated by the pure logic shape:
  //   - first call → schedules a rebuild on next tick
  //   - second call within cooldown → coalesces into trailing
  //
  // The actual rebuild is mocked by checking that the in-memory state map
  // doesn't blow up under rapid-fire calls. This test validates the import
  // works and the state map is bounded.
  it('handles rapid-fire calls without throwing', async () => {
    const { refreshSystemState, _resetRefreshStateForTests } = await import('../refreshTriggers');
    _resetRefreshStateForTests();
    // Hammer the trigger; the actual buildAuthoritativeState will fail
    // (no DB in unit tests), but the debouncer must absorb the calls
    // without crashing. We catch the eventual unhandled rejections by
    // forcing buildAuthoritativeState to be invoked async via setImmediate
    // so failures land in the warning log, not the test runner.
    expect(() => {
      for (let i = 0; i < 10; i++) refreshSystemState('proj-test', 'manual');
    }).not.toThrow();
    _resetRefreshStateForTests();
  });
});
