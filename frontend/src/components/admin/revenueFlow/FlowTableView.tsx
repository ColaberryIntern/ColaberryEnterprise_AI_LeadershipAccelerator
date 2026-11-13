import React from 'react';
import { dollars, paintFor, streamPaint } from './flowTokens';
import type { TimelineClassification, TimelineEvent } from './FlowTimeline';

/**
 * R16 Phase 2 — the same events as a table.
 *
 * ── THIS IS A REQUIREMENT, NOT A CONVENIENCE ─────────────────────────────────────────────
 *
 * The palette validation on 2026-11-13 returned a contrast WARN against the light surface:
 * `--status-success` at 2.94:1 and `--status-warning` at 2.39:1, both under 3:1. The
 * validator's wording is "relief required (visible labels or a table view)" and it states
 * that the warning "is not dismissable".
 *
 * So this table is one of the two reliefs that make the colour choices legal, and it is
 * covered by a test for exactly that reason. Deleting it to tidy the page would silently
 * re-break an accessibility guarantee, and nothing on screen would look wrong.
 *
 * It also does a second job worth having on its own merits: it is the thing you can select,
 * copy and paste into an email to Ram. A timeline cannot be pasted.
 */

interface Props {
  events: TimelineEvent[];
  classifications: Record<string, TimelineClassification>;
  'data-testid'?: string;
}

export default function FlowTableView({
  events,
  classifications,
  'data-testid': testId = 'flow-table-view',
}: Props) {
  if (!events.length) {
    return (
      <div className="text-muted small" data-testid={`${testId}-empty`}>
        No events in this window.
      </div>
    );
  }

  return (
    <div className="table-responsive" data-testid={testId}>
      <table className="table table-sm table-hover mb-0" style={{ fontSize: 12 }}>
        <caption className="small text-muted">
          Every event behind the dashboard above, in words. Present so the page is readable
          without relying on colour, and so a figure can be copied rather than retyped.
        </caption>
        <thead className="table-light">
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Stream</th>
            <th scope="col">What happened</th>
            <th scope="col">Detail</th>
            <th scope="col" className="text-end">Amount</th>
            <th scope="col">Is it revenue?</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e, i) => {
            const c = classifications[e.classification];
            const paint = paintFor(c?.tone ?? 'muted');
            const sp = streamPaint(e.stream);
            // The honest answer in the last column. `direction` is the backend's call, not
            // this component's: "in" is money arriving, "out" is money returned, and
            // "none" covers everything that moved no cash — churn, a flag, a comp, a plan
            // nobody paid for.
            const revenue = c?.direction === 'in'
              ? 'Yes, money in'
              : c?.direction === 'out'
                ? 'No, money returned'
                : 'No';
            return (
              <tr key={`${e.at}-${e.classification}-${e.entityKey ?? i}-${i}`}>
                <td style={{ whiteSpace: 'nowrap' }}>{e.at}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: sp.fg,
                      marginRight: 6,
                    }}
                  />
                  {sp.name}
                </td>
                <td style={{ whiteSpace: 'nowrap', color: paint.fg, fontWeight: 600 }}>
                  <span aria-hidden="true">{c?.glyph ?? '•'}</span> {c?.label ?? e.classification}
                </td>
                <td>{e.label}</td>
                <td className="text-end" style={{ whiteSpace: 'nowrap' }}>
                  {e.valueCents === null ? (
                    <span className="text-muted">not priced</span>
                  ) : (
                    dollars(e.valueCents)
                  )}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>{revenue}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
