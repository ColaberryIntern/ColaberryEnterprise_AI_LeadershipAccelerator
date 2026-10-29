import React from 'react';
import { SectionCard } from '../../../components/admin/shell';

/**
 * Gov Contracts mode — scaffold (mgmt-portal M0).
 *
 * The filled version carries a section per active government project: a read-only management
 * view of where the pursuit stands, the proposal workspace, and an AI helper for drafting.
 * This placeholder ships first so the hub's tab, its `?view=gov` deep link and its access gate
 * (the `gov_contracts` management section) are real and testable before the data lands. It
 * renders only for a viewer who holds that section — owner and admin today; the per-project
 * grant for assigned interns and their managers arrives with the fuller build.
 */
const InternshipGovContractsMode: React.FC = () => (
  <div className="d-flex flex-column gap-3">
    <SectionCard title="Gov Contracts" icon="government-line" subtitle="One section per active government project">
      <p className="text-muted mb-0">
        A section for every active government project is being set up here: a read-only view of
        where the pursuit stands, the proposal workspace, and an AI helper for drafting.
        Management sees every project; each assigned intern and manager sees their own.
      </p>
    </SectionCard>
  </div>
);

export default InternshipGovContractsMode;
