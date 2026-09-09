/**
 * Explorer Growth OS — spread the day's sends across the send window.
 *
 * THE PROBLEM THIS SOLVES. The executor runs once, overnight, and queued every
 * decision with `scheduled_for: now`. The scheduler defers anything outside the
 * send window, so all of them became eligible at the same instant the window
 * opened — a burst at 8am, competing with every other campaign that also starts
 * then. Nothing was wrong with any single message; the shape of the traffic was
 * wrong.
 *
 * So slots are computed the night before, when the schedule is created, and
 * written onto each row's `scheduled_for`. The engine then picks them up
 * naturally through the day.
 *
 * EVERY NUMBER HERE IS OPERATOR-CONTROLLED via `system_settings`, because the
 * right cadence is a judgment about the rest of the sending programme rather
 * than a property of this subsystem, and it will change without the code
 * changing.
 *
 * PURE. No I/O, no clock of its own — `windowStart` is passed in. That is what
 * makes "what would tomorrow look like" answerable without waiting for
 * tomorrow.
 */

export interface StaggerConfig {
  /** Off puts everything at the window open, i.e. the previous behaviour. */
  enabled: boolean;
  /** Local hour the window opens, 0-23. */
  startHour: number;
  /** Local hour the window closes, 0-23, exclusive. */
  endHour: number;
  /** Never place two sends closer than this. */
  minGapMinutes: number;
  /** Hard ceiling on Explorer sends in one day. */
  maxPerDay: number;
}

export const STAGGER_DEFAULTS: StaggerConfig = {
  enabled: true,
  startHour: 8,
  endHour: 17,
  // 4 minutes: with a 9-hour window that is room for 135 sends, comfortably
  // above the current population, while still being far enough apart that a
  // downstream rate limit never sees a burst.
  minGapMinutes: 4,
  maxPerDay: 200,
};

/** Settings keys, so the service, the defaults and any admin UI share one list. */
export const STAGGER_SETTING_KEYS = {
  enabled: 'explorer_stagger_enabled',
  startHour: 'explorer_send_window_start_hour',
  endHour: 'explorer_send_window_end_hour',
  minGapMinutes: 'explorer_stagger_min_gap_minutes',
  maxPerDay: 'explorer_max_sends_per_day',
} as const;

/**
 * Coerce whatever is in `system_settings` into a usable config.
 *
 * A setting is edited by a human in a text field and arrives as a string, a
 * number, or nonsense. Anything unusable falls back to the default rather than
 * producing `NaN`, which would propagate into a Date and yield an Invalid Date
 * on a row that decides when a real person is emailed.
 */
export function resolveStaggerConfig(raw: Record<string, unknown>): StaggerConfig {
  const num = (v: unknown, fallback: number, min: number, max: number): number => {
    // An EMPTY string is "unset", not zero. Number('') is 0, which is finite,
    // so without this an operator clearing a field would be read as asking for
    // zero and silently clamped to the minimum — the opposite of the default
    // they were reaching for.
    if (typeof v === 'string' && v.trim() === '') return fallback;
    const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  };

  const enabledRaw = raw[STAGGER_SETTING_KEYS.enabled];
  const enabled =
    enabledRaw === undefined || enabledRaw === null
      ? STAGGER_DEFAULTS.enabled
      : enabledRaw === true || enabledRaw === 'true';

  const startHour = num(raw[STAGGER_SETTING_KEYS.startHour], STAGGER_DEFAULTS.startHour, 0, 23);
  let endHour = num(raw[STAGGER_SETTING_KEYS.endHour], STAGGER_DEFAULTS.endHour, 0, 23);

  // An end at or before the start is a misconfiguration that would otherwise
  // produce a zero-length or negative window, and a negative window means every
  // send lands on the same instant — the exact burst this exists to prevent.
  if (endHour <= startHour) endHour = Math.min(23, startHour + 1);

  return {
    enabled,
    startHour,
    endHour,
    minGapMinutes: num(raw[STAGGER_SETTING_KEYS.minGapMinutes], STAGGER_DEFAULTS.minGapMinutes, 1, 240),
    maxPerDay: num(raw[STAGGER_SETTING_KEYS.maxPerDay], STAGGER_DEFAULTS.maxPerDay, 1, 10000),
  };
}

export interface StaggerPlan {
  /** One send time per decision, in order. Shorter than `count` when capped. */
  slots: Date[];
  /** How many did not fit today. */
  deferred: number;
  /** Minutes actually used between sends. */
  gapMinutes: number;
}

/**
 * Lay `count` sends across the window that opens at `windowStart`.
 *
 * Spacing is the window divided by the count, floored at `minGapMinutes`. Even
 * spread is the point: clumping them at the start would reproduce the burst
 * with extra steps.
 *
 * WHAT DOES NOT FIT IS DEFERRED, NOT COMPRESSED. Squeezing 300 sends into a
 * 9-hour window by shrinking the gap is how a rate limit gets hit and a
 * reputation gets spent. The overflow simply stays unexecuted and is picked up
 * by the next night's run, which is why the executor leaves those decisions
 * alone rather than marking them done.
 */
export function planStagger(count: number, windowStart: Date, config: StaggerConfig): StaggerPlan {
  if (count <= 0) return { slots: [], deferred: 0, gapMinutes: 0 };

  const windowMinutes = (config.endHour - config.startHour) * 60;

  if (!config.enabled) {
    // Previous behaviour, kept reachable on purpose: an operator turning this
    // off should get the old shape back, not a subtly different one.
    return { slots: Array.from({ length: count }, () => new Date(windowStart)), deferred: 0, gapMinutes: 0 };
  }

  // How many can the window hold at the minimum gap?
  const capacity = Math.max(1, Math.floor(windowMinutes / config.minGapMinutes));
  const allowed = Math.min(count, capacity, config.maxPerDay);
  const deferred = count - allowed;

  // Spread across the whole window when there is room; fall back to the minimum
  // gap when there is not.
  const gapMinutes =
    allowed <= 1 ? 0 : Math.max(config.minGapMinutes, Math.floor(windowMinutes / allowed));

  const slots: Date[] = [];
  for (let i = 0; i < allowed; i++) {
    slots.push(new Date(windowStart.getTime() + i * gapMinutes * 60_000));
  }

  return { slots, deferred, gapMinutes };
}

/**
 * The next moment the window opens, at or after `now`.
 *
 * Uses `Intl` to read the local hour in `timezone` rather than assuming the
 * server's zone or a fixed offset — an offset captured once is wrong for half
 * the year, and being an hour early here means emailing before the window
 * opens.
 */
export function nextWindowOpen(now: Date, config: StaggerConfig, timezone: string): Date {
  const localHour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false })
      .formatToParts(now)
      .find((p) => p.type === 'hour')?.value,
  );

  if (!Number.isFinite(localHour)) return new Date(now);

  // Before the window opens today: wait for it. Inside or past it: the executor
  // runs overnight, so "past it" means the window opens tomorrow.
  const hoursUntilOpen =
    localHour < config.startHour
      ? config.startHour - localHour
      : 24 - localHour + config.startHour;

  const open = new Date(now.getTime() + hoursUntilOpen * 3_600_000);
  // Land on the hour rather than carrying the current minute across.
  open.setUTCMinutes(0, 0, 0);
  return open;
}
