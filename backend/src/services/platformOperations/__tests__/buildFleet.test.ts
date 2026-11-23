/**
 * The Fleet tab's judgements, tested without a database.
 *
 * Every case here is a way the page could lie. A job that fails every five minutes looking
 * punctual; an uninstrumented job being called dead; a timer that names a registry row that
 * does not exist being counted as watched. Those are the failures this tab exists to
 * prevent, so they are the ones that get a test.
 */
import {
  FleetReadings, RegistryAgent, buildLive, buildRuns, buildSilent, buildUntracked, humanDuration,
  humanSchedule,
} from '../buildFleet';
import { TimerSite } from '../timerScanTypes';

const NOW = new Date('2026-11-23T18:00:00.000Z');

function agent(name: string, schedule: string, id = name): RegistryAgent {
  return { id, agent_name: name, schedule, schedule_source: 'registry' };
}

function readings(over: Partial<FleetReadings> = {}): FleetReadings {
  return {
    now: NOW,
    windowHours: 24,
    lookbackDays: 30,
    agents: [],
    activity: [],
    latestRuns: [],
    deadLetters: [],
    timerSites: [],
    ...over,
  };
}

describe('Live fleet', () => {
  it('calls a job that fired in the window alive', () => {
    const r = readings({
      agents: [agent('Health scan', '*/5 * * * *')],
      activity: [{
        agent_id: 'Health scan',
        runs_in_window: 12,
        runs_in_lookback: 900,
        last_fire_at: new Date('2026-11-23T17:55:00.000Z'),
        last_success_at: new Date('2026-11-23T17:55:00.000Z'),
      }],
    });
    expect(buildLive(r)[0]).toMatchObject({ status: 'Fired', tone: 'ok', runs_in_window: 12 });
  });

  it('calls a job that reports but did not fire dead, in red', () => {
    const r = readings({
      agents: [agent('Ticket auto-resolution', '0 */6 * * *')],
      activity: [{
        agent_id: 'Ticket auto-resolution',
        runs_in_window: 0,
        runs_in_lookback: 40,
        last_fire_at: new Date('2026-11-20T04:00:00.000Z'),
        last_success_at: new Date('2026-11-20T04:00:00.000Z'),
      }],
    });
    expect(buildLive(r)[0]).toMatchObject({ status: 'Has not fired', tone: 'bad', coverage: 'reporting' });
  });

  /**
   * The case that makes this tab honest rather than alarming. 23 of the fleet's enabled
   * agents had zero log rows when this was measured, and we cannot tell from data whether
   * they are dead or merely silent about being alive. Painting them red would put a false
   * outage in front of a person every single day until they stopped reading the card.
   */
  it('does not call a job with no report at all dead — it says we are not watching', () => {
    const r = readings({ agents: [agent('Never instrumented', '*/5 * * * *')], activity: [] });
    const row = buildLive(r)[0];
    expect(row.status).toBe('No report ever');
    expect(row.tone).toBe('warn');
    expect(row.tone).not.toBe('bad');
    expect(row.coverage).toBe('never_reported');
  });

  it('puts the worst rows first, so nobody scrolls to find the outage', () => {
    const r = readings({
      agents: [agent('A ok', '*/5 * * * *'), agent('B dead', '*/5 * * * *'), agent('C unseen', '*/5 * * * *')],
      activity: [
        { agent_id: 'A ok', runs_in_window: 3, runs_in_lookback: 99, last_fire_at: NOW, last_success_at: NOW },
        { agent_id: 'B dead', runs_in_window: 0, runs_in_lookback: 99, last_fire_at: NOW, last_success_at: NOW },
      ],
    });
    expect(buildLive(r).map((x) => x.agent_name)).toEqual(['B dead', 'C unseen', 'A ok']);
  });

  it('shows the schedule actually in force when an override exists', () => {
    const r = readings({
      agents: [{ id: 'x', agent_name: 'Rollup', schedule: '*/1 * * * *', schedule_source: 'override' }],
    });
    expect(buildLive(r)[0]).toMatchObject({ schedule: '*/1 * * * *', schedule_source: 'override' });
  });
});

describe('Untracked timers', () => {
  const site = (over: Partial<TimerSite> = {}): TimerSite => ({
    file: 'backend/src/server.ts', line: 214, kind: 'cron', schedule: '*/5 * * * *', reportsAs: null, ...over,
  });

  it('flags a timer that reports under no name', () => {
    const rows = buildUntracked(readings({ timerSites: [site()] }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      location: 'backend/src/server.ts:214',
      reason: 'reports under no name',
      status: 'Needs a row',
    });
    expect(rows[0].proposed_row.enabled).toBe(false);
  });

  /**
   * The quieter failure of the two. `instrumentCronJob` looks the name up in `ai_agents` and,
   * on a miss, runs the job and logs nothing at all. The code believes it is instrumented.
   */
  it('flags a timer whose name no registry row receives', () => {
    const rows = buildUntracked(readings({
      agents: [agent('Something else', '*/5 * * * *')],
      timerSites: [site({ reportsAs: 'NotInTheRegistry' })],
    }));
    expect(rows[0]).toMatchObject({ reason: 'name is not in the registry', reports_as: 'NotInTheRegistry' });
  });

  it('leaves a properly registered timer alone', () => {
    const rows = buildUntracked(readings({
      agents: [agent('Health scan', '*/5 * * * *')],
      timerSites: [site({ reportsAs: 'Health scan' })],
    }));
    expect(rows).toEqual([]);
  });

  it('never proposes an enabled row — a new timer stays off until a person switches it on', () => {
    const rows = buildUntracked(readings({
      timerSites: [site(), site({ line: 300, reportsAs: 'Missing' })],
    }));
    expect(rows.every((x) => x.proposed_row.enabled === false)).toBe(true);
  });
});

describe('Last run, per job', () => {
  it('prints an unclassified failure as a gap, not as a blank', () => {
    const r = readings({
      agents: [agent('Preview stack reaping', '*/5 * * * *')],
      latestRuns: [{
        agent_id: 'Preview stack reaping',
        created_at: new Date('2026-11-23T17:56:00.000Z'),
        duration_ms: 30000,
        result: 'failed',
        trace_id: 'trace-1',
      }],
    });
    expect(buildRuns(r)[0]).toMatchObject({ outcome: 'Failed', error_class: 'unclassified', tone: 'bad' });
  });

  it('uses the dead-letter class when the job has failed past the retry limit', () => {
    const r = readings({
      agents: [agent('Preview stack reaping', '*/5 * * * *')],
      latestRuns: [{
        agent_id: 'Preview stack reaping',
        created_at: NOW, duration_ms: 1, result: 'failed', trace_id: null,
      }],
      deadLetters: [{ job_name: 'Preview stack reaping', error_class: 'timeout' }],
    });
    expect(buildRuns(r)[0].error_class).toBe('timeout');
  });

  it('says "none" on success rather than borrowing a stale dead-letter class', () => {
    const r = readings({
      agents: [agent('Rollup', '*/10 * * * *')],
      latestRuns: [{ agent_id: 'Rollup', created_at: NOW, duration_ms: 4000, result: 'success', trace_id: null }],
      deadLetters: [{ job_name: 'Rollup', error_class: 'db_lock' }],
    });
    expect(buildRuns(r)[0]).toMatchObject({ outcome: 'OK', error_class: 'none' });
  });

  it('reports a job with no run in the lookback as having no record', () => {
    const r = readings({ agents: [agent('Ghost', '*/5 * * * *')] });
    expect(buildRuns(r)[0]).toMatchObject({ outcome: 'No record', error_class: 'no record', tone: 'warn' });
  });
});

describe('Silent since', () => {
  /**
   * The whole reason this panel reads last SUCCESS. `cronInstrumentation` stamps a run on
   * failure too, so a job failing every five minutes for a day is perfectly punctual by
   * last-run and is exactly the outage nobody currently sees.
   */
  it('counts a job that keeps running and keeps failing as silent', () => {
    const r = readings({
      agents: [agent('Auto-resolution', '0 */6 * * *')],
      activity: [{
        agent_id: 'Auto-resolution',
        runs_in_window: 4,
        runs_in_lookback: 100,
        last_fire_at: NOW,                                        // fired minutes ago
        last_success_at: new Date('2026-11-22T23:00:00.000Z'),    // last SUCCEEDED 19 hours ago
      }],
    });
    const row = buildSilent(r)[0];
    expect(row.status).toBe('Silent 19 hours');
    expect(row.overdue_factor).toBeGreaterThanOrEqual(2);
  });

  it('leaves a job inside its own cadence alone', () => {
    const r = readings({
      agents: [agent('Health scan', '*/5 * * * *')],
      activity: [{
        agent_id: 'Health scan',
        runs_in_window: 200,
        runs_in_lookback: 9000,
        last_fire_at: NOW,
        last_success_at: new Date('2026-11-23T17:57:00.000Z'),
      }],
    });
    expect(buildSilent(r)).toEqual([]);
  });

  it('does not double-count a job that Live fleet already reports as unseen', () => {
    const r = readings({ agents: [agent('Never instrumented', '*/5 * * * *')], activity: [] });
    expect(buildSilent(r)).toEqual([]);
    expect(buildLive(r)[0].status).toBe('No report ever');
  });

  it('skips a schedule it cannot read rather than guessing an interval', () => {
    const r = readings({
      agents: [agent('Odd', 'not a cron expression')],
      activity: [{
        agent_id: 'Odd',
        runs_in_window: 0,
        runs_in_lookback: 5,
        last_fire_at: NOW,
        last_success_at: new Date('2020-01-01T00:00:00.000Z'),
      }],
    });
    expect(buildSilent(r)).toEqual([]);
  });
});

describe('humanSchedule', () => {
  it.each([
    ['*/5 * * * *', 'every 5 min'],
    ['*/1 * * * *', 'every minute'],
    ['0 */6 * * *', 'every 6 hours'],
    ['0 */1 * * *', 'hourly'],
    ['30 * * * *', 'hourly'],
    ['0 2 * * *', 'daily at 02:00'],
    ['5 14 * * *', 'daily at 14:05'],
    ['0 9 * * 1', 'Mondays at 09:00'],
    ['10,25,40,55 * * * *', '4 times an hour'],
  ])('%s reads as "%s"', (cron, expected) => {
    expect(humanSchedule(cron as string)).toBe(expected);
  });

  /**
   * The point of the fallback. A confident-sounding phrase for an expression we did not
   * really parse is worse than the expression, because the expression is at least true.
   */
  it.each([
    '0 0 1 */3 *',
    'not a cron expression',
    '*/5 * * * * *',
    '',
  ])('leaves %p alone rather than guessing', (cron) => {
    expect(humanSchedule(cron as string)).toBe(cron);
  });

  it('carries the label onto every row that shows a schedule', () => {
    const r = readings({
      agents: [agent('Scan', '*/5 * * * *')],
      activity: [{
        agent_id: 'Scan', runs_in_window: 0, runs_in_lookback: 9,
        last_fire_at: NOW, last_success_at: new Date('2026-11-01T00:00:00.000Z'),
      }],
      latestRuns: [{ agent_id: 'Scan', created_at: NOW, duration_ms: 1, result: 'success', trace_id: null }],
    });
    expect(buildLive(r)[0].schedule_label).toBe('every 5 min');
    expect(buildRuns(r)[0].schedule_label).toBe('every 5 min');
    expect(buildSilent(r)[0].schedule_label).toBe('every 5 min');
    // the raw expression is still there, because it is what a person edits
    expect(buildLive(r)[0].schedule).toBe('*/5 * * * *');
  });
});

describe('humanDuration', () => {
  it.each([
    [30_000, 'under a minute'],
    [5 * 60_000, '5 min'],
    [60 * 60_000, '1 hour'],
    [19 * 3600_000, '19 hours'],
    [2 * 86_400_000, '2 days'],
  ])('%i ms reads as %s', (ms, expected) => {
    expect(humanDuration(ms as number)).toBe(expected);
  });
});
