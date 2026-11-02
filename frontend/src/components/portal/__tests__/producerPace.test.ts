import {
  paceApplies, planProgressPct, rundownElapsed, rundownPace, showCanMove,
  type PlannedWindow,
} from '../producerPace';
import { producerClock } from '../producerClock';
import type { ProducerOccurrence } from '../../../services/broadcastProducer';

/**
 * The rundown's reading. Pure, so every threshold here is a test rather than a judgement made
 * once inside a render.
 *
 * The two that matter: a show under a minute off its plan must not be reported as a problem with
 * no quantity attached, and the pace must be measured from the same instant as the clock sitting
 * beside it in the strip.
 */

const buildMap: PlannedWindow = { planned_start_min: 5, planned_end_min: 25 };
const min = (n: number) => n * 60_000;

const occ = (over: Partial<ProducerOccurrence> = {}): ProducerOccurrence => ({
  id: 'occ-1',
  title: 'Week 8 — Build Day',
  editorial_state: 'live',
  provider_health: 'ready',
  version: 7,
  content_started_at: '2026-11-01T18:00:00.000Z',
  ended_at: null,
  end_reason: null,
  scheduled_start_at: '2026-11-01T17:55:00.000Z',
  ...over,
});

const T0 = Date.parse('2026-11-01T18:00:00.000Z');

describe('rundownPace', () => {
  it('reads on time anywhere inside the planned window', () => {
    expect(rundownPace(buildMap, min(5))!.verdict).toBe('on_time');
    expect(rundownPace(buildMap, min(14))!.verdict).toBe('on_time');
    expect(rundownPace(buildMap, min(25))!.verdict).toBe('on_time');
    expect(rundownPace(buildMap, min(14))!.text).toBe('on time');
  });

  it('reads behind, by whole minutes past the planned end', () => {
    const r = rundownPace(buildMap, min(31))!;
    expect(r).toMatchObject({ verdict: 'behind', minutes: 6, text: 'behind 6 min' });
  });

  it('reads ahead, by whole minutes short of the planned start', () => {
    const r = rundownPace(buildMap, min(2))!;
    expect(r).toMatchObject({ verdict: 'ahead', minutes: 3, text: 'ahead 3 min' });
  });

  it('NEVER SAYS "behind 0 min", which is a verdict with no quantity in it', () => {
    /**
     * The whole reason the tolerance exists. Thirty seconds over reads as a problem and names no
     * number, and a producer cannot act on less than a minute anyway — the smallest move
     * available is to cut or extend a beat.
     */
    const justOver = rundownPace(buildMap, min(25) + 30_000)!;
    expect(justOver.verdict).toBe('on_time');
    expect(justOver.minutes).toBe(0);

    const justUnder = rundownPace(buildMap, min(5) - 30_000)!;
    expect(justUnder.verdict).toBe('on_time');

    // And a full minute out is reported, so the tolerance is a floor rather than a rounding.
    expect(rundownPace(buildMap, min(26))!).toMatchObject({ verdict: 'behind', minutes: 1 });
    expect(rundownPace(buildMap, min(4))!).toMatchObject({ verdict: 'ahead', minutes: 1 });
  });

  it('says NOTHING rather than "on time" when it has nothing to measure', () => {
    // "On time" is a claim. An absent segment, an absent anchor or a plan without two usable
    // numbers each produce no reading, and the rundown then shows the plan and judges nothing.
    expect(rundownPace(null, min(10))).toBeNull();
    expect(rundownPace(buildMap, null)).toBeNull();
    expect(rundownPace({ planned_start_min: NaN, planned_end_min: 25 }, min(10))).toBeNull();
    expect(rundownPace(
      { planned_start_min: 5, planned_end_min: undefined as unknown as number }, min(10),
    )).toBeNull();
  });

  it('handles a zero-length window without claiming the show is both ahead and behind', () => {
    // Authored windows can collapse when a 120-minute template is scaled to a short session.
    const collapsed: PlannedWindow = { planned_start_min: 30, planned_end_min: 30 };
    expect(rundownPace(collapsed, min(30))!.verdict).toBe('on_time');
    expect(rundownPace(collapsed, min(36))!.verdict).toBe('behind');
    expect(rundownPace(collapsed, min(24))!.verdict).toBe('ahead');
  });
});

describe('rundownElapsed', () => {
  it('measures from content start, so the pace and the clock agree', () => {
    /**
     * The load-bearing one. These two readings sit beside each other in the strip and a producer
     * compares them, so they must come from the same instant: `rundownElapsed` and
     * `producerClock` both go through `elapsedSinceContentStart`'s anchor and skew rule.
     */
    const o = occ();
    const now = T0 + min(4) + 12_000;
    expect(rundownElapsed(o, now)).toBe(min(4) + 12_000);
    expect(producerClock(o, now)!.text).toBe('on air 4:12');
  });

  it('REFUSES THE SAME SKEWED START THE CLOCK REFUSES', () => {
    // A laptop whose clock is minutes behind the server would otherwise read an airing that has
    // not started yet as one running in reverse. The clock shows nothing; so does the pace,
    // rather than a confident verdict beside an empty clock.
    const o = occ({ content_started_at: new Date(T0 + min(5)).toISOString() });
    expect(producerClock(o, T0)).toBeNull();
    expect(rundownElapsed(o, T0)).toBeNull();
  });

  it('clamps ordinary sub-minute drift to zero instead of going negative', () => {
    const o = occ({ content_started_at: new Date(T0 + 400).toISOString() });
    expect(rundownElapsed(o, T0)).toBe(0);
  });

  it('is null off air, because a finished class has a duration and not a pace', () => {
    // The clock beside it already reports `ran 38:12`. Judging a finished show against the plan
    // produces a verdict nobody can act on that then sits there until the page closes.
    expect(rundownElapsed(occ({ editorial_state: 'ended' }), T0 + min(40))).toBeNull();
    expect(rundownElapsed(occ({ editorial_state: 'scheduled' }), T0 + min(40))).toBeNull();
    expect(rundownElapsed(occ({ editorial_state: 'backstage' }), T0 + min(40))).toBeNull();
    expect(rundownElapsed(occ({ editorial_state: 'reconnecting' }), T0 + min(40))).toBe(min(40));
  });

  it('is null before anybody marked content as started', () => {
    expect(rundownElapsed(occ({ content_started_at: null }), T0)).toBeNull();
  });
});

describe('paceApplies and showCanMove', () => {
  it('judges the pace only while the class is actually on air', () => {
    expect(paceApplies({ editorial_state: 'live' })).toBe(true);
    expect(paceApplies({ editorial_state: 'reconnecting' })).toBe(true);
    ['scheduled', 'backstage', 'ended', 'processing', 'replay_ready', 'cancelled']
      .forEach((s) => expect(paceApplies({ editorial_state: s })).toBe(false));
  });

  it('stops re-reading an airing nobody can advance any further', () => {
    // A poll that runs for the rest of the page's life to re-fetch a frozen answer is the same
    // waste the clock's tick already refuses.
    ['scheduled', 'backstage', 'live', 'reconnecting']
      .forEach((s) => expect(showCanMove({ editorial_state: s })).toBe(true));
    ['ended', 'processing', 'replay_ready', 'cancelled']
      .forEach((s) => expect(showCanMove({ editorial_state: s })).toBe(false));
  });
});

describe('planProgressPct', () => {
  it('places the marker along the plan', () => {
    expect(planProgressPct(min(30), 120)).toBe(25);
    expect(planProgressPct(0, 120)).toBe(0);
  });

  it('CLAMPS AT THE END OF THE BAR, because running long is ordinary', () => {
    // A marker that keeps traveling past its own track reads as a rendering fault rather than
    // as a show running over. The `behind` verdict beside it is what carries that number.
    expect(planProgressPct(min(200), 120)).toBe(100);
  });

  it('places nothing when there is no anchor or no plan length', () => {
    expect(planProgressPct(null, 120)).toBeNull();
    expect(planProgressPct(min(30), 0)).toBeNull();
    expect(planProgressPct(min(30), NaN)).toBeNull();
  });
});
