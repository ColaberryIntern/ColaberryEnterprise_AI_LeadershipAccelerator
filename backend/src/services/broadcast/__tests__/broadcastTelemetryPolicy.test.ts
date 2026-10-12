import {
  resolveSeconds,
  resolveTelemetryConfig,
  rejectUntrustedFields,
  isFresh,
  countsAsWatching,
  creditSeconds,
  resolveIntent,
  excludedFromReporting,
  TELEMETRY_BOUNDS,
  TELEMETRY_SETTING_KEYS,
  UNTRUSTED_FIELDS,
  type TelemetryConfig,
  type SessionSnapshot,
} from '../broadcastTelemetryPolicy';

/**
 * The measurement rules. No database, no clock — every "when" is an exact number.
 *
 * The four properties worth the most here are the ones a wrong implementation gets away with
 * for a long time: two tabs must not count twice, a lid closed for an hour must not become an
 * hour of watch time, a paused tab must not be an audience member, and a staff account must
 * not inflate a business number.
 */

const T0 = 1_700_000_000_000;

const cfg = (over: Partial<TelemetryConfig> = {}): TelemetryConfig => ({
  appHeartbeatSeconds: 30,
  appActiveWindowSeconds: 90,
  playbackHeartbeatSeconds: 15,
  viewerExpirySeconds: 45,
  bufferingGraceSeconds: 20,
  ...over,
});

const beat = (over: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
  state: 'playing',
  lastBeatAt: T0,
  lastPlayingAt: T0,
  ...over,
});

describe('settings are clamped, because an operator typo is the realistic failure', () => {
  it('accepts a sane value unchanged', () => {
    expect(resolveSeconds(30, TELEMETRY_BOUNDS.appHeartbeatSeconds)).toBe(30);
    expect(resolveSeconds('45', TELEMETRY_BOUNDS.viewerExpirySeconds)).toBe(45);
  });

  it('raises below the floor and lowers above the ceiling', () => {
    expect(resolveSeconds(1, TELEMETRY_BOUNDS.playbackHeartbeatSeconds)).toBe(5);
    expect(resolveSeconds(100_000, TELEMETRY_BOUNDS.viewerExpirySeconds)).toBe(600);
    expect(resolveSeconds(-30, TELEMETRY_BOUNDS.appHeartbeatSeconds)).toBe(10);
  });

  it('falls back to the default rather than to NaN', () => {
    // NaN survives Math.min/Math.max, so without the explicit guard a typo would propagate a
    // NaN window and every freshness comparison would silently answer false — measurement
    // would read zero viewers and look like a quiet broadcast rather than a broken setting.
    for (const bad of [undefined, null, '', '   ', 'thirty', {}, [], NaN]) {
      expect(resolveSeconds(bad, TELEMETRY_BOUNDS.playbackHeartbeatSeconds)).toBe(15);
    }
  });

  it('pins the documented defaults as NUMBERS, not just as relationships', () => {
    // Every other assertion compares against TELEMETRY_BOUNDS, so changing a bound would
    // leave them all passing. These are the metrics dictionary's published values.
    expect(TELEMETRY_BOUNDS.appHeartbeatSeconds.def).toBe(30);
    expect(TELEMETRY_BOUNDS.appActiveWindowSeconds.def).toBe(90);
    expect(TELEMETRY_BOUNDS.playbackHeartbeatSeconds.def).toBe(15);
    expect(TELEMETRY_BOUNDS.viewerExpirySeconds.def).toBe(45);
    expect(TELEMETRY_BOUNDS.bufferingGraceSeconds.def).toBe(20);
  });

  it('reads the setting KEYS the dictionary names', () => {
    expect(TELEMETRY_SETTING_KEYS).toEqual({
      appHeartbeatSeconds: 'live_app_heartbeat_seconds',
      appActiveWindowSeconds: 'live_app_active_window_seconds',
      playbackHeartbeatSeconds: 'live_playback_heartbeat_seconds',
      viewerExpirySeconds: 'live_viewer_expiry_seconds',
      bufferingGraceSeconds: 'live_buffering_grace_seconds',
    });
  });

  it('builds the whole config from settings, defaulting what is absent', () => {
    const c = resolveTelemetryConfig({
      live_playback_heartbeat_seconds: 10,
      live_viewer_expiry_seconds: 60,
    });
    expect(c.playbackHeartbeatSeconds).toBe(10);
    expect(c.viewerExpirySeconds).toBe(60);
    expect(c.appHeartbeatSeconds).toBe(30);
  });

  it('REPAIRS an expiry window shorter than the heartbeat that refreshes it', () => {
    // Independently settable, so this combination is reachable by two valid-looking edits.
    // Left alone, a viewer watching perfectly normally expires between beats and
    // "watching now" oscillates — which reads as a flaky audience, not a bad setting.
    const c = resolveTelemetryConfig({
      live_playback_heartbeat_seconds: 60,
      live_viewer_expiry_seconds: 20,
    });
    expect(c.viewerExpirySeconds).toBeGreaterThanOrEqual(c.playbackHeartbeatSeconds * 2);
  });

  it('repairs the app window the same way', () => {
    const c = resolveTelemetryConfig({
      live_app_heartbeat_seconds: 120,
      live_app_active_window_seconds: 40,
    });
    expect(c.appActiveWindowSeconds).toBeGreaterThanOrEqual(c.appHeartbeatSeconds * 2);
  });

  it('never throws, whatever the settings table holds', () => {
    expect(() => resolveTelemetryConfig(undefined)).not.toThrow();
    expect(() => resolveTelemetryConfig({ live_viewer_expiry_seconds: { nested: true } })).not.toThrow();
  });
});

describe('a client may never assert its own identity, entitlement or counts', () => {
  it('names every forbidden field it finds', () => {
    const offenders = rejectUntrustedFields({
      occurrence_id: 'occ-1', state: 'playing', person_id: 'p-1', is_staff: false, watching_now: 500,
    });
    expect(offenders).toEqual(expect.arrayContaining(['person_id', 'is_staff', 'watching_now']));
    expect(offenders).not.toContain('occurrence_id');
    expect(offenders).not.toContain('state');
  });

  it('passes a clean payload', () => {
    expect(rejectUntrustedFields({
      occurrence_id: 'occ-1', session_id: 's-1', state: 'playing', intent: 'deliberate',
    })).toEqual([]);
  });

  it('covers both snake_case and camelCase, since a client may send either', () => {
    expect(rejectUntrustedFields({ personId: 'p' })).toContain('personId');
    expect(rejectUntrustedFields({ person_id: 'p' })).toContain('person_id');
    expect(rejectUntrustedFields({ accessMode: 'paid' })).toContain('accessMode');
  });

  it('guards the entitlement fields specifically — the ones that would corrupt a split', () => {
    for (const f of ['access_mode', 'paid', 'is_paid', 'entitlement', 'grant']) {
      expect(UNTRUSTED_FIELDS).toContain(f as never);
      expect(rejectUntrustedFields({ [f]: 'x' })).toContain(f);
    }
  });

  it('survives a non-object body rather than throwing into the route', () => {
    for (const bad of [null, undefined, 'string', 42, true]) {
      expect(rejectUntrustedFields(bad)).toEqual([]);
    }
  });
});

describe('expiry — a tab that stops reporting stops counting', () => {
  it('counts a beat inside the window', () => {
    expect(isFresh(beat({ lastBeatAt: T0 - 44_000 }), T0, cfg())).toBe(true);
  });

  it('drops a beat past the window', () => {
    // The viewer never said they left: the laptop closed, the tunnel dropped, the process
    // died. Counting them for ever is how a live audience never goes down.
    expect(isFresh(beat({ lastBeatAt: T0 - 46_000 }), T0, cfg())).toBe(false);
  });

  it('treats a beat from the FUTURE as not fresh', () => {
    // A skewed client clock would otherwise buy itself unlimited freshness.
    expect(isFresh(beat({ lastBeatAt: T0 + 60_000 }), T0, cfg())).toBe(false);
  });

  it('is exactly inclusive at the boundary', () => {
    expect(isFresh(beat({ lastBeatAt: T0 - 45_000 }), T0, cfg())).toBe(true);
    expect(isFresh(beat({ lastBeatAt: T0 - 45_001 }), T0, cfg())).toBe(false);
  });
});

describe('watching_now excludes what the dictionary says it excludes', () => {
  it('counts a playing tab', () => {
    expect(countsAsWatching(beat(), T0, cfg())).toBe(true);
  });

  it('does NOT count a paused tab', () => {
    // Counting pauses turns an audience number into a count of open browsers.
    expect(countsAsWatching(beat({ state: 'paused' }), T0, cfg())).toBe(false);
  });

  it('does NOT count an ended tab', () => {
    expect(countsAsWatching(beat({ state: 'ended' }), T0, cfg())).toBe(false);
  });

  it('counts buffering INSIDE the grace window', () => {
    expect(countsAsWatching(
      beat({ state: 'buffering', lastPlayingAt: T0 - 19_000 }), T0, cfg(),
    )).toBe(true);
  });

  it('stops counting buffering past the grace window', () => {
    // Someone who left mid-stall is not watching, however long the element keeps trying.
    expect(countsAsWatching(
      beat({ state: 'buffering', lastPlayingAt: T0 - 21_000 }), T0, cfg(),
    )).toBe(false);
  });

  it('does not count buffering that NEVER played', () => {
    expect(countsAsWatching(
      beat({ state: 'buffering', lastPlayingAt: null }), T0, cfg(),
    )).toBe(false);
  });

  it('does not treat a null lastPlayingAt as TIME ZERO', () => {
    // The test above passed with the null guard removed, which a mutation caught: `now - null`
    // coerces to `now - 0`, an epoch-scale stall that fails the grace check for any realistic
    // clock, so the guard looked redundant. It is not — it is what stops null meaning 1970.
    // Pinned at a small clock, where the coercion WOULD land inside the grace window and a
    // tab that never played once would be counted as watching.
    const justAfterEpoch = 10_000;
    expect(countsAsWatching(
      { state: 'buffering', lastBeatAt: justAfterEpoch, lastPlayingAt: null },
      justAfterEpoch,
      cfg(),
    )).toBe(false);
  });

  it('an expired tab does not count however good its state looks', () => {
    expect(countsAsWatching(
      beat({ state: 'playing', lastBeatAt: T0 - 100_000 }), T0, cfg(),
    )).toBe(false);
  });
});

describe('watch time is credited PER PERSON — the whole dedup story', () => {
  it('credits nothing on the first beat, which only establishes a baseline', () => {
    expect(creditSeconds(null, T0, cfg())).toBe(0);
  });

  it('credits the elapsed gap for a steady single tab', () => {
    expect(creditSeconds(T0 - 15_000, T0, cfg())).toBe(15);
  });

  it('TWO TABS DO NOT DOUBLE COUNT', () => {
    // Both tabs beat every 15s, offset by 7.5s. Because the gap is measured from the PERSON's
    // last credit and not the tab's, four beats across two tabs over 30 seconds credit about
    // 30 seconds — not 60. This is the single assertion that separates "unique attendees"
    // from "open browsers".
    const c = cfg();
    let last = T0;
    let total = 0;
    for (const t of [7_500, 15_000, 22_500, 30_000]) {
      const credited = creditSeconds(last, T0 + t, c);
      total += credited;
      last = T0 + t;
    }
    expect(total).toBeCloseTo(30, 5);
  });

  it('does NOT credit an hour to a viewer who closed the lid for an hour', () => {
    // Capped at two heartbeat periods: wall clock between two observations is attributed to
    // the smaller of "what elapsed" and "what one missed beat could explain".
    expect(creditSeconds(T0 - 3_600_000, T0, cfg())).toBe(30);
  });

  it('tolerates exactly one missed beat without under-crediting', () => {
    expect(creditSeconds(T0 - 30_000, T0, cfg())).toBe(30);
  });

  it('credits nothing for a zero or negative gap', () => {
    // Two tabs beating in the same millisecond, or a clock that went backwards.
    expect(creditSeconds(T0, T0, cfg())).toBe(0);
    expect(creditSeconds(T0 + 5_000, T0, cfg())).toBe(0);
  });

  it('scales the cap with the configured heartbeat', () => {
    expect(creditSeconds(T0 - 3_600_000, T0, cfg({ playbackHeartbeatSeconds: 5 }))).toBe(10);
  });
});

describe('intent is sticky once deliberate', () => {
  it('a deliberate viewer stays deliberate through an automatic resume', () => {
    // A credential renewal re-plays the element with no gesture. Downgrading would move a
    // real tune-in into auto-exposure, which the dictionary forbids reporting as interest.
    expect(resolveIntent('deliberate', 'auto')).toBe('deliberate');
  });

  it('an auto viewer becomes deliberate when they act', () => {
    expect(resolveIntent('auto', 'deliberate')).toBe('deliberate');
  });

  it('auto stays auto', () => {
    expect(resolveIntent('auto', 'auto')).toBe('auto');
    expect(resolveIntent(null, 'auto')).toBe('auto');
  });

  it('a first deliberate beat is deliberate', () => {
    expect(resolveIntent(null, 'deliberate')).toBe('deliberate');
  });
});

describe('staff and test accounts are out of business reporting by default', () => {
  it('excludes staff', () => {
    expect(excludedFromReporting({ isStaff: true, isTest: false })).toBe(true);
  });

  it('excludes test accounts', () => {
    expect(excludedFromReporting({ isStaff: false, isTest: true })).toBe(true);
  });

  it('keeps an ordinary viewer', () => {
    expect(excludedFromReporting({ isStaff: false, isTest: false })).toBe(false);
  });

  it('includes everyone in diagnostic mode, so a producer can see themselves', () => {
    expect(excludedFromReporting({ isStaff: true, isTest: true }, true)).toBe(false);
  });

  it('diagnostic mode is OPT-IN — the default argument excludes', () => {
    // The mutation this kills is flipping the default to `true`, which would silently put
    // every staff viewer into the audience number reported upward.
    expect(excludedFromReporting({ isStaff: true, isTest: false })).toBe(true);
  });
});
