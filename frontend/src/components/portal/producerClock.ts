/**
 * The producer's clock — the one number a producer looks at more than any other, and the one
 * the producer strip did not have.
 *
 * WHY IT WAS MISSING RATHER THAN DEFERRED. `content_started_at` and `scheduled_start_at` have
 * been on the producer read since it shipped and nothing rendered either of them. The strip
 * showed state, feed health and version — three things that answer "is this working" and none
 * that answer "where am I in the hour". On 2026-10-20 an occurrence sat `live` over dead air
 * for five minutes; a producer with a clock would have seen five minutes.
 *
 * THE OVERDUE READING IS THE POINT. Most of a producer's pre-air minute is spent waiting for
 * the platform to see the feed, and the strip already shows the server's reason for that wait.
 * What it could not show is the cost of it: a producer four minutes past the hour with Go Live
 * still blocked is making a different decision from one who is thirty seconds early. Counting
 * UP past a missed start, rather than stopping the countdown at 0:00, is the difference.
 *
 * THIS IS THE VIEWER'S CLOCK AGAINST THE SERVER'S TIMESTAMPS, and that is a failure mode worth
 * naming rather than hiding. `Date.now()` is the producer's laptop; the timestamps were written
 * by the server. A laptop an hour behind would read an airing that just started as an hour old.
 *
 *   - Handled: a start instant slightly in the future (the ordinary few hundred ms of clock
 *     drift, plus the gap between the server writing and this tab polling) clamps to 0:00
 *     rather than rendering a negative; a start instant MORE than a minute in the future is
 *     treated as unusable and no clock is shown, because a wrong clock is worse than none.
 *   - Not handled: a local clock skewed into the PAST. Nothing here can distinguish that from
 *     a class that genuinely started earlier, and the server does not send its own `now`. If
 *     this ever matters, the fix is a server timestamp on the producer read, not a heuristic.
 *
 * Pure, so every branch above is tested rather than argued about.
 */
import type { ProducerOccurrence } from '../../services/broadcastProducer';

/** What the clock is measuring. The strip renders this as a `data-kind`, so tests need no text. */
export type ProducerClockKind = 'on_air' | 'countdown' | 'overdue' | 'final';

export interface ProducerClockReading {
  kind: ProducerClockKind;
  /** The whole phrase, ready to render: `on air 4:12`, `starts in 2:30`, `4:12 past start`. */
  text: string;
  /** The duration alone, for a tighter layout or a direct assertion. */
  time: string;
}

/**
 * A start instant this far in the future is ordinary drift and clamps to 0:00. Beyond it, the
 * clock refuses to render at all. One minute is wide enough to cover the write-to-poll gap and
 * narrow enough that a genuinely skewed machine shows nothing instead of fiction.
 */
const SKEW_GRACE_MS = 60_000;

/** The fields the clock reads. Deliberately narrow, so it cannot grow a dependency on the rest. */
type Timed = Pick<
  ProducerOccurrence, 'editorial_state' | 'content_started_at' | 'scheduled_start_at' | 'ended_at'
>;

/**
 * An ISO instant from the wire, as epoch ms — or null when it is absent OR unparseable.
 *
 * Both are the same instruction to the caller ("you have no anchor"), and collapsing them here
 * is what keeps the reading functions from each having to ask twice.
 */
export function instantOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * `4:12`, `1:02:30`. Floors, so the first second of an airing reads 0:00.
 *
 * Hours appear only once there are some. The campus surface's `clock()` is minutes-only and
 * reads `61:05` past the hour, which is correct but asks a person under time pressure to do
 * division. This is a producer's clock, so it says `1:01:05`. That is the only reason these
 * are two functions rather than one import, and if a third surface needs a duration the three
 * of them should become one module.
 */
export function hms(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  const h = Math.floor(s / 3600);
  return h > 0 ? `${h}:${mm}:${ss}` : `${Math.floor(s / 60)}:${ss}`;
}

/**
 * Whether this reading changes on its own and so needs a one-second tick.
 *
 * Separate from `producerClock` on purpose: the tick has to be decided BEFORE `now` is known,
 * or the hook that produces `now` would depend on a reading that depends on `now`. It takes
 * only the state, which is all that question needs.
 */
export function clockTicks(o: Pick<Timed, 'editorial_state'>): boolean {
  return o.editorial_state === 'live'
    || o.editorial_state === 'reconnecting'
    || o.editorial_state === 'scheduled'
    || o.editorial_state === 'backstage';
}

/**
 * What the producer's clock says right now, or null when there is nothing honest to say.
 *
 * ON AIR ALWAYS HAS AN ANCHOR, and that is a guarantee from the state machine rather than an
 * assumption here: `go_live` refuses with `ContentNotStarted` unless `content_started_at` is
 * already set, because going live without it would leave every viewer's free preview window
 * unbounded. So the `live` branch's null case is unreachable in practice — it is handled
 * anyway, because a client that renders a wrong number when the server surprises it is worse
 * than one that renders none.
 *
 * `cancelled` gets no clock: nothing ran, so no duration describes it.
 */
export function producerClock(o: Timed, now: number): ProducerClockReading | null {
  const started = instantOf(o.content_started_at);

  if (o.editorial_state === 'live' || o.editorial_state === 'reconnecting') {
    if (started === null) return null;
    if (started - now > SKEW_GRACE_MS) return null;
    const time = hms(now - started);
    return { kind: 'on_air', text: `on air ${time}`, time };
  }

  if (o.editorial_state === 'scheduled' || o.editorial_state === 'backstage') {
    const at = instantOf(o.scheduled_start_at);
    if (at === null) return null;
    if (at > now) {
      const time = hms(at - now);
      return { kind: 'countdown', text: `starts in ${time}`, time };
    }
    const time = hms(now - at);
    return { kind: 'overdue', text: `${time} past start`, time };
  }

  /**
   * `ended`, `processing`, `replay_ready` — how long it actually ran.
   *
   * `ended_at` can be null on a real airing, and not as an edge case: the column existed from
   * the start and nothing wrote it until recently, so the first production broadcast ended
   * cleanly and left no end instant. There is no clock for those, and inventing one from
   * `now` would grow a "duration" every time the page polled.
   */
  if (o.editorial_state === 'ended' || o.editorial_state === 'processing' || o.editorial_state === 'replay_ready') {
    const end = instantOf(o.ended_at);
    if (started === null || end === null) return null;
    const time = hms(end - started);
    return { kind: 'final', text: `ran ${time}`, time };
  }

  return null;
}
