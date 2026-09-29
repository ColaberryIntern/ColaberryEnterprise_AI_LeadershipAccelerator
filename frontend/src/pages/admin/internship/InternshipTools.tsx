import React, { useCallback, useRef, useState } from 'react';
import { SectionCard } from '../../../components/admin/shell';
import StartProjectForStudent from '../../../components/admin/internship/StartProjectForStudent';
import FlotationIntakePanel from '../../../components/admin/internship/FlotationIntakePanel';
import InternshipConversionPanel from '../../../components/admin/internship/InternshipConversionPanel';
import InternshipProjectReadiness from '../components/InternshipProjectReadiness';
import { useReview } from './reviewContext';
import type { ProjectReadinessRow } from '../../../services/adminInternshipApi';
import type { IntakeStudent } from '../../../services/adminFlotationIntakeApi';

/**
 * The Projects mode: the "who is ready for a project" roster and the two ways to
 * start a project. Moved off the review screen so these tools can't fire while
 * you're reading an applicant, and so the queue isn't buried under them.
 *
 * `onOpenApplicant` hands selection back to the Applications view: clicking
 * "assign a project" opens that applicant so the project author is right there.
 */
export const InternshipProjectsMode: React.FC<{ onOpenApplicant: (id: string) => void }> = ({ onOpenApplicant }) => {
  // The roster hand-off. Held here rather than inside either child because the
  // roster raises it and the interview consumes it, and neither owns the other.
  const [startFor, setStartFor] = useState<IntakeStudent | null>(null);
  const intakeRef = useRef<HTMLDivElement>(null);

  const startProject = useCallback((row: ProjectReadinessRow) => {
    // The roster row already carries the enrollment, which is the identity the
    // interview builds for. `tier` and `cohort_id` are the intake's own lookups,
    // not ours to guess, so they are left for it to resolve.
    setStartFor({ id: row.enrollment_id, full_name: row.full_name, email: row.email ?? '', tier: '', cohort_id: null });
    // Scrolled, because the interview is below the fold on the roster and a
    // button that appears to do nothing is worse than no button.
    requestAnimationFrame(() => intakeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, []);

  return (
    <div className="d-flex flex-column gap-3">
      <SectionCard title="Ready for a project" icon="user-star-line" subtitle="Active interns, and who has cleared the first three weeks">
        <InternshipProjectReadiness onSelect={onOpenApplicant} onStartProject={startProject} />
      </SectionCard>
      <div ref={intakeRef}>
        <StartProjectForStudent startFor={startFor} onConsumed={() => setStartFor(null)} />
      </div>
      <FlotationIntakePanel />
    </div>
  );
};

/**
 * The Manage mode: convert existing interns. A dry-run plan then a confirmed
 * commit — deliberately off the review screen so it can't be triggered by accident.
 */
export const InternshipManageMode: React.FC = () => {
  const r = useReview();
  return (
    <InternshipConversionPanel onChanged={() => { void r.loadQueue(r.bucket); }} />
  );
};
