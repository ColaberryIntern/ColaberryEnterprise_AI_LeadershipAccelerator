import {
  planStagger,
  resolveStaggerConfig,
  nextWindowOpen,
  STAGGER_DEFAULTS,
  STAGGER_SETTING_KEYS,
  type StaggerConfig,
} from '../explorerSendSchedule';

/**
 * Spreading the day's sends instead of releasing them all at once.
 *
 * The executor runs overnight and used to queue every decision with
 * `scheduled_for: now`. The engine defers anything outside the send window, so
 * all of them became eligible at the same instant it opened — a burst at 8am,
 * competing with every other campaign that also starts then.
 */

const cfg = (over: Partial<StaggerConfig> = {}): StaggerConfig => ({
  ...STAGGER_DEFAULTS,
  ...over,
});

// 08:00 local, the window opening.
const OPEN = new Date('2026-09-10T13:00:00Z');

const minutesBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 60_000;

describe('it spreads sends across the window', () => {
  it('places the first send at the window open', () => {
    const plan = planStagger(10, OPEN, cfg());
    expect(plan.slots[0].toISOString()).toBe(OPEN.toISOString());
  });

  it('spaces them evenly rather than clumping at the start', () => {
    // Clumping would reproduce the burst with extra steps.
    const plan = planStagger(9, OPEN, cfg({ startHour: 8, endHour: 17, minGapMinutes: 4 }));
    const gaps = plan.slots.slice(1).map((s, i) => minutesBetween(plan.slots[i], s));
    expect(new Set(gaps).size).toBe(1);
    expect(gaps[0]).toBe(60); // 9 hours over 9 sends
  });

  it('keeps every send inside the window', () => {
    const config = cfg({ startHour: 8, endHour: 17 });
    const plan = planStagger(50, OPEN, config);
    const windowMinutes = (config.endHour - config.startHour) * 60;
    const last = minutesBetween(OPEN, plan.slots[plan.slots.length - 1]);
    expect(last).toBeLessThanOrEqual(windowMinutes);
  });

  it('never places two sends closer than the minimum gap', () => {
    const plan = planStagger(500, OPEN, cfg({ minGapMinutes: 4 }));
    const gaps = plan.slots.slice(1).map((s, i) => minutesBetween(plan.slots[i], s));
    for (const g of gaps) expect(g).toBeGreaterThanOrEqual(4);
  });
});

describe('what does not fit is deferred, not compressed', () => {
  it('caps at the window capacity and reports the overflow', () => {
    // 9 hours at a 4-minute floor holds 135. Squeezing 500 in by shrinking the
    // gap is how a rate limit gets hit and a reputation gets spent.
    const plan = planStagger(500, OPEN, cfg({ startHour: 8, endHour: 17, minGapMinutes: 4 }));
    expect(plan.slots).toHaveLength(135);
    expect(plan.deferred).toBe(365);
  });

  it('respects an explicit daily cap below the window capacity', () => {
    const plan = planStagger(100, OPEN, cfg({ maxPerDay: 20 }));
    expect(plan.slots).toHaveLength(20);
    expect(plan.deferred).toBe(80);
  });

  it('defers nothing when everything fits', () => {
    expect(planStagger(10, OPEN, cfg()).deferred).toBe(0);
  });
});

describe('boundaries', () => {
  it('plans nothing for nothing', () => {
    expect(planStagger(0, OPEN, cfg())).toEqual({ slots: [], deferred: 0, gapMinutes: 0 });
  });

  it('places a single send at the open with no gap', () => {
    const plan = planStagger(1, OPEN, cfg());
    expect(plan.slots).toHaveLength(1);
    expect(plan.gapMinutes).toBe(0);
  });

  it('turning it off restores the previous shape exactly', () => {
    // An operator disabling this should get the old behaviour back, not a
    // subtly different one.
    const plan = planStagger(5, OPEN, cfg({ enabled: false }));
    expect(plan.slots).toHaveLength(5);
    for (const s of plan.slots) expect(s.toISOString()).toBe(OPEN.toISOString());
    expect(plan.deferred).toBe(0);
  });
});

describe('operator settings are coerced, never trusted', () => {
  it('uses defaults when nothing is set', () => {
    expect(resolveStaggerConfig({})).toEqual(STAGGER_DEFAULTS);
  });

  it('accepts numbers typed as strings, which is how a text field arrives', () => {
    const c = resolveStaggerConfig({
      [STAGGER_SETTING_KEYS.startHour]: '9',
      [STAGGER_SETTING_KEYS.endHour]: '18',
      [STAGGER_SETTING_KEYS.minGapMinutes]: '10',
    });
    expect(c).toMatchObject({ startHour: 9, endHour: 18, minGapMinutes: 10 });
  });

  it('falls back rather than producing NaN', () => {
    // NaN would propagate into a Date and yield an Invalid Date on the row that
    // decides when a real person is emailed.
    const c = resolveStaggerConfig({
      [STAGGER_SETTING_KEYS.startHour]: 'nine oclock',
      [STAGGER_SETTING_KEYS.minGapMinutes]: '',
    });
    expect(c.startHour).toBe(STAGGER_DEFAULTS.startHour);
    expect(c.minGapMinutes).toBe(STAGGER_DEFAULTS.minGapMinutes);
  });

  it('repairs an end hour at or before the start', () => {
    // A negative window puts every send on the same instant — the exact burst
    // this exists to prevent.
    const c = resolveStaggerConfig({
      [STAGGER_SETTING_KEYS.startHour]: 17,
      [STAGGER_SETTING_KEYS.endHour]: 8,
    });
    expect(c.endHour).toBeGreaterThan(c.startHour);
  });

  it('clamps hours into a real day', () => {
    const c = resolveStaggerConfig({
      [STAGGER_SETTING_KEYS.startHour]: -5,
      [STAGGER_SETTING_KEYS.endHour]: 99,
    });
    expect(c.startHour).toBeGreaterThanOrEqual(0);
    expect(c.endHour).toBeLessThanOrEqual(23);
  });

  it('treats the enabled flag as an explicit opt-out only', () => {
    expect(resolveStaggerConfig({ [STAGGER_SETTING_KEYS.enabled]: 'false' }).enabled).toBe(false);
    expect(resolveStaggerConfig({ [STAGGER_SETTING_KEYS.enabled]: false }).enabled).toBe(false);
    expect(resolveStaggerConfig({ [STAGGER_SETTING_KEYS.enabled]: 'true' }).enabled).toBe(true);
  });
});

describe('the window opens at the right local time', () => {
  it('waits for this morning when the run is before the window', () => {
    // 06:00 Chicago — the window opens in two hours, today.
    const before = new Date('2026-09-10T11:00:00Z');
    const open = nextWindowOpen(before, cfg({ startHour: 8 }), 'America/Chicago');
    expect(open.getTime()).toBeGreaterThan(before.getTime());
    expect(open.getTime() - before.getTime()).toBe(2 * 3_600_000);
  });

  it('waits for tomorrow when the run is inside or past the window', () => {
    // 20:00 Chicago — the next open is twelve hours away.
    const evening = new Date('2026-09-11T01:00:00Z');
    const open = nextWindowOpen(evening, cfg({ startHour: 8 }), 'America/Chicago');
    expect(open.getTime() - evening.getTime()).toBe(12 * 3_600_000);
  });

  it('reads the hour in the given zone, not the server’s', () => {
    // The same instant is a different hour in each zone, so the wait differs.
    const at = new Date('2026-09-10T11:00:00Z');
    const chicago = nextWindowOpen(at, cfg({ startHour: 8 }), 'America/Chicago');
    const london = nextWindowOpen(at, cfg({ startHour: 8 }), 'Europe/London');
    expect(chicago.getTime()).not.toBe(london.getTime());
  });
});
