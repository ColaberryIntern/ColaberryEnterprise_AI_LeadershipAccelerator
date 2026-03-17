import React from 'react';
import ProjectMaturityGauge from './ProjectMaturityGauge';
import ArtifactMaturityChart from './ArtifactMaturityChart';
import RequirementsStatusCard from './RequirementsStatusCard';
import ExecutiveReadinessCard from './ExecutiveReadinessCard';

interface Props {
  maturityScore: number | null | undefined;
  executiveUpdatedAt?: string;
  portfolioCache?: {
    portfolio_structure?: {
      strategy?: any[];
      governance?: any[];
      architecture?: any[];
      implementation?: any[];
    };
  };
}

function ProjectIntelligencePanel({ maturityScore, executiveUpdatedAt, portfolioCache }: Props) {
  const ps = portfolioCache?.portfolio_structure;
  const categories = {
    strategy: ps?.strategy?.length || 0,
    governance: ps?.governance?.length || 0,
    architecture: ps?.architecture?.length || 0,
    implementation: ps?.implementation?.length || 0,
  };

  return (
    <div className="mb-4">
      <h6 className="fw-semibold small mb-3" style={{ color: 'var(--color-primary)' }}>
        <i className="bi bi-bar-chart-line me-2"></i>Project Intelligence
      </h6>
      <div className="row g-3">
        <div className="col-md-3 col-6">
          <ProjectMaturityGauge maturityScore={maturityScore} categories={categories} />
        </div>
        <div className="col-md-3 col-6">
          <ArtifactMaturityChart categories={categories} />
        </div>
        <div className="col-md-3 col-6">
          <RequirementsStatusCard />
        </div>
        <div className="col-md-3 col-6">
          <ExecutiveReadinessCard maturityScore={maturityScore} executiveUpdatedAt={executiveUpdatedAt} />
        </div>
      </div>
    </div>
  );
}

export default ProjectIntelligencePanel;
