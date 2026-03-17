import React from 'react';

interface ProjectHeaderProps {
  organizationName?: string;
  industry?: string;
  projectStage: string;
  selectedUseCase?: string;
  primaryBusinessProblem?: string;
}

const STAGE_CONFIG: Record<string, { label: string; badge: string; icon: string }> = {
  discovery: { label: 'Discovery', badge: 'bg-info', icon: 'bi-compass' },
  architecture: { label: 'Architecture', badge: 'bg-primary', icon: 'bi-diagram-3' },
  implementation: { label: 'Implementation', badge: 'bg-warning text-dark', icon: 'bi-gear' },
  portfolio: { label: 'Portfolio', badge: 'bg-success', icon: 'bi-collection' },
  complete: { label: 'Complete', badge: 'bg-dark', icon: 'bi-trophy' },
};

function ProjectHeader({ organizationName, industry, projectStage, selectedUseCase, primaryBusinessProblem }: ProjectHeaderProps) {
  const stage = STAGE_CONFIG[projectStage] || STAGE_CONFIG.discovery;

  return (
    <div className="card border-0 shadow-sm mb-4">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
          <div>
            <h1 className="h4 fw-bold mb-1" style={{ color: 'var(--color-primary)' }}>
              <i className="bi bi-rocket-takeoff me-2"></i>
              {organizationName ? `${organizationName} — AI Project` : 'Enterprise AI Project'}
            </h1>
            {industry && (
              <span className="text-muted small">
                <i className="bi bi-building me-1"></i>{industry}
              </span>
            )}
          </div>
          <span className={`badge ${stage.badge} fs-6`}>
            <i className={`${stage.icon} me-1`}></i>{stage.label}
          </span>
        </div>
        {(selectedUseCase || primaryBusinessProblem) && (
          <div className="mt-3 pt-3 border-top">
            {primaryBusinessProblem && (
              <p className="small mb-1">
                <span className="fw-medium" style={{ color: 'var(--color-primary)' }}>Business Problem:</span>{' '}
                <span className="text-muted">{primaryBusinessProblem}</span>
              </p>
            )}
            {selectedUseCase && (
              <p className="small mb-0">
                <span className="fw-medium" style={{ color: 'var(--color-primary)' }}>AI Use Case:</span>{' '}
                <span className="text-muted">{selectedUseCase}</span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ProjectHeader;
