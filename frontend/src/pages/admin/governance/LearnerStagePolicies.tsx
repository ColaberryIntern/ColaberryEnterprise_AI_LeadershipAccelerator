import React from 'react';
import { SectionCard } from '../../../components/admin/shell';

/**
 * LearnerStagePolicies — placeholder shell for T010; replaced by the real
 * panel in T012 (design doc §10/§12 "Learner-stage policies"). See
 * SkillCoverageHeatmap.tsx's header comment for why this exists as a
 * standalone placeholder rather than being built directly in T010.
 */
const LearnerStagePolicies: React.FC = () => (
  <SectionCard
    title="Learner-Stage Policies"
    subtitle="Foundation, Experienced Cold Start, Builder, Architect, Returning — coming in T012."
    icon="user-settings-line"
  >
    <div className="text-muted">Panel under construction (T012).</div>
  </SectionCard>
);

export default LearnerStagePolicies;
