import React from 'react';

interface RequirementNode { id: string; key: string; text: string; status: string; is_active: boolean; github_file_paths: string[]; confidence_score: number; }
interface FeatureNode { id: string; name: string; description: string; success_criteria: string; status: string; priority: string; completion_pct: number; total_active: number; completed_active: number; requirements: RequirementNode[]; }
interface CapabilityNode { id: string; name: string; description: string; status: string; priority: string; source: string; completion_pct: number; total_active: number; completed_active: number; features: FeatureNode[]; }

interface Props { capability: CapabilityNode; onToggle: (type: string, id: string, active: boolean) => void; onClose: () => void; }

export default function CapabilityDetail({ capability, onToggle, onClose }: Props) {
  return (
    <div className="card border-0 shadow-sm mb-4">
      <div className="card-header bg-white d-flex justify-content-between align-items-center">
        <h6 className="fw-semibold mb-0" style={{ color: 'var(--color-primary)', fontSize: 14 }}><i className="bi bi-diagram-3 me-2"></i>{capability.name}</h6>
        <button className="btn btn-link btn-sm text-muted p-0" onClick={onClose}><i className="bi bi-x-lg"></i></button>
      </div>
      <div className="card-body p-0">
        {capability.features.map(feat => (
          <div key={feat.id} className="border-bottom">
            <div className="d-flex align-items-center justify-content-between px-3 py-2" style={{ background: 'var(--color-bg-alt, #f7fafc)' }}>
              <div className="flex-grow-1">
                <div className="d-flex align-items-center gap-2">
                  <span className="fw-medium small" style={{ color: 'var(--color-primary)' }}>{feat.name}</span>
                  <span className="badge" style={{ fontSize: 9, background: feat.priority === 'high' ? '#ef444420' : '#f59e0b20', color: feat.priority === 'high' ? '#ef4444' : '#f59e0b' }}>{feat.priority}</span>
                  <span className="text-muted" style={{ fontSize: 10 }}>{feat.completed_active}/{feat.total_active}</span>
                </div>
                {feat.success_criteria && <div className="text-muted" style={{ fontSize: 10 }}><i className="bi bi-check2-circle me-1"></i>{feat.success_criteria}</div>}
              </div>
              <div className="d-flex align-items-center gap-2">
                <div className="progress" style={{ width: 60, height: 4 }}><div className="progress-bar" style={{ width: `${feat.completion_pct}%`, background: feat.completion_pct >= 75 ? 'var(--color-accent)' : 'var(--color-primary-light)' }} /></div>
                <span className="small fw-medium" style={{ fontSize: 11 }}>{feat.completion_pct}%</span>
                <div className="form-check form-switch mb-0"><input className="form-check-input" type="checkbox" checked={feat.status === 'active'} onChange={e => onToggle('feature', feat.id, e.target.checked)} style={{ cursor: 'pointer' }} /></div>
              </div>
            </div>
            {feat.requirements.map(req => (
              <div key={req.id} className="d-flex align-items-start gap-2 px-3 py-2 border-top" style={{ fontSize: 12, opacity: req.is_active ? 1 : 0.5 }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>{req.status === 'completed' ? '✅' : req.status === 'in_progress' ? '🔄' : '⬜'}</span>
                <div className="flex-grow-1">
                  <span className="fw-medium" style={{ color: 'var(--color-primary)' }}>{req.key}</span>
                  <span className="text-muted ms-2">{req.text}</span>
                  {req.github_file_paths.length > 0 && <div className="mt-1">{req.github_file_paths.map(f => <span key={f} className="badge bg-light text-dark me-1" style={{ fontSize: 9 }}><i className="bi bi-file-code me-1"></i>{f.split('/').pop()}</span>)}</div>}
                </div>
                <div className="form-check form-switch mb-0 flex-shrink-0"><input className="form-check-input" type="checkbox" checked={req.is_active} onChange={e => onToggle('requirement', req.id, e.target.checked)} style={{ cursor: 'pointer' }} /></div>
              </div>
            ))}
          </div>
        ))}
        {capability.features.length === 0 && <div className="text-center py-3 text-muted small">No features</div>}
      </div>
    </div>
  );
}
