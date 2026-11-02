import React, { useEffect, useState } from 'react';
import {
  readSessionRundown as readSessionRundownRequest,
  type ProducerOccurrence,
  type RundownResult,
  type RundownSegment,
} from '../../services/broadcastProducer';
import { planProgressPct, rundownElapsed, rundownPace, showCanMove } from './producerPace';
import { CPR_CSS } from './producerRundownStyles';

/**
 * The segment rundown — P4-02's last open item, and the half of the producer's picture that was
 * missing.
 *
 * WHAT A PRODUCER COULD NOT SEE. The strip above this answers "is this working" and "where am I
 * in the hour". Neither answers "where am I in the SHOW" — which segment is on air, how long it
 * was planned to run, and what is next. That reading has existed since the Class Kit shipped,
 * and it has only ever existed inside the instructor's Present tab, which is also the
 * screen-recording source and so is the one window a producer does not have.
 *
 * IT SHOWS THE PLAN WHEN IT CANNOT SHOW THE POSITION. Every failure here degrades to the
 * rundown without a highlight, because the plan is useful on its own — it is what a producer
 * reads while waiting for the feed — and a segment marked `current` on a guess is worse than no
 * highlight at all. The three ways the position can be unavailable each say which one it is.
 *
 * ONE OF THEM IS NOT COSMETIC. `deck_drifted` means the instructor's tab is on a different slide
 * list than the server, which is the condition under which every clip marker for the class is
 * being silently discarded. Until this component existed, that fact reached a server log and
 * nobody else.
 */

export interface ProducerRundownProps {
  sessionId: string;
  /** The airing, for the class clock and for whether the show can still move. */
  occurrence: Pick<ProducerOccurrence, 'editorial_state' | 'content_started_at'>;
  /** The strip's one-second tick, passed down rather than started again. */
  now: number;
  /** Injected in tests. Production reads the real rundown endpoint. */
  load?: (sessionId: string) => Promise<RundownResult>;
}

/**
 * SLOWER THAN THE STATE READ, FASTER THAN THE AUDIENCE COUNT, and both bounds have a reason.
 *
 * What this tracks is a human pressing a key, so a 5s poll would mostly re-fetch an unchanged
 * answer — and the server's kit spec is cached for 30s anyway, so a faster poll would not even
 * see an edited timeline sooner. It shares `producerStateLimiter`'s 60/min with the state read's
 * 5s (12/min), so 10s spends 6 more and leaves the commands the rest of the budget. The
 * audience lesson applies here too: the thing that must never be throttled is Go Live.
 */
const POLL_MS = 10_000;

/** `0–5`, `25–75`. En dash, because it is a range rather than a subtraction. */
function plannedWindow(s: RundownSegment): string {
  return `${s.planned_start_min}–${s.planned_end_min}`;
}

/**
 * Which slide of the current segment the show is on, when that can be said.
 *
 * Useful precisely where the planned window is not: five minutes into a fifty-minute guided
 * build, "slide 2 of 9" is the reading that says whether the class is actually moving. Returns
 * null off the current row, and for a position that is not trustworthy.
 */
function slideWithin(s: RundownSegment, currentSlideIndex: number | null): string | null {
  if (s.standing !== 'current' || currentSlideIndex === null) return null;
  const at = currentSlideIndex - s.first_slide + 1;
  if (at < 1 || at > s.slide_count) return null;
  return `slide ${at} of ${s.slide_count}`;
}

/**
 * Why there is no highlight, in the producer's own terms, or null when there is one.
 *
 * Each of these is a different instruction. Drift means restart the Present tab and know that
 * the clip list is losing rows. An unresolvable index means the same cause with less evidence.
 * No position at all means nobody has presented the deck yet, which before a class is simply
 * the truth.
 */
function positionNote(r: RundownResult): { tone: 'warn' | 'plain'; node: React.ReactNode } | null {
  if (r.positionState === 'deck_drifted') {
    return {
      tone: 'warn',
      node: (
        <>
          <b>The deck is on a different slide list than the server.</b> The Present tab says this
          slide is <code>{r.deckClaimedTitle}</code>; on the current plan, slide{' '}
          {r.currentSlideIndex} is <code>{r.currentSlideTitle}</code>. That happens when the
          timeline is edited after Present was opened — the tab is a frozen copy. While it lasts,
          every clip marker for this class is being discarded, so the clip list will come out
          short. Re-open Present to fix both.
        </>
      ),
    };
  }
  if (r.positionState === 'unresolvable') {
    /**
     * Two different sentences, because the index can be unusable in two different ways and only
     * one of them gives a producer a number. An out-of-range NUMBER is the diagnosis — "slide 40,
     * and this plan has 3" says the deck is on a longer list. A value that is not a number at all
     * is a broadcast row holding something the deck never writes, and quoting it on screen
     * explains nothing anyone can act on.
     */
    return {
      tone: 'warn',
      node: r.currentSlideIndex === null || r.currentSlideIndex === undefined ? (
        <>
          <b>The show&apos;s position cannot be read.</b> The broadcast is reporting a slide
          position this plan cannot place. Re-opening Present reloads the deck from the current
          plan and should restore it.
        </>
      ) : (
        <>
          <b>The deck is on slide {r.currentSlideIndex}, and this plan has {r.slideCount}.</b> The
          position cannot be placed in the rundown, which usually means the timeline changed after
          Present was opened. Re-opening Present reloads the deck from the current plan.
        </>
      ),
    };
  }
  if (r.positionState === 'no_position') {
    return {
      tone: 'plain',
      node: <>Nothing has been presented yet, so this is the plan rather than the position.</>,
    };
  }
  return null;
}

export default function ProducerRundown({
  sessionId, occurrence, now, load,
}: ProducerRundownProps): React.ReactElement | null {
  const [rundown, setRundown] = useState<RundownResult | null>(null);
  const read = load ?? readSessionRundownRequest;
  const moves = showCanMove(occurrence);

  useEffect(() => {
    let alive = true;
    const tick = async (): Promise<void> => {
      try {
        const r = await read(sessionId);
        // Guarded after the await, not before: the answer can arrive to an unmounted component,
        // and a state write then is the React warning that sends people hunting for a leak.
        if (alive) setRundown(r);
      } catch {
        // A rundown that cannot be read must not disturb the controls above it. The last good
        // answer stays on screen, and a transient failure is not worth a notice of its own —
        // this is a reference panel, not the thing putting the class on air.
      }
    };
    void tick();
    // One read and then silence for an airing nobody can advance any further.
    if (!moves) return () => { alive = false; };
    const timer = setInterval(() => { void tick(); }, POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [read, sessionId, moves]);

  /**
   * NOTHING AT ALL until there is a plan to show.
   *
   * `none` is the server saying this session has no run of show to render, and `forbidden` is it
   * declining — in both cases an empty heading would be a section announcing that it has nothing
   * to say. The strip above has already told the producer everything that is true.
   */
  if (!rundown || rundown.outcome !== 'ok' || !rundown.segments?.length) return null;

  const segments = rundown.segments;
  const elapsed = rundownElapsed(occurrence, now);
  const current = segments.find((s) => s.standing === 'current') ?? null;
  const pace = rundownPace(current, elapsed);
  const pct = planProgressPct(elapsed, rundown.totalMinutes ?? 0);
  const note = positionNote(rundown);

  return (
    <section className="cpr" data-testid="producer-rundown" aria-label="Segment rundown">
      <style>{CPR_CSS}</style>

      <div className="cpr-head">
        <span className="cpr-title">Rundown</span>
        <span className="cpr-plan" data-testid="rundown-plan">
          {rundown.totalMinutes} min planned · {segments.length} segments
        </span>
        {/*
          * NOT A LIVE REGION, for the same reason the clock above is not: it changes on its own
          * and a screen reader announcing "behind 7 min" over a class being taught is worse than
          * a reading somebody has to go and look at.
          */}
        {pace && (
          <span className="cpr-pace" data-testid="rundown-pace" data-verdict={pace.verdict}>
            {pace.text}
          </span>
        )}
      </div>

      {pct !== null && (
        <div
          className="cpr-track"
          data-testid="rundown-track"
          role="progressbar"
          aria-label="Elapsed against the planned length"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
        >
          <span
            className="cpr-track-fill"
            style={{ width: `${pct}%` }}
            data-verdict={pace?.verdict ?? 'on_time'}
          />
        </div>
      )}

      <table className="cpr-table">
        <thead>
          <tr>
            <th scope="col">Segment</th>
            <th scope="col">Planned</th>
            <th scope="col">Slides</th>
            <th scope="col">At</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((s) => (
            <tr
              className="cpr-row"
              key={s.id || s.label}
              data-standing={s.standing}
              data-testid={`rundown-segment-${s.id || s.label}`}
            >
              <td>
                {/*
                  * The marker is decoration: the row's state is already carried by
                  * `data-standing` and by its weight, and a screen reader reading "triangle" in
                  * front of every current segment adds nothing a sighted user gets.
                  */}
                <span className="cpr-mark" aria-hidden="true">
                  {s.standing === 'current' ? '▸' : s.standing === 'done' ? '✓' : ''}
                </span>
                {s.label}
              </td>
              <td className="cpr-num">{plannedWindow(s)} min</td>
              <td className="cpr-num">{s.slide_count}</td>
              <td className="cpr-num cpr-at">{slideWithin(s, rundown.currentSlideIndex ?? null) ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {note && (
        <p className="cpr-note" data-tone={note.tone} data-testid="rundown-position-note">
          {note.node}
        </p>
      )}
    </section>
  );
}
