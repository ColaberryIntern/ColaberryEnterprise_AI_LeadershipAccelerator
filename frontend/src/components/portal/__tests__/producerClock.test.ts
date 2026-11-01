import { clockTicks, hms, instantOf, producerClock } from '../producerClock';
import type { ProducerOccurrence } from '../../../services/broadcastProducer';

/**
 * The producer's clock. Pure, so the cases that matter are the ones a real airing hits and
 * nobody can reproduce on demand.
 *
 * Three of these are the reason the module exists rather than two lines in the component:
 *
 *  - PAST THE SCHEDULED START COUNTS UP. A countdown that stops at 0:00 tells a producer
 *    waiting on provider health nothing about what the wait has cost, and that wait is where
 *    most of a pre-air minute goes.
 *  - A START INSTANT IN THE FUTURE IS A SKEWED LAPTOP, and beyond a minute of it no clock is
 *    shown at all. The timestamps come from the server and `now` comes from the producer's
 *    machine; a wrong duration rendered confidently is worse than a blank.
 *  - `ended_at` CAN BE NULL ON A REAL AIRING. The column existed from the start and nothing
 *    wrote it until recently, so the first production broadcast left no end instant. Those get
 *    no final duration rather than one measured against `now`, which would otherwise grow every
 *    time the page polled.
 */

const NOW = Date.parse('2026-11-01T18:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

const occ = (over: Partial<ProducerOccurrence> = {}): ProducerOccurrence => ({
  id: 'occ-1',
  title: 'Week 8 — Build Day',
  editorial_state: 'scheduled',
  provider_health: 'unknown',
  version: 4,
  content_started_at: null,
  ended_at: null,
  end_reason: null,
  scheduled_start_at: null,
  ...over,
});

describe('instantOf', () => {
  it('reads an ISO instant as epoch milliseconds', () => {
    expect(instantOf('2026-11-01T18:00:00.000Z')).toBe(NOW);
  });

  it('treats absent and unparseable the same, because both mean "no anchor"', () => {
    expect(instantOf(null)).toBeNull();
    expect(instantOf(undefined)).toBeNull();
    expect(instantOf('')).toBeNull();
    expect(instantOf('whenever')).toBeNull();
  });
});

describe('hms', () => {
  it('floors to the second, so the first second of an airing reads 0:00', () => {
    expect(hms(0)).toBe('0:00');
    expect(hms(999)).toBe('0:00');
    expect(hms(59_999)).toBe('0:59');
  });

  it('pads seconds and leaves minutes unpadded', () => {
    expect(hms(252_000)).toBe('4:12');
    expect(hms(65_000)).toBe('1:05');
  });

  it('grows an hours field only once there are hours — a producer should not do division', () => {
    // The campus surface's minutes-only clock reads this as 59:59 / 60:00 / 61:01.
    expect(hms(3_599_000)).toBe('59:59');
    expect(hms(3_600_000)).toBe('1:00:00');
    expect(hms(3_661_000)).toBe('1:01:01');
  });

  it('reads a negative duration as 0:00 rather than printing a minus sign', () => {
    expect(hms(-5_000)).toBe('0:00');
  });
});

describe('clockTicks', () => {
  it('ticks while anything is counting', () => {
    (['live', 'reconnecting', 'scheduled', 'backstage'] as const).forEach((s) => {
      expect(clockTicks({ editorial_state: s })).toBe(true);
    });
  });

  it('does not tick on a finished airing, whose duration cannot change', () => {
    (['ended', 'processing', 'replay_ready', 'cancelled'] as const).forEach((s) => {
      expect(clockTicks({ editorial_state: s })).toBe(false);
    });
  });
});

describe('on air', () => {
  it('counts up from the moment content started', () => {
    const r = producerClock(occ({ editorial_state: 'live', content_started_at: iso(NOW - 252_000) }), NOW);
    expect(r).toEqual({ kind: 'on_air', text: 'on air 4:12', time: '4:12' });
  });

  it('keeps counting through a reconnect, because the class is still happening', () => {
    const r = producerClock(
      occ({ editorial_state: 'reconnecting', content_started_at: iso(NOW - 600_000) }), NOW,
    );
    expect(r!.kind).toBe('on_air');
    expect(r!.time).toBe('10:00');
  });

  it('shows 0:00 for a start instant a few seconds ahead, which is ordinary drift', () => {
    const r = producerClock(occ({ editorial_state: 'live', content_started_at: iso(NOW + 8_000) }), NOW);
    expect(r).toEqual({ kind: 'on_air', text: 'on air 0:00', time: '0:00' });
  });

  it('SHOWS NO CLOCK AT ALL when the start instant is minutes ahead, which is a skewed clock', () => {
    // A laptop five minutes behind the server would otherwise read a class that has not begun
    // as already running, or render a negative. Neither is worth showing.
    expect(producerClock(occ({ editorial_state: 'live', content_started_at: iso(NOW + 300_000) }), NOW)).toBeNull();
  });

  it('shows no clock when live arrives with no content anchor, which the state machine forbids', () => {
    // `go_live` refuses with ContentNotStarted unless content_started_at is set, so this is
    // unreachable in practice — and handled anyway, because a client that invents a number
    // when the server surprises it is worse than one that shows none.
    expect(producerClock(occ({ editorial_state: 'live', content_started_at: null }), NOW)).toBeNull();
  });

  it('shows no clock when the start instant is unparseable', () => {
    expect(producerClock(occ({ editorial_state: 'live', content_started_at: 'soon' }), NOW)).toBeNull();
  });
});

describe('before air', () => {
  it('counts down to a scheduled start', () => {
    const r = producerClock(occ({ editorial_state: 'scheduled', scheduled_start_at: iso(NOW + 150_000) }), NOW);
    expect(r).toEqual({ kind: 'countdown', text: 'starts in 2:30', time: '2:30' });
  });

  it('COUNTS UP PAST A MISSED START instead of resting at 0:00', () => {
    // The reading that changes a decision: four minutes past the hour with Go Live still
    // blocked is a different situation from thirty seconds early, and the strip showed neither.
    const r = producerClock(occ({ editorial_state: 'backstage', scheduled_start_at: iso(NOW - 252_000) }), NOW);
    expect(r).toEqual({ kind: 'overdue', text: '4:12 past start', time: '4:12' });
  });

  it('is overdue, not counting down, at the scheduled instant exactly', () => {
    const r = producerClock(occ({ editorial_state: 'backstage', scheduled_start_at: iso(NOW) }), NOW);
    expect(r).toEqual({ kind: 'overdue', text: '0:00 past start', time: '0:00' });
  });

  it('counts down in backstage too, which is where a producer actually waits', () => {
    expect(producerClock(
      occ({ editorial_state: 'backstage', scheduled_start_at: iso(NOW + 45_000) }), NOW,
    )!.kind).toBe('countdown');
  });

  it('shows no clock with no scheduled start to measure from', () => {
    expect(producerClock(occ({ editorial_state: 'scheduled', scheduled_start_at: null }), NOW)).toBeNull();
  });
});

describe('after air', () => {
  it('reports how long it actually ran, from the two recorded instants', () => {
    const r = producerClock(occ({
      editorial_state: 'ended',
      content_started_at: iso(NOW - 4_334_000),
      ended_at: iso(NOW),
    }), NOW);
    expect(r).toEqual({ kind: 'final', text: 'ran 1:12:14', time: '1:12:14' });
  });

  it('reports it through processing and replay too — the airing is over, its length is not', () => {
    (['processing', 'replay_ready'] as const).forEach((s) => {
      const r = producerClock(occ({
        editorial_state: s, content_started_at: iso(NOW - 600_000), ended_at: iso(NOW),
      }), NOW);
      expect(r!.kind).toBe('final');
      expect(r!.time).toBe('10:00');
    });
  });

  it('SHOWS NOTHING when ended_at is null, which real production rows are', () => {
    // Nothing wrote ended_at until recently; the first airing ended cleanly and left it null.
    // Measuring against `now` instead would grow a "duration" on every poll.
    expect(producerClock(occ({
      editorial_state: 'ended', content_started_at: iso(NOW - 600_000), ended_at: null,
    }), NOW)).toBeNull();
  });

  it('shows nothing for a cancelled airing, because nothing ran', () => {
    expect(producerClock(occ({
      editorial_state: 'cancelled', content_started_at: iso(NOW - 600_000), ended_at: iso(NOW),
    }), NOW)).toBeNull();
  });

  it('does not read a final duration backwards if the instants are out of order', () => {
    const r = producerClock(occ({
      editorial_state: 'ended', content_started_at: iso(NOW), ended_at: iso(NOW - 60_000),
    }), NOW);
    expect(r!.time).toBe('0:00');
  });
});
