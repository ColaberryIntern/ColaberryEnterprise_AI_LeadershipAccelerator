/* eslint-disable */
// The sweep's window arithmetic, extracted so the reconcile default cannot regress silently.
//
// `sweepInternMail.js` is a top-level script that connects to Postgres and Basecamp on import,
// so its argument parsing cannot be required from a test. The parsing is reproduced here from
// the script and asserted, which is weaker than importing it and is called out as such: if the
// script's own expression changes, this file must change with it. The alternative was no
// coverage at all on the number that decides how far back a backfill looks.
//
// What this pins:
//   - a normal run looks back 30 minutes, which is what the cron has always relied on
//   - `--reconcile` looks back 90 DAYS by default, not 30 minutes, which is the whole point
//   - an explicit `--since` wins in both modes
//   - a malformed `--since` falls back to the MODE's default, never to the other mode's
//
// Mutation that kills a NAMED test: make DEFAULT_WINDOW a plain '30m' and
// "a malformed --since falls back to the reconcile default, not the 30 minute one" fails.

/** Lifted verbatim from sweepInternMail.js. Keep in step with it. */
function parseWindow(args: string[]) {
  const RECONCILE = args.includes('--reconcile');
  const sinceArg = (args[args.indexOf('--since') + 1] || (RECONCILE ? '90d' : '30m'));
  const DEFAULT_WINDOW = RECONCILE ? '90d' : '30m';
  const WINDOW = /^\d+[mhd]$/.test(sinceArg) ? sinceArg : DEFAULT_WINDOW;
  const UNIT = ({ m: 'minutes', h: 'hours', d: 'days' } as Record<string, string>)[WINDOW.slice(-1)];
  return { reconcile: RECONCILE, amount: parseInt(WINDOW, 10), unit: UNIT };
}

describe('the ordinary rolling window', () => {
  it('looks back 30 minutes by default', () => {
    expect(parseWindow(['--apply'])).toEqual({ reconcile: false, amount: 30, unit: 'minutes' });
  });

  it('honors an explicit --since', () => {
    expect(parseWindow(['--since', '45m', '--apply']))
      .toEqual({ reconcile: false, amount: 45, unit: 'minutes' });
    // 45m is what the cron actually passes, giving a 15 minute overlap on a 30 minute schedule.
  });

  it('falls back to 30 minutes on a malformed --since rather than scanning everything', () => {
    expect(parseWindow(['--since', 'last-tuesday'])).toEqual({
      reconcile: false, amount: 30, unit: 'minutes',
    });
  });
});

describe('reconcile mode', () => {
  it('looks back 90 DAYS by default, not 30 minutes', () => {
    // If this ever reads 30 minutes, reconcile is just a slower normal run and the 23 unfiled
    // messages it was built to find stay invisible.
    expect(parseWindow(['--reconcile'])).toEqual({ reconcile: true, amount: 90, unit: 'days' });
  });

  it('honors an explicit --since, so a deeper sweep is possible', () => {
    expect(parseWindow(['--reconcile', '--since', '180d', '--apply']))
      .toEqual({ reconcile: true, amount: 180, unit: 'days' });
  });

  it('a malformed --since falls back to the reconcile default, not the 30 minute one', () => {
    // The trap this guards: sharing one DEFAULT_WINDOW constant between the modes would make a
    // typo'd `--since` turn a backfill into a no-op that still reports success.
    expect(parseWindow(['--reconcile', '--since', 'everything']))
      .toEqual({ reconcile: true, amount: 90, unit: 'days' });
  });

  it('is off unless asked for, so the cron keeps its narrow window', () => {
    expect(parseWindow(['--apply']).reconcile).toBe(false);
    expect(parseWindow([]).reconcile).toBe(false);
  });
});

describe('the units map covers every suffix the regex admits', () => {
  it('resolves m, h and d', () => {
    expect(parseWindow(['--since', '5m']).unit).toBe('minutes');
    expect(parseWindow(['--since', '5h']).unit).toBe('hours');
    expect(parseWindow(['--since', '5d']).unit).toBe('days');
  });

  it('never produces an undefined unit, which would make the SQL interval invalid', () => {
    // The interval is built as `($2 || ' ' || $3)::interval`, so an undefined unit is a crash at
    // the database rather than a bad window.
    for (const a of [[], ['--reconcile'], ['--since', 'junk'], ['--reconcile', '--since', 'junk'],
      ['--since', '1m'], ['--since', '99d']]) {
      expect(typeof parseWindow(a).unit).toBe('string');
    }
  });
});
