import React from 'react';
import { paintFor } from './flowTokens';
import { fmtCount, fmtCountOr } from './fmtCount';
import type { DemandSource } from './flowBoardTypes';

/**
 * The drill-in for ONE demand source: every measure it carries, and what it cannot say.
 *
 * Ali, 2026-11-23: "when i drill into a source, I want to see a timeline of all color
 * coordinated events."
 *
 * ── WHY THIS PANEL CONTAINS NO TIMELINE, AND SAYS SO IN SO MANY WORDS ────────────────────
 *
 * The stream-level drill-in beside this one DOES render a timeline, scoped and color
 * coordinated, because a stream's events exist. A demand source's do not, and the reason is
 * structural rather than a gap somebody can be asked to fill in this phase:
 *
 *   A CAMPAIGN has no dated row tying it to a person. `campaigns` holds aggregate counters
 *   (asked, sent, opened, replied) and `interaction_outcomes` holds undated vocabulary nothing
 *   writes. There is no "this campaign asked this person on this day" record anywhere, so
 *   there is nothing for `events[]` to carry and nothing a timeline could draw.
 *
 *   A CHANNEL does reach paying members, and `channelTruth` ties it to them. But no event in
 *   the payload records which channel its person arrived through: `subscriptions` carries only
 *   `enrollment_id`, and the channel lives two joins away on `leads.source`. So the timeline
 *   below this card is not split by channel, and a panel that filtered it by channel would be
 *   filtering on a field that is not there.
 *
 * An empty timeline rendered here would read as "this source produced nothing", which is a
 * claim about the business. The absence is a fact about the schema, so this panel states the
 * fact and points at where the dated evidence actually starts. Making either case drawable is
 * a backend change, named in the session record, not something to fake at the render layer.
 */

/**
 * A measurement state, in the words of its own declaration.
 *
 * Copied from `TileStatus` in `commercializationTiles.ts`, which defines each of these in a
 * trailing comment on the union member. They are reproduced rather than paraphrased so this
 * file cannot drift into a friendlier reading than the backend's, and an unrecognized status
 * falls through to its raw key instead of being glossed into something unverified.
 */
const STATUS_READING: Record<string, string> = {
  live: 'A source exists, holds data, and is the metric asked for.',
  measured_zero: 'A correctly shaped source exists and is empty. The answer is genuinely zero.',
  undefined_rate: 'A ratio whose denominator is empty. Not zero, and not knowable.',
  proxy: 'A near neighbor exists. It is not the metric, and it over- or under-counts.',
  unmeasurable: 'Nothing of the right shape exists anywhere.',
};

export function statusReading(status: string): string {
  return STATUS_READING[status] ?? status;
}

export default function DemandSourceDetail({
  streamKey, source,
}: {
  streamKey: string;
  source: DemandSource;
}) {
  const paint = paintFor(source.tone);
  return (
    <div
      className="mt-2 p-3"
      data-testid={`demand-detail-${streamKey}-${source.key}`}
      style={{
        background: 'var(--surface-subtle)',
        borderLeft: `3px solid ${paint.fg}`,
        borderRadius: 4,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700 }}>{source.label}</div>
      <div className="text-muted mb-2" style={{ fontSize: 11 }}>{source.note}</div>

      <div className="table-responsive">
        <table className="table table-sm mb-2" style={{ fontSize: 12 }}>
          <caption className="text-muted" style={{ fontSize: 11, captionSide: 'bottom' }}>
            Every measure recorded for {source.label}. A measure nobody records is marked as
            such rather than counted as zero.
          </caption>
          <thead className="table-light">
            <tr>
              <th scope="col">Measure</th>
              <th scope="col" className="text-end">Count</th>
              <th scope="col">What it is</th>
            </tr>
          </thead>
          <tbody>
            <tr data-testid={`demand-measure-${streamKey}-${source.key}-headline`}>
              <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{source.countLabel}</td>
              <td className="text-end fw-bold">{fmtCountOr(source.count, 'Not recorded')}</td>
              <td className="text-muted">The headline count for this source.</td>
            </tr>
            {source.measures.map((m) => (
              <tr key={m.label} data-testid={`demand-measure-${streamKey}-${source.key}-${m.label}`}>
                <td style={{ whiteSpace: 'nowrap' }}>{m.label}</td>
                <td className="text-end">
                  {m.count === null
                    ? <span className="text-muted" style={{ whiteSpace: 'nowrap' }}>Not recorded</span>
                    : <span className="fw-bold">{fmtCount(m.count)}</span>}
                </td>
                <td className="text-muted">{m.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 11 }}>
        <strong>Measurement state:</strong>{' '}
        <span className="text-muted">{statusReading(source.status)}</span>
      </div>

      <div
        className="mt-2 p-2"
        data-testid={`demand-no-timeline-${streamKey}-${source.key}`}
        style={{
          fontSize: 11,
          background: 'var(--status-warning-bg)',
          borderLeft: '3px solid var(--status-warning)',
          borderRadius: 4,
        }}
      >
        <strong>Needs attention: no dated events exist for this source.</strong>{' '}
        {source.attributable
          ? 'This channel is tied to the members who pay, but no event records which channel '
            + 'its person arrived through, so the timeline on this card covers the whole stream '
            + 'and is not split by channel. Splitting it needs the channel carried onto the event.'
          : 'Nothing in the system holds a dated record of this campaign reaching a named '
            + 'person. It keeps running totals only, so there is no event for a timeline to '
            + 'draw. The dated evidence on this card starts at the funnel above.'}
      </div>
    </div>
  );
}
