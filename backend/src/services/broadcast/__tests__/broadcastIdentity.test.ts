/**
 * broadcastIdentity is pure, so these are exhaustive rather than representative.
 *
 * The cases map to request §5 P2-02's named list — duplicate source refs, recurring
 * occurrences staying distinct, an unknown source, and the one that matters most: an event
 * that has ALREADY STARTED must still be visible, which no existing feed in this repo can
 * manage because they all filter `starts_at >= now`.
 */
import {
  deriveStartInstant,
  occurrenceKeyFor,
  selectActive,
  isActiveState,
  previewSecondsRemaining,
  ACTIVE_STATES,
} from '../broadcastIdentity';

describe('deriveStartInstant — Central wall-clock sources', () => {
  it('resolves a live_session wall-clock to the true Central instant, not the naive UTC one', () => {
    // 2026-07-23 is CDT (UTC-5), so 18:30 Central is 23:30Z.
    const { startsAt, derived } = deriveStartInstant({
      sourceType: 'live_session', sourceId: 's1', sessionDate: '2026-07-23', rawStartTime: '18:30',
    });
    expect(derived).toBe(true);
    expect(startsAt!.toISOString()).toBe('2026-07-23T23:30:00.000Z');

    // The bug this replaces: a naive parse yields 18:30Z — five hours early. If these two
    // were ever equal, the Central conversion would not be doing anything.
    expect(startsAt!.toISOString()).not.toBe('2026-07-23T18:30:00.000Z');
  });

  it('follows DST rather than hardcoding an offset', () => {
    // January is CST (UTC-6): 18:30 Central is 00:30Z the NEXT day.
    const winter = deriveStartInstant({
      sourceType: 'live_session', sourceId: 's2', sessionDate: '2026-01-14', rawStartTime: '18:30',
    });
    expect(winter.startsAt!.toISOString()).toBe('2026-01-15T00:30:00.000Z');

    const summer = deriveStartInstant({
      sourceType: 'live_session', sourceId: 's3', sessionDate: '2026-07-14', rawStartTime: '18:30',
    });
    expect(summer.startsAt!.toISOString()).toBe('2026-07-14T23:30:00.000Z');
  });

  it('accepts the trailing seconds a Sequelize TIME column returns', () => {
    // The private copy in communityCalendarService.ts does NOT tolerate "HH:MM:SS" and
    // silently yields 10:00 — the exact regression centralDate's header warns about.
    const withSeconds = deriveStartInstant({
      sourceType: 'live_session', sourceId: 's4', sessionDate: '2026-07-23', rawStartTime: '18:30:00',
    });
    expect(withSeconds.derived).toBe(true);
    expect(withSeconds.startsAt!.toISOString()).toBe('2026-07-23T23:30:00.000Z');
  });

  it('accepts 12-hour wall-clock with a meridiem', () => {
    const pm = deriveStartInstant({
      sourceType: 'live_session', sourceId: 's5', sessionDate: '2026-07-23', rawStartTime: '6:30 PM',
    });
    expect(pm.startsAt!.toISOString()).toBe('2026-07-23T23:30:00.000Z');
  });

  it('REPORTS the 10:00 fallback instead of hiding it', () => {
    const bad = deriveStartInstant({
      sourceType: 'live_session', sourceId: 's6', sessionDate: '2026-07-23', rawStartTime: 'sometime after lunch',
    });
    // A usable instant still comes back (scheduling math needs one) but the caller is told.
    expect(bad.derived).toBe(false);
    expect(bad.reason).toBe('unparseable_time');
    expect(bad.startsAt).not.toBeNull();
  });

  it('reports missing inputs rather than inventing a time', () => {
    expect(deriveStartInstant({ sourceType: 'live_session', sourceId: 's7', sessionDate: '2026-07-23' }))
      .toMatchObject({ startsAt: null, derived: false, reason: 'missing_input' });
  });
});

describe('deriveStartInstant — instant-bearing and CCPP sources', () => {
  it('passes through a source that already stores a true instant', () => {
    const at = new Date('2026-07-23T23:30:00.000Z');
    for (const sourceType of ['open_house_event', 'community_event', 'room_booking'] as const) {
      const r = deriveStartInstant({ sourceType, sourceId: 'x', startsAt: at });
      expect(r.derived).toBe(true);
      expect(r.startsAt!.toISOString()).toBe('2026-07-23T23:30:00.000Z');
    }
  });

  it('re-interprets a CCPP naive wall-clock as Central', () => {
    // The mssql driver reads Central wall-clock into UTC fields, so 18:30 arrives as 18:30Z.
    const r = deriveStartInstant({
      sourceType: 'ccpp_event', sourceId: 'eb-1', naiveCentralStartsAt: new Date('2026-07-23T18:30:00.000Z'),
    });
    expect(r.derived).toBe(true);
    expect(r.startsAt!.toISOString()).toBe('2026-07-23T23:30:00.000Z');
  });

  it('quarantines an unknown source type instead of guessing', () => {
    const r = deriveStartInstant({ sourceType: 'something_new' as any, sourceId: 'z', startsAt: new Date() });
    expect(r.derived).toBe(false);
    expect(r.startsAt).toBeNull();
  });
});

describe('occurrenceKeyFor', () => {
  const at = new Date('2026-07-23T23:30:00.000Z');

  it('is stable, so re-running an import converges instead of duplicating', () => {
    expect(occurrenceKeyFor('live_session', 's1', at)).toBe(occurrenceKeyFor('live_session', 's1', at));
  });

  it('ignores sub-minute jitter — the same airing is the same airing', () => {
    const jittered = new Date('2026-07-23T23:30:41.000Z');
    expect(occurrenceKeyFor('live_session', 's1', jittered)).toBe(occurrenceKeyFor('live_session', 's1', at));
  });

  it('keeps each episode of a recurring series DISTINCT under one reused meeting id', () => {
    // The failure this prevents: one persistent Zoom meeting id standing in for a whole season.
    const week1 = occurrenceKeyFor('live_session', 'zoom-999', new Date('2026-07-23T23:30:00Z'));
    const week2 = occurrenceKeyFor('live_session', 'zoom-999', new Date('2026-07-30T23:30:00Z'));
    expect(week1).not.toBe(week2);
  });

  it('separates two different sources that share an id value', () => {
    expect(occurrenceKeyFor('live_session', 'shared-id', at))
      .not.toBe(occurrenceKeyFor('community_event', 'shared-id', at));
  });

  it('marks an unscheduled source rather than fabricating a timestamp', () => {
    expect(occurrenceKeyFor('room_booking', 'b1', null)).toContain('unscheduled');
  });
});

describe('selectActive — the already-started event every existing feed hides', () => {
  const started = {
    id: 'occ-live', editorial_state: 'live',
    scheduled_start_at: new Date('2026-07-23T23:30:00Z'),
    content_started_at: new Date('2026-07-23T23:32:00Z'),
  };
  const upcoming = { id: 'occ-next', editorial_state: 'scheduled', scheduled_start_at: new Date('2026-07-24T23:30:00Z') };
  const done = { id: 'occ-done', editorial_state: 'ended', scheduled_start_at: new Date('2026-07-22T23:30:00Z') };

  it('returns an occurrence that started 10 minutes ago', () => {
    // communityCalendarService.ts:94 filters `starts_at >= now` and would drop this row even
    // though its own status says live. That is the defect this whole entity exists to fix.
    const active = selectActive([started, upcoming, done]);
    expect(active.map((o) => o.id)).toEqual(['occ-live']);
  });

  it('includes backstage and reconnecting, excludes scheduled and ended', () => {
    const rows = ACTIVE_STATES.map((s, i) => ({ id: `a${i}`, editorial_state: s }));
    expect(selectActive(rows)).toHaveLength(ACTIVE_STATES.length);
    expect(selectActive([{ id: 'x', editorial_state: 'processing' }])).toHaveLength(0);
    expect(selectActive([{ id: 'y', editorial_state: 'cancelled' }])).toHaveLength(0);
  });

  it('does not consult the clock at all — state is the only input', () => {
    // Both directions, deliberately. A future-dated row alone would still pass a
    // `starts_at >= now` filter, so it cannot prove the clock is unused; the long-past row
    // is what actually fails if a time filter is ever reintroduced.
    const farFuture = { id: 'future', editorial_state: 'live', scheduled_start_at: new Date('2099-01-01T00:00:00Z') };
    const longPast = { id: 'past', editorial_state: 'live', scheduled_start_at: new Date('2001-01-01T00:00:00Z') };
    const noSchedule = { id: 'none', editorial_state: 'live', scheduled_start_at: null };
    expect(selectActive([farFuture, longPast, noSchedule]).map((o) => o.id)).toEqual(['future', 'past', 'none']);
  });

  it('isActiveState rejects an unknown state', () => {
    expect(isActiveState('live')).toBe(true);
    expect(isActiveState('definitely_not_a_state')).toBe(false);
  });
});

describe('previewSecondsRemaining — the 900-second boundary', () => {
  const startedAt = new Date('2026-07-23T23:30:00.000Z');
  const occ = { id: 'o', editorial_state: 'live', content_started_at: startedAt };
  const at = (s: number) => startedAt.getTime() + s * 1000;

  it('is open at 899s, exhausted at 900s, and stays exhausted at 901s', () => {
    expect(previewSecondsRemaining(occ, 900, at(899))).toBe(1);
    expect(previewSecondsRemaining(occ, 900, at(900))).toBe(0);
    expect(previewSecondsRemaining(occ, 900, at(901))).toBe(0);
  });

  it('gives a late joiner only the remainder, not a fresh window', () => {
    // Joining at minute ten leaves five minutes, per request §4.2.
    expect(previewSecondsRemaining(occ, 900, at(600))).toBe(300);
  });

  it('returns null — not 0 — when content has not started', () => {
    // Distinct states: "no preview left" and "the clock has not begun" must not collapse,
    // or a waiting-room viewer would be shown an exhausted preview.
    expect(previewSecondsRemaining({ id: 'o', editorial_state: 'backstage' }, 900, Date.now())).toBeNull();
  });

  it('anchors to content_started_at, so a lobby countdown does not consume the window', () => {
    const withLobby = {
      id: 'o', editorial_state: 'live',
      scheduled_start_at: new Date('2026-07-23T23:00:00.000Z'), // 30 min of lobby
      content_started_at: startedAt,
    };
    // 30 minutes after the SCHEDULED start, but only 0s after content start: full window.
    expect(previewSecondsRemaining(withLobby, 900, startedAt.getTime())).toBe(900);
  });
});
