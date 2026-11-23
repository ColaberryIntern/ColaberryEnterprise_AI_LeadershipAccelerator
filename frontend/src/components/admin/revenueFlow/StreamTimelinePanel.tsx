import React from 'react';
import FlowTimeline from './FlowTimeline';
import type { TimelineEvent } from './FlowTimeline';
import { paintFor } from './flowTokens';
import type { ClassMap } from './flowBoardTypes';

/**
 * One stream's own timeline, drilled into from its card, with the legend scoped to it.
 *
 * Ali, 2026-11-23: "when i drill into a source, I want to see a timeline of all color
 * coordinated events."
 *
 * ── WHAT WAS ALREADY THERE, AND WHY IT DID NOT ANSWER THE ASK ────────────────────────────
 *
 * The board already ends in one timeline carrying every stream's events, with a stream filter
 * in the legend bar at the top. So the events were on the page and the colours were already
 * coordinated. What was missing is the thing the ask names: drilling into a source. A filter
 * sixty lines above a list two screens below is not a drill-in, and the legend at the top
 * explains all eleven classifications on the board whether or not this stream uses any of them.
 *
 * This panel puts the events inside the card they belong to and scopes the legend to the
 * classifications these events actually carry, so the key beside the timeline explains exactly
 * what is in front of the reader and nothing else.
 *
 * ── WHY IT IS AN EXPANSION AND NOT A ROUTE ───────────────────────────────────────────────
 *
 * `oneDoorIntoRevenue.test.ts` holds the Revenue Room as the single door into revenue, after a
 * standalone Flow page had to be absorbed once already. A per-source page would reopen exactly
 * that. Four of the six streams also carry `drillDownKey: null`, so a route-based drill-in
 * would exist for two streams and silently not for the rest.
 *
 * ── WHY THE ENTITY FOCUS IS CONTROLLED FROM OUTSIDE ──────────────────────────────────────
 *
 * `FlowTimeline` has carried an `onPickEntity` prop since R16 that no caller ever passed, so
 * every pill rendered unclickable. It is wired here, and the focused key lives on the card
 * rather than in this panel, because `@testing-library/react` is not a dependency of this
 * frontend: a click cannot be simulated, so both states have to be reachable as props for
 * `renderToStaticMarkup` to assert them. Adding the library is an escalation-tier decision,
 * not a step in a feature.
 */
export default function StreamTimelinePanel({
  streamKey, streamLabel, events, classMap, focusEntityKey, onPickEntity, onClearFocus, windowDays,
}: {
  streamKey: string;
  streamLabel: string;
  /** This stream's events, already filtered by the caller. */
  events: TimelineEvent[];
  classMap: ClassMap;
  focusEntityKey: string | null;
  onPickEntity: (streamKey: string, entityKey: string) => void;
  onClearFocus: () => void;
  windowDays: number;
}) {
  // Order of first appearance, which is newest first, rather than alphabetical: the legend then
  // reads in the same order as the timeline beside it.
  const present: string[] = [];
  for (const e of events) if (!present.includes(e.classification)) present.push(e.classification);

  const shown = focusEntityKey
    ? events.filter((e) => e.entityKey === focusEntityKey)
    : events;

  return (
    <div
      className="mt-2 p-3"
      data-testid={`stream-timeline-panel-${streamKey}`}
      style={{ background: 'var(--surface-subtle)', borderRadius: 4 }}
    >
      <div style={{ fontSize: 12, fontWeight: 700 }}>
        Every dated event behind {streamLabel}, newest first
      </div>
      <div className="text-muted mb-2" style={{ fontSize: 11 }}>
        Covering the last {windowDays} days. An empty stretch is drawn as a gap rather than
        closed up, so a quiet month reads as a quiet month.
      </div>

      {present.length > 0 && (
        <div className="d-flex flex-wrap gap-2 mb-2" data-testid={`stream-legend-${streamKey}`}>
          {present.map((key) => {
            const c = classMap[key];
            const paint = paintFor(c?.tone ?? 'muted');
            return (
              <span
                key={key}
                style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 10,
                  background: paint.bg,
                  color: paint.fg,
                  border: `1px solid ${paint.fg}`,
                }}
              >
                <strong aria-hidden="true">{c?.glyph ?? '•'}</strong>{' '}
                <strong>{c?.label ?? key}</strong>
                {' '}
                <span style={{ color: 'var(--text-body)' }}>({paint.name})</span>
              </span>
            );
          })}
        </div>
      )}

      {focusEntityKey && (
        <div className="d-flex align-items-center gap-2 mb-2" data-testid={`stream-focus-${streamKey}`}>
          <span style={{ fontSize: 11 }}>
            Showing one record only. Every other event in this stream is hidden.
          </span>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={onClearFocus}
            data-testid={`stream-focus-clear-${streamKey}`}
          >
            Show all of {streamLabel}
          </button>
        </div>
      )}

      <FlowTimeline
        events={shown}
        classifications={classMap}
        onPickEntity={onPickEntity}
        data-testid={`stream-timeline-${streamKey}`}
      />
    </div>
  );
}
