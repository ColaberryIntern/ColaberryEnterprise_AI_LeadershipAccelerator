import React from 'react';

interface ProjectProgressProps {
  currentStage: string;
}

const STAGES = [
  { key: 'discovery', label: 'Discovery', icon: 'bi-compass' },
  { key: 'architecture', label: 'Architecture', icon: 'bi-diagram-3' },
  { key: 'implementation', label: 'Implementation', icon: 'bi-gear' },
  { key: 'portfolio', label: 'Portfolio', icon: 'bi-collection' },
  { key: 'complete', label: 'Complete', icon: 'bi-trophy' },
];

function ProjectProgress({ currentStage }: ProjectProgressProps) {
  const currentIndex = STAGES.findIndex(s => s.key === currentStage);
  const pct = currentIndex >= 0 ? ((currentIndex + 1) / STAGES.length) * 100 : 0;

  return (
    <div className="card border-0 shadow-sm mb-4">
      <div className="card-header bg-white fw-semibold">
        <i className="bi bi-signpost-split me-2"></i>Project Progress
      </div>
      <div className="card-body">
        <div className="progress mb-3" style={{ height: 8 }}>
          <div
            className="progress-bar"
            role="progressbar"
            style={{ width: `${pct}%`, background: 'var(--color-primary)' }}
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          ></div>
        </div>
        <div className="d-flex justify-content-between flex-wrap gap-1">
          {STAGES.map((stage, idx) => {
            const isComplete = idx < currentIndex;
            const isCurrent = idx === currentIndex;
            const color = isComplete
              ? 'var(--color-accent)'
              : isCurrent
                ? 'var(--color-primary)'
                : 'var(--color-text-light)';
            return (
              <div key={stage.key} className="text-center" style={{ minWidth: 70 }}>
                <div
                  className="rounded-circle d-inline-flex align-items-center justify-content-center mb-1"
                  style={{
                    width: 32,
                    height: 32,
                    border: `2px solid ${color}`,
                    background: isComplete || isCurrent ? color : 'transparent',
                    color: isComplete || isCurrent ? '#fff' : color,
                  }}
                >
                  <i className={isComplete ? 'bi bi-check-lg' : stage.icon} style={{ fontSize: 14 }}></i>
                </div>
                <div className="small" style={{ color, fontWeight: isCurrent ? 600 : 400 }}>
                  {stage.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default ProjectProgress;
