import React from 'react';
import { SectionCard } from '../../../components/admin/shell';

/**
 * SkillCoverageHeatmap — placeholder shell for T010; replaced by the real
 * heatmap panel in T011 (design doc §12 "Skill coverage heatmap"). Kept as a
 * real, compiling, minimally-rendering component so
 * AdminFeedControlGovernancePage.tsx (T010) is independently verifiable
 * before T011 lands.
 */
const SkillCoverageHeatmap: React.FC = () => (
  <SectionCard
    title="Skill Coverage Heatmap"
    subtitle="50 curriculum types x 10 Architecture Skills — coming in T011."
    icon="grid-line"
  >
    <div className="text-muted">Panel under construction (T011).</div>
  </SectionCard>
);

export default SkillCoverageHeatmap;
