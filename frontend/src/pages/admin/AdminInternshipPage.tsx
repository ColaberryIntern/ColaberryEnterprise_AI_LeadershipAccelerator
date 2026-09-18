import React, { useState } from 'react';
import { PageHeader } from '../../components/admin/shell';
import './internship/adminInternship.css';
import { useInternshipReview, ReviewProvider } from './internship/reviewContext';
import InternshipApplicationsMode from './internship/InternshipApplicationsMode';
import { InternshipProjectsMode, InternshipManageMode } from './internship/InternshipTools';

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

type Mode = 'apps' | 'projects' | 'manage';
const MODES: Array<{ key: Mode; label: string }> = [
  { key: 'apps', label: 'Applications' },
  { key: 'projects', label: 'Projects' },
  { key: 'manage', label: 'Manage' },
];

const AdminInternshipPage: React.FC = () => {
  const review = useInternshipReview();
  const [mode, setMode] = useState<Mode>('apps');

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
          {MODES.map((m) => (
            <button key={m.key} type="button" role="tab" aria-selected={mode === m.key} className={mode === m.key ? 'on' : ''} onClick={() => setMode(m.key)}>
              {m.label}
            </button>
          ))}
        </div>

        {mode === 'apps' && <InternshipApplicationsMode />}
        {mode === 'projects' && <InternshipProjectsMode onOpenApplicant={openApplicant} />}
        {mode === 'manage' && <InternshipManageMode />}
      </div>
    </ReviewProvider>
  );
};

export default AdminInternshipPage;
