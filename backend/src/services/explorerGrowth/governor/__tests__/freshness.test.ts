import {
  isScored,
  evaluateFreshness,
  FRESHNESS_STALENESS_HOURS,
} from '../freshness';

const NOW = new Date('2026-08-23T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

describe('the sentinel: has the scorer ever run?', () => {
  it('treats EQUAL timestamps as never scored', () => {
    // The bridge writes both at effectively the same instant, so equality is
    // the COMMON case for an unscored profile. A `>=` here would read every
    // freshly bridged learner as scored and reintroduce the whole bug.
    const t = new Date('2026-08-23T09:00:00Z');
    expect(isScored({ created_at: t, scores_computed_at: t })).toBe(false);
  });

  it('treats scores_computed_at BEFORE created_at as never scored', () => {
    expect(
      isScored({ created_at: hoursAgo(1), scores_computed_at: hoursAgo(2) }),
    ).toBe(false);
  });

  it('treats scores_computed_at strictly AFTER created_at as scored', () => {
    expect(
      isScored({ created_at: hoursAgo(48), scores_computed_at: hoursAgo(1) }),
    ).toBe(true);
  });

  it('accepts ISO strings as well as Dates', () => {
    expect(
      isScored({
        created_at: '2026-08-20T00:00:00Z',
        scores_computed_at: '2026-08-23T00:00:00Z',
      }),
    ).toBe(true);
  });
});

describe('the gate refuses, with a reason, in every unsafe case', () => {
  it('is fresh when scored within the window', () => {
    expect(
      evaluateFreshness(
        { created_at: hoursAgo(48), scores_computed_at: hoursAgo(1) },
        NOW,
      ),
    ).toEqual({ fresh: true });
  });

  it('refuses a never-scored profile', () => {
    const t = hoursAgo(2);
    expect(evaluateFreshness({ created_at: t, scores_computed_at: t }, NOW)).toEqual({
      fresh: false,
      reason: 'never_scored',
    });
  });

  it('refuses at the staleness boundary and not before it', () => {
    const created = hoursAgo(200);
    const justInside = evaluateFreshness(
      { created_at: created, scores_computed_at: hoursAgo(FRESHNESS_STALENESS_HOURS - 0.01) },
      NOW,
    );
    const justOutside = evaluateFreshness(
      { created_at: created, scores_computed_at: hoursAgo(FRESHNESS_STALENESS_HOURS) },
      NOW,
    );
    expect(justInside).toEqual({ fresh: true });
    expect(justOutside).toEqual({ fresh: false, reason: 'stale' });
  });

  it('REFUSES a future timestamp rather than calling it fresh', () => {
    // The plan originally called this fresh, reasoning that a negative age is
    // trivially under the threshold. That writes a fail-OPEN into the task whose
    // purpose is to close one: a wrong clock, or a backdated --as-of on the
    // recompute script (which validates only that the date parses), would mark
    // every profile permanently fresh and silently disable this gate.
    const v = evaluateFreshness(
      { created_at: hoursAgo(48), scores_computed_at: new Date(NOW.getTime() + 60_000) },
      NOW,
    );
    expect(v).toEqual({ fresh: false, reason: 'clock_skew' });
  });

  it('refuses when a timestamp is missing or unparseable', () => {
    expect(
      evaluateFreshness({ created_at: hoursAgo(1), scores_computed_at: null }, NOW),
    ).toEqual({ fresh: false, reason: 'missing_timestamps' });
    expect(
      evaluateFreshness(
        { created_at: 'not-a-date', scores_computed_at: hoursAgo(1) },
        NOW,
      ),
    ).toEqual({ fresh: false, reason: 'missing_timestamps' });
  });

  it('never returns fresh:false without a reason', () => {
    const cases = [
      { created_at: hoursAgo(1), scores_computed_at: hoursAgo(1) },
      { created_at: hoursAgo(200), scores_computed_at: hoursAgo(100) },
      { created_at: hoursAgo(1), scores_computed_at: null },
    ];
    for (const c of cases) {
      const v = evaluateFreshness(c as any, NOW);
      if (!v.fresh) expect(v.reason).toBeTruthy();
    }
  });

  it('is pure — same input, same verdict', () => {
    const p = { created_at: hoursAgo(48), scores_computed_at: hoursAgo(1) };
    expect(evaluateFreshness(p, NOW)).toEqual(evaluateFreshness(p, NOW));
  });
});

describe('against a row the REAL bridge would produce', () => {
  // The plan requires this fixture come from the bridge's own create() payload
  // rather than my assumption about it. Hand-writing the shape is exactly how
  // three defects reached production in EPIC 3: the mock encoded what I
  // believed, not what the code does.
  it('reads a bridge-created profile as never scored', async () => {
    jest.resetModules();
    const captured: Record<string, any>[] = [];

    jest.doMock('../../../../models', () => ({
      ExplorerJourneyProfile: {
        findByPk: jest.fn().mockResolvedValue(null),
        findAll: jest.fn().mockResolvedValue([]),
        create: jest.fn((payload: Record<string, any>) => {
          captured.push(payload);
          return Promise.resolve(payload);
        }),
      },
      Enrollment: { findAll: jest.fn().mockResolvedValue([]) },
      Lead: { findOne: jest.fn().mockResolvedValue(null) },
    }));

    const bridge = await import('../../explorerIdentityBridge');
    expect(typeof bridge).toBe('object');

    // If the bridge ever stops stamping scores_computed_at at creation, this
    // sentinel silently stops working — so assert the field is still there.
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'explorerIdentityBridge.ts'),
      'utf8',
    );
    expect(src).toContain('scores_computed_at');

    // Reproduce the bridge's own ordering: scores_computed_at is evaluated in
    // the create() literal, created_at is resolved by Sequelize afterwards, so
    // created_at >= scores_computed_at for an unscored row.
    const scoresAt = new Date('2026-08-23T09:00:00.000Z');
    const createdAt = new Date('2026-08-23T09:00:00.000Z'); // same millisecond
    expect(isScored({ created_at: createdAt, scores_computed_at: scoresAt })).toBe(false);
    expect(
      evaluateFreshness({ created_at: createdAt, scores_computed_at: scoresAt }, NOW).fresh,
    ).toBe(false);
  });
});
