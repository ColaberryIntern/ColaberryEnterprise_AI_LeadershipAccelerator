/**
 * The status taxonomy and the untrusted-row reader.
 *
 * Two things are pinned here that the verdict tests cannot pin on their own.
 *
 * 1. WHICH statuses count as working. The health rules are written as the
 *    complement of this set, so a future edit that quietly adds a status to
 *    RUNNABLE_STATUSES would make that status certifiable without any verdict
 *    test noticing. The membership itself is the contract.
 *
 * 2. That a row the database hands over can be unreadable without anything
 *    throwing and without anything passing. `ai_agents.status` is STRING(20)
 *    with no enum, `enabled` can arrive absent, and a raw query can hand over
 *    a null row - and a TypeError in a super agent cycle means no report row
 *    is written at all, which leaves the last good report standing as if it
 *    were current.
 */

import {
  RECOGNISED_STATUSES,
  RUNNABLE_STATUSES,
  describeStatus,
  describeValue,
  isRecognisedStatus,
  isRunnableStatus,
  normalizeSubordinateRows,
} from '../superAgentSubordinateRows';

describe('the status taxonomy', () => {
  it('treats exactly idle and running as runnable', () => {
    expect([...RUNNABLE_STATUSES].sort()).toEqual(['idle', 'running']);
  });

  it('recognises exactly the AiAgentStatus union', () => {
    // models/AiAgent.ts:204 - 'idle' | 'running' | 'paused' | 'error'.
    expect([...RECOGNISED_STATUSES].sort()).toEqual(['error', 'idle', 'paused', 'running']);
  });

  it('does not count paused or error as runnable', () => {
    // The two recognised statuses that mean an agent is not doing work. If
    // either of these ever answers true, an enabled, paused agent becomes
    // certifiable again.
    expect(isRunnableStatus('paused')).toBe(false);
    expect(isRunnableStatus('error')).toBe(false);
  });

  it('counts both runnable statuses as runnable', () => {
    expect(isRunnableStatus('idle')).toBe(true);
    expect(isRunnableStatus('running')).toBe(true);
  });

  it('keeps every runnable status inside the recognised set', () => {
    for (const status of RUNNABLE_STATUSES) {
      expect({ status, recognised: isRecognisedStatus(status) }).toEqual({ status, recognised: true });
    }
  });

  it.each(['crashed', 'stopped', 'IDLE', 'Running', 'idle ', '', ' ', 'healthy'])(
    'does not recognise %p as a status',
    status => {
      expect(isRecognisedStatus(status)).toBe(false);
      expect(isRunnableStatus(status)).toBe(false);
    },
  );

  const nonStrings: unknown[] = [null, undefined, 3, true, {}, []];
  it.each(nonStrings)('does not recognise the non-string %p', value => {
    expect(isRecognisedStatus(value)).toBe(false);
    expect(isRunnableStatus(value)).toBe(false);
  });
});

describe('normalizeSubordinateRows', () => {
  it('reports an unreadable list rather than an empty one', () => {
    const n = normalizeSubordinateRows(undefined);
    expect(n.readable).toBe(false);
    if (n.readable) throw new Error('expected unreadable');
    expect(n.reason).toBe('the subordinate list is undefined, not an array of agent records');
  });

  const notLists: unknown[] = [null, 'rows', 42, {}, true];
  it.each(notLists)('reports %p as an unreadable list', value => {
    expect(normalizeSubordinateRows(value).readable).toBe(false);
  });

  it('treats an empty array as readable with nothing in it', () => {
    // An empty department is a different fact from an unreadable one, and the
    // verdict layer gives them different anomalies. Both are 'unknown', but
    // only one of them is fixable by registering an agent.
    expect(normalizeSubordinateRows([])).toEqual({ readable: true, valid: [], malformed: [] });
  });

  it('keeps the rows it can read and names the ones it cannot by index', () => {
    const n = normalizeSubordinateRows([
      { agent_name: 'A', status: 'idle', enabled: true, run_count: 1 },
      null,
      { status: 'idle', enabled: true },
      undefined,
      { agent_name: 'B', status: 'running', enabled: true, run_count: 2 },
    ]);
    if (!n.readable) throw new Error('expected readable');
    expect(n.valid.map(v => v.agent_name)).toEqual(['A', 'B']);
    expect(n.malformed).toEqual([
      'Subordinate row 1 is null, not an agent record - this department could not be fully read',
      'Subordinate row 2 has no agent_name - this department could not be fully read',
      'Subordinate row 3 is undefined, not an agent record - this department could not be fully read',
    ]);
  });

  const badNames: unknown[] = ['', '   ', undefined, null, 42, {}];
  it.each(badNames)('refuses the unusable agent_name %p', name => {
    const n = normalizeSubordinateRows([{ agent_name: name, status: 'idle', enabled: true }]);
    if (!n.readable) throw new Error('expected readable');
    expect(n.valid).toEqual([]);
    expect(n.malformed).toHaveLength(1);
  });

  it('reads an absent or non-boolean enabled as disabled', () => {
    // Fail closed. Disabled is the reading that produces a finding - the
    // all-disabled and disabled-after-running rules - while enabled-and-idle
    // is the only reading that can be certified.
    for (const enabled of [undefined, null, 1, 'true', 't']) {
      const n = normalizeSubordinateRows([{ agent_name: 'A', status: 'idle', enabled }]);
      if (!n.readable) throw new Error('expected readable');
      expect({ enabled, read: n.valid[0].enabled }).toEqual({ enabled, read: false });
    }
  });

  it('reads a real boolean enabled as itself', () => {
    const n = normalizeSubordinateRows([
      { agent_name: 'On', status: 'idle', enabled: true },
      { agent_name: 'Off', status: 'idle', enabled: false },
    ]);
    if (!n.readable) throw new Error('expected readable');
    expect(n.valid.map(v => v.enabled)).toEqual([true, false]);
  });

  it('keeps a missing status as a string nothing recognises, rather than undefined', () => {
    const n = normalizeSubordinateRows([{ agent_name: 'A', enabled: true }]);
    if (!n.readable) throw new Error('expected readable');
    expect(n.valid[0].status).toBe('');
    expect(isRecognisedStatus(n.valid[0].status)).toBe(false);
  });

  it('turns an unreadable count into 0 rather than NaN', () => {
    const n = normalizeSubordinateRows([
      { agent_name: 'A', status: 'idle', enabled: true, run_count: 'lots', error_count: null, avg_duration_ms: 'slow' },
    ]);
    if (!n.readable) throw new Error('expected readable');
    expect(n.valid[0]).toMatchObject({ run_count: 0, error_count: 0, avg_duration_ms: null });
    expect(Number.isNaN(n.valid[0].run_count)).toBe(false);
  });

  it('refuses a negative count, which no run counter can legitimately be', () => {
    const n = normalizeSubordinateRows([
      { agent_name: 'A', status: 'idle', enabled: true, run_count: -5, error_count: -1 },
    ]);
    if (!n.readable) throw new Error('expected readable');
    expect(n.valid[0]).toMatchObject({ run_count: 0, error_count: 0 });
  });

  it('reads a numeric string count, which a raw query can produce', () => {
    const n = normalizeSubordinateRows([
      { agent_name: 'A', status: 'idle', enabled: true, run_count: '412', error_count: '3' },
    ]);
    if (!n.readable) throw new Error('expected readable');
    expect(n.valid[0]).toMatchObject({ run_count: 412, error_count: 3 });
  });

  it('accepts a Date, an ISO string or an epoch for last_run_at', () => {
    const when = new Date('2026-08-24T06:30:00.000Z');
    const n = normalizeSubordinateRows([
      { agent_name: 'D', status: 'idle', enabled: true, last_run_at: when },
      { agent_name: 'S', status: 'idle', enabled: true, last_run_at: '2026-08-24T06:30:00.000Z' },
      { agent_name: 'N', status: 'idle', enabled: true, last_run_at: when.getTime() },
      { agent_name: 'X', status: 'idle', enabled: true, last_run_at: { nope: true } },
    ]);
    if (!n.readable) throw new Error('expected readable');
    expect(n.valid[0].last_run_at).toEqual(when);
    expect(n.valid[1].last_run_at).toBe('2026-08-24T06:30:00.000Z');
    expect(n.valid[2].last_run_at).toEqual(when);
    expect(n.valid[3].last_run_at).toBeNull();
  });

  it('trims a padded agent_name instead of reporting on the padding', () => {
    const n = normalizeSubordinateRows([{ agent_name: '  AgentA  ', status: 'idle', enabled: true }]);
    if (!n.readable) throw new Error('expected readable');
    expect(n.valid[0].agent_name).toBe('AgentA');
  });

  it('does not mutate the rows it was handed', () => {
    const rows = [{ agent_name: 'A', status: 'idle', enabled: true, run_count: 'lots' }];
    const before = JSON.stringify(rows);
    normalizeSubordinateRows(rows);
    expect(JSON.stringify(rows)).toBe(before);
  });

  it('is replayable: the same rows normalize identically every time', () => {
    const rows = [{ agent_name: 'A', status: 'paused', enabled: true }, null];
    expect(JSON.stringify(normalizeSubordinateRows(rows))).toBe(
      JSON.stringify(normalizeSubordinateRows(rows)),
    );
  });
});

describe('the describe helpers', () => {
  it('names a value type instead of interpolating the value', () => {
    expect(describeValue(undefined)).toBe('undefined');
    expect(describeValue(null)).toBe('null');
    expect(describeValue([])).toBe('an array');
    expect(describeValue({})).toBe('an object');
    expect(describeValue(0)).toBe('a number');
    expect(describeValue('x')).toBe('a string');
    expect(describeValue(true)).toBe('a boolean');
  });

  it('never leaves an empty status printed as nothing at all', () => {
    // "reports status , which is not a known agent status" would read as a
    // formatting bug rather than a finding.
    expect(describeStatus('')).toBe('(none recorded)');
    expect(describeStatus('paused')).toBe("'paused'");
  });
});
