/**
 * THE JOB THAT KEEPS THE SNACK BAR FROM GOING DARK.
 *
 * GEO-1 made the bar render on 2026-11-11 by backfilling `visitors.city` once, by hand.
 * The feed only looks back 72 hours, so a one-off backfill buys about three days and then
 * the bar silently returns to the empty state it had been in since it was built. This job
 * is the difference between a feature that worked once and one that keeps working.
 *
 * Two properties carry real weight here and both are asserted below:
 *
 *   - It runs the enrichment as a CHILD PROCESS. The GeoLite2 reader is ~50MB and the
 *     production host OOM-kills; `enrichVisitorGeo` is written as a short-lived script for
 *     that reason. A future edit that "simplifies" this into a direct import would put
 *     50MB resident in the long-running backend, and the test named below is what fails.
 *   - The in-flight guard RELEASES on the failure path. A guard that leaks on an error
 *     wedges the job permanently, and the symptom is indistinguishable from "the cron
 *     stopped firing" - the worst kind of bug to find from the outside.
 *
 * node-cron and cronInstrumentation are mocked so this suite stays pure: no timers are
 * registered, no database handle is opened, and nothing leaks into a jest worker.
 */
import * as path from 'path';

const scheduleMock = jest.fn();
const instrumentMock = jest.fn();

jest.mock('node-cron', () => ({ __esModule: true, default: { schedule: (...a: unknown[]) => scheduleMock(...a) } }));
jest.mock('../../cronInstrumentation', () => ({
  instrumentCronJob: (name: string, fn: () => Promise<void>) => instrumentMock(name, fn),
}));

import {
  VISITOR_GEO_SCHEDULE,
  VISITOR_GEO_TIMEOUT_MS,
  enrichmentScriptPath,
  parseEndEvent,
  runVisitorGeoEnrichment,
  registerVisitorGeoCrons,
  __resetInFlightForTests,
  GeoRunDeps,
} from '../visitorGeoCrons';

/** One `end` line as the real script emits it, counters and all. */
const END_LINE = JSON.stringify({
  timestamp: '2026-11-12T01:06:07.496Z',
  level: 'info',
  service: 'visitor-geo-enrichment',
  event: 'end',
  considered: 646,
  enriched: 153,
  countryOnly: 60,
  skippedNotPublic: 433,
  outcome: 'success',
  renderable_cities_added: 153,
});

const BATCH_LINE = JSON.stringify({ event: 'batch_done', considered: 500, enriched: 120 });
const START_LINE = JSON.stringify({ event: 'start', dryRun: false });

function depsReturning(stdout: string, stderr = ''): { deps: GeoRunDeps; calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    deps: {
      run: (file, args, opts) => {
        calls.push([file, args, opts]);
        return Promise.resolve({ stdout, stderr });
      },
    },
  };
}

beforeEach(() => {
  __resetInFlightForTests();
  scheduleMock.mockReset();
  instrumentMock.mockReset();
});

describe('it runs the enrichment as a short-lived child process', () => {
  it('invokes the node binary against the compiled script, not an in-process import', async () => {
    const { deps, calls } = depsReturning([START_LINE, BATCH_LINE, END_LINE].join('\n'));
    await runVisitorGeoEnrichment(deps);

    expect(calls).toHaveLength(1);
    const [file, args] = calls[0] as [string, string[]];
    // process.execPath, so it uses the same node that is running the backend.
    expect(file).toBe(process.execPath);
    expect(args).toHaveLength(1);
    expect(args[0]).toBe(enrichmentScriptPath());
  });

  it('points at dist/scripts/enrichVisitorGeo.js, the one implementation', () => {
    const p = enrichmentScriptPath();
    expect(path.basename(p)).toBe('enrichVisitorGeo.js');
    // Resolved out of services/scheduling and into scripts/ - if the compiled layout
    // moves, this is the assertion that notices before production does.
    expect(p.split(path.sep).slice(-2)).toEqual(['scripts', 'enrichVisitorGeo.js']);
  });

  it('bounds the child with an explicit timeout, so a wedged run cannot hang for ever', async () => {
    const { deps, calls } = depsReturning(END_LINE);
    await runVisitorGeoEnrichment(deps);
    const [, , opts] = calls[0] as [string, string[], { timeout: number }];
    expect(opts.timeout).toBe(VISITOR_GEO_TIMEOUT_MS);
    expect(opts.timeout).toBeGreaterThan(0);
  });
});

describe('it forwards the script own counters rather than recomputing them', () => {
  it('reads the end event, past the start and batch lines', async () => {
    const { deps } = depsReturning([START_LINE, BATCH_LINE, END_LINE].join('\n'));
    const result = await runVisitorGeoEnrichment(deps);
    expect(result.counters).not.toBeNull();
    expect(result.counters!.enriched).toBe(153);
    expect(result.counters!.renderable_cities_added).toBe(153);
  });

  it('survives non-JSON noise on stdout (a node warning does not lose the counters)', () => {
    const noisy = [
      '(node:1) Warning: something entirely unstructured',
      START_LINE,
      END_LINE,
      '',
    ].join('\n');
    expect(parseEndEvent(noisy)!.enriched).toBe(153);
  });

  it('returns null, rather than a fake success, when there is no end event', () => {
    // This is the honest answer. Reporting zeroes here would make a job that produced no
    // end event indistinguishable from one that genuinely enriched nothing.
    expect(parseEndEvent([START_LINE, BATCH_LINE].join('\n'))).toBeNull();
  });

  it('CONTROL: returns null for empty and for pure garbage', () => {
    expect(parseEndEvent('')).toBeNull();
    expect(parseEndEvent('not json at all\n{oops')).toBeNull();
  });

  it('takes the LAST end event when a run somehow emits two', () => {
    const second = JSON.stringify({ event: 'end', enriched: 999 });
    expect(parseEndEvent([END_LINE, second].join('\n'))!.enriched).toBe(999);
  });
});

describe('the in-flight guard', () => {
  it('refuses a second run while the first is still working', async () => {
    let release: (v: { stdout: string; stderr: string }) => void = () => {};
    const deps: GeoRunDeps = {
      run: () => new Promise((res) => { release = res; }),
    };
    const first = runVisitorGeoEnrichment(deps);
    await expect(runVisitorGeoEnrichment(deps)).rejects.toThrow(/already in flight/);
    release({ stdout: END_LINE, stderr: '' });
    await expect(first).resolves.toBeTruthy();
  });

  it('RELEASES after a failure, so one error does not wedge the job for ever', async () => {
    const failing: GeoRunDeps = { run: () => Promise.reject(new Error('exit 1')) };
    await expect(runVisitorGeoEnrichment(failing)).rejects.toThrow('exit 1');

    // The whole point: the very next tick must still be able to run.
    const { deps, calls } = depsReturning(END_LINE);
    await expect(runVisitorGeoEnrichment(deps)).resolves.toBeTruthy();
    expect(calls).toHaveLength(1);
  });

  it('releases after a success too', async () => {
    const a = depsReturning(END_LINE);
    await runVisitorGeoEnrichment(a.deps);
    const b = depsReturning(END_LINE);
    await expect(runVisitorGeoEnrichment(b.deps)).resolves.toBeTruthy();
    expect(b.calls).toHaveLength(1);
  });

  it('propagates the failure instead of swallowing it, so the run is recorded as failed', async () => {
    const failing: GeoRunDeps = { run: () => Promise.reject(new Error('ENOENT mmdb')) };
    await expect(runVisitorGeoEnrichment(failing)).rejects.toThrow('ENOENT mmdb');
  });
});

describe('registration', () => {
  it('schedules daily, on the documented expression', () => {
    registerVisitorGeoCrons();
    expect(scheduleMock).toHaveBeenCalledTimes(1);
    expect(scheduleMock.mock.calls[0][0]).toBe(VISITOR_GEO_SCHEDULE);
    expect(VISITOR_GEO_SCHEDULE).toBe('35 9 * * *');
  });

  it('tracks the run under the agent name the seed row uses', async () => {
    registerVisitorGeoCrons();
    const tick = scheduleMock.mock.calls[0][1] as () => void;
    instrumentMock.mockReturnValue(Promise.resolve());
    tick();
    expect(instrumentMock).toHaveBeenCalledTimes(1);
    // Must match agentRegistrySeed.ts exactly, or the cron registry guard fails the build
    // and the health detector has no row to evaluate.
    expect(instrumentMock.mock.calls[0][0]).toBe('VisitorGeoEnrichment');
  });

  it('CONTROL: registering nothing would fail the assertions above', () => {
    // Non-vacuity. Without this it is possible to read the two tests above as passing
    // because the mocks were never called at all.
    expect(scheduleMock).not.toHaveBeenCalled();
    expect(instrumentMock).not.toHaveBeenCalled();
  });
});
