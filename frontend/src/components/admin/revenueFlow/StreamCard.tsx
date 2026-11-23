import React from 'react';
import { Link } from 'react-router-dom';
import FlowSparkline from './FlowSparkline';
import type { TimelineEvent } from './FlowTimeline';
import { paintFor, streamPaint } from './flowTokens';
import type { ClassMap, Stream } from './flowBoardTypes';

/**
 * One revenue stream: its headline, its funnel, and why it says what it says.
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
 */
export default function StreamCard({
  stream, events, classMap,
}: {
  stream: Stream;
  /** This stream's own events, already filtered by the caller. Drives the sparkline. */
  events: TimelineEvent[];
  classMap: ClassMap;
}) {
  const s = stream;
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
            <div style={{ fontSize: 20, fontWeight: 700 }}>{s.headline.display}</div>
          </div>
          <div style={{ minWidth: 220 }}>
            <FlowSparkline
              events={events}
              classifications={classMap}
              data-testid={`spark-${s.key}`}
            />
          </div>
        </div>

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
        {s.drillDownKey && (
          <Link
            className="btn btn-outline-primary btn-sm mt-2"
            to={`/admin/revenue-room/${s.drillDownKey}`}
            data-testid={`drill-${s.key}`}
          >
            Drill into {s.label}
          </Link>
        )}
      </div>
    </div>
  );
}

