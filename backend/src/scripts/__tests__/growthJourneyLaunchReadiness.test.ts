/**
 * The launch-readiness CLI (Phase 6, T610).
 *
 * Three things: the argument parser refuses what it does not understand, the printed
 * output carries no `@` under an adversarial fixture, and the checklist is readable -
 * every item shows its state, what was found, and what would clear it.
 */

const buildReadiness = jest.fn();
jest.mock('../../services/growthJourney/readiness/buildReadiness', () => ({
  buildReadiness: (...a: unknown[]) => buildReadiness(...a),
}));

import { formatReadiness, main, mark, parseArgs } from '../growthJourneyLaunchReadiness';

const READY_ITEM = { key: 'master_flag', ready: true, reason: 'GROWTH_JOURNEY_ENABLED is on', next_move: 'nothing' };
const BLOCKED_ITEM = { key: 'content_rules', ready: false, reason: '1 of 2 learner brand(s) have at least one content rule', next_move: 'add a rule' };
const UNKNOWN_ITEM = { key: 'tests_green', ready: null, reason: 'not readable from here', next_move: 'check CI' };

const report = (over: Record<string, unknown> = {}) => ({
  items: [READY_ITEM, BLOCKED_ITEM, UNKNOWN_ITEM],
  score: { ready: 1, known: 2, unknown: 1, pct: 50 },
  next_move: 'content_rules',
  as_of: '2026-09-29T18:00:00.000Z',
  ...over,
});

let logged: string[] = [];

beforeEach(() => {
  logged = [];
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
    logged.push(a.map(String).join(' '));
  });
});

afterEach(() => jest.restoreAllMocks());

describe('parseArgs refuses what it does not understand', () => {
  it('no arguments -> human output', () => {
    expect(parseArgs([])).toEqual({ json: false });
  });

  it('--json -> json output', () => {
    expect(parseArgs(['--json'])).toEqual({ json: true });
  });

  it.each([['--josn'], ['-j'], ['--json=true'], ['register-campaigns'], ['--confirm-production']])(
    'throws on %s rather than silently ignoring it',
    (bad) => {
      expect(() => parseArgs([bad])).toThrow(/unknown argument/);
    },
  );
});

describe('mark is the three-state answer, not a boolean', () => {
  it.each([
    [true, '[x]'],
    [false, '[ ]'],
    [null, '[?]'],
  ] as Array<[boolean | null, string]>)('%s -> %s', (ready, expected) => {
    expect(mark(ready)).toBe(expected);
  });
});

describe('the printed checklist', () => {
  it('shows every item with its state, what was found, and what would clear it', () => {
    const lines = formatReadiness(report() as never);
    const joined = lines.join('\n');
    expect(joined).toContain('[x] master_flag');
    expect(joined).toContain('[ ] content_rules');
    expect(joined).toContain('[?] tests_green');
    expect(joined).toContain('found - 1 of 2 learner brand(s)');
    // printed for READY items too, so the list doubles as a runbook
    expect(joined).toContain('to clear - nothing');
    expect(joined).toContain('score     1 of 2 knowable conditions met (50%)');
    expect(joined).toContain('unknown   1');
    expect(joined).toContain('next move content_rules');
  });

  it('nothing blocked -> the next move says so rather than printing null', () => {
    const joined = formatReadiness(report({ next_move: null }) as never).join('\n');
    expect(joined).toContain('next move nothing is blocked');
    expect(joined).not.toContain('null');
  });

  it('an uncomputable score prints why, never 0%', () => {
    const joined = formatReadiness(
      report({ score: { ready: 0, known: 0, unknown: 17, pct: null } }) as never,
    ).join('\n');
    expect(joined).toContain('not computable - nothing could be checked');
    expect(joined).not.toContain('(0%)');
  });
});

describe('no `@` is ever printed, under an adversarial report', () => {
  it('an address in a reason or a next_move does not reach the output', async () => {
    // The reader is the thing that guarantees this (its own suite asserts no row value
    // is interpolated into a reason). This cell is the belt: if a reason ever did carry
    // one, the CLI must not be the surface that prints it.
    buildReadiness.mockResolvedValue(
      report({
        items: [
          { key: 'memberships', ready: false, reason: 'contact someone@example.com', next_move: 'mail other@example.com' },
        ],
      }),
    );
    await main([]);
    const raw = logged.join('\n');
    expect(raw).toContain('[ ] memberships');
    expect(raw).not.toContain('@');
  });

  it('the --json document is scrubbed the same way', async () => {
    buildReadiness.mockResolvedValue(
      report({ items: [{ key: 'memberships', ready: false, reason: 'someone@example.com', next_move: 'x' }] }),
    );
    await main(['--json']);
    expect(logged.join('\n')).not.toContain('@');
  });
});

describe('main', () => {
  it('human mode prints the checklist; json mode prints one parseable document', async () => {
    buildReadiness.mockResolvedValue(report());
    await main([]);
    expect(logged.join('\n')).toContain('Growth Journey OS - launch readiness');

    logged = [];
    await main(['--json']);
    expect(logged).toHaveLength(1);
    const parsed = JSON.parse(logged[0]);
    expect(parsed.next_move).toBe('content_rules');
    expect(parsed.score.pct).toBe(50);
  });

  it('asks the reader for NOW and nothing else - no flags argument, no write', async () => {
    buildReadiness.mockResolvedValue(report());
    await main([]);
    expect(buildReadiness).toHaveBeenCalledTimes(1);
    const arg = buildReadiness.mock.calls[0][0];
    expect(Object.keys(arg)).toEqual(['now']);
    expect(arg.now).toBeInstanceOf(Date);
  });
});
