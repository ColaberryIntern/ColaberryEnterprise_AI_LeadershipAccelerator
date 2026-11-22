import React from 'react';
import { Link, Navigate, NavLink, useLocation } from 'react-router-dom';
import { loadOverview, type DeskOverview } from './careerDeskApi';
import { DeskError, Pill, SWITCH_WORDS } from './DeskParts';
import { useDeskData } from './useDesk';
import DeskQueueTab from './DeskQueueTab';
import DeskInboxesTab from './DeskInboxesTab';
import DeskBookingsTab from './DeskBookingsTab';
import DeskFeesTab from './DeskFeesTab';
import './careerDesk.css';

/**
 * Placement > the staff interview desk (Career Prep v27, CP11.1b, kit F9), one page with four tabs at the kit's routes
 * (/admin/placement/queue, /inboxes, /bookings, /fees). Above the tabs: the two dark switches as the server reads them
 * (on / off / could not be read), the recruiters, the Zoom-permission notice when recording is unavailable, and the link
 * to each student's prep. Access is the server's: every desk route is requireSection('placement'); a 403 says so.
 */
export const DESK_TABS = [
  { key: 'queue', label: 'Review queue', lead: 'What the inbox manager could not settle on its own.', Tab: DeskQueueTab },
  { key: 'inboxes', label: 'Inbox health', lead: "Every learner's job-search address and its forwarding.", Tab: DeskInboxesTab },
  { key: 'bookings', label: 'Bookings', lead: 'Every interview across learners, in Central time.', Tab: DeskBookingsTab },
  { key: 'fees', label: 'Placements and fees', lead: 'Offers, first-year salary and the fee.', Tab: DeskFeesTab },
] as const;

const Overview: React.FC<{ o: DeskOverview }> = ({ o }) => {
  const [mail, mailTone] = SWITCH_WORDS[o.switches.employerMail] ?? SWITCH_WORDS.unreadable;
  const [tests, testsTone] = SWITCH_WORDS[o.switches.inboxTests] ?? SWITCH_WORDS.unreadable;
  return (
    <div className="cdesk-overview" data-testid="cdesk-overview">
      <span>Employer email <Pill tone={mailTone} testId="cdesk-sw-mail">{mail}</Pill></span>
      <span>Inbox tests <Pill tone={testsTone} testId="cdesk-sw-tests">{tests}</Pill></span>
      <span data-testid="cdesk-recruiters">Recruiters: {o.recruiters.length ? o.recruiters.map((r) => r.name).join(', ') : 'none listed'}</span>
      <Link className="cdesk-link" to="/admin/placement/students">Student prep</Link>
      {o.recording && <p className="cdesk-callout cdesk-warnline" data-testid="cdesk-recording">{o.recording.note}</p>}
    </div>
  );
};

const CareerDeskPage: React.FC = () => {
  const { pathname } = useLocation();
  const overview = useDeskData(loadOverview, "the desk's switches");
  const tab = DESK_TABS.find((t) => pathname.replace(/\/+$/, '') === `/admin/placement/${t.key}`);
  if (!tab) return <Navigate to="/admin/placement/queue" replace />;
  const { Tab } = tab;
  return (
    <div className="cdesk" data-testid="cdesk">
      <header className="cdesk-head">
        <div className="cdesk-eyebrow">Placement · interview desk</div>
        <h1 className="cdesk-h1">{tab.label}</h1>
        <p className="cdesk-lead">{tab.lead}</p>
      </header>
      {overview.error ? <DeskError text={overview.error} onRetry={overview.reload} testId="cdesk-overview-error" /> : overview.data ? <Overview o={overview.data} /> : null}
      <nav className="cdesk-tabs" aria-label="Interview desk">
        {DESK_TABS.map((t) => <NavLink key={t.key} to={`/admin/placement/${t.key}`} data-testid={`cdesk-tab-${t.key}`}>{t.label}</NavLink>)}
      </nav>
      <Tab key={tab.key} />
    </div>
  );
};

export default CareerDeskPage;
