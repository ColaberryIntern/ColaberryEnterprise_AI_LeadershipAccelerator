/**
 * Phase 3 telemetry tests — pure / no DB.
 *
 * Coverage:
 *   - manifest shape validation (Zod)
 *   - secret leak detection
 *   - conflict resolution
 *   - freshness scoring
 *   - graph augmentation
 *   - database map building
 *   - ui map building
 *   - snapshot retention deletion logic
 */
import { validateManifestShape } from '../telemetry/manifestValidator';
import { resolveManifests } from '../telemetry/telemetryConflictResolver';
import { scoreFreshnessFromAges, classifyAge } from '../telemetry/telemetryFreshnessMonitor';
import { augmentGraphFromManifests } from '../telemetry/graphSynchronizer';
import { buildDatabaseMapFromManifests } from '../telemetry/databaseSynchronizer';
import { buildUIMapFromManifests } from '../telemetry/uiSynchronizer';
import { decideDeletions, DEFAULT_POLICY } from '../telemetry/snapshotRetentionSweeper';

// Zod 4 enforces RFC-compliant UUID format (version byte 1-8 at position 13,
// variant 8/9/a/b at position 17). Use real-looking v4 UUIDs.
const VALID_PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const VALID_BP_ID =      '22222222-2222-4222-8222-222222222222';
const VALID_TASK_ID =    '33333333-3333-4333-8333-333333333333';

function validManifest(overrides: Record<string, any> = {}) {
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
// manifestValidator
// ---------------------------------------------------------------------------

describe('validateManifestShape', () => {
  it('accepts a minimally valid manifest', () => {
    const out = validateManifestShape(validManifest());
    expect(out.ok).toBe(true);
  });

  it('rejects when manifest_version is wrong', () => {
    const out = validateManifestShape(validManifest({ manifest_version: '2.0' }));
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.errors.some(e => e.path.includes('manifest_version'))).toBe(true);
    }
  });

  it('rejects when project_id is not a UUID', () => {
    const out = validateManifestShape(validManifest({ project_id: 'not-a-uuid' }));
    expect(out.ok).toBe(false);
  });

  it('rejects when execution_timestamp is not ISO-8601', () => {
    const out = validateManifestShape(validManifest({ execution_timestamp: 'yesterday' }));
    expect(out.ok).toBe(false);
  });

  it('rejects file paths with leading slash', () => {
    const out = validateManifestShape(validManifest({ files_created: ['/etc/passwd'] }));
    expect(out.ok).toBe(false);
  });

  it('rejects file paths with traversal', () => {
    const out = validateManifestShape(validManifest({ files_modified: ['../../secret.env'] }));
    expect(out.ok).toBe(false);
  });

  it('rejects manifests containing OpenAI keys', () => {
    const out = validateManifestShape(validManifest({
      database_changes: [{ table: 'users', operation: 'add_column', details: 'set OPENAI_API_KEY=sk-AAAAAAAAAAAAAAAAAAAAAAAA' }],
    }));
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.errors.some(e => e.code === 'secret_in_manifest')).toBe(true);
    }
  });

  it('accepts a fully populated valid manifest', () => {
    const out = validateManifestShape(validManifest({
      files_created: ['backend/src/services/x.ts'],
      apis_added: [{ method: 'GET', path: '/api/x', handler_file: 'backend/src/routes/x.ts' }],
      frontend_routes_added: [{ route: '/x' }],
      ui_components_added: [{ name: 'XList', file: 'frontend/src/components/XList.tsx', category: 'widget' }],
      database_changes: [{ table: 'x', operation: 'create_table' }],
      tests_added: [{ file: 'backend/src/__tests__/x.test.ts', type: 'unit' }],
      validation_results: [{ check: 'tsc', status: 'pass' }],
      dependencies_added: [{ name: 'foo', version: '1.2.3', scope: 'runtime' }],
    }));
    expect(out.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resolveManifests
// ---------------------------------------------------------------------------

describe('resolveManifests', () => {
  it('returns empty state for empty input', () => {
    const out = resolveManifests([]);
    expect(out.files.size).toBe(0);
    expect(out.conflicts.length).toBe(0);
  });

  it('merges files from multiple manifests in timestamp order', () => {
    const a = { ...validManifest({ execution_timestamp: '2026-05-01T10:00:00Z', files_created: ['a.ts'] }), id: 'a' };
    const b = { ...validManifest({ execution_timestamp: '2026-05-02T10:00:00Z', files_created: ['b.ts'] }), id: 'b' };
    const out = resolveManifests([b as any, a as any]);   // pass out-of-order on purpose
    expect(out.files.has('a.ts')).toBe(true);
    expect(out.files.has('b.ts')).toBe(true);
    expect(out.conflicts.length).toBe(0);
  });

  it('removes a file when a later manifest deletes it', () => {
    const a = { ...validManifest({ execution_timestamp: '2026-05-01T10:00:00Z', files_created: ['a.ts'] }), id: 'a' };
    const b = { ...validManifest({ execution_timestamp: '2026-05-02T10:00:00Z', files_deleted: ['a.ts'] }), id: 'b' };
    const out = resolveManifests([a as any, b as any]);
    expect(out.files.has('a.ts')).toBe(false);
  });

  it('flags re-creation after deletion as conflict', () => {
    const a = { ...validManifest({ execution_timestamp: '2026-05-01T10:00:00Z', files_created: ['a.ts'] }), id: 'a' };
    const b = { ...validManifest({ execution_timestamp: '2026-05-02T10:00:00Z', files_deleted: ['a.ts'] }), id: 'b' };
    const c = { ...validManifest({ execution_timestamp: '2026-05-03T10:00:00Z', files_created: ['a.ts'] }), id: 'c' };
    const out = resolveManifests([a as any, b as any, c as any]);
    expect(out.files.has('a.ts')).toBe(true);
    expect(out.conflicts.length).toBeGreaterThan(0);
  });

  it('flags modification of a never-created file as conflict', () => {
    const a = { ...validManifest({ execution_timestamp: '2026-05-01T10:00:00Z', files_modified: ['ghost.ts'] }), id: 'a' };
    const out = resolveManifests([a as any]);
    expect(out.conflicts.some(c => c.file === 'ghost.ts')).toBe(true);
  });

  it('aggregates APIs and components without duplicates', () => {
    const a = { ...validManifest({ execution_timestamp: '2026-05-01T10:00:00Z', apis_added: [{ method: 'GET', path: '/x' }], ui_components_added: [{ name: 'X', file: 'X.tsx' }] }), id: 'a' };
    const b = { ...validManifest({ execution_timestamp: '2026-05-02T10:00:00Z', apis_added: [{ method: 'GET', path: '/x' }, { method: 'POST', path: '/y' }] }), id: 'b' };
    const out = resolveManifests([a as any, b as any]);
    expect(out.apis.size).toBe(2);
    expect(out.apis.has('GET /x')).toBe(true);
    expect(out.apis.has('POST /y')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// telemetryFreshnessMonitor
// ---------------------------------------------------------------------------

describe('telemetryFreshnessMonitor', () => {
  it('returns 0 score when no manifests', () => {
    const r = scoreFreshnessFromAges([]);
    expect(r.score).toBe(0);
    expect(r.total).toBe(0);
  });

  it('classifies fresh < aging < stale < expired', () => {
    expect(classifyAge(60 * 60 * 1000)).toBe('fresh');
    expect(classifyAge(3 * 24 * 60 * 60 * 1000)).toBe('aging');
    expect(classifyAge(15 * 24 * 60 * 60 * 1000)).toBe('stale');
    expect(classifyAge(60 * 24 * 60 * 60 * 1000)).toBe('expired');
  });

  it('all-fresh manifests produce score 100', () => {
    const r = scoreFreshnessFromAges([1000, 2000, 3000]);
    expect(r.score).toBe(100);
    expect(r.fresh).toBe(3);
  });

  it('all-expired manifests produce score 0', () => {
    const veryOld = 365 * 24 * 60 * 60 * 1000;
    const r = scoreFreshnessFromAges([veryOld, veryOld, veryOld]);
    expect(r.score).toBe(0);
    expect(r.expired).toBe(3);
  });

  it('mixed bag yields a weighted score', () => {
    const fresh = 60 * 60 * 1000;
    const aging = 3 * 24 * 60 * 60 * 1000;
    const r = scoreFreshnessFromAges([fresh, aging]);
    // (1 + 0.7) / 2 = 0.85 -> 85
    expect(r.score).toBe(85);
  });
});

// ---------------------------------------------------------------------------
// graphSynchronizer
// ---------------------------------------------------------------------------

describe('augmentGraphFromManifests', () => {
  const baseGraph = {
    nodes: [
      { id: 'proj:1', type: 'project' as const, label: 'P', metadata: {} },
      { id: `bp:${VALID_BP_ID}`, type: 'bp' as const, label: 'BP1', metadata: {} },
    ],
    edges: [{ from: `bp:${VALID_BP_ID}`, to: 'proj:1', relation: 'contains' }],
  };

  it('returns base graph when no manifests', () => {
    const out = augmentGraphFromManifests({ base: baseGraph, manifests: [], projectId: VALID_PROJECT_ID });
    expect(out.nodes.length).toBe(2);
  });

  it('adds api/ui/db/test nodes from a manifest', () => {
    const m = { ...validManifest({
      apis_added: [{ method: 'GET', path: '/x' }],
      ui_components_added: [{ name: 'X', file: 'X.tsx' }],
      database_changes: [{ table: 'users', operation: 'create_table' }],
      tests_added: [{ file: 'x.test.ts', type: 'unit' }],
    }), id: 'm1' };
    const out = augmentGraphFromManifests({ base: baseGraph, manifests: [m as any], projectId: VALID_PROJECT_ID });
    expect(out.nodes.some(n => n.type === 'api')).toBe(true);
    expect(out.nodes.some(n => n.type === 'ui_component')).toBe(true);
    expect(out.nodes.some(n => n.type === 'database_object')).toBe(true);
    expect(out.nodes.some(n => n.type === 'test')).toBe(true);
  });

  it('adds edges from telemetry nodes back to BP', () => {
    const m = { ...validManifest({ apis_added: [{ method: 'GET', path: '/x' }] }), id: 'm1' };
    const out = augmentGraphFromManifests({ base: baseGraph, manifests: [m as any], projectId: VALID_PROJECT_ID });
    expect(out.edges.some(e => e.from === 'api:GET /x' && e.to === `bp:${VALID_BP_ID}`)).toBe(true);
  });

  it('marks manifest-sourced nodes with source=manifest', () => {
    const m = { ...validManifest({ apis_added: [{ method: 'GET', path: '/x' }] }), id: 'm1' };
    const out = augmentGraphFromManifests({ base: baseGraph, manifests: [m as any], projectId: VALID_PROJECT_ID });
    const apiNode = out.nodes.find(n => n.id === 'api:GET /x');
    expect((apiNode?.metadata as any)?.source).toBe('manifest');
  });
});

// ---------------------------------------------------------------------------
// databaseSynchronizer
// ---------------------------------------------------------------------------

describe('buildDatabaseMapFromManifests', () => {
  it('returns empty map when no manifests', () => {
    const m = buildDatabaseMapFromManifests(VALID_PROJECT_ID, []);
    expect(m.tables.length).toBe(0);
    expect(m.orphan_tables.length).toBe(0);
  });

  it('adds tables from create_table changes', () => {
    const manifest = { ...validManifest({
      database_changes: [{ table: 'users', operation: 'create_table' }],
    }), id: 'm1' };
    const m = buildDatabaseMapFromManifests(VALID_PROJECT_ID, [manifest as any]);
    expect(m.tables.length).toBe(1);
    expect(m.tables[0].name).toBe('users');
  });

  it('removes tables from drop_table changes', () => {
    const a = { ...validManifest({ execution_timestamp: '2026-05-01T10:00:00Z', database_changes: [{ table: 'tmp', operation: 'create_table' }] }), id: 'a' };
    const b = { ...validManifest({ execution_timestamp: '2026-05-02T10:00:00Z', database_changes: [{ table: 'tmp', operation: 'drop_table' }] }), id: 'b' };
    const m = buildDatabaseMapFromManifests(VALID_PROJECT_ID, [a as any, b as any]);
    expect(m.tables.find(t => t.name === 'tmp')).toBeUndefined();
  });

  it('reports orphan_tables for tables with no consumers', () => {
    const manifest = { ...validManifest({
      bp_id: null,
      database_changes: [{ table: 'lonely', operation: 'create_table' }],
    }), id: 'm1' };
    const m = buildDatabaseMapFromManifests(VALID_PROJECT_ID, [manifest as any]);
    expect(m.orphan_tables.length).toBe(1);
    expect(m.orphan_tables[0].name).toBe('lonely');
  });

  it('records BPs and APIs as consumers', () => {
    const manifest = { ...validManifest({
      bp_id: VALID_BP_ID,
      database_changes: [{ table: 'users', operation: 'create_table' }],
      apis_added: [{ method: 'GET', path: '/api/users' }],
    }), id: 'm1' };
    const m = buildDatabaseMapFromManifests(VALID_PROJECT_ID, [manifest as any]);
    expect(m.tables[0].consumers?.bps).toContain(VALID_BP_ID);
    expect(m.tables[0].consumers?.apis).toContain('GET /api/users');
  });
});

// ---------------------------------------------------------------------------
// uiSynchronizer
// ---------------------------------------------------------------------------

describe('buildUIMapFromManifests', () => {
  it('returns empty map when no manifests', () => {
    const m = buildUIMapFromManifests(VALID_PROJECT_ID, []);
    expect(m.pages.length).toBe(0);
    expect(m.components.length).toBe(0);
  });

  it('extracts pages from frontend_routes_added', () => {
    const manifest = { ...validManifest({
      frontend_routes_added: [{ route: '/admin/dashboard', component_file: 'frontend/src/pages/admin/Dashboard.tsx' }],
    }), id: 'm1' };
    const m = buildUIMapFromManifests(VALID_PROJECT_ID, [manifest as any]);
    expect(m.pages.length).toBe(1);
    expect(m.pages[0].route).toBe('/admin/dashboard');
    expect(m.pages[0].category).toBe('admin');
  });

  it('extracts components from ui_components_added', () => {
    const manifest = { ...validManifest({
      ui_components_added: [{ name: 'XList', file: 'frontend/src/components/XList.tsx', category: 'widget' }],
    }), id: 'm1' };
    const m = buildUIMapFromManifests(VALID_PROJECT_ID, [manifest as any]);
    expect(m.components.length).toBe(1);
    expect(m.components[0].name).toBe('XList');
  });

  it('infers public/admin/portal categories from route prefix', () => {
    const manifest = { ...validManifest({
      frontend_routes_added: [
        { route: '/admin/x' },
        { route: '/portal/y' },
        { route: '/about' },
      ],
    }), id: 'm1' };
    const m = buildUIMapFromManifests(VALID_PROJECT_ID, [manifest as any]);
    const byRoute = (r: string) => m.pages.find(p => p.route === r);
    expect(byRoute('/admin/x')?.category).toBe('admin');
    expect(byRoute('/portal/y')?.category).toBe('portal');
    expect(byRoute('/about')?.category).toBe('public');
  });
});

// ---------------------------------------------------------------------------
// snapshotRetentionSweeper
// ---------------------------------------------------------------------------

describe('decideDeletions', () => {
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;

  it('deletes nothing when all snapshots are recent', () => {
    const now = Date.now();
    const snaps = [0, 1, 2, 3].map(i => ({
      id: `s${i}`,
      project_id: 'p',
      generated_at: new Date(now - i * HOUR),
    }));
    expect(decideDeletions(snaps, now).length).toBe(0);
  });

  it('keeps one per hour for snapshots aged 1d–7d', () => {
    // Pin `now` to a value where ts and ts+5min are guaranteed to be in
    // the SAME hour bucket. Pick a `now` whose minutes are 0–54 so adding
    // 5 minutes 3 days ago doesn't cross an hour boundary.
    const baseNow = Date.now();
    const cur = new Date(baseNow);
    cur.setMinutes(30, 0, 0);   // pin to :30:00 — adding 5min stays inside the hour
    const now = cur.getTime();
    const ts = now - 3 * DAY;
    const snaps = [
      { id: 'a', project_id: 'p', generated_at: new Date(ts) },
      { id: 'b', project_id: 'p', generated_at: new Date(ts + 5 * 60 * 1000) },
    ];
    const dels = decideDeletions(snaps, now);
    expect(dels.length).toBe(1);    // one of the two same-hour entries dropped
  });

  it('keeps one per day for snapshots aged 7d–90d', () => {
    // Pin `now` to noon UTC so the 3 hourly offsets all stay inside the
    // same UTC day bucket (avoids wall-clock-flap when 2h offset crosses
    // a midnight boundary).
    const cur = new Date();
    cur.setUTCHours(12, 0, 0, 0);
    const now = cur.getTime();
    const ts = now - 30 * DAY;
    const snaps = [
      { id: 'a', project_id: 'p', generated_at: new Date(ts) },
      { id: 'b', project_id: 'p', generated_at: new Date(ts + HOUR) },
      { id: 'c', project_id: 'p', generated_at: new Date(ts + 2 * HOUR) },
    ];
    const dels = decideDeletions(snaps, now);
    expect(dels.length).toBe(2);    // keep newest, drop the other two same-day
  });

  it('drops everything older than dailyDetailMs', () => {
    const now = Date.now();
    const veryOld = now - 200 * DAY;
    const snaps = [
      { id: 'a', project_id: 'p', generated_at: new Date(veryOld) },
      { id: 'b', project_id: 'p', generated_at: new Date(veryOld - DAY) },
    ];
    expect(decideDeletions(snaps, now, DEFAULT_POLICY).length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Phase 3 explainability — extended decision_trace shape
// ---------------------------------------------------------------------------

import { buildAuthoritativeStateFromInputs } from '../systemStateEngine';

describe('decision_trace (Phase 3 explainability extensions)', () => {
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
      linked_backend_services: ['a.ts'],
      linked_frontend_components: [],
      linked_agents: [],
      ui_element_map: null,
      total_requirements: 5,
      matched_requirements: 2,
      verified_requirements: 0,
      ...overrides,
    };
  }

  it('every per-cap task carries the new explainability fields', () => {
    const cap = mkCap();
    const state = buildAuthoritativeStateFromInputs({
      project: { id: 'proj-1', target_mode: 'production', setup_status: {}, capabilities: [cap], repo_file_tree: [], latest_commit_sha: null },
      capabilities: [cap],
    });
    const perCap = state.queue.find(t => t.bp_id === cap.id);
    expect(perCap).toBeTruthy();
    const trace = perCap?.decision_trace as any;
    expect(trace?.score_breakdown).toBeDefined();
    expect(typeof trace?.score_breakdown?.priority).toBe('number');
    expect(trace?.dependency_chain).toBeDefined();
    expect(trace?.expected_outcomes).toBeDefined();
    expect(trace?.projected_maturity_gain).toBeDefined();
    expect(trace?.affected_systems).toBeDefined();
    expect(trace?.telemetry_sources_used).toBeDefined();
  });

  it('projected_maturity_gain.delta is non-negative', () => {
    const cap = mkCap();
    const state = buildAuthoritativeStateFromInputs({
      project: { id: 'proj-1', target_mode: 'production', setup_status: {}, capabilities: [cap], repo_file_tree: [], latest_commit_sha: null },
      capabilities: [cap],
    });
    const perCap = state.queue.find(t => t.bp_id === cap.id);
    const trace = perCap?.decision_trace as any;
    expect(trace?.projected_maturity_gain?.delta).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// syncHealth — Phase 3 telemetry dimensions
// ---------------------------------------------------------------------------

import { scoreSyncHealth } from '../scoring/syncHealthScorer';

describe('scoreSyncHealth (Phase 3 telemetry dimensions)', () => {
  const baseProject = {
    id: 'proj-1',
    target_mode: 'production',
    setup_status: {},
    capabilities: [],
    repo_file_tree: ['package.json'],
    latest_commit_sha: null,
  } as any;

  it('telemetry dimensions default to 100 (no penalty) when no telemetry input given', () => {
    const result = scoreSyncHealth({
      project: baseProject,
      capabilities: [],
      contradictions: [],
      lastSyncAt: new Date(),
    });
    expect(result.dimensions.manifest_freshness).toBe(100);
    expect(result.dimensions.missing_build_manifests).toBe(100);
    expect(result.dimensions.conflicting_manifests).toBe(100);
  });

  it('manifest freshness drops when telemetry score is low', () => {
    const result = scoreSyncHealth({
      project: baseProject,
      capabilities: [],
      contradictions: [],
      lastSyncAt: new Date(),
      telemetry: { manifest_freshness: 30 },
    });
    expect(result.dimensions.manifest_freshness).toBe(30);
  });

  it('missing_build_manifests reflects bp coverage ratio', () => {
    const result = scoreSyncHealth({
      project: baseProject,
      capabilities: [],
      contradictions: [],
      lastSyncAt: new Date(),
      telemetry: { bps_with_manifest: 1, bps_total: 4 },
    });
    expect(result.dimensions.missing_build_manifests).toBe(25);
  });

  it('conflicting_manifests penalizes per-conflict', () => {
    const result = scoreSyncHealth({
      project: baseProject,
      capabilities: [],
      contradictions: [],
      lastSyncAt: new Date(),
      telemetry: { conflict_count: 3 },
    });
    expect(result.dimensions.conflicting_manifests).toBe(76);   // 100 - 3*8
  });
});
