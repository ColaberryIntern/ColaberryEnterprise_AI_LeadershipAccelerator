import React, { useEffect, useState } from 'react';
import * as bpApi from '../../services/portalBusinessProcessApi';

interface Props { processId: string; onClose: () => void; onUpdate: () => void; }

const STATUS_BADGES: Record<string, { bg: string; color: string; label: string }> = {
  matched: { bg: '#10b98120', color: '#10b981', label: 'Implemented' },
  verified: { bg: '#10b98120', color: '#10b981', label: 'Verified' },
  partial: { bg: '#f59e0b20', color: '#f59e0b', label: 'Partial' },
  unmatched: { bg: '#ef444420', color: '#ef4444', label: 'Not Built' },
  not_started: { bg: '#9ca3af20', color: '#9ca3af', label: 'Not Started' },
};

export default function PortalBusinessProcessDetail({ processId, onClose, onUpdate }: Props) {
  const [process, setProcess] = useState<any>(null);

  useEffect(() => {
    bpApi.getProcess(processId).then(r => setProcess(r.data)).catch(() => {});
  }, [processId]);

  if (!process) return null;

  const features = process.features || [];
  const totalR = process.total_requirements || 0;
  const matchedR = process.matched_requirements || 0;
  const gaps = process.gap_count || 0;
  const pct = process.completion_pct || 0;

  return (
    <div className="card border-0 shadow-sm">
      <div className="card-header bg-white d-flex justify-content-between align-items-center">
        <div>
          <h6 className="fw-semibold mb-0" style={{ color: 'var(--color-primary)' }}>
            <i className="bi bi-diagram-3 me-2"></i>{process.name}
          </h6>
          <span className="text-muted" style={{ fontSize: 11 }}>{matchedR}/{totalR} requirements implemented · {Math.round(pct)}% complete</span>
        </div>
        <button className="btn btn-link btn-sm text-muted p-0" onClick={onClose}><i className="bi bi-x-lg"></i></button>
      </div>
      <div className="card-body p-3">
        {process.description && <p className="text-muted small mb-3">{process.description}</p>}

        {/* Summary stats */}
        <div className="d-flex gap-4 mb-4">
          <div className="text-center">
            <div className="fw-bold" style={{ fontSize: 22, color: 'var(--color-accent)' }}>{matchedR}</div>
            <div className="text-muted" style={{ fontSize: 10 }}>Implemented</div>
          </div>
          <div className="text-center">
            <div className="fw-bold" style={{ fontSize: 22, color: '#f59e0b' }}>{(process.partial_requirements || 0)}</div>
            <div className="text-muted" style={{ fontSize: 10 }}>Partial</div>
          </div>
          <div className="text-center">
            <div className="fw-bold" style={{ fontSize: 22, color: 'var(--color-secondary)' }}>{gaps}</div>
            <div className="text-muted" style={{ fontSize: 10 }}>Gaps</div>
          </div>
          <div className="text-center">
            <div className="fw-bold" style={{ fontSize: 22, color: 'var(--color-primary)' }}>{features.length}</div>
            <div className="text-muted" style={{ fontSize: 10 }}>Features</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="progress mb-4" style={{ height: 6 }}>
          <div className="progress-bar bg-success" style={{ width: `${pct}%` }} />
        </div>

        {/* Feature-level traceability */}
        <h6 className="fw-semibold small mb-2">Requirements Traceability</h6>
        {features.map((feature: any) => {
          const reqs = feature.requirements || [];
          const fPct = feature.completion_pct || 0;
          return (
            <div key={feature.id} className="mb-3">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <span className="fw-medium" style={{ fontSize: 12, color: 'var(--color-primary)' }}>
                  <i className="bi bi-layers me-1"></i>{feature.name}
                </span>
                <span className="text-muted" style={{ fontSize: 10 }}>{Math.round(fPct)}% · {reqs.filter((r: any) => r.status === 'matched' || r.status === 'verified').length}/{reqs.length}</span>
              </div>
              {feature.description && <div className="text-muted mb-1" style={{ fontSize: 10 }}>{feature.description}</div>}

              {/* Requirements list */}
              <div className="ps-3">
                {reqs.map((req: any) => {
                  const badge = STATUS_BADGES[req.status] || STATUS_BADGES.not_started;
                  const files = req.github_file_paths || [];
                  return (
                    <div key={req.id} className="d-flex align-items-start gap-2 mb-1 py-1" style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <span className="badge" style={{ background: badge.bg, color: badge.color, fontSize: 8, flexShrink: 0, marginTop: 2 }}>
                        {badge.label}
                      </span>
                      <div className="flex-grow-1" style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11 }}>
                          <strong className="me-1">{req.key}</strong>
                          <span className="text-muted">{req.text?.substring(0, 120)}{req.text?.length > 120 ? '...' : ''}</span>
                        </div>
                        {files.length > 0 && (
                          <div className="d-flex flex-wrap gap-1 mt-1">
                            {files.slice(0, 3).map((f: string, i: number) => (
                              <span key={i} className="badge bg-light text-dark" style={{ fontSize: 8 }}>
                                <i className="bi bi-file-code me-1"></i>{f.split('/').pop()}
                              </span>
                            ))}
                            {files.length > 3 && <span className="text-muted" style={{ fontSize: 8 }}>+{files.length - 3} more</span>}
                          </div>
                        )}
                      </div>
                      {req.confidence_score != null && (
                        <span className="text-muted" style={{ fontSize: 9, flexShrink: 0 }}>{Math.round(req.confidence_score * 100)}%</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {features.length === 0 && (
          <div className="text-center text-muted py-3" style={{ fontSize: 12 }}>
            <i className="bi bi-info-circle me-1"></i>No features extracted yet. Click "Extract Requirements" on the Requirements tab first.
          </div>
        )}
      </div>
    </div>
  );
}
