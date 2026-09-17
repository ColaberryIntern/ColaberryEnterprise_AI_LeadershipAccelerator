import React from 'react';
import { SectionCard } from '../../../components/admin/shell';
import StartProjectForStudent from '../../../components/admin/internship/StartProjectForStudent';
import FlotationIntakePanel from '../../../components/admin/internship/FlotationIntakePanel';
import InternshipConversionPanel from '../../../components/admin/internship/InternshipConversionPanel';
import InternshipProjectReadiness from '../components/InternshipProjectReadiness';
import { useReview } from './reviewContext';

/**
 * The Projects mode: the "who is ready for a project" roster and the two ways to
 * start a project. Moved off the review screen so these tools can't fire while
 * you're reading an applicant, and so the queue isn't buried under them.
 *
 * `onOpenApplicant` hands selection back to the Applications view: clicking
 * "assign a project" opens that applicant so the project author is right there.
 */
export const InternshipProjectsMode: React.FC<{ onOpenApplicant: (id: string) => void }> = ({ onOpenApplicant }) => (
  <div className="d-flex flex-column gap-3">
    <SectionCard title="Ready for a project" icon="user-star-line" subtitle="Active interns, and who has cleared the first three weeks">
      <InternshipProjectReadiness onSelect={onOpenApplicant} />
    </SectionCard>
    <StartProjectForStudent />
    <FlotationIntakePanel />
  </div>
);

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
