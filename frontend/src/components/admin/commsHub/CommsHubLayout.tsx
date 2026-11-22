import React, { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { PageHeader } from '../shell';
import { apiErrorMessage, getCommsHubSummary, setSendingPaused, type CommsHubSummary } from '../../../services/commsHubApi';
import ReportAProblem from '../../../pages/admin/marketing/bugReport/ReportAProblem';
// The hub's styles for every tab (Today, Events, Compose, Schedule), not only the Events tab.
import './commsHub.css';

/**
 * The Communications Hub shell (CH1.3): the header with its three controls, the four tabs as real
 * routes (a refresh keeps the tab), and the summary every tab reads. Tabs receive it through the
 * Outlet context so the page makes one summary call, not four.
 *
 * CH7.4: Pause all sending works from every tab. While paused, every tab says so under the header,
 * and the sending worker holds every message (it reads the same setting before each send).
 */
export interface CommsHubOutletContext {
  summary: CommsHubSummary | null;
  loadError: boolean;
  reload: () => void;
  /** Pause or resume every channel; the summary is refreshed from the server's answer. */
  setPaused: (paused: boolean) => Promise<void>;
  pauseBusy: boolean;
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
  const [pauseBusy, setPauseBusy] = useState(false);
  const [pauseError, setPauseError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoadError(false);
    getCommsHubSummary()
      .then((s) => setSummary(s))
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const setPaused = useCallback(async (paused: boolean): Promise<void> => {
    setPauseBusy(true);
    setPauseError(null);
    try {
      const s = await setSendingPaused(paused);
      setSummary((cur) => (cur ? { ...cur, sending_paused: s.sending_paused } : cur));
    } catch (err) {
      setPauseError(apiErrorMessage(err, paused ? 'Sending was not paused. Try again.' : 'Sending was not resumed. Try again.'));
    } finally {
      setPauseBusy(false);
    }
  }, []);
  const paused = !!summary?.sending_paused;

  const actions = (
    <div className="d-flex flex-wrap gap-2">
      <button
        type="button"
        className={`btn comms-hub-action ${paused ? 'btn-warning' : 'btn-outline-secondary'}`}
        aria-pressed={paused}
        disabled={!summary || pauseBusy}
        onClick={() => { void setPaused(!paused); }}
      >
        <i className={`${paused ? 'ri-play-circle-line' : 'ri-pause-circle-line'} me-1`} aria-hidden="true" />
        {paused ? 'Resume sending' : 'Pause all sending'}
      </button>
      <button type="button" className="btn btn-outline-primary comms-hub-action" onClick={() => navigate('/admin/comms-hub/events?new=1')}>
        <i className="ri-calendar-event-line me-1" aria-hidden="true" />New event
      </button>
      <button type="button" className="btn btn-primary comms-hub-action" onClick={() => navigate('/admin/comms-hub/compose')}>
        <i className="ri-quill-pen-line me-1" aria-hidden="true" />New message
      </button>
    </div>
  );

  const context: CommsHubOutletContext = { summary, loadError, reload, setPaused, pauseBusy };

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
      <div role="status" aria-live="polite">
        {paused && (
          <div className="alert alert-warning d-flex align-items-center gap-2 ch-paused" data-testid="ch-paused">
            <i className="ri-pause-circle-fill" aria-hidden="true" />
            <span><strong>Sending is paused.</strong> Nothing goes out on any channel until you resume. Nothing is lost.</span>
          </div>
        )}
      </div>
      {pauseError && <div className="alert alert-danger py-2" role="alert">{pauseError}</div>}
      {loadError && (
        <div className="alert alert-warning d-flex align-items-center justify-content-between" role="alert">
          <span>The hub summary did not load.</span>
          <button type="button" className="btn btn-sm btn-outline-secondary comms-hub-action" onClick={reload}>Try again</button>
        </div>
      )}
      <Outlet context={context} />
      {/* CH9.1 Report a problem, bottom right on every tab. Its own endpoint: Marketing's is gated on
          `campaigns`, which neither Jackie nor Taiwo holds. The route is in the report, so no tab prop. */}
      <ReportAProblem brandLabel="Communications Hub" endpoint={COMMS_HUB_BUG_REPORT_ENDPOINT} extra={{ area: 'comms-hub' }} />
    </div>
  );
}

export const COMMS_HUB_BUG_REPORT_ENDPOINT = '/api/admin/comms-hub/bug-report';
