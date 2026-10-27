import React from 'react';
import SectionCard from '../admin/shell/SectionCard';
import type { CampusActivity } from '../../services/explorerCampusApi';

/**
 * Explorer Growth: what explorers are doing on the campus (2026-10-26). Every number is a recorded fact (explorerCampusService):
 * completed assignment cards (Open House sign-ups live on Eventbrite, so that tile points there instead of showing a portal 0), admissions calls booked from the campus, the explorer tour (furthest stop of
 * how many, finished) and who was on the campus. Tours and bookings are recorded only from `tracked_since`, and the panel says so.
 */
function Kpi({ label, value, sub, testId }: { label: string; value: number; sub: string; testId: string }) {
  return (
    <div className="col-6 col-md-4 col-xl" data-testid={testId}>
      <div className="border rounded-3 p-3 h-100 bg-white">
        <div className="text-muted small text-uppercase fw-semibold" style={{ letterSpacing: '.04em' }}>{label}</div>
        <div className="fs-3 fw-bold">{value.toLocaleString()}</div>
        <div className="text-muted small">{sub}</div>
      </div>
    </div>
  );
}

const sinceLabel = (iso: string): string => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function TourSteps({ byStop, started }: { byStop: CampusActivity['tours']['by_stop']; started: number }) {
  if (started === 0) return <div className="text-muted small" data-testid="eg-tour-none">No explorer has started the tour since tracking began.</div>;
  return (
    <ul className="list-unstyled mb-0" data-testid="eg-tour-steps">
      {byStop.map((s) => (
        <li key={`${s.stop}-${s.total}`} className="d-flex align-items-center gap-2 mb-1">
          <span className="small text-nowrap" style={{ width: 110 }}>Stop {s.stop} of {s.total}</span>
          <span className="flex-grow-1 bg-light rounded" style={{ height: 10 }}>
            <span className="d-block bg-primary rounded" style={{ height: 10, width: `${Math.round((s.people / started) * 100)}%` }} />
          </span>
          <span className="small text-end" style={{ width: 70 }}>{s.people.toLocaleString()} {s.people === 1 ? 'person' : 'people'}</span>
        </li>
      ))}
    </ul>
  );
}

export default function CampusActivityPanel({ a }: { a: CampusActivity }) {
  const since = sinceLabel(a.tracked_since);
  return (
    <>
      <div className="row g-3 mb-3">
        <div className="col-6 col-md-4 col-xl" data-testid="eg-kpi-openhouse">
          <div className="border rounded-3 p-3 h-100 bg-light">
            <div className="text-muted small text-uppercase fw-semibold" style={{ letterSpacing: '.04em' }}>Open House sign-ups</div>
            <div className="small mt-1">Recorded on Eventbrite, not in the portal. See the event page there for who signed up.</div>
          </div>
        </div>
        <Kpi testId="eg-kpi-assignments" label="Assignments completed" value={a.assignments.completed}
          sub={`by ${a.assignments.people.toLocaleString()} explorers · ${a.assignments.last_7_days.toLocaleString()} this week`} />
        <Kpi testId="eg-kpi-calls" label="Admissions calls booked" value={a.admissions_calls.booked}
          sub={`${a.admissions_calls.upcoming.toLocaleString()} upcoming · ${a.admissions_calls.cancelled.toLocaleString()} cancelled`} />
        <Kpi testId="eg-kpi-tours" label="Tours taken" value={a.tours.started}
          sub={`${a.tours.finished.toLocaleString()} finished all the way`} />
        <Kpi testId="eg-kpi-campus" label="On the campus" value={a.on_campus.last_24h}
          sub={`today · ${a.on_campus.last_7_days.toLocaleString()} this week`} />
      </div>
      <SectionCard title="How far explorers got in the tour" icon="footprint-line" subtitle={`Furthest stop reached, out of the tour's stops. Counted since ${since}.`}>
        <TourSteps byStop={a.tours.by_stop} started={a.tours.started} />
      </SectionCard>
      <p className="text-muted small mt-2 mb-0" data-testid="eg-tracked-since">
        Of {a.explorers.toLocaleString()} explorers. Tours and admissions calls booked from the campus are counted since {since}; assignments include everything before.
      </p>
    </>
  );
}
