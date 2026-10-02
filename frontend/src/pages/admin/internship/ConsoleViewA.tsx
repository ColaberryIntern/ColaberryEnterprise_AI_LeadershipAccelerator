import React from 'react';
import { InternRow } from '../../../services/adminInternConsoleApi';
import {
  ago, certLabel, paceLabel, stripCells, gateCleared, LEVEL_LABEL,
} from './consoleFormat';

/**
 * View A — the Command Center.
 *
 *     "One dense table, one row per intern, all three tracks side by side. Best when you scan
 *      everyone daily and act from the row."  (the finalised design's own description)
 *
 * **The design's Attendance column is not here.** It showed "9/12 · 75%", and neither number exists:
 * the attendance table held 7 join rows across 2 interns and nothing records a scheduled-and-missed
 * meeting. Seven columns, not eight. A test asserts no attendance header renders, because a column
 * silently returning is how a dead stat comes back.
 *
 * The Certification column also differs from the design, which showed a best score. Practice sets
 * are 1, 10, 15 and 60 items, so a best score across them is not a fact — it shows sitting counts.
 */

const ROW_COLS = 7;

export const ConsoleViewA: React.FC<{
  rows: InternRow[];
  /** Takes the APPLICATION id, which is what the Applications mode selects on. */
  onOpen: (applicationId: string) => void;
}> = ({ rows, onOpen }) => (
  <div className="aint-card">
    <div className="aint-card-h">
      <h2><i className="ri-team-line" aria-hidden="true" /> Active interns</h2>
    </div>
    <div className="aint-tbl">
      <table>
        <thead>
          <tr>
            <th scope="col">Intern</th>
            <th scope="col">Last active</th>
            <th scope="col">Training · weeks 0-10</th>
            <th scope="col">Pace</th>
            <th scope="col">Certification</th>
            <th scope="col">Project</th>
            <th scope="col"><span className="aint-sr">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={ROW_COLS} className="aint-empty">No interns match this filter.</td>
            </tr>
          )}
          {rows.map((row) => <InternTableRow key={row.enrollment_id} row={row} onOpen={onOpen} />)}
        </tbody>
      </table>
    </div>
  </div>
);

const InternTableRow: React.FC<{ row: InternRow; onOpen: (applicationId: string) => void }> = ({ row, onOpen }) => {
  const pace = paceLabel(row);
  const cert = certLabel(row);
  const cells = stripCells(row);
  const gate = gateCleared(row);

  return (
    <tr>
      <td>
        <div className="aint-name">{row.name}</div>
        <div className="aint-sub">
          <span className={`aint-pill state-${row.application_state ?? 'unknown'}`}>
            {row.application_state ?? 'no application'}
          </span>
          {row.day !== null && <> day {row.day}</>}
        </div>
      </td>

      <td>
        <div className="aint-lastseen">
          {/* The dot carries the band; the text carries the measurement. The band's meaning is in
              the title so it is not colour-only information. */}
          <span className={`aint-dot lv-${row.activity.level}`} title={LEVEL_LABEL[row.activity.level]} />
          <span className="aint-strong">{ago(row.activity.days_since)}</span>
          {row.activity.graced && <span className="aint-tag" title="New intern: band capped at yellow">new</span>}
        </div>
        <div className="aint-sub">{row.activity.last_activity_source ?? '—'}</div>
      </td>

      <td>
        <div className="aint-strip" role="img"
          aria-label={`Weeks 0 to 10: ${cells.filter((c) => c.done).length} done, weeks 1 to 3 gate ${gate} of 3`}>
          {cells.map((c) => (
            <span
              key={c.week}
              className={[
                'aint-wk',
                c.done ? 'done' : '',
                c.gate ? 'gate' : '',
                c.unpublished ? 'unpub' : '',
              ].filter(Boolean).join(' ')}
              title={c.unpublished ? `Week ${c.week}: not published yet` : `Week ${c.week}: ${c.pct}%`}
            />
          ))}
        </div>
        <div className="aint-sub">Wk 1-3 gate {gate}/3 · {row.training.weeks_completed} weeks done</div>
      </td>

      <td>
        {/* No band means no measurement, so it renders as plain muted text rather than a coloured
            badge. A grey "No cohort schedule" is honest; a green "On pace" would not be. */}
        {pace.band
          ? <span className={`aint-pill pace-${pace.band}`}>{pace.text}</span>
          : <span className="aint-sub">{pace.text}</span>}
      </td>

      <td className={cert.muted ? 'aint-sub' : 'aint-strong'}>{cert.text}</td>

      <td>
        {row.project
          ? (
            <>
              <div className="aint-strong aint-nowrap">{row.project.name ?? 'Untitled project'}</div>
              <div className="aint-sub">{row.project.stage} · {row.project.tasks_pct}% of {row.project.tasks_total} tasks</div>
            </>
          )
          : <span className="aint-sub">No project</span>}
      </td>

      <td>
        {/* Opens the APPLICATION, which is what the Applications mode selects on — passing the
            enrollment id here would select a record that does not exist. An intern holding no
            application row gets a disabled control that says why, rather than a button that
            silently does nothing. */}
        <button
          type="button"
          className="aint-btn"
          disabled={!row.application_id}
          title={row.application_id ? undefined : 'No application record to open'}
          onClick={() => row.application_id && onOpen(row.application_id)}
        >
          Open applicant
        </button>
      </td>
    </tr>
  );
};

export default ConsoleViewA;
