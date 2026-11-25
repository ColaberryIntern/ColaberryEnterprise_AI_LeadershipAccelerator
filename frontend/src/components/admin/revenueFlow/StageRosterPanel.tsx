import React, { useEffect, useState } from 'react';
import api from '../../../utils/api';

/**
 * R26 — the named people behind one membership funnel count.
 *
 * Taiwo Oludimimu, Admissions and Support Supervisor, 25 Nov 2026: "can you make the data
 * points clickable so they show a list of students or leads that fall within each category?
 * I would like to look further into this data."
 *
 * ── THE COUNT AND THIS LIST CANNOT DISAGREE ──────────────────────────────────────────────
 *
 * Both come from one classifier on the backend (`membershipStages`): the funnel tallies it,
 * this filters by it. That matters more here than almost anywhere else on the page, because a
 * count of 27 above a list of 32 does not read as a bug in one of them. It reads as a reason
 * to stop trusting the whole screen.
 *
 * So this panel renders the server's list verbatim and does no filtering of its own. It shows
 * `count` from the payload beside the number of rows it drew, which is the cheap visible
 * proof that nothing was lost in transit.
 *
 * ── A ROW WITH NO NAME IS LISTED, NOT DROPPED ────────────────────────────────────────────
 *
 * Every subscription resolved to a person when this was built, so an unnamed row is not
 * expected. If one appears it is shown with its absence stated, because a list quietly
 * shorter than its own count is exactly the failure above.
 */

export interface RosterPerson {
  rowId: string;
  name: string | null;
  email: string | null;
  detail: string;
  unresolvedReason: string | null;
}

export interface StageRoster {
  stageKey: string;
  label: string;
  count: number;
  people: RosterPerson[];
  emptyNote: string | null;
  provenance: string;
}

/**
 * The rendering, split from the fetching.
 *
 * Exported for the same reason `InitiativeCardView` is: `renderToStaticMarkup` never runs
 * effects, so a populated roster is unreachable through the fetching component and its
 * behaviour would be asserted by reading the source rather than by running it. The rules
 * worth testing — a count that disagrees with its own list, an unresolved row, an empty
 * stage — all live here.
 */
export function StageRosterView({ roster }: { roster: StageRoster }) {
  const { stageKey } = roster;
  return (
    <div data-testid={`roster-${stageKey}`}>
      <div className="d-flex align-items-baseline gap-2 flex-wrap mb-2">
        <strong style={{ fontSize: 13 }}>{roster.label}</strong>
        <span className="small text-muted" data-testid={`roster-count-${stageKey}`}>
          {roster.people.length === roster.count
            ? `${roster.count} ${roster.count === 1 ? 'person' : 'people'}`
            /*
              Shown rather than smoothed over. If these ever differ, the page says so instead
              of printing whichever number happens to be in hand.
            */
            : `Count says ${roster.count}, this list holds ${roster.people.length}`}
        </span>
      </div>

      {roster.emptyNote && (
        <div className="small text-muted" data-testid={`roster-empty-${stageKey}`}>
          {roster.emptyNote}
        </div>
      )}

      {roster.people.length > 0 && (
        <div className="table-responsive">
          <table className="table table-sm mb-2" style={{ fontSize: 12 }}>
            <thead className="table-light">
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">What this row is</th>
              </tr>
            </thead>
            <tbody>
              {roster.people.map((p) => (
                <tr key={p.rowId} data-testid={`roster-row-${p.rowId}`}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {p.name ?? (
                      <span className="text-muted fst-italic">No name recorded</span>
                    )}
                  </td>
                  {/*
                    Words, not a dash, for a missing address. A dash in a column of emails
                    reads as "blank" and invites the reader to assume the address exists and
                    failed to load, which is the same mistake this page refuses to make with
                    a zero. The repo's escaped-dash lint caught this one, and its message is
                    the right one: escaping a dash does not make it a different dash.
                  */}
                  <td>
                    {p.email
                      ? <a href={`mailto:${p.email}`}>{p.email}</a>
                      : <span className="text-muted">None recorded</span>}
                  </td>
                  <td className="text-muted">
                    {p.detail}
                    {p.unresolvedReason && (
                      <span style={{ color: 'var(--status-warning)' }}> {p.unresolvedReason}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{roster.provenance}</div>
    </div>
  );
}

/**
 * The fetching half: asks the server for one stage's people and hands them to the view.
 *
 * It does no filtering of its own, deliberately. The backend classifies the rows with the
 * same rules that produced the count, so any filtering here would be a second opinion and
 * the first thing anyone would notice is a list that disagrees with the number above it.
 */
export default function StageRosterPanel({ stageKey, label }: { stageKey: string; label: string }) {
  const [roster, setRoster] = useState<StageRoster | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setRoster(null);
    setError(null);
    api.get(`/api/admin/commercialization/revenue-flow/membership/stage/${stageKey}/people`)
      .then((r) => { if (alive) setRoster(r.data?.data ?? null); })
      .catch((e) => {
        if (alive) setError(e?.message || 'Could not load the people in this stage.');
      });
    return () => { alive = false; };
  }, [stageKey]);

  if (error) {
    return (
      <div className="alert alert-danger py-2 px-3 mb-0" data-testid={`roster-error-${stageKey}`}>
        {error}
      </div>
    );
  }
  if (!roster) {
    return (
      <div className="small text-muted" data-testid={`roster-loading-${stageKey}`}>
        Loading the people at &#8220;{label}&#8221;&#8230;
      </div>
    );
  }
  return <StageRosterView roster={roster} />;
}
