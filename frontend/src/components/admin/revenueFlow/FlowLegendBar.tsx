import React from 'react';
import { TONE, streamPaint } from './flowTokens';
import type { Stream } from './flowBoardTypes';

/**
 * How to read the colours, and the one filter that scopes the whole board.
 *
 * ── IDENTITY IS NEVER COLOUR ALONE ───────────────────────────────────────────────────────
 *
 * The palette validation returned a contrast WARN on the light surface whose required relief
 * is "visible labels or a table view". So every tone renders its swatch AND its word, and the
 * word is the part that survives greyscale, colour-vision deficiency and a pasted screenshot.
 * A swatch row with the names removed would look tidier and would be an accessibility
 * regression, which is why the names come from `TONE` rather than being written here.
 *
 * ── THE FILTER IS ONE PIECE OF STATE, HELD BY THE PARENT ─────────────────────────────────
 *
 * Choosing a stream scopes the stream cards AND the timeline below them, so the state cannot
 * live in this component. It is passed in and raised, which keeps "what the reader is looking
 * at" a single answer rather than two components agreeing by coincidence.
 */
export default function FlowLegendBar({
  streams, streamFilter, onPickStream,
}: {
  streams: Stream[];
  streamFilter: string;
  onPickStream: (key: string) => void;
}) {
  return (
    <div className="card border-0 shadow-sm mb-4">
      <div className="card-body p-3">
        <div className="d-flex flex-wrap align-items-center gap-3">
          <strong style={{ fontSize: 12 }}>How to read the colours</strong>
          {Object.entries(TONE).map(([tone, paint]) => (
            <span key={tone} style={{ fontSize: 12 }} data-testid={`legend-${tone}`}>
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-block', width: 10, height: 10, borderRadius: 2,
                  background: paint.fg, marginRight: 5,
                }}
              />
              {paint.name}
            </span>
          ))}
          <span className="ms-auto d-flex gap-2">
            <button
              type="button"
              className={`btn btn-sm ${streamFilter === '' ? 'btn-secondary' : 'btn-outline-secondary'}`}
              onClick={() => onPickStream('')}
            >
              All streams
            </button>
            {streams.map((s) => (
              <button
                key={s.key}
                type="button"
                className={`btn btn-sm ${streamFilter === s.key ? 'btn-secondary' : 'btn-outline-secondary'}`}
                onClick={() => onPickStream(s.key)}
                data-testid={`filter-${s.key}`}
              >
                <span
                  aria-hidden="true"
                  style={{
                    display: 'inline-block', width: 8, height: 8, borderRadius: 2,
                    background: streamPaint(s.key).fg, marginRight: 5,
                  }}
                />
                {s.label}
              </button>
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}
