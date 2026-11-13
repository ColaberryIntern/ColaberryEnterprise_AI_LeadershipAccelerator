import React, { useCallback, useEffect, useState } from 'react';
import { PageHeader, SectionCard, EmptyState } from '../../../components/admin/shell';
import {
  getOpenHouseAttendees,
  attendeesErrorMessage,
  type OpenHouseAttendees,
  type ReconciledRegistrant,
} from '../../../services/openHouseAttendeeApi';

/**
 * /admin/marketing/open-house-attendees - everyone coming to the next Open House.
 *
 * WHY THIS PAGE EXISTS. On 2026-11-11 the Nov 19 Open House had seven people
 * registered on Eventbrite and six registered through our own landing page, with
 * ZERO overlap. Thirteen people, and no screen anywhere showed more than seven:
 * the portal Events page counts Eventbrite's roster out of CCPP, while our funnel
 * writes to Postgres, and nothing joined them. The reminder sweep only knows the
 * second list; anyone running the event from Eventbrite only sees the first.
 *
 * So the headline here is the UNION, and the two exclusive groups are named rather
 * than summed away. Reached from the Marketing hub, not the sidebar, which keeps
 * the one Marketing button (2026-10-08).
 */

function RosterUnavailable({ errorClass }: { errorClass?: string }) {
  // Deliberately NOT an empty table. "We could not read it" and "nobody signed up"
  // look identical once a failure is rendered as zero, and this page is exactly
  // where that confusion does damage.
  return (
    <div className="alert alert-warning py-2 mb-3" role="status">
      <strong>Eventbrite&rsquo;s roster could not be read.</strong>{' '}
      The list below is only the people who signed up through our own pages, so the
      totals are incomplete &mdash; this is <em>not</em> a sign that nobody registered on
      Eventbrite. CCPP is reachable only from inside the production network.
      {errorClass && <span className="text-muted small ms-1">({errorClass})</span>}
    </div>
  );
}

function SourceBadge({ source }: { source: string | null }) {
  const label = source === 'landing_page' ? 'Landing page'
    : source === 'training_site' ? 'Training site'
      : source ?? 'Unknown';
  return <span className="badge bg-secondary">{label}</span>;
}

function ReminderCell({ r }: { r: ReconciledRegistrant }) {
  if (r.reminded_1h) return <span className="badge bg-success">1-hour sent</span>;
  if (r.reminded_24h) return <span className="badge bg-info">Day-before sent</span>;
  return <span className="text-muted small">Not yet</span>;
}

function EventbriteCell({ on }: { on: boolean | null }) {
  // Three states, not two. Null is "unknown", and saying "No" there would be a
  // claim the page cannot support.
  if (on === null) return <span className="text-muted small">Unknown</span>;
  return on
    ? <span className="badge bg-success">On both</span>
    : <span className="badge bg-warning text-dark">Ours only</span>;
}

export default function AdminOpenHouseAttendeesPage() {
  const [data, setData] = useState<OpenHouseAttendees | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await getOpenHouseAttendees());
    } catch (err) {
      setError(attendeesErrorMessage(err, 'The attendee list could not be loaded.'));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rosterOk = data?.eventbrite.status === 'ok';

  return (
    <>
      <PageHeader
        title="Open House signups"
        icon="group-line"
        subtitle="Everyone coming to the next Open House, from Eventbrite and our own funnel. Two systems take registrations; this is the only place both are counted."
        breadcrumb={[{ label: 'Marketing', to: '/admin/marketing' }, { label: 'Open House signups' }]}
        actions={data?.event?.rsvp_url
          ? <a className="btn btn-sm btn-outline-secondary" href={data.event.rsvp_url} target="_blank" rel="noopener noreferrer">Open on Eventbrite</a>
          : undefined}
      />

      {error && (
        <div className="alert alert-danger py-2 d-flex align-items-center gap-2" role="alert">
          <span>{error}</span>
          <button type="button" className="btn btn-sm btn-outline-danger ms-auto" onClick={load}>Try again</button>
        </div>
      )}
      {!data && !error && <p className="text-muted">Loading&hellip;</p>}

      {data && !data.event && (
        <EmptyState
          icon="calendar-close-line"
          title="No Open House is announced"
          description="Once an Open House is live on Eventbrite, everyone registered for it shows up here."
        />
      )}

      {data && data.event && (
        <>
          {data.eventbrite.status === 'unavailable' && (
            <RosterUnavailable errorClass={data.eventbrite.error_class} />
          )}

          <SectionCard
            title={data.event.name}
            subtitle={data.event.starts_at
              ? new Date(data.event.starts_at).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'full', timeStyle: 'short' }) + ' Central'
              : undefined}
            icon="calendar-event-line"
            className="mb-3"
          >
            <div className="row g-3">
              <div className="col-6 col-lg-3">
                <div className="fs-4 fw-bold text-primary">
                  {/* An em dash, not a zero, when either side is unknown. */}
                  {data.summary.distinct_people ?? '—'}
                </div>
                <div className="text-muted small">People expected, in total</div>
              </div>
              <div className="col-6 col-lg-3">
                <div className="fs-4 fw-bold">{data.eventbrite.count ?? '—'}</div>
                <div className="text-muted small">Registered on Eventbrite</div>
              </div>
              <div className="col-6 col-lg-3">
                <div className="fs-4 fw-bold">{data.ours.count}</div>
                <div className="text-muted small">Registered on our pages</div>
              </div>
              <div className="col-6 col-lg-3">
                <div className="fs-4 fw-bold">{data.summary.overlap ?? '—'}</div>
                <div className="text-muted small">On both lists</div>
              </div>
            </div>

            {rosterOk && data.summary.overlap === 0 && data.ours.count > 0 && (
              <p className="small text-muted mt-3 mb-0">
                No one appears on both lists. Our registrants are reminded by us;
                Eventbrite reminds its own. Make sure both are being sent to the same
                meeting room.
              </p>
            )}
          </SectionCard>

          <SectionCard
            title="Registered on our pages"
            subtitle="These are the people our reminders go to. They do not appear on Eventbrite unless they also registered there."
            icon="user-add-line"
            className="mb-3"
          >
            {data.ours.registrants.length === 0 ? (
              <EmptyState
                icon="user-search-line"
                title="Nobody has signed up through our pages yet"
                description="Signups from the Open House landing page and the training site land here the moment they happen."
              />
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0 align-middle">
                  <thead className="table-light">
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Email</th>
                      <th scope="col">Came from</th>
                      <th scope="col">Account</th>
                      <th scope="col">Reminder</th>
                      <th scope="col">Eventbrite</th>
                      <th scope="col">Signed up</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ours.registrants.map((r) => (
                      <tr key={r.email}>
                        <td>{r.name ?? <span className="text-muted">&mdash;</span>}</td>
                        <td className="text-break">{r.email}</td>
                        <td><SourceBadge source={r.source} /></td>
                        <td>{r.has_account
                          ? <span className="badge bg-success">Created</span>
                          : <span className="text-muted small">None</span>}
                        </td>
                        <td><ReminderCell r={r} /></td>
                        <td><EventbriteCell on={r.on_eventbrite} /></td>
                        <td className="small text-muted">
                          {r.registered_at
                            ? new Date(r.registered_at).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' })
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {rosterOk && (
            <SectionCard
              title="Registered on Eventbrite only"
              subtitle="Eventbrite reminds these people itself. Our reminder sweep does not know about them."
              icon="ticket-line"
              className="mb-3"
            >
              {data.eventbrite.only_on_eventbrite.length === 0 ? (
                <p className="text-muted mb-0">Everyone on Eventbrite also registered through our pages.</p>
              ) : (
                <ul className="list-unstyled mb-0">
                  {data.eventbrite.only_on_eventbrite.map((email) => (
                    <li key={email} className="py-1 border-bottom text-break">{email}</li>
                  ))}
                </ul>
              )}
            </SectionCard>
          )}
        </>
      )}
    </>
  );
}
