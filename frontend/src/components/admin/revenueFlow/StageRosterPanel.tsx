import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../../utils/api';
import { personPath } from '../../../adminOs/personLink';
import { fmtCount } from './fmtCount';

/**
 * R26, extended by R27 — the people behind one membership funnel count.
 *
 * Taiwo Oludimimu, 25 Nov 2026: "can you make the data points clickable so they show a list of
 * students or leads that fall within each category? I would like to look further into this
 * data." Ali the same day, on seeing it: group the repeats, link the name to the 360, and give
 * every row a way to send email.
 *
 * ── THE COUNT AND THIS LIST CANNOT DISAGREE ──────────────────────────────────────────────
 *
 * Both come from one classifier on the backend (`membershipStages`): the funnel tallies it,
 * the roster filters by it. That matters more here than almost anywhere else on the page,
 * because a count of 27 above a list of 32 does not read as a bug in one of them. It reads as
 * a reason to stop trusting the whole screen.
 *
 * ── WHY TWO COUNTS ARE SHOWN ─────────────────────────────────────────────────────────────
 *
 * Grouping by person broke the old "the count equals the rows listed" invariant, because 296
 * subscription rows belong to 115 people. The honest fix is to print BOTH and say which is
 * which, not to quietly start reporting a different number under the same name. The funnel's
 * figure counts subscriptions; this list counts people; the panel says so.
 *
 * ── AND WHY THE REPEATS ARE KEPT ─────────────────────────────────────────────────────────
 *
 * A person's `rowCount` is the finding, not noise. Four rows at "Payment failed" is somebody
 * who tried four times, and deduping to one name would delete exactly the fact a support
 * reader came for.
 */

export interface RosterRow {
  rowId: string;
  detail: string;
}

export interface RosterPerson {
  personKey: string;
  name: string | null;
  email: string | null;
  enrollmentId: string | null;
  rowCount: number;
  rows: RosterRow[];
  summary: string | null;
  unresolvedReason: string | null;
}

export interface StageRoster {
  stageKey: string;
  label: string;
  subscriptionCount: number;
  personCount: number;
  people: RosterPerson[];
  emptyNote: string | null;
  provenance: string;
}

/**
 * The name, as a link to the 360 where the row carries something to link on.
 *
 * Built through `personPath` rather than by hand, which is the helper written for Ali's
 * 2026-09-09 rule that any person's name on the admin side opens the 360 dashboard. It also
 * chooses the opening TAB, and `billing` is the right one from a revenue roster: a reader who
 * clicked a payment stage wants the payments, not the timeline.
 *
 * Returns plain text when there is nothing to link on, because a link that 404s is worse than
 * a name that is not a link.
 */
function PersonName({ person }: { person: RosterPerson }) {
  const to = personPath(
    { email: person.email, enrollmentId: person.enrollmentId },
    'billing',
  );
  const label = person.name ?? <span className="text-muted fst-italic">No name recorded</span>;

  if (!to) return <span data-testid={`roster-name-${person.personKey}`}>{label}</span>;
  return (
    <Link to={to} data-testid={`roster-name-${person.personKey}`} className="text-decoration-none">
      {label}
    </Link>
  );
}

/**
 * The rendering, split from the fetching.
 *
 * Exported for the same reason `InitiativeCardView` is: `renderToStaticMarkup` never runs
 * effects, so a populated roster is unreachable through the fetching component and its
 * behaviour would be asserted by reading the source rather than by running it.
 */
export function StageRosterView({ roster }: { roster: StageRoster }) {
  const { stageKey } = roster;
  const listed = roster.people.reduce((a, p) => a + p.rowCount, 0);

  return (
    <div data-testid={`roster-${stageKey}`}>
      <div className="d-flex align-items-baseline gap-2 flex-wrap mb-2">
        <strong style={{ fontSize: 13 }}>{roster.label}</strong>
        <span className="small text-muted" data-testid={`roster-count-${stageKey}`}>
          {listed === roster.subscriptionCount
            ? `${fmtCount(roster.subscriptionCount)} `
              + `${roster.subscriptionCount === 1 ? 'subscription' : 'subscriptions'}, held by `
              + `${fmtCount(roster.personCount)} ${roster.personCount === 1 ? 'person' : 'people'}`
            /*
              Printed rather than smoothed over. If these ever differ, the page says so instead
              of showing whichever number happens to be in hand.
            */
            : `Count says ${fmtCount(roster.subscriptionCount)}, this list holds ${fmtCount(listed)}`}
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
                <th scope="col" className="text-end">Rows</th>
                <th scope="col">What these rows are</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {roster.people.map((p) => (
                <tr key={p.personKey} data-testid={`roster-person-${p.personKey}`}>
                  <td style={{ whiteSpace: 'nowrap' }}><PersonName person={p} /></td>
                  <td>
                    {/*
                      Words, not a dash, for a missing address. A dash in a column of emails
                      reads as "blank" and invites the reader to assume the address exists and
                      failed to load, which is the same mistake this page refuses to make with
                      a zero.
                    */}
                    {p.email ?? <span className="text-muted">None recorded</span>}
                  </td>
                  <td className="text-end fw-bold" data-testid={`roster-rows-${p.personKey}`}>
                    {fmtCount(p.rowCount)}
                  </td>
                  <td className="text-muted">
                    {p.summary && (
                      <div data-testid={`roster-summary-${p.personKey}`}>{p.summary}</div>
                    )}
                    {p.rows.map((r) => (
                      <div key={r.rowId} data-testid={`roster-row-${r.rowId}`}>{r.detail}</div>
                    ))}
                    {p.unresolvedReason && (
                      <div style={{ color: 'var(--status-warning)' }}>{p.unresolvedReason}</div>
                    )}
                  </td>
                  <td className="text-end" style={{ whiteSpace: 'nowrap' }}>
                    {/*
                      A mailto, deliberately. There is no admin composer in this app, and this
                      must NOT send through Mandrill as Ali: that path is for considered
                      outbound, not a button on a list. This opens the reader's own client with
                      the address filled, which is what "send email" means from here.
                    */}
                    {p.email && (
                      <a
                        href={`mailto:${p.email}`}
                        className="btn btn-outline-secondary btn-sm"
                        data-testid={`roster-email-${p.personKey}`}
                      >
                        Send email
                      </a>
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
 * It does no filtering and no grouping of its own, deliberately. The backend classifies and
 * groups with the same rules that produced the count, so anything done here would be a second
 * opinion, and the first thing anyone would notice is a list that disagrees with the number
 * above it.
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
