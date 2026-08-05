import React from 'react';
import { SectionCard } from '../../../components/admin/shell';

/**
 * ExplanationSimulator — placeholder shell for T010; replaced by the real
 * panel in T014 (design doc §12 "Explanation simulator"). See
 * SkillCoverageHeatmap.tsx's header comment for why this exists as a
 * standalone placeholder rather than being built directly in T010.
 */
const ExplanationSimulator: React.FC = () => (
  <SectionCard
    title="Explanation Simulator"
    subtitle="Look up a real student or pick a persona to see their placement, gaps, exclusions, score breakdown, and rerank reasons — coming in T014."
    icon="search-eye-line"
  >
    <div className="text-muted">Panel under construction (T014).</div>
  </SectionCard>
);

export default ExplanationSimulator;
