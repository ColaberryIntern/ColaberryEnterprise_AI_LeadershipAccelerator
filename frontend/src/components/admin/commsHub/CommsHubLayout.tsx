import React, { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { PageHeader } from '../shell';
import { getCommsHubSummary, type CommsHubSummary } from '../../../services/commsHubApi';
// The hub's styles for every tab (Today, Events, Compose, Schedule), not only the Events tab.
import './commsHub.css';

/**
 * The Communications Hub shell (CH1.3): the header with its three controls, the four tabs as real
 * routes (a refresh keeps the tab), and the summary every tab reads. Tabs receive it through the
 * Outlet context so the page makes one summary call, not four.
 */
export interface CommsHubOutletContext {
  summary: CommsHubSummary | null;
  loadError: boolean;
  reload: () => void;
}

export const COMMS_HUB_TABS: ReadonlyArray<{ to: string; label: string; end: boolean }> = [
  { to: '/admin/comms-hub', label: 'Today', end: true },
  { to: '/admin/comms-hub/events', label: 'Events', end: false },
  { to: '/admin/comms-hub/compose', label: 'Compose', end: false },
  { to: '/admin/comms-hub/schedule', label: 'Schedule & history', end: false },
];

export default function CommsHubLayout(): React.ReactElement {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<CommsHubSummary | null>(null);
  const [loadError, setLoadError] = useState(false);

  const reload = useCallback(() => {
    setLoadError(false);
    getCommsHubSummary()
      .then((s) => setSummary(s))
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const actions = (
    <div className="d-flex flex-wrap gap-2">
      <button type="button" className="btn btn-outline-secondary comms-hub-action" disabled aria-describedby="comms-hub-pause-note">
        <i className="ri-pause-circle-line me-1" aria-hidden="true" />Pause all sending
      </button>
      <span id="comms-hub-pause-note" className="visually-hidden">Nothing is set to send yet, so there is nothing to pause.</span>
      <button type="button" className="btn btn-outline-primary comms-hub-action" onClick={() => navigate('/admin/comms-hub/events?new=1')}>
        <i className="ri-calendar-event-line me-1" aria-hidden="true" />New event
      </button>
      <button type="button" className="btn btn-primary comms-hub-action" onClick={() => navigate('/admin/comms-hub/compose')}>
        <i className="ri-quill-pen-line me-1" aria-hidden="true" />New message
      </button>
    </div>
  );

  const context: CommsHubOutletContext = { summary, loadError, reload };

  return (
    <div className="comms-hub">
      <PageHeader
        title="Communications Hub"
        subtitle="Events, member announcements and going live, in one place. All times are Central."
        icon="calendar-event-line"
        actions={actions}
      />
      <nav aria-label="Communications Hub sections" className="mb-3">
        <ul className="nav nav-tabs">
          {COMMS_HUB_TABS.map((t) => (
            <li className="nav-item" key={t.to}>
              <NavLink to={t.to} end={t.end} className={({ isActive }) => `nav-link comms-hub-tab${isActive ? ' active' : ''}`}>
                {t.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      {loadError && (
        <div className="alert alert-warning d-flex align-items-center justify-content-between" role="alert">
          <span>The hub summary did not load.</span>
          <button type="button" className="btn btn-sm btn-outline-secondary comms-hub-action" onClick={reload}>Try again</button>
        </div>
      )}
      <Outlet context={context} />
    </div>
  );
}
