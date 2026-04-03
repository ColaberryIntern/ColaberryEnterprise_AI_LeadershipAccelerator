import React from 'react';

interface RequirementNode {
  id: string; key: string; text: string; status: string;
  is_active: boolean; github_file_paths: string[]; confidence_score: number;
}

interface FeatureNode {
  id: string; name: string; description: string; success_criteria: string;
  status: string; priority: string; completion_pct: number;
  total_active: number; completed_active: number; requirements: RequirementNode[];
}

interface CapabilityNode {
  id: string; name: string; description: string; status: string;
  priority: string; source: string; completion_pct: number;
  total_active: number; completed_active: number; features: FeatureNode[];
}

interface Props {
  capability: CapabilityNode;
  onToggle: (type: string, id: string, active: boolean) => void;
  onClose: () => void;
}

export default function CapabilityDetail({ capability, onToggle, onClose }: Props) {
  return (
    <div className="card border-0 shadow-sm mb-4">
      <div className="card-header bg-white d-flex justify-content-between align-items-center">
        <h6 className="fw-semibold mb-0" style={{ color: 'var(--color-primary)', fontSize: 14 }}>
          <i className="bi bi-diagram-3 me-2"></i>{capability.name}
        </h6>
        <button className="btn btn-link btn-sm text-muted p-0" onClick={onClose}>
          <i className="bi bi-x-lg"></i>
        </button>
      </div>
      <div className="card-body p-0">
        {capability.features.map(feature => (
          <div key={feature.id} className="border-bottom">
            {/* Feature header */}
            <div className="d-flex align-items-center justify-content-between px-3 py-2" style={{ background: 'var(--color-bg-alt, #f7fafc)' }}>
              <div className="flex-grow-1">
                <div className="d-flex align-items-center gap-2">
                  <span className="fw-medium small" style={{ color: 'var(--color-primary)' }}>{feature.name}</span>
                  <span className="badge" style={{
                    fontSize: 9,
                    background: feature.priority === 'high' ? '#ef444420' : feature.priority === 'low' ? '#9ca3af20' : '#f59e0b20',
                    color: feature.priority === 'high' ? '#ef4444' : feature.priority === 'low' ? '#9ca3af' : '#f59e0b',
                  }}>{feature.priority}</span>
                  <span className="text-muted" style={{ fontSize: 10 }}>{feature.completed_active}/{feature.total_active}</span>
                </div>
                {feature.success_criteria && (
                  <div className="text-muted" style={{ fontSize: 10 }}>
                    <i className="bi bi-check2-circle me-1"></i>{feature.success_criteria}
                  </div>
                )}
              </div>
              <div className="d-flex align-items-center gap-2">
                <div className="progress" style={{ width: 60, height: 4 }}>
                  <div className="progress-bar" style={{
                    width: `${feature.completion_pct}%`,
                    background: feature.completion_pct >= 75 ? 'var(--color-accent)' : 'var(--color-primary-light)',
                  }} />
                </div>
                <span className="small fw-medium" style={{ fontSize: 11 }}>{feature.completion_pct}%</span>
                <div className="form-check form-switch mb-0">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    checked={feature.status === 'active'}
                    onChange={e => onToggle('feature', feature.id, e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                </div>
              </div>
            </div>

            {/* Requirements */}
            {feature.requirements.map(req => (
              <div key={req.id} className="d-flex align-items-start gap-2 px-3 py-2 border-top" style={{ fontSize: 12, opacity: req.is_active ? 1 : 0.5 }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>
                  {req.status === 'completed' ? '✅' : req.status === 'in_progress' ? '🔄' : '⬜'}
                </span>
                <div className="flex-grow-1">
                  <span className="fw-medium" style={{ color: 'var(--color-primary)' }}>{req.key}</span>
                  <span className="text-muted ms-2">{req.text}</span>
                  {req.github_file_paths.length > 0 && (
                    <div className="mt-1">
                      {req.github_file_paths.map(f => (
                        <span key={f} className="badge bg-light text-dark me-1" style={{ fontSize: 9 }}>
                          <i className="bi bi-file-code me-1"></i>{f.split('/').pop()}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="form-check form-switch mb-0 flex-shrink-0">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    checked={req.is_active}
                    onChange={e => onToggle('requirement', req.id, e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                </div>
              </div>
            ))}
          </div>
        ))}

        {capability.features.length === 0 && (
          <div className="text-center py-3 text-muted small">No features in this capability</div>
        )}
      </div>
    </div>
  );
}
