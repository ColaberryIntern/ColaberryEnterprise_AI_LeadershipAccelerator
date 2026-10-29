import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { PageHeader } from '../../components/admin/shell';
import './internship/adminInternship.css';
import { useInternshipReview, ReviewProvider } from './internship/reviewContext';
import InternshipApplicationsMode from './internship/InternshipApplicationsMode';
import { InternshipProjectsMode, InternshipManageMode } from './internship/InternshipTools';
import InternConsoleMode from './internship/InternConsoleMode';
import InternshipAgentsMode from './internship/InternshipAgentsMode';
import InternshipGovContractsMode from './internship/InternshipGovContractsMode';

/**
 * AdminInternshipPage — the AI Internship admin console.
 *
 * ── WHY THIS WAS REBUILT ────────────────────────────────────────────────────
 *
 * The previous version was one 1000-line page in a single scrolling column.
 * Opening an applicant injected ~11 stacked cards into the middle of that column
 * and the selection state bounced the reader between the top and the bottom of the
 * page; the review tools sat mixed in with the queue. It was, in the owner's
 * words, a maze.
 *
 * The rebuild is a master/detail console with three modes:
 *   - Applications: a fixed queue beside a detail pane that shows ONE tab at a
 *     time (Overview · Assessment · Activity & Project · Answers · Documents ·
 *     Decide · Audit), with a pinned applicant header. Opening someone fills the
 *     pane; it never grows the page.
 *   - Projects: the "ready for a project" roster and the start-a-project tools,
 *     moved off the review screen.
 *   - Manage: convert existing interns, kept apart so it can't fire by accident.
 *
 * All the review state lives in `useInternshipReview` (context), so the split
 * surfaces read what they need without prop-drilling. The Decide tab also carries
 * the Activate control, which the backend has always supported but the old UI
 * never exposed.
 */

type Mode = 'apps' | 'console' | 'projects' | 'manage' | 'agents' | 'gov';
// The last two tabs are section-gated: each renders only for a viewer who holds the matching
// management section (`agents` / `gov_contracts`). owner and admin hold both; Admissions, who
// holds `internship` to run the application queue (resume / phone / transcript), holds neither
// and so never sees them. A tab with no `section` is visible to everyone who can open this hub.
const MODES: Array<{ key: Mode; label: string; section?: string }> = [
  { key: 'apps', label: 'Applications' },
  { key: 'console', label: 'Intern Console' },
  { key: 'projects', label: 'Projects' },
  { key: 'manage', label: 'Manage' },
  { key: 'agents', label: 'Agents', section: 'agents' },
  { key: 'gov', label: 'Gov Contracts', section: 'gov_contracts' },
];

const AdminInternshipPage: React.FC = () => {
  const review = useInternshipReview();
  const { canSection } = useAuth();
  // The two Agent Factory / Gov delivery tabs appear only for a viewer who holds the matching
  // section; everyone who can open the hub sees the rest. Before /me resolves, canSection is
  // permissive (no nav flash for the common owner/admin case), then it gates strictly.
  const visibleModes = MODES.filter((m) => !m.section || canSection(m.section));
  // Which section is open lives in the URL (?view=), so a refresh keeps you where
  // you were instead of dropping back to Applications — which, mid phone-intake,
  // meant losing the whole live call view.
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('view');
  // 'apps' stays the default on purpose: staff mid phone-intake must not be moved off the live
  // call view by a new tab beside it. An unknown ?view=, or one the viewer may not see, falls
  // back to it too — so a deep link to a gated tab never strands a viewer who lacks that section.
  const mode: Mode = visibleModes.some((m) => m.key === raw) ? (raw as Mode) : 'apps';
  const setMode = (m: Mode) => setSearchParams((prev) => {
    const p = new URLSearchParams(prev);
    p.set('view', m);
    return p;
  }, { replace: true });

  const openApplicant = (id: string) => { setMode('apps'); review.setSelected(id); };

  return (
    <ReviewProvider value={review}>
      <div>
        <PageHeader
          title="AI Internship"
          subtitle="Applications, interviews and decisions"
          icon="user-follow-line"
          breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'AI Internship' }]}
        />

        <div className="aint-modes" role="tablist" aria-label="Internship admin sections">
          {visibleModes.map((m) => (
            <button key={m.key} type="button" role="tab" aria-selected={mode === m.key} className={mode === m.key ? 'on' : ''} onClick={() => setMode(m.key)}>
              {m.label}
            </button>
          ))}
        </div>

        {mode === 'apps' && <InternshipApplicationsMode />}
        {mode === 'console' && <InternConsoleMode onOpenApplicant={openApplicant} />}
        {mode === 'projects' && <InternshipProjectsMode onOpenApplicant={openApplicant} />}
        {mode === 'manage' && <InternshipManageMode />}
        {mode === 'agents' && <InternshipAgentsMode />}
        {mode === 'gov' && <InternshipGovContractsMode />}
      </div>
    </ReviewProvider>
  );
};

export default AdminInternshipPage;
