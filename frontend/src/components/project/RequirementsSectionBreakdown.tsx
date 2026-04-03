import React from 'react';

interface Section {
  name: string;
  total: number;
  completed: number;
  in_progress: number;
  pct: number;
}

interface Requirement {
  key: string;
  text: string;
  status: string;
  files: string[];
  section: string;
}

interface Props {
  sections: Section[];
  requirements: Requirement[];
  completionPct: number;
  nextAction: string | null;
}

export default function RequirementsSectionBreakdown({ sections, requirements, completionPct, nextAction }: Props) {
  return (
    <div>
      {/* Overall Progress */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body p-3">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h6 className="fw-semibold mb-0" style={{ color: 'var(--color-primary)', fontSize: 14 }}>
              <i className="bi bi-speedometer2 me-2"></i>Requirements Progress
            </h6>
            <span className="fw-bold" style={{ fontSize: 20, color: completionPct >= 75 ? 'var(--color-accent)' : completionPct >= 40 ? '#f59e0b' : 'var(--color-secondary)' }}>
              {completionPct}%
            </span>
          </div>
          <div className="progress mb-3" style={{ height: 8 }}>
            <div className="progress-bar" style={{
              width: `${completionPct}%`,
              background: completionPct >= 75 ? 'var(--color-accent)' : completionPct >= 40 ? '#f59e0b' : 'var(--color-secondary)',
              transition: 'width 0.5s ease',
            }} />
          </div>

          {/* Section breakdown bars */}
          {sections.map(section => (
            <div key={section.name} className="mb-2">
              <div className="d-flex justify-content-between small mb-1">
                <span className="text-muted">{section.name}</span>
                <span className="fw-medium">{section.completed}/{section.total}</span>
              </div>
              <div className="progress" style={{ height: 5 }}>
                <div className="progress-bar" style={{
                  width: `${section.pct}%`,
                  background: section.pct >= 100 ? 'var(--color-accent)' : 'var(--color-primary-light)',
                }} />
                {section.in_progress > 0 && (
                  <div className="progress-bar" style={{
                    width: `${(section.in_progress / section.total) * 100}%`,
                    background: '#f59e0b',
                    opacity: 0.6,
                  }} />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Next Action */}
      {nextAction && (
        <div className="card border-0 shadow-sm mb-4" style={{ borderLeft: '4px solid var(--color-primary-light)' }}>
          <div className="card-body p-3">
            <div className="d-flex align-items-center gap-2 mb-1">
              <i className="bi bi-arrow-right-circle-fill" style={{ color: 'var(--color-primary-light)', fontSize: 16 }}></i>
              <span className="fw-semibold small" style={{ color: 'var(--color-primary)' }}>Next Action</span>
            </div>
            <p className="mb-0 small text-muted">{nextAction}</p>
          </div>
        </div>
      )}

      {/* Requirements List */}
      <div className="card border-0 shadow-sm">
        <div className="card-body p-3">
          <h6 className="fw-semibold mb-3" style={{ color: 'var(--color-primary)', fontSize: 14 }}>
            <i className="bi bi-list-check me-2"></i>All Requirements ({requirements.length})
          </h6>
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {requirements.map(req => (
              <div key={req.key} className="d-flex align-items-start gap-2 py-2 border-bottom" style={{ fontSize: 12 }}>
                <span style={{ fontSize: 14 }}>
                  {req.status === 'completed' ? '✅' : req.status === 'in_progress' ? '🔄' : '⬜'}
                </span>
                <div className="flex-grow-1">
                  <span className="fw-medium" style={{ color: 'var(--color-primary)' }}>{req.key}</span>
                  <span className="text-muted ms-2">{req.text}</span>
                  {req.files.length > 0 && (
                    <div className="mt-1">
                      {req.files.map(f => (
                        <span key={f} className="badge bg-light text-dark me-1" style={{ fontSize: 10 }}>
                          <i className="bi bi-file-code me-1"></i>{f.split('/').pop()}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {requirements.length === 0 && (
              <p className="text-muted small mb-0">No requirements parsed yet. Upload a requirements document to begin tracking.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
