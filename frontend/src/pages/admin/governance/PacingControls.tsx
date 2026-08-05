import React from 'react';
import { SectionCard } from '../../../components/admin/shell';

/**
 * PacingControls — placeholder shell for T010; replaced by the real panel in
 * T013 (design doc §12 "Pacing controls"). See SkillCoverageHeatmap.tsx's
 * header comment for why this exists as a standalone placeholder rather than
 * being built directly in T010.
 */
const PacingControls: React.FC = () => (
  <SectionCard
    title="Pacing Controls"
    subtitle="Daily plan size, passive-to-active ratio, stretch cap, review/AI Pulse share — coming in T013."
    icon="speed-line"
  >
    <div className="text-muted">Panel under construction (T013).</div>
  </SectionCard>
);

export default PacingControls;
