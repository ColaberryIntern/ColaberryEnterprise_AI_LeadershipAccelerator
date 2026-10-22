/**
 * scheduledAgentHealth — the invariant is that the EXECUTION LOG decides, and
 * `ai_agents.run_count` never does.
 *
 * The bug this guards against is not hypothetical. On 2026-10-22 an audit of the 142
 * enabled agents carrying a cron schedule found 23 with zero execution rows in their
 * whole history. Reaching for `run_count` to find them would have produced the wrong
 * list in BOTH directions, because several registry runners never write back to their
 * own `ai_agents` row: `WorkforceResearchDirector` carried `run_count = 0` while its
 * execution log held 12 rows, the newest four days old. That row is reproduced here
 * verbatim as the central test.
 */
import {
  classifyAgent, buildHealthReport, STALLED_AFTER_HOURS, ScheduledAgentRow,
} from '../scheduledAgentHealth';

const NOW = new Date('2026-10-22T20:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600 * 1000);

/** A row as the join produces it; override per test. */
const row = (over: Partial<ScheduledAgentRow> = {}): ScheduledAgentRow => ({
  agent_name: 'SomeAgent',
  schedule: '*/15 * * * *',
  execution_count: 10,
  last_execution_at: hoursAgo(1),
  ...over,
});

describe('classifyAgent', () => {
  it('reads the EXECUTION LOG, never run_count (the real WorkforceResearchDirector row)', () => {
    // run_count said 0. The execution log said 12, newest 18 Oct. It was running.
    expect(classifyAgent(row({
      agent_name: 'WorkforceResearchDirector',
      schedule: '0 7 * * 0',
      run_count: 0,
      execution_count: 12,
      last_execution_at: new Date('2026-10-18T12:00:05Z'),
    }), NOW)).toBe('running');
  });

  it.each([
    ['AutonomousEngine', 11774],
    ['AICOOStrategicCycle', 3925],
    ['MetaAgentLoop', 1960],
    ['CoryEvolutionCycle', 277],
  ])('keeps %s off the dead list: run_count=%i with ZERO log rows is unverifiable', (name, rc) => {
    // The second half of the trap, found by running the real query against production.
    // The execution log under-reports too. Calling these four "never ran" would put
    // busy agents at the top of the dead list and discredit the whole report.
    expect(classifyAgent(row({
      agent_name: String(name), run_count: Number(rc), execution_count: 0, last_execution_at: null,
    }), NOW)).toBe('unverifiable');
  });

  it('calls an agent never_ran only when BOTH sources are silent (the dead list)', () => {
    expect(classifyAgent(row({ execution_count: 0, last_execution_at: null, run_count: 0 }), NOW)).toBe('never_ran');
    // run_count absent entirely is still silence, not a reprieve.
    expect(classifyAgent(row({ execution_count: 0, last_execution_at: null }), NOW)).toBe('never_ran');
    expect(classifyAgent(row({ execution_count: 0, last_execution_at: null, run_count: null }), NOW)).toBe('never_ran');
  });

  it('does not let run_count CONVICT, only exonerate (the asymmetry)', () => {
    // run_count = 0 while the log shows recent activity must stay running. If
    // run_count could convict, this would be condemned as never_ran.
    expect(classifyAgent(row({ run_count: 0, execution_count: 12, last_execution_at: hoursAgo(2) }), NOW))
      .toBe('running');
  });

  it('calls a recently active agent running', () => {
    expect(classifyAgent(row({ last_execution_at: hoursAgo(1) }), NOW)).toBe('running');
  });

  it('calls an agent that ran once long ago stalled (the real WorkforceOperationsDirector shape)', () => {
    // Scheduled */15, one execution on 30 Jul, nothing since.
    expect(classifyAgent(row({
      agent_name: 'WorkforceOperationsDirector',
      execution_count: 1,
      last_execution_at: new Date('2026-07-30T19:15:54Z'),
    }), NOW)).toBe('stalled');
  });

  it('holds the boundary on either side of the window', () => {
    expect(classifyAgent(row({ last_execution_at: hoursAgo(STALLED_AFTER_HOURS - 1) }), NOW)).toBe('running');
    expect(classifyAgent(row({ last_execution_at: hoursAgo(STALLED_AFTER_HOURS + 1) }), NOW)).toBe('stalled');
  });

  it('does not flag a healthy WEEKLY agent, which is why the window is 8 days', () => {
    // A weekly agent is routinely 7 days idle. A shorter window would page on every run.
    expect(STALLED_AFTER_HOURS).toBeGreaterThan(7 * 24);
    expect(classifyAgent(row({ schedule: '0 7 * * 0', last_execution_at: hoursAgo(7 * 24) }), NOW)).toBe('running');
  });

  it('is stalled, not running, when executions exist but the timestamp is unusable (boundary)', () => {
    for (const bad of [null, 'not-a-date', '']) {
      expect(classifyAgent(row({ execution_count: 5, last_execution_at: bad as string | null }), NOW)).toBe('stalled');
    }
  });

  it('treats a malformed execution count as never_ran rather than throwing (boundary)', () => {
    for (const bad of [NaN, -1, undefined as unknown as number]) {
      expect(classifyAgent(row({ execution_count: bad, run_count: 0 }), NOW)).toBe('never_ran');
    }
  });

  it('does not let a malformed run_count exonerate (boundary)', () => {
    for (const bad of [NaN, -1, 'lots' as unknown as number]) {
      expect(classifyAgent(row({ execution_count: 0, last_execution_at: null, run_count: bad }), NOW))
        .toBe('never_ran');
    }
  });
});

describe('buildHealthReport', () => {
  it('sorts a mixed fleet into the four buckets', () => {
    const r = buildHealthReport([
      row({ agent_name: 'Alive', execution_count: 868886, last_execution_at: hoursAgo(1) }),
      row({ agent_name: 'Dead', execution_count: 0, last_execution_at: null, run_count: 0 }),
      row({ agent_name: 'Stopped', execution_count: 1, last_execution_at: hoursAgo(2000) }),
      row({ agent_name: 'Untracked', execution_count: 0, last_execution_at: null, run_count: 11774 }),
    ], NOW);
    expect(r.running.map((x) => x.agent_name)).toEqual(['Alive']);
    expect(r.never_ran.map((x) => x.agent_name)).toEqual(['Dead']);
    expect(r.stalled.map((x) => x.agent_name)).toEqual(['Stopped']);
    expect(r.unverifiable.map((x) => x.agent_name)).toEqual(['Untracked']);
  });

  it('reports run_count disagreements without acting on them', () => {
    const r = buildHealthReport([
      row({ agent_name: 'WorkforceResearchDirector', run_count: 0, execution_count: 12 }),
      row({ agent_name: 'Agrees', run_count: 10, execution_count: 10 }),
      row({ agent_name: 'NotTracked', execution_count: 10 }), // run_count absent, not a disagreement
    ], NOW);
    expect(r.run_count_disagrees).toEqual([
      { agent_name: 'WorkforceResearchDirector', run_count: 0, execution_count: 12 },
    ]);
    // The disagreement is reported, and the agent is still classified on the log.
    expect(r.running.map((x) => x.agent_name)).toContain('WorkforceResearchDirector');
  });

  it('returns empty buckets for an empty fleet rather than throwing (boundary)', () => {
    expect(buildHealthReport([], NOW)).toEqual({
      running: [], stalled: [], never_ran: [], unverifiable: [], run_count_disagrees: [],
    });
  });

  it('is idempotent: classifying the same fleet twice gives the same answer', () => {
    const fleet = [row({ agent_name: 'A' }), row({ agent_name: 'B', execution_count: 0, last_execution_at: null })];
    expect(buildHealthReport(fleet, NOW)).toEqual(buildHealthReport(fleet, NOW));
  });
});
