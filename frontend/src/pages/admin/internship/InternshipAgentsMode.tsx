import React from 'react';
import { SectionCard } from '../../../components/admin/shell';

/**
 * Agents mode — scaffold (mgmt-portal M0).
 *
 * The filled version carries a section per agent in the factory: each agent's dashboard
 * (how it is configured and how to work with it) beside its GitHub activity, so management
 * can see what every agent can do and what is being built on it, and each builder sees their
 * own. This placeholder ships first so the hub's tab, its `?view=agents` deep link and its
 * access gate (the `agents` management section) are real and testable before the data lands.
 * It renders only for a viewer who holds that section — owner and admin today; the per-builder
 * grant arrives with the fuller build.
 */
const InternshipAgentsMode: React.FC = () => (
  <div className="d-flex flex-column gap-3">
    <SectionCard title="Agents" icon="robot-2-line" subtitle="One section per agent, with its dashboard and GitHub activity">
      <p className="text-muted mb-0">
        A section for every agent in the factory is being set up here. Each one will show the
        agent&apos;s dashboard, how it is configured and how to work with it, alongside the GitHub
        activity behind it, so you can see what each agent can do and what is being built on it.
        Management sees every agent; each builder sees their own.
      </p>
    </SectionCard>
  </div>
);

export default InternshipAgentsMode;
