/**
 * The path table.
 *
 * This is the diagram's equal, not its footnote: same view model, one row per drawn
 * band, same drill-down on click. It is the answer for anyone reading with a screen
 * reader, anyone who needs the exact number rather than a thickness, and the relief
 * for the palette steps that sit under 3:1 against the surface.
 */

import React from 'react';
import type { PathRow } from './campaignSankeyAdapter';
import { formatHours } from './JourneySankeyChart';
import type { JourneySelection } from './JourneySankeyChart';

interface Props {
  rows: PathRow[];
  selection: JourneySelection | null;
  onSelect: (selection: JourneySelection) => void;
  totalVolume: number;
}

export default function JourneyPathTable({
  rows,
  selection,
  onSelect,
  totalVolume,
}: Props): React.ReactElement {
  if (rows.length === 0) {
    return (
      <div className="text-center text-muted py-5">
        No paths carry leads in this view.
      </div>
    );
  }

  return (
    <div className="table-responsive">
      <table className="table table-sm align-middle mb-0">
        <caption className="text-muted small">
          {rows.length.toLocaleString()} paths · {totalVolume.toLocaleString()} lead movements. Same
          filters and same figures as the flow view.
        </caption>
        <thead className="table-light">
          <tr>
            <th scope="col">From</th>
            <th scope="col">To</th>
            <th scope="col" className="text-end">
              Leads
            </th>
            <th scope="col" className="text-end">
              Share of source
            </th>
            <th scope="col" className="text-end">
              Median time
            </th>
            <th scope="col" className="text-end">
              <span className="visually-hidden">Inspect</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const selected =
              selection?.kind === 'link' && selection.from === r.fromId && selection.to === r.toId;
            return (
              <tr
                key={`${r.fromId}->${r.toId}`}
                className={selected ? 'table-active' : undefined}
                aria-selected={selected}
              >
                <td className="small">
                  <div className="fw-medium">{r.fromName}</div>
                  <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                    {r.fromStage}
                  </div>
                </td>
                <td className="small">
                  <div className="fw-medium">{r.toName}</div>
                  <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                    {r.toStage}
                  </div>
                </td>
                <td className="small text-end">{r.volume.toLocaleString()}</td>
                {/* An em dash, not 0%, when the source node holds no population:
                    the share is undefined, and printing zero would assert that
                    nobody took a path that in fact had no one to take it. */}
                <td className="small text-end">
                  {r.pctOfSource === null ? '—' : `${r.pctOfSource.toFixed(1)}%`}
                </td>
                <td className="small text-end text-muted">
                  {r.medianHours === null ? '—' : formatHours(r.medianHours)}
                </td>
                <td className="text-end">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    style={{ fontSize: '0.7rem' }}
                    disabled={!r.drillable}
                    title={
                      r.drillable
                        ? 'List the leads who took this path'
                        : 'Grouped path — switch journey detail to expand it'
                    }
                    onClick={() => onSelect({ kind: 'link', from: r.fromId, to: r.toId })}
                  >
                    Inspect
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
