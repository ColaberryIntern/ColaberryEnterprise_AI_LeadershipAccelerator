/**
 * The honest health verdict.
 *
 * The bug these tests exist to prevent: for 9,366 consecutive cycles
 * ContentEngineSuperAgent reported 'periodic' / "All agents operating within
 * normal parameters" for a department (content_engine) that has zero rows in
 * ai_agents, and the identical report would have been written if the database
 * query had thrown. 'healthy' was the ELSE branch of "no anomalies", and "no
 * anomalies" was what you got when you could not look.
 *
 * So the central assertion in this file is not "degraded is detected". It is
 * that the reassuring sentence is reachable from exactly one state, and that
 * 'unknown' is never confusable with 'healthy'.
 */
import {
  evaluateGroupHealth,
  detectAnomalies,
  generateRecommendations,
  HEALTHY_RECOMMENDATION,
  type SubordinateStatus,
  type StatusCollection,
} from '../superAgentHealth';

const NOW = Date.parse('2026-10-06T12:00:00.000Z');
const ONE_HOUR = 60 * 60 * 1000;

function sub(overrides: Partial<SubordinateStatus> = {}): SubordinateStatus {
  return {
    agent_name: 'AgentA',
    status: 'idle',
    enabled: true,
    last_run_at: new Date(NOW - 60_000),
    error_count: 0,
    run_count: 20,
    avg_duration_ms: 1200,
    last_error: null,
    ...overrides,
  };
}

const ok = (subordinates: SubordinateStatus[]): StatusCollection => ({ ok: true, subordinates });

// ---------------------------------------------------------------------------
// Rule 1 - a failed collection is its own verdict
// ---------------------------------------------------------------------------

describe('rule 1 - collection failure is never mistaken for health', () => {
  const failed: StatusCollection = {
    ok: false,
    errorClass: 'UpstreamUnavailable',
    message: 'connect ECONNREFUSED 127.0.0.1:5432',
  };

  it('returns unknown, not healthy, when the status query failed', () => {
    const v = evaluateGroupHealth(failed, NOW);
    expect(v.health).toBe('unknown');
    expect(v.health).not.toBe('healthy');
  });

  it('names the error_class in the anomaly so the report says why it is blind', () => {
    const v = evaluateGroupHealth(failed, NOW);
    expect(v.anomalies).toHaveLength(1);
    expect(v.anomalies[0]).toContain('UpstreamUnavailable');
    expect(v.anomalies[0]).toContain('connect ECONNREFUSED 127.0.0.1:5432');
    expect(v.anomalies[0]).toMatch(/could not be determined/);
  });

  it('raises an alert rather than a routine periodic report', () => {
    expect(evaluateGroupHealth(failed, NOW).report_type).toBe('alert');
  });

  it('produces a verdict distinguishable from a genuinely healthy department', () => {
    const blind = evaluateGroupHealth(failed, NOW);
    const fine = evaluateGroupHealth(ok([sub(), sub({ agent_name: 'AgentB' })]), NOW);
    expect(blind).not.toEqual(fine);
    expect(blind.health).not.toBe(fine.health);
    expect(blind.report_type).not.toBe(fine.report_type);
  });

  it('carries whatever error_class the classifier produced, including the fallback', () => {
    const v = evaluateGroupHealth({ ok: false, errorClass: 'UnknownError', message: 'boom' }, NOW);
    expect(v.anomalies[0]).toContain('UnknownError');
    expect(v.recommendations[0]).toContain('UnknownError');
  });
});

// ---------------------------------------------------------------------------
// Rule 2 - a supervisor of nothing certifies nothing
// ---------------------------------------------------------------------------

describe('rule 2 - an empty department is unknown, not healthy', () => {
  it('is unknown and alerts', () => {
    const v = evaluateGroupHealth(ok([]), NOW);
    expect(v.health).toBe('unknown');
    expect(v.report_type).toBe('alert');
  });

  it('says plainly that there are no registered agents', () => {
    const v = evaluateGroupHealth(ok([]), NOW);
    expect(v.anomalies).toEqual([
      'Department has no registered agents, so its health cannot be determined',
    ]);
  });

  it('is the content_engine case: zero rows no longer reads as all clear', () => {
    // content_engine has never had a row in ai_agents. Pre-fix this produced
    // anomalies: [] -> report_type 'periodic' -> briefing 'healthy'.
    const v = evaluateGroupHealth(ok([]), NOW);
    expect(v.anomalies.length).toBeGreaterThan(0);
    expect(v.report_type).not.toBe('periodic');
  });
});

// ---------------------------------------------------------------------------
// Rule 3 - members but nothing enabled
// ---------------------------------------------------------------------------

describe('rule 3 - a department with nothing enabled is degraded at any size', () => {
  it('flags a department of one, which the old >2-member floor excused', () => {
    const v = evaluateGroupHealth(ok([sub({ enabled: false, run_count: 0 })]), NOW);
    expect(v.health).toBe('degraded');
    expect(v.anomalies).toContain('All 1 agent(s) in this department are disabled - no work can run here');
  });

  it('flags a larger all-disabled department too', () => {
    const v = evaluateGroupHealth(
      ok([
        sub({ agent_name: 'A', enabled: false, run_count: 0 }),
        sub({ agent_name: 'B', enabled: false, run_count: 0 }),
        sub({ agent_name: 'C', enabled: false, run_count: 0 }),
      ]),
      NOW,
    );
    expect(v.health).toBe('degraded');
    expect(v.anomalies).toContain('All 3 agent(s) in this department are disabled - no work can run here');
  });

  it('does not fire while at least one agent is enabled', () => {
    const v = evaluateGroupHealth(
      ok([sub({ agent_name: 'A' }), sub({ agent_name: 'B', enabled: false, run_count: 0 })]),
      NOW,
    );
    expect(v.anomalies.some(a => a.includes('are disabled - no work can run here'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rule 4 - disabling something broken must not silence it
// ---------------------------------------------------------------------------

describe('rule 4 - a disabled agent that used to work is still reported', () => {
  it('names the last run of a disabled agent with history', () => {
    // The Finance / Partnerships shape: one subordinate, last ran 2026-08-24,
    // then disabled. Alerts stopped that very day.
    const v = evaluateGroupHealth(
      ok([
        sub({
          agent_name: 'FinanceReconciliationAgent',
          enabled: false,
          run_count: 412,
          last_run_at: new Date('2026-08-24T06:30:00.000Z'),
        }),
      ]),
      NOW,
    );
    expect(v.health).toBe('degraded');
    expect(v.anomalies).toContain(
      'FinanceReconciliationAgent is disabled after 412 run(s) - last ran 2026-08-24T06:30:00.000Z',
    );
  });

  it('says so explicitly when a disabled agent never recorded a run', () => {
    const v = evaluateGroupHealth(
      ok([sub({ agent_name: 'A' }), sub({ agent_name: 'B', enabled: false, run_count: 3, last_run_at: null })]),
      NOW,
    );
    expect(v.anomalies).toContain('B is disabled after 3 run(s) - never recorded a run');
  });

  it('leaves a never-run disabled agent alone (parked, not broken)', () => {
    const v = evaluateGroupHealth(
      ok([sub({ agent_name: 'A' }), sub({ agent_name: 'B', enabled: false, run_count: 0 })]),
      NOW,
    );
    expect(v.anomalies.some(a => a.includes('is disabled after'))).toBe(false);
  });

  it('KEEPS the pre-existing staleness rule for enabled agents (added, not replaced)', () => {
    const v = evaluateGroupHealth(
      ok([sub({ agent_name: 'Stale', last_run_at: new Date(NOW - ONE_HOUR - 1) })]),
      NOW,
    );
    expect(v.anomalies).toContain('Stale has not run in over 1 hour');
  });

  it('reports a stale enabled agent and a disabled-with-history agent in the same cycle', () => {
    const v = evaluateGroupHealth(
      ok([
        sub({ agent_name: 'Stale', last_run_at: new Date(NOW - 3 * ONE_HOUR) }),
        sub({ agent_name: 'Switched', enabled: false, run_count: 9, last_run_at: new Date(NOW - 5 * ONE_HOUR) }),
      ]),
      NOW,
    );
    expect(v.anomalies).toContain('Stale has not run in over 1 hour');
    expect(v.anomalies.some(a => a.startsWith('Switched is disabled after 9 run(s)'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Rule 5 - the >50%-disabled recommendation reaches small departments
// ---------------------------------------------------------------------------

describe('rule 5 - half-disabled recommendation, without double-reporting', () => {
  const half = (health: 'healthy' | 'degraded' | 'unknown', subs: SubordinateStatus[]) =>
    generateRecommendations(detectAnomalies(subs, NOW), subs, health);

  it('fires for a department of two with one disabled (impossible before)', () => {
    const subs = [sub({ agent_name: 'A' }), sub({ agent_name: 'B', enabled: false, run_count: 0 })];
    expect(half('degraded', subs)).toContain(
      '1 of 2 department agents are disabled - review if intentional',
    );
  });

  it('fires for a department of four with two disabled', () => {
    const subs = [
      sub({ agent_name: 'A' }),
      sub({ agent_name: 'B' }),
      sub({ agent_name: 'C', enabled: false, run_count: 0 }),
      sub({ agent_name: 'D', enabled: false, run_count: 0 }),
    ];
    expect(half('degraded', subs)).toContain(
      '2 of 4 department agents are disabled - review if intentional',
    );
  });

  it('stays quiet below half', () => {
    const subs = [
      sub({ agent_name: 'A' }),
      sub({ agent_name: 'B' }),
      sub({ agent_name: 'C', enabled: false, run_count: 0 }),
    ];
    expect(half('degraded', subs).some(r => r.includes('review if intentional'))).toBe(false);
  });

  it('does not double-report the all-disabled case', () => {
    const subs = [sub({ agent_name: 'A', enabled: false, run_count: 0 })];
    const recs = half('degraded', subs);
    const disabledLines = recs.filter(r => /disabled/.test(r));
    expect(disabledLines).toHaveLength(1);
    expect(disabledLines[0]).toBe(
      'Re-enable or formally retire the 1 disabled agent(s) in this department',
    );
  });

  it('says nothing when nothing is disabled', () => {
    const subs = [sub({ agent_name: 'A' }), sub({ agent_name: 'B' })];
    expect(half('healthy', subs).some(r => /disabled/.test(r))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rule 6 - THE INVARIANT
// ---------------------------------------------------------------------------

describe('rule 6 - the all-clear sentence is reachable from exactly one state', () => {
  const battery: Array<{ name: string; collection: StatusCollection }> = [
    {
      name: 'database query threw',
      collection: { ok: false, errorClass: 'UpstreamUnavailable', message: 'ECONNREFUSED' },
    },
    { name: 'timeout', collection: { ok: false, errorClass: 'TimeoutError', message: 'query timed out' } },
    { name: 'zero registered agents', collection: ok([]) },
    { name: 'one member, disabled, never ran', collection: ok([sub({ enabled: false, run_count: 0 })]) },
    {
      name: 'one member, disabled after running',
      collection: ok([sub({ enabled: false, run_count: 412, last_run_at: new Date(NOW - 40 * 24 * ONE_HOUR) })]),
    },
    {
      name: 'all three disabled',
      collection: ok([
        sub({ agent_name: 'A', enabled: false, run_count: 0 }),
        sub({ agent_name: 'B', enabled: false, run_count: 0 }),
        sub({ agent_name: 'C', enabled: false, run_count: 0 }),
      ]),
    },
    { name: 'an agent in error state', collection: ok([sub({ status: 'error', error_count: 2 })]) },
    { name: 'a stale enabled agent', collection: ok([sub({ last_run_at: new Date(NOW - 2 * ONE_HOUR) })]) },
    { name: 'a high error count', collection: ok([sub({ error_count: 5 })]) },
    { name: 'a high error rate', collection: ok([sub({ run_count: 10, error_count: 4 })]) },
    { name: 'a slow agent', collection: ok([sub({ avg_duration_ms: 30001 })]) },
    // Added with the routes they close. Every one of these states reached
    // 'healthy' and the all-clear sentence before.
    { name: 'an enabled agent paused by automated backoff', collection: ok([sub({ status: 'paused' })]) },
    { name: 'an enabled agent with a status outside the union', collection: ok([sub({ status: 'crashed' })]) },
    { name: 'an enabled agent that has never run', collection: ok([sub({ run_count: 0, last_run_at: null })]) },
    { name: 'every recorded run errored', collection: ok([sub({ run_count: 4, error_count: 4 })]) },
    {
      name: 'an unreadable row beside a working one',
      collection: ok([sub({ agent_name: 'A' }), null as unknown as SubordinateStatus]),
    },
    {
      name: 'a subordinate list that is not an array',
      collection: { ok: true, subordinates: null } as unknown as StatusCollection,
    },
    { name: 'not a status result at all', collection: undefined as unknown as StatusCollection },
  ];

  it.each(battery)('withholds the all-clear when $name', ({ collection }) => {
    const v = evaluateGroupHealth(collection, NOW);
    expect(v.health).not.toBe('healthy');
    expect(v.recommendations).not.toContain(HEALTHY_RECOMMENDATION);
    expect(v.report_type).toBe('alert');
  });

  it('emits the all-clear for a healthy multi-member department', () => {
    const v = evaluateGroupHealth(
      ok([sub({ agent_name: 'A' }), sub({ agent_name: 'B', status: 'running' }), sub({ agent_name: 'C' })]),
      NOW,
    );
    expect(v.health).toBe('healthy');
    expect(v.anomalies).toEqual([]);
    expect(v.recommendations).toEqual([HEALTHY_RECOMMENDATION]);
    expect(v.report_type).toBe('periodic');
  });

  it('ties the sentence to health === healthy across every case, in both directions', () => {
    const healthyCase: StatusCollection = ok([sub({ agent_name: 'A' }), sub({ agent_name: 'B' })]);
    for (const { name, collection } of [...battery, { name: 'healthy', collection: healthyCase }]) {
      const v = evaluateGroupHealth(collection, NOW);
      expect({ case: name, allClear: v.recommendations.includes(HEALTHY_RECOMMENDATION) }).toEqual({
        case: name,
        allClear: v.health === 'healthy',
      });
    }
  });

  it('never emits the sentence on an empty group, whatever the anomaly count says', () => {
    // generateRecommendations([], []) was the literal line that produced the
    // false all-clear 9,366 times.
    expect(generateRecommendations([], [], 'unknown')).not.toContain(HEALTHY_RECOMMENDATION);
  });

  // The gate itself, tested directly rather than through evaluateGroupHealth.
  //
  // Inside evaluateGroupHealth an empty anomaly list and health 'healthy'
  // always coincide, so a test that only drives the verdict cannot tell
  // `health === 'healthy'` apart from the old `anomalies.length === 0`. This
  // matrix separates the two: the sentence must track the HEALTH ARGUMENT and
  // nothing else, in both directions.
  describe('the gate tracks health and not the anomaly count', () => {
    const shapes: Array<[string, SubordinateStatus[]]> = [
      ['no members', []],
      ['one enabled', [sub({ agent_name: 'A' })]],
      ['one disabled', [sub({ agent_name: 'A', enabled: false, run_count: 4 })]],
      ['mixed', [sub({ agent_name: 'A' }), sub({ agent_name: 'B', enabled: false, run_count: 4 })]],
      ['errored', [sub({ agent_name: 'A', status: 'error', error_count: 3 })]],
    ];
    const anomalyLists: Array<[string, string[]]> = [
      ['no anomalies', []],
      ['one anomaly', ['A is in error state (3 errors)']],
      ['three anomalies', ['x', 'y', 'z']],
    ];
    const healths: Array<'healthy' | 'degraded' | 'unknown'> = ['healthy', 'degraded', 'unknown'];

    const matrix = healths.flatMap(health =>
      anomalyLists.flatMap(([anomalyLabel, anomalies]) =>
        shapes.map(([shapeLabel, subordinates]) => ({
          label: `health=${health} / ${anomalyLabel} / ${shapeLabel}`,
          health,
          anomalies,
          subordinates,
        })),
      ),
    );

    it.each(matrix)('$label', ({ health, anomalies, subordinates }) => {
      const recs = generateRecommendations(anomalies, subordinates, health);
      expect(recs.includes(HEALTHY_RECOMMENDATION)).toBe(health === 'healthy');
    });

    it('emits the sentence exactly once, never twice', () => {
      const recs = generateRecommendations([], [sub({ agent_name: 'A' })], 'healthy');
      expect(recs.filter(r => r === HEALTHY_RECOMMENDATION)).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
// Boundaries
// ---------------------------------------------------------------------------

describe('boundaries', () => {
  it('treats exactly one hour since the last run as not yet stale', () => {
    const atTheLine = detectAnomalies([sub({ last_run_at: new Date(NOW - ONE_HOUR) })], NOW);
    const oneMsOver = detectAnomalies([sub({ last_run_at: new Date(NOW - ONE_HOUR - 1) })], NOW);
    expect(atTheLine).toEqual([]);
    expect(oneMsOver).toContain('AgentA has not run in over 1 hour');
  });

  it('reports a never-run enabled agent as never-started rather than as stale', () => {
    // This assertion used to read `.toEqual([])`: the suite pinned a
    // registered, enabled agent with no runs on record as an intended
    // all-clear, which is the nearest neighbour of the bug this module exists
    // to kill. The two conditions stay distinct because their fixes differ -
    // "it ran and stopped" is a scheduler or crash problem, "it never started"
    // means it was probably never scheduled - so the never-run line must fire
    // and the staleness line must not.
    const anomalies = detectAnomalies([sub({ run_count: 0, last_run_at: new Date(NOW - 10 * ONE_HOUR) })], NOW);
    expect(anomalies).toContain(
      'AgentA is enabled but has never run (run_count 0) - it may never have been scheduled',
    );
    expect(anomalies).not.toContain('AgentA has not run in over 1 hour');
  });

  it('flags an error_count of exactly 5 and not of 4 at low rate', () => {
    expect(detectAnomalies([sub({ error_count: 5, run_count: 100 })], NOW)).toContain('AgentA has 5 errors');
    expect(detectAnomalies([sub({ error_count: 4, run_count: 100 })], NOW)).toEqual([]);
  });

  it('uses a strict 30s duration threshold', () => {
    expect(detectAnomalies([sub({ avg_duration_ms: 30000 })], NOW)).toEqual([]);
    expect(detectAnomalies([sub({ avg_duration_ms: 30001 })], NOW)).toContain(
      'AgentA avg duration 30.0s exceeds 30s threshold',
    );
  });

  it('reads an ISO string last_run_at as well as a Date', () => {
    const asString = {
      ...sub({ agent_name: 'S', enabled: false, run_count: 4 }),
      last_run_at: '2026-08-24T06:30:00.000Z' as unknown as Date,
    };
    expect(detectAnomalies([asString], NOW)).toContain(
      'S is disabled after 4 run(s) - last ran 2026-08-24T06:30:00.000Z',
    );
  });

  it('survives an unparseable last_run_at without claiming a run time', () => {
    const broken = {
      ...sub({ agent_name: 'B', enabled: false, run_count: 4 }),
      last_run_at: 'not-a-date' as unknown as Date,
    };
    expect(detectAnomalies([broken], NOW)).toContain('B is disabled after 4 run(s) - never recorded a run');
  });
});

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

describe('replay - the same inputs always yield the same verdict', () => {
  const cases: StatusCollection[] = [
    { ok: false, errorClass: 'TimeoutError', message: 'timed out' },
    ok([]),
    ok([sub({ enabled: false, run_count: 50, last_run_at: new Date(NOW - 80 * ONE_HOUR) })]),
    ok([sub({ agent_name: 'A' }), sub({ agent_name: 'B' })]),
    ok([sub({ agent_name: 'A', status: 'error', error_count: 7 }), sub({ agent_name: 'B' })]),
  ];

  it.each(cases.map((c, i) => [i, c] as const))('case %i is identical on a second evaluation', (_i, collection) => {
    const first = evaluateGroupHealth(collection, NOW);
    const second = evaluateGroupHealth(collection, NOW);
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('returns fresh arrays rather than shared mutable state', () => {
    const collection = ok([sub({ status: 'error', error_count: 9 })]);
    const first = evaluateGroupHealth(collection, NOW);
    first.anomalies.push('tampered');
    const second = evaluateGroupHealth(collection, NOW);
    expect(second.anomalies).not.toContain('tampered');
  });

  it('does not mutate the subordinate rows it was handed', () => {
    const subs = [sub({ agent_name: 'A', enabled: false, run_count: 3 }), sub({ agent_name: 'B' })];
    const before = JSON.stringify(subs);
    evaluateGroupHealth(ok(subs), NOW);
    evaluateGroupHealth(ok(subs), NOW);
    expect(JSON.stringify(subs)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Rule 7 - an enabled agent that is not in a running state
//
// The same defect as the `enabled` one, re-created through `status`. There is
// a live producer: intelligence/agents/ExecutionAgent.ts:74 applies backoff
// with `agent.update({ status: 'paused' })` and never clears `enabled`, and
// aiOpsService.ts:259 does the same for an operator clicking pause. The agent
// is still registered to run; only the field the rules were not reading moved.
// ---------------------------------------------------------------------------

describe('rule 7 - an enabled agent not in a running state is never certified', () => {
  it('refuses the enabled-and-paused row that automated backoff produces', () => {
    const v = evaluateGroupHealth(ok([sub({ agent_name: 'FinanceReconciliationAgent', status: 'paused' })]), NOW);
    expect(v.health).toBe('degraded');
    expect(v.health).not.toBe('healthy');
    expect(v.anomalies).toContain(
      "FinanceReconciliationAgent is enabled but its status is 'paused', which is not a running state - it is registered to run and is not running",
    );
    expect(v.recommendations).not.toContain(HEALTHY_RECOMMENDATION);
    expect(v.report_type).toBe('alert');
  });

  it('catches one paused agent inside an otherwise working department', () => {
    // No department-wide rule can see this: two of three agents are running
    // normally, so only a per-agent rule finds the third.
    const v = evaluateGroupHealth(
      ok([sub({ agent_name: 'A' }), sub({ agent_name: 'B', status: 'running' }), sub({ agent_name: 'P', status: 'paused' })]),
      NOW,
    );
    expect(v.health).toBe('degraded');
    expect(v.anomalies).toContain(
      "P is enabled but its status is 'paused', which is not a running state - it is registered to run and is not running",
    );
  });

  it('recommends resuming or formally disabling the stuck agent', () => {
    const v = evaluateGroupHealth(ok([sub({ agent_name: 'A' }), sub({ agent_name: 'P', status: 'paused' })]), NOW);
    expect(v.recommendations).toContain(
      'Resume or formally disable 1 enabled agent(s) in a non-running state: P',
    );
  });

  it('leaves a disabled paused agent to the disabled rules, with no second line', () => {
    const v = evaluateGroupHealth(
      ok([sub({ agent_name: 'A' }), sub({ agent_name: 'Parked', status: 'paused', enabled: false, run_count: 0 })]),
      NOW,
    );
    expect(v.anomalies.some(a => a.includes('Parked is enabled but'))).toBe(false);
  });

  it('keeps the errored agent on its own, more specific line', () => {
    // 'error' is also not a running state, but it already had a rule naming
    // the error count. It must not collect a second, vaguer line.
    const v = evaluateGroupHealth(ok([sub({ agent_name: 'E', status: 'error', error_count: 2 })]), NOW);
    expect(v.anomalies).toContain('E is in error state (2 errors)');
    expect(v.anomalies.some(a => a.includes('E is enabled but its status'))).toBe(false);
  });

  it.each(['crashed', 'stopped', 'STOPPED', 'Idle', 'idle ', ''])(
    'fails closed on the out-of-union status %p, which STRING(20) allows',
    status => {
      // ai_agents.status is DataTypes.STRING(20) with no enum and no CHECK, so
      // every one of these is storable, and every one used to take the same
      // path to 'healthy' as 'idle'.
      const v = evaluateGroupHealth(ok([sub({ agent_name: 'Odd', status })]), NOW);
      expect({ status, health: v.health }).toEqual({ status, health: 'degraded' });
      expect(v.recommendations).not.toContain(HEALTHY_RECOMMENDATION);
      expect(v.report_type).toBe('alert');
    },
  );

  it('names the unrecognised status without interpolating a bare undefined', () => {
    const v = evaluateGroupHealth(ok([sub({ agent_name: 'Odd', status: 'crashed' })]), NOW);
    expect(v.anomalies).toContain(
      "Odd reports status 'crashed', which is not a known agent status - its health cannot be determined",
    );

    const missing = evaluateGroupHealth(
      ok([{ ...sub({ agent_name: 'NoStatus' }), status: undefined as unknown as string }]),
      NOW,
    );
    expect(missing.anomalies).toContain(
      'NoStatus reports status (none recorded), which is not a known agent status - its health cannot be determined',
    );
    expect(missing.anomalies.join(' ')).not.toContain('undefined');
  });

  it('fails closed on an unrecognised status even when the agent is disabled', () => {
    // A string we do not understand is not a state we can read, whatever
    // `enabled` says about it.
    const v = evaluateGroupHealth(
      ok([sub({ agent_name: 'Odd', status: 'crashed', enabled: false, run_count: 0 })]),
      NOW,
    );
    expect(v.anomalies).toContain(
      "Odd reports status 'crashed', which is not a known agent status - its health cannot be determined",
    );
    expect(v.health).toBe('degraded');
  });

  it('still certifies the two statuses that do mean working', () => {
    // The point is not that every status is suspicious. 'idle' and 'running'
    // are the states the system operates in, and they still pass.
    const v = evaluateGroupHealth(
      ok([sub({ agent_name: 'A', status: 'idle' }), sub({ agent_name: 'B', status: 'running' })]),
      NOW,
    );
    expect(v.health).toBe('healthy');
    expect(v.anomalies).toEqual([]);
    expect(v.recommendations).toEqual([HEALTHY_RECOMMENDATION]);
  });
});

// ---------------------------------------------------------------------------
// Rule 8 - a total error rate is not excused by a small sample
// ---------------------------------------------------------------------------

describe('rule 8 - the run-count floor no longer hides a 100% failure rate', () => {
  it('flags 4 errors in 4 runs, which both old rules let through', () => {
    // error_count 4 was under HIGH_ERROR_COUNT (5) and run_count 4 was under
    // MIN_RUNS_FOR_RATE (5), so an agent that failed every one of its four
    // runs produced no finding at all and was certified healthy.
    const v = evaluateGroupHealth(ok([sub({ agent_name: 'Doomed', run_count: 4, error_count: 4 })]), NOW);
    expect(v.health).toBe('degraded');
    expect(v.anomalies).toContain('Doomed has never completed a run successfully (4 error(s) in 4 run(s))');
    expect(v.recommendations).not.toContain(HEALTHY_RECOMMENDATION);
  });

  it('flags a single run that errored', () => {
    expect(detectAnomalies([sub({ agent_name: 'One', run_count: 1, error_count: 1 })], NOW)).toContain(
      'One has never completed a run successfully (1 error(s) in 1 run(s))',
    );
  });

  it('flags a rate over the threshold below the old 5-run floor', () => {
    // Two of three runs failed. Not "every run", so it lands on the rate line,
    // which the floor used to silence.
    expect(detectAnomalies([sub({ agent_name: 'Flaky', run_count: 3, error_count: 2 })], NOW)).toContain(
      'Flaky has 67% error rate',
    );
  });

  it('reports the specific never-succeeded line instead of the generic rate line', () => {
    const anomalies = detectAnomalies([sub({ agent_name: 'Doomed', run_count: 4, error_count: 4 })], NOW);
    expect(anomalies.filter(a => a.includes('Doomed'))).toHaveLength(1);
    expect(anomalies.some(a => a.includes('100% error rate'))).toBe(false);
  });

  it('keeps the 30% threshold rather than flagging every stray error', () => {
    // Measured in production before removing the floor: of the 25 agents in a
    // supervised agent_group with errors, none has run_count < 5, and none has
    // a rate over 30%. Dropping the floor must not turn those into alerts.
    expect(detectAnomalies([sub({ run_count: 100, error_count: 4 })], NOW)).toEqual([]);
    expect(detectAnomalies([sub({ run_count: 10, error_count: 3 })], NOW)).toEqual([]);
  });

  it('leaves a never-run agent out of the error-rate arithmetic entirely', () => {
    // run_count 0 would be a divide-by-zero. It has its own rule.
    const anomalies = detectAnomalies([sub({ agent_name: 'Fresh', run_count: 0, error_count: 0 })], NOW);
    expect(anomalies.some(a => a.includes('error rate'))).toBe(false);
    expect(anomalies.some(a => a.includes('NaN') || a.includes('Infinity'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rule 9 - registered, enabled, and never run
// ---------------------------------------------------------------------------

describe('rule 9 - an enabled agent that has never run is not an all-clear', () => {
  it('is an anomaly in its own right', () => {
    const v = evaluateGroupHealth(
      ok([sub({ agent_name: 'WorkforceMarketingDirector', run_count: 0, last_run_at: null })]),
      NOW,
    );
    expect(v.health).toBe('degraded');
    expect(v.anomalies).toContain(
      'WorkforceMarketingDirector is enabled but has never run (run_count 0) - it may never have been scheduled',
    );
    expect(v.recommendations).not.toContain(HEALTHY_RECOMMENDATION);
    expect(v.report_type).toBe('alert');
  });

  it('is reported separately from staleness, which means something else', () => {
    const v = evaluateGroupHealth(
      ok([
        sub({ agent_name: 'NeverRan', run_count: 0, last_run_at: null }),
        sub({ agent_name: 'Stalled', run_count: 500, last_run_at: new Date(NOW - 3 * ONE_HOUR) }),
      ]),
      NOW,
    );
    expect(v.anomalies).toContain(
      'NeverRan is enabled but has never run (run_count 0) - it may never have been scheduled',
    );
    expect(v.anomalies).toContain('Stalled has not run in over 1 hour');
    expect(v.anomalies).not.toContain('NeverRan has not run in over 1 hour');
  });

  it('leaves a disabled never-run agent parked', () => {
    // Measured in production before this rule shipped: 0 ENABLED agents in a
    // supervised agent_group have run_count = 0, while 6 disabled ones do (all
    // in `admissions`). Flagging those would be six lines per cycle about
    // agents nobody expects to run.
    const v = evaluateGroupHealth(
      ok([sub({ agent_name: 'A' }), sub({ agent_name: 'Parked', enabled: false, run_count: 0 })]),
      NOW,
    );
    expect(v.anomalies.some(a => a.includes('Parked is enabled but has never run'))).toBe(false);
    expect(v.health).toBe('healthy');
  });
});

// ---------------------------------------------------------------------------
// Rule 10 - malformed input degrades, and never throws
//
// evaluateGroupHealth threw a TypeError on undefined, on {ok:true} with no
// subordinates, and on a null row. A throw here aborts runSuperAgentCycle
// before it writes anything, and no row at all is the one outcome worse than a
// wrong row: the next reader sees the department's last good report and has no
// way to know it is stale.
// ---------------------------------------------------------------------------

describe('rule 10 - unreadable input degrades to unknown without throwing', () => {
  const garbage: Array<[string, unknown]> = [
    ['undefined', undefined],
    ['null', null],
    ['a string', 'ok'],
    ['a number', 0],
    ['an array', []],
    ['a boolean', true],
  ];

  it.each(garbage)('degrades to unknown for %s', (_label, value) => {
    const run = () => evaluateGroupHealth(value as unknown as StatusCollection, NOW);
    expect(run).not.toThrow();
    const v = run();
    expect(v.health).toBe('unknown');
    expect(v.health).not.toBe('healthy');
    expect(v.report_type).toBe('alert');
    expect(v.recommendations).not.toContain(HEALTHY_RECOMMENDATION);
  });

  it('says what it was handed instead of what it expected', () => {
    expect(evaluateGroupHealth(undefined as unknown as StatusCollection, NOW).anomalies[0]).toBe(
      'Agent status collection is undefined, not a status result (ContractViolation) - department health could not be determined',
    );
  });

  it('degrades to unknown when ok:true carries no subordinates', () => {
    const v = evaluateGroupHealth({ ok: true } as unknown as StatusCollection, NOW);
    expect(v.health).toBe('unknown');
    expect(v.anomalies[0]).toContain('the subordinate list is undefined, not an array of agent records');
    expect(v.anomalies[0]).toContain('ContractViolation');
  });

  it('degrades to unknown when subordinates is null', () => {
    const v = evaluateGroupHealth({ ok: true, subordinates: null } as unknown as StatusCollection, NOW);
    expect(v.health).toBe('unknown');
    expect(v.anomalies[0]).toContain('the subordinate list is null');
  });

  it('keeps a collection with no ok key on the unknown path, and names it', () => {
    // Verified correct before this change and kept correct. What changed is
    // that the report no longer interpolates the literal string "undefined"
    // where the error_class belongs.
    const v = evaluateGroupHealth({ subordinates: [] } as unknown as StatusCollection, NOW);
    expect(v.health).toBe('unknown');
    expect(v.anomalies[0]).toContain('(ContractViolation)');
    expect(v.anomalies[0]).not.toContain('undefined');
    expect(v.recommendations[0]).toContain('ContractViolation');
  });

  it('reads the rows it can and still refuses to grade the department', () => {
    // Partially blind is blind. 'degraded' would be a claim about the row it
    // could not read; 'unknown' is the truth.
    const v = evaluateGroupHealth(ok([sub({ agent_name: 'A' }), null as unknown as SubordinateStatus]), NOW);
    expect(v.health).toBe('unknown');
    expect(v.health).not.toBe('degraded');
    expect(v.anomalies).toContain(
      'Subordinate row 1 is null, not an agent record - this department could not be fully read',
    );
    expect(v.recommendations).not.toContain(HEALTHY_RECOMMENDATION);
    expect(v.recommendations[0]).toBe(
      'Repair the 1 unreadable agent record(s) in this department, then re-run this department health check',
    );
  });

  it('still reports the findings from the rows it could read', () => {
    const v = evaluateGroupHealth(
      ok([sub({ agent_name: 'Broken', status: 'error', error_count: 3 }), null as unknown as SubordinateStatus]),
      NOW,
    );
    expect(v.anomalies).toContain('Broken is in error state (3 errors)');
    expect(v.health).toBe('unknown');
  });

  it('refuses a row with no usable agent_name rather than reporting on "undefined"', () => {
    for (const name of ['', '   ', undefined, 42]) {
      const v = evaluateGroupHealth(
        ok([{ ...sub(), agent_name: name as unknown as string }]),
        NOW,
      );
      expect({ name, health: v.health }).toEqual({ name, health: 'unknown' });
      expect(v.anomalies).toContain(
        'Subordinate row 0 has no agent_name - this department could not be fully read',
      );
      expect(v.anomalies.join(' ')).not.toContain('undefined is');
    }
  });

  it('never returns an empty anomaly list from detectAnomalies for input it could not read', () => {
    // [] is the value that means "looked, found nothing wrong". Handing it back
    // for garbage is the original defect wearing a new costume.
    for (const bad of [undefined, null, 'rows', 42, {}]) {
      const anomalies = detectAnomalies(bad as unknown as SubordinateStatus[], NOW);
      expect({ bad, count: anomalies.length > 0 }).toEqual({ bad, count: true });
      expect(anomalies[0]).toContain('could not be read');
      expect(anomalies[0]).toContain('ContractViolation');
    }
  });

  it('keeps enabled:undefined reading as disabled', () => {
    // Verified correct before this change; pinned so it stays that way. A
    // field we cannot trust is read the way that produces a finding.
    const v = evaluateGroupHealth(
      ok([{ ...sub({ agent_name: 'Murky' }), enabled: undefined as unknown as boolean }]),
      NOW,
    );
    expect(v.health).toBe('degraded');
    expect(v.anomalies).toContain('All 1 agent(s) in this department are disabled - no work can run here');
  });

  it('is replayable on malformed input too', () => {
    const collection = ok([sub({ agent_name: 'A' }), null as unknown as SubordinateStatus]);
    expect(JSON.stringify(evaluateGroupHealth(collection, NOW))).toBe(
      JSON.stringify(evaluateGroupHealth(collection, NOW)),
    );
  });
});
