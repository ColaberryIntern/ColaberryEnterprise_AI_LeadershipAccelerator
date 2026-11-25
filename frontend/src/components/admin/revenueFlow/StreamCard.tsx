import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import FlowSparkline from './FlowSparkline';
import type { TimelineEvent } from './FlowTimeline';
import DemandPath from './DemandPath';
import PreProjectTierBlock from './PreProjectTierBlock';
import StreamTimelinePanel from './StreamTimelinePanel';
import { paintFor, streamPaint } from './flowTokens';
import type { ClassMap, Stream } from './flowBoardTypes';

/**
 * One revenue stream: the path into its number, its funnel, and then the number.
 *
 * ── THE NUMBER COMES LAST, WHICH IS THE WHOLE POINT OF THE CARD ──────────────────────────
 *
 * Ali, 2026-11-23: "Can we show that so we can see the path before they reach the final
 * revenue number."
 *
 * Until now this card printed its headline figure in the header, ABOVE the funnel, so the page
 * read number-then-stages: the conclusion first and the working underneath it. The reading
 * order is now what he asked for, and it is the same for every stream rather than only the one
 * that has a demand path, because a layout that moved its headline depending on the data would
 * read as a bug and would be two layouts to keep right.
 *
 * `demandPathRender.test.tsx` asserts the ORDER by comparing indices in the markup, because
 * this is a regression that looks like a refactor: moving the headline back to the top would
 * break no behavioural test and no screenshot anyone compares.
 *
 * ── STAGE ORDER IS THE BACKEND'S AND IS NEVER RE-SORTED HERE ─────────────────────────────
 *
 * The order of `funnel` is the reading order the stream builder chose, and in several streams
 * it is load bearing: membership puts "Never paid" directly under "Signed up" so the gap
 * between a plan and a payment cannot be scrolled past. Sorting by count here, which would
 * look like an improvement, would put the biggest number first and destroy that adjacency.
 *
 * ── A STAGE WEARS ITS CLASSIFICATION'S COLOUR, LOOKED UP RATHER THAN DECIDED ─────────────
 *
 * A stage carries only a classification key. The label, glyph and tone that make it readable
 * come from the registry the backend ships in the same payload, via `classMap`. Nothing in
 * this file decides what a colour means, which is what stops the page and the legend
 * disagreeing on the same screen. An unknown key falls back to muted and a bullet rather than
 * rendering blank.
 *
 * ── WHAT THIS FILE OWNS ──────────────────────────────────────────────────────────────────
 *
 * Three pieces of expansion state and nothing else. Which demand source is open, whether the
 * timeline is drilled into, and which record the timeline is focused on. They live here rather
 * than in the panels so only one source can be open at a time and so each panel stays a pure
 * function of its props, which is the only way `renderToStaticMarkup` can assert both states
 * of a drill-in that no test here can click (see `StreamTimelinePanel`).
 */
export default function StreamCard({
  stream, events, classMap, windowDays,
}: {
  stream: Stream;
  /** This stream's own events, already filtered by the caller. Drives the sparkline. */
  events: TimelineEvent[];
  classMap: ClassMap;
  windowDays: number;
}) {
  const s = stream;
  const [openSourceKey, setOpenSourceKey] = useState<string | null>(null);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [focusEntityKey, setFocusEntityKey] = useState<string | null>(null);

  return (
    <div className="card border-0 shadow-sm mb-4" data-testid={`stream-${s.key}`}>
      <div className="card-body p-3">
        <div className="d-flex justify-content-between align-items-start flex-wrap mb-2">
          <div>
            <h2 className="h6 mb-1">
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block', width: 10, height: 10, borderRadius: 2,
                  background: streamPaint(s.key).fg, marginRight: 6,
                }}
              />
              {s.label}
            </h2>
          </div>
          <div style={{ minWidth: 220 }}>
            <FlowSparkline
              events={events}
              classifications={classMap}
              data-testid={`spark-${s.key}`}
            />
          </div>
        </div>

        {/* ── THE PATH INTO THE NUMBER, WHERE THERE IS ONE ──────────────────────────────── */}
        {s.demand && s.demand.length > 0 && (
          <DemandPath
            streamKey={s.key}
            bands={s.demand}
            openSourceKey={openSourceKey}
            onPickSource={setOpenSourceKey}
          />
        )}

        {/* ── WHAT IS QUEUED BEHIND THE FUNNEL, WHERE THERE IS ANY (R12) ────────────────
            Placed ABOVE the funnel, where the demand path sits, because it is upstream of
            it: these opportunities are still being assessed and have not been flagged for
            pursuit. Deliberately NOT a funnel row, because the funnel's counts partition one
            population and this is a different one. */}
        {s.preProject && (
          <PreProjectTierBlock streamKey={s.key} tier={s.preProject} />
        )}

        <div className="table-responsive">
          <table className="table table-sm mb-2" style={{ fontSize: 12 }}>
            <thead className="table-light">
              <tr>
                <th scope="col">Stage</th>
                <th scope="col" className="text-end">Count</th>
                <th scope="col" className="text-end">Value</th>
                <th scope="col">What it means</th>
              </tr>
            </thead>
            <tbody>
              {s.funnel.map((stage) => {
                const paint = paintFor(classMap[stage.classification]?.tone ?? 'muted');
                return (
                  <tr key={stage.key} data-testid={`stage-${s.key}-${stage.key}`}>
                    <td style={{ whiteSpace: 'nowrap', color: paint.fg, fontWeight: 600 }}>
                      <span aria-hidden="true">{classMap[stage.classification]?.glyph ?? '•'}</span>{' '}
                      {stage.label}
                    </td>
                    <td className="text-end fw-bold">{stage.count}</td>
                    <td className="text-end" style={{ whiteSpace: 'nowrap' }}>
                      {stage.value.cents === null
                        ? <span className="text-muted">{stage.value.display}</span>
                        : stage.value.display}
                    </td>
                    <td className="text-muted">{stage.definition}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── AND ONLY THEN THE NUMBER ──────────────────────────────────────────────────── */}
        <div
          className="pt-2"
          data-testid={`headline-${s.key}`}
          style={{ borderTop: '2px solid var(--surface-sunken)' }}
        >
          <div
            className="text-muted"
            style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}
          >
            What this stream is worth
          </div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{s.headline.display}</div>
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.provenance}</div>
        {s.caveat && (
          <div
            className="mt-2 p-2"
            data-testid={`caveat-${s.key}`}
            style={{
              fontSize: 11,
              background: 'var(--status-warning-bg)',
              borderLeft: '3px solid var(--status-warning)',
              borderRadius: 4,
            }}
          >
            {s.caveat}
          </div>
        )}

        {/* ── DRILL INTO THIS SOURCE'S OWN EVENTS, IN PLACE ─────────────────────────────── */}
        <div className="d-flex flex-wrap gap-2 mt-2">
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={() => {
              setTimelineOpen((v) => !v);
              setFocusEntityKey(null);
            }}
            aria-expanded={timelineOpen}
            data-testid={`timeline-toggle-${s.key}`}
          >
            {timelineOpen
              ? `Hide the ${events.length} dated events`
              : `Show the ${events.length} dated events`}
          </button>
          {s.drillDownKey && (
            <Link
              className="btn btn-outline-primary btn-sm"
              to={`/admin/revenue-room/${s.drillDownKey}`}
              data-testid={`drill-${s.key}`}
            >
              Drill into {s.label}
            </Link>
          )}
        </div>

        {timelineOpen && (
          <StreamTimelinePanel
            streamKey={s.key}
            streamLabel={s.label}
            events={events}
            classMap={classMap}
            focusEntityKey={focusEntityKey}
            onPickEntity={(_stream, entityKey) => setFocusEntityKey(entityKey)}
            onClearFocus={() => setFocusEntityKey(null)}
            windowDays={windowDays}
          />
        )}
      </div>
    </div>
  );
}
