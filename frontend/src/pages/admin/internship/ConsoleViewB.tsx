import React from 'react';
import { InternRow } from '../../../services/adminInternConsoleApi';
import {
  LANES, LEVEL_ORDER, LEVEL_LABEL, laneRows, levelCounts, share,
  gateDistribution, certDistribution, projectDistribution,
  ago, certLabel, gateCleared, DistRow,
} from './consoleFormat';

/**
 * View B — the Triage Board.
 *
 *     "Interns are grouped by how recently they showed up, so the people who need you are in their
 *      own column."  (the finalised design's own description)
 *
 * Four differences from the design, each because the underlying number is not a fact:
 *
 *   - the intern cards' "N/M meetings" line is gone (attendance is off);
 *   - the cert bar showed a best score across 1-, 10-, 15- and 60-item sets — it shows sitting
 *     counts instead;
 *   - the cert *distribution* used the readiness states, which are an estimate the roster does not
 *     load; it counts rows by what they have actually sat;
 *   - the project cards' industry / commits-in-7-days / health figures have no source at all, so the
 *     cards show the task counts that do.
 *
 * Two controls the design offers are rendered visibly unavailable rather than silently absent: the
 * per-intern Nudge (its endpoint is Phase 6) and the bulk "nudge everyone quiet" (bulk mail to
 * students is against a standing rule in this repo, so it is not coming).
 */

const DistBlock: React.FC<{ title: string; icon: string; rows: DistRow[] }> = ({ title, icon, rows }) => (
  <div className="aint-card aint-dist">
    <div className="aint-card-h"><h3><i className={icon} aria-hidden="true" /> {title}</h3></div>
    <div className="aint-dist-body">
      {rows.map((r) => (
        <div className="aint-dist-row" key={r.label}>
          <span className="aint-dist-l">{r.label}</span>
          <span className="aint-bar"><span style={{ width: `${r.pct}%` }} /></span>
          <b>{r.count}</b>
        </div>
      ))}
    </div>
  </div>
);

export const ConsoleViewB: React.FC<{
  rows: InternRow[];
  stages: string[];
  onOpen: (applicationId: string) => void;
}> = ({ rows, stages, onOpen }) => {
  const counts = levelCounts(rows);
  const total = rows.length;

  return (
    <div className="aint-viewb">
      <div className="aint-card">
        <div className="aint-card-h">
          <h2><i className="ri-pulse-line" aria-hidden="true" /> Pulse · when each intern last showed up</h2>
          <span className="aint-sub">Latest of their learning and community activity, or the portal heartbeat</span>
        </div>
        <div className="aint-card-b">
          {/* The segmented bar is decorative duplication of the legend below, so it is hidden from
              assistive tech rather than read out twice. */}
          <div className="aint-seg" aria-hidden="true">
            {LEVEL_ORDER.filter((l) => counts[l] > 0).map((l) => (
              <span key={l} className={`lv-${l}`} style={{ width: `${share(counts[l], total)}%` }} />
            ))}
          </div>
          <div className="aint-legend">
            {LEVEL_ORDER.map((l) => (
              <span key={l}>
                <i className={`aint-dot lv-${l}`} aria-hidden="true" />
                {LEVEL_LABEL[l]} <b>{counts[l]}</b>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="aint-dists">
        <DistBlock title="Training" icon="ri-book-open-line" rows={gateDistribution(rows)} />
        <DistBlock title="Certification" icon="ri-award-line" rows={certDistribution(rows)} />
        <DistBlock title="Projects" icon="ri-flag-line" rows={projectDistribution(rows, stages)} />
      </div>

      <div className="aint-lanes">
        {LANES.map((lane) => {
          const list = laneRows(rows, lane);
          return (
            <section className="aint-lane" key={lane.key} aria-label={`${lane.title}: ${list.length}`}>
              <h3 className="aint-lane-h">
                <span className={`aint-dot lv-${lane.key}`} aria-hidden="true" />
                {lane.title}
                <span className="aint-lane-c">{list.length}</span>
              </h3>
              {/* An empty lane says so. Collapsing it would hide that nobody is in the healthy
                  column, which is the most important thing an empty lane can tell you. */}
              {list.length === 0 && <div className="aint-empty">Nobody here</div>}
              {list.map((row) => <LaneCard key={row.enrollment_id} row={row} onOpen={onOpen} />)}
            </section>
          );
        })}
      </div>

      <div className="aint-card">
        <div className="aint-card-h">
          <h2><i className="ri-git-branch-line" aria-hidden="true" /> Project pipeline</h2>
        </div>
        <div className="aint-pipe">
          {stages.map((stage) => {
            const list = rows.filter((r) => r.project?.stage === stage);
            return (
              <section className="aint-pipe-col" key={stage} aria-label={`${stage}: ${list.length}`}>
                <h4>{stage}<span>{list.length}</span></h4>
                {list.length === 0 && <div className="aint-empty">No projects</div>}
                {list.map((row) => (
                  <div className="aint-pcard" key={row.enrollment_id}>
                    <div className="aint-strong">{row.project!.name ?? 'Untitled project'}</div>
                    <div className="aint-sub">{row.name}</div>
                    <div className="aint-trk">
                      <span>Tasks</span>
                      <span className="aint-bar"><span style={{ width: `${row.project!.tasks_pct}%` }} /></span>
                      <b>{row.project!.tasks_complete}/{row.project!.tasks_total}</b>
                    </div>
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const LaneCard: React.FC<{ row: InternRow; onOpen: (applicationId: string) => void }> = ({ row, onOpen }) => {
  const gate = gateCleared(row);
  const cert = certLabel(row);
  return (
    <div className="aint-icard">
      <div className="aint-icard-top">
        <div className="aint-name">{row.name}</div>
        {/* No meetings line here: attendance is off. */}
        <div className="aint-sub">{ago(row.activity.days_since)} · day {row.day ?? '—'}</div>
      </div>

      <div className="aint-trk">
        <span>Training</span>
        <span className="aint-bar"><span style={{ width: `${(gate / 3) * 100}%` }} /></span>
        <b>{gate}/3</b>
      </div>

      <div className="aint-trk">
        <span>Cert</span>
        <span className="aint-trk-t">{cert.text}</span>
      </div>

      <div className="aint-trk">
        <span>Project</span>
        {row.project
          ? (
            <>
              <span className="aint-bar"><span style={{ width: `${row.project.tasks_pct}%` }} /></span>
              <b>{row.project.tasks_pct}%</b>
            </>
          )
          : <span className="aint-trk-t">None</span>}
      </div>

      <div className="aint-icard-acts">
        {row.application_state === 'paused' && <span className="aint-pill state-paused">paused</span>}
        {/* Visibly unavailable, not absent: the design promises this control and Phase 6 builds it. */}
        <button type="button" className="aint-btn" disabled title="Nudge is not built yet">Nudge</button>
        <button
          type="button"
          className="aint-btn"
          disabled={!row.application_id}
          title={row.application_id ? undefined : 'No application record to open'}
          onClick={() => row.application_id && onOpen(row.application_id)}
        >
          Open applicant
        </button>
      </div>
    </div>
  );
};

export default ConsoleViewB;
