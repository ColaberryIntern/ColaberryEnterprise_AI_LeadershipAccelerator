/**
 * MR3: the first rollout control row, composed and validated but never written.
 *
 * ── THE LOCK THE TICKET MISSED ─────────────────────────────────────────────
 *
 * `growth_journey_execution_controls` holds **zero rows** in production, and
 * `resolveExecutionMode.ts:143` is `if (!rollout) return result('shadow', 'no_rollout')`. So
 * every scope resolves to shadow even with all five of MR3's listed locks flipped. The two
 * control defaults are asymmetric and that is the whole point: a **pause allows** by default, a
 * **rollout denies** by default.
 *
 * What these tests defend, in order of what the regression would cost:
 *
 *   1. **It writes nothing.** Asserted by spying on every write method of every journey model,
 *      not by reading the source and trusting it. Writing this row is the act that permits a
 *      scope to leave shadow; a planner that quietly wrote it would be the worst possible bug
 *      in this change.
 *   2. **It uses the REAL key parser**, so an under-specified scope throws rather than silently
 *      widening to something nobody chose.
 *   3. **The defaults are the smallest first rollout**, not the widest.
 */

const create = jest.fn();
const update = jest.fn();
const destroy = jest.fn();
const findOrCreate = jest.fn();
const bulkCreate = jest.fn();
const upsert = jest.fn();

const writeSpies = { create, update, destroy, findOrCreate, bulkCreate, upsert };

jest.mock('../../../../models', () => ({
  GrowthJourneyExecutionControl: writeSpiesProxy(),
  GrowthJourneyDecision: writeSpiesProxy(),
  GrowthJourneyExecution: writeSpiesProxy(),
  JourneyProgram: writeSpiesProxy(),
}));

/** Every model in the mock exposes the write methods, so any attempt to use one is recorded. */
function writeSpiesProxy(): Record<string, unknown> {
  return {
    create: (...a: unknown[]) => create(...a),
    update: (...a: unknown[]) => update(...a),
    destroy: (...a: unknown[]) => destroy(...a),
    findOrCreate: (...a: unknown[]) => findOrCreate(...a),
    bulkCreate: (...a: unknown[]) => bulkCreate(...a),
    upsert: (...a: unknown[]) => upsert(...a),
    findOne: jest.fn(),
    findAll: jest.fn(),
    count: jest.fn(),
  };
}

import {
  planFirstRollout,
  describePlannedRollout,
  DEFAULT_FIRST_ROLLOUT_MODE,
  DEFAULT_FIRST_ROLLOUT_DAILY_LIMIT,
} from '../planFirstRollout';
import { ScopeKeyError, rolloutScopeKey } from '../scopeKey';

const SCOPE = {
  brandId: '11111111-1111-4111-8111-111111111111',
  programId: '22222222-2222-4222-8222-222222222222',
  channel: 'in_app',
};

beforeEach(() => jest.clearAllMocks());

describe('it writes nothing', () => {
  it('no write method on any journey model is reachable', () => {
    planFirstRollout(SCOPE);
    describePlannedRollout(planFirstRollout(SCOPE));

    for (const [name, spy] of Object.entries(writeSpies)) {
      expect(spy).not.toHaveBeenCalled();
      expect(name).toBeTruthy();
    }
  });

  it('and says so in the row itself, so a caller cannot mistake it for a written one', () => {
    expect(planFirstRollout(SCOPE).written).toBe(false);
  });

  it('and says so in the first line a person reads', () => {
    expect(describePlannedRollout(planFirstRollout(SCOPE))[0])
      .toMatch(/PLANNED, NOT WRITTEN/);
  });
});

describe('the key comes from the real parser, not from string concatenation', () => {
  it('matches what rolloutScopeKey itself produces', () => {
    // If this ever diverges, the planned row would not be found by `findActiveRollout`, which
    // builds the same key - so the row would exist and permit nothing.
    expect(planFirstRollout(SCOPE).scope_key).toBe(rolloutScopeKey(SCOPE));
  });

  it('has the documented shape: rollout|brand|programme|channel', () => {
    expect(planFirstRollout(SCOPE).scope_key)
      .toBe(`rollout|${SCOPE.brandId}|${SCOPE.programId}|${SCOPE.channel}`);
  });

  it.each(['brandId', 'programId', 'channel'] as const)(
    'refuses an under-specified scope: missing %s throws the real parser error', (field) => {
      // A rollout with a missing dimension would widen to something nobody chose, which is why
      // the parser throws rather than defaulting. Borrowed, not re-implemented.
      expect(() => planFirstRollout({ ...SCOPE, [field]: '' }))
        .toThrow(ScopeKeyError);
      expect(() => planFirstRollout({ ...SCOPE, [field]: '' }))
        .toThrow(new RegExp(`needs a ${field.replace('Id', '')}`, 'i'));
    },
  );

  it('throws before anything else is computed, so a bad scope cannot half-build a row', () => {
    let built: unknown = 'not reached';
    try {
      built = planFirstRollout({ ...SCOPE, channel: '' });
    } catch {
      // expected
    }
    expect(built).toBe('not reached');
  });
});

describe('the defaults are the smallest first rollout', () => {
  it('defaults to review, which files a proposal and claims nothing', () => {
    // `limited` executes under a cap; `review` cannot send without a human looking at it. The
    // first rollout should produce something to read, not something to undo.
    expect(DEFAULT_FIRST_ROLLOUT_MODE).toBe('review');
    expect(planFirstRollout(SCOPE).mode).toBe('review');
  });

  it('defaults to a daily cap rather than none', () => {
    expect(DEFAULT_FIRST_ROLLOUT_DAILY_LIMIT).toBeGreaterThan(0);
    expect(planFirstRollout(SCOPE).daily_limit).toBe(DEFAULT_FIRST_ROLLOUT_DAILY_LIMIT);
  });

  it('honours an explicit mode and limit when the operator names them', () => {
    const p = planFirstRollout({ ...SCOPE, mode: 'limited', dailyLimit: 25, reason: 'CPN pilot' });
    expect(p.mode).toBe('limited');
    expect(p.daily_limit).toBe(25);
    expect(p.reason).toBe('CPN pilot');
  });

  it.each([0, -1, 1.5, Number.NaN])('refuses a daily limit of %p', (limit) => {
    expect(() => planFirstRollout({ ...SCOPE, dailyLimit: limit })).toThrow(RangeError);
  });

  it('carries a reason even when the operator gives none, so the row is never unexplained', () => {
    expect(planFirstRollout(SCOPE).reason.length).toBeGreaterThan(10);
  });
});

describe('what a person reads', () => {
  it('explains that a rollout denies by default, which is the non-obvious half', () => {
    const lines = describePlannedRollout(planFirstRollout(SCOPE)).join('\n');
    expect(lines).toMatch(/rollout denies by/);
    expect(lines).toMatch(/pause, which allows by default/);
    expect(lines).toMatch(/shadow\/no_rollout/);
  });

  it('names the route that would write it, rather than leaving that to be found', () => {
    expect(describePlannedRollout(planFirstRollout(SCOPE)).join('\n'))
      .toMatch(/POST \/api\/admin\/growth-journey\/execution\/rollouts/);
  });

  it('says what review mode means, where the reader would otherwise have to guess', () => {
    expect(describePlannedRollout(planFirstRollout(SCOPE)).join('\n'))
      .toMatch(/files a proposal; claims and sends nothing/);
  });

  it('carries no address', () => {
    // The journey tree's rule. Every value here is a uuid, a channel name, an integer or
    // authored text, so this is cheap - and absolute rules are worth asserting cheaply.
    const lines = describePlannedRollout(planFirstRollout({
      ...SCOPE, reason: 'asked for by dana@gmail.com',
    })).join('\n');
    expect(lines).not.toContain('@');
  });
});
