import React from 'react';
import type { ProducerOccurrence } from '../../services/broadcastProducer';
import type { ProducerClockReading } from './producerClock';
import { stateLabel, type Chip } from './producerStripCopy';

/**
 * The producer strip's readings: what state, how far into the hour, is the feed up, who is here.
 *
 * WHY IT MOVED OUT OF `ProducerStrip.tsx`. Adding the room and stuck counts (D8) took that file
 * past 500 lines, which is CLAUDE.md's hard ceiling, and the rule there is that the change
 * crossing it splits the file rather than deferring again. The header is the right seam: it is
 * the whole of what the strip REPORTS, as against what it lets a producer DO, and it is where
 * every new reading has landed so far. The stylesheet left for the same reason one change
 * earlier; nothing about either was a new rule.
 *
 * Presentational on purpose. Every value arrives decided - no fetching, no polling, no clock of
 * its own - so each chip can be argued with in a test by passing the shape that produces it.
 *
 * ## The one rule every chip in here obeys
 *
 * A number nobody can stand behind is not shown as a number. Three different answers get three
 * different renderings: a real count, a kept count labeled as not updating, and no measurement
 * at all. Collapsing any of them into `0` would report an empty room during a full class, which
 * is a reading a producer would act on.
 *
 * Note what that rule does NOT say: a genuine zero is a real reading and renders as a number.
 * The distinction is between unmeasurable and zero, not between zero and everything else.
 */

export interface ProducerHeaderProps {
  occurrence: ProducerOccurrence;
  /** True for `live` and `reconnecting`. Drives the badge; decided by the caller. */
  onAir: boolean;
  /** Where the show is in the hour, or null when there is nothing to say. */
  reading: ProducerClockReading | null;
  /** Remote viewers. Null renders nothing at all rather than an empty chip. */
  audience: Chip | null;
  /** Phones in the room, and how many of those said they are stuck. */
  room: Chip | null;
  stuck: Chip | null;
}

export default function ProducerHeader(
  { occurrence, onAir, reading, audience, room, stuck }: ProducerHeaderProps,
): React.ReactElement {
  return (
    <header className="cps-head">
      <span
        className={`cps-badge${onAir ? ' is-live' : ''}`}
        data-testid="producer-state"
      >
        {onAir && <span className="cps-dot" aria-hidden="true" />}
        {stateLabel(occurrence.editorial_state)}
      </span>
      {/*
        * NO READING IN HERE IS A LIVE REGION, deliberately. They change on their own - the
        * clock every second, the counts every fifteen - and `aria-live` on any of them would
        * make a screen reader read numbers out loud over the class a producer is running.
        * They are plain text, readable on demand, which is how a wall clock works.
        */}
      {reading && (
        <span
          className="cps-clock"
          data-testid="producer-clock"
          data-kind={reading.kind}
        >
          {reading.text}
        </span>
      )}
      <span className="cps-health" data-testid="producer-health">
        feed: {occurrence.provider_health}
      </span>
      {audience && (
        <span
          className="cps-aud"
          data-testid="producer-audience"
          data-state={audience.state}
        >
          {audience.text}
        </span>
      )}
      {room && (
        <span className="cps-aud" data-testid="producer-room" data-state={room.state}>
          {room.text}
        </span>
      )}
      {/*
        * The stuck count is the one reading here a producer is meant to ACT on, so it is
        * colored when somebody is actually stuck and plain otherwise. `data-raised` rather
        * than a second class name, so the chip keeps one set of rules for the states where
        * there is no number to raise.
        */}
      {stuck && (
        <span
          className="cps-aud"
          data-testid="producer-stuck"
          data-state={stuck.state}
          data-raised={stuck.raised ? 'yes' : undefined}
        >
          {stuck.text}
        </span>
      )}
      <span className="cps-version">v{occurrence.version}</span>
    </header>
  );
}
