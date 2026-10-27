import React from 'react';
import type { OutreachRow, OutreachView } from '../../services/explorerCampusApi';
import LearnerName from './LearnerName';

/**
 * The staff outreach list (2026-10-26: "an easy way for the human staff to know who they should be reaching out to and who are the
 * most engaged customers"). Two views: Reach out now (not converted, no call coming up, not contacted in 7 days, active in the last
 * 14) and Most engaged (not converted). Each person carries the plain reasons the backend derived from recorded facts; the email opens a message.
 */
export const VIEWS: { key: OutreachView; label: string; hint: string }[] = [
  { key: 'reach_out', label: 'Reach out now', hint: 'Active in the last 14 days, not converted, no call booked, not contacted in the last 7 days. Highest intent first.' },
  { key: 'engaged', label: 'Most engaged', hint: 'Everyone not yet enrolled, ranked by what they have done: assignments, calls booked, the tour and recent activity.' },
];

const stateLabel = (s: string): string => s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export function ViewToggle({ view, onChange }: { view: OutreachView; onChange: (v: OutreachView) => void }) {
  return (
    <div className="btn-group btn-group-sm" role="group" aria-label="Outreach list view">
      {VIEWS.map((v) => (
        <button key={v.key} type="button" className={`btn ${view === v.key ? 'btn-primary' : 'btn-outline-primary'}`}
          aria-pressed={view === v.key} onClick={() => onChange(v.key)} data-testid={`eg-view-${v.key}`}>{v.label}</button>
      ))}
    </div>
  );
}

export default function OutreachList({ rows, view }: { rows: OutreachRow[]; view: OutreachView }) {
  if (rows.length === 0) {
    return (
      <div className="text-muted small" data-testid="eg-outreach-empty">
        {view === 'reach_out' ? 'Nobody needs a call right now: every recently active explorer has a call booked, was contacted this week, or has enrolled.' : 'No explorer activity is recorded yet.'}
      </div>
    );
  }
  return (
    <div className="table-responsive">
      <table className="table table-sm align-middle mb-0" data-testid="eg-outreach">
        <thead className="table-light">
          <tr><th style={{ width: 36 }}>#</th><th>Explorer</th><th>Stage</th><th>Why</th><th className="text-end">Score</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.enrollment_id} data-testid="eg-outreach-row">
              <td className="text-muted">{i + 1}</td>
              <td>
                {/* 2026-10-26: the name opens the 360; the orange icon opens GHL; the email starts a message */}
                <div className="fw-semibold"><LearnerName enrollmentId={r.enrollment_id} email={r.email} name={r.name} leadId={r.lead_id} ghlUrl={r.ghl_url} /></div>
                <a className="small" href={`mailto:${r.email}`}>{r.email}</a>
              </td>
              <td className="small text-nowrap">{stateLabel(r.primary_state)}</td>
              <td>
                <div className="d-flex flex-wrap gap-1">
                  {r.reasons.map((why) => <span key={why} className="badge rounded-pill text-bg-light border fw-normal">{why}</span>)}
                </div>
              </td>
              <td className="text-end fw-semibold">{r.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
