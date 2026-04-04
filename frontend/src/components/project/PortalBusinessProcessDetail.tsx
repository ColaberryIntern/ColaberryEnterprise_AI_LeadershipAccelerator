import React, { useEffect, useState } from 'react';
import * as bpApi from '../../services/portalBusinessProcessApi';

interface Props { processId: string; onClose: () => void; onUpdate: () => void; }

const TYPE_ICONS: Record<string, string> = {
  service: 'bi-gear-fill',
  agent: 'bi-cpu-fill',
  route: 'bi-signpost-fill',
  model: 'bi-database-fill',
  scheduler: 'bi-clock-fill',
  analytics: 'bi-graph-up-arrow',
  script: 'bi-file-code-fill',
};

const TYPE_COLORS: Record<string, string> = {
  service: '#3b82f6',
  agent: '#8b5cf6',
  route: '#10b981',
  model: '#f59e0b',
  scheduler: '#6366f1',
  analytics: '#ec4899',
};

export default function PortalBusinessProcessDetail({ processId, onClose, onUpdate }: Props) {
  const [process, setProcess] = useState<any>(null);

  useEffect(() => {
    bpApi.getProcess(processId).then(r => setProcess(r.data)).catch(() => {});
  }, [processId]);

  if (!process) return null;

  const scores = process.strength_scores || {};
  const capabilities = process.capabilities || [];
  const groupedCaps: Record<string, any[]> = {};
  for (const cap of capabilities) {
    const type = cap.type || 'service';
    if (!groupedCaps[type]) groupedCaps[type] = [];
    groupedCaps[type].push(cap);
  }

  return (
    <div className="card border-0 shadow-sm">
      <div className="card-header bg-white d-flex justify-content-between align-items-center">
        <h6 className="fw-semibold mb-0" style={{ color: 'var(--color-primary)' }}>
          <i className="bi bi-diagram-3 me-2"></i>{process.name}
        </h6>
        <button className="btn btn-link btn-sm text-muted p-0" onClick={onClose}><i className="bi bi-x-lg"></i></button>
      </div>
      <div className="card-body p-3">
        <p className="text-muted small mb-3">{process.description}</p>

        <div className="row g-4">
          {/* Left: Scores */}
          <div className="col-md-5">
            <h6 className="fw-semibold small mb-2">Process Health Scores</h6>
            {Object.entries(scores).filter(([k]) => k !== 'overall').map(([dim, val]: [string, any]) => (
              <div key={dim} className="d-flex align-items-center gap-2 mb-1">
                <span className="text-muted text-capitalize" style={{ fontSize: 11, width: 110 }}>{dim.replace(/_/g, ' ')}</span>
                <div className="progress flex-grow-1" style={{ height: 6 }}>
                  <div className="progress-bar" style={{ width: `${val}%`, background: val >= 70 ? 'var(--color-accent)' : val >= 40 ? '#f59e0b' : 'var(--color-secondary)' }} />
                </div>
                <span className="fw-medium" style={{ fontSize: 11, width: 25, textAlign: 'right' }}>{val}</span>
              </div>
            ))}
            <div className="mt-2 text-muted" style={{ fontSize: 10 }}>
              Overall: <strong>{scores.overall || 0}/100</strong> · {capabilities.length} components discovered
            </div>

            {/* Summary stats */}
            <div className="mt-3 d-flex gap-3">
              {process.agent_count > 0 && (
                <div className="text-center">
                  <div className="fw-bold" style={{ fontSize: 18, color: '#8b5cf6' }}>{process.agent_count}</div>
                  <div className="text-muted" style={{ fontSize: 9 }}>Agents</div>
                </div>
              )}
              <div className="text-center">
                <div className="fw-bold" style={{ fontSize: 18, color: '#3b82f6' }}>{process.service_count || 0}</div>
                <div className="text-muted" style={{ fontSize: 9 }}>Services</div>
              </div>
              {process.route_count > 0 && (
                <div className="text-center">
                  <div className="fw-bold" style={{ fontSize: 18, color: '#10b981' }}>{process.route_count}</div>
                  <div className="text-muted" style={{ fontSize: 9 }}>Routes</div>
                </div>
              )}
              {process.model_count > 0 && (
                <div className="text-center">
                  <div className="fw-bold" style={{ fontSize: 18, color: '#f59e0b' }}>{process.model_count}</div>
                  <div className="text-muted" style={{ fontSize: 9 }}>Models</div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Built Components */}
          <div className="col-md-7">
            <h6 className="fw-semibold small mb-2">Built Components</h6>
            {Object.entries(groupedCaps).map(([type, caps]) => (
              <div key={type} className="mb-3">
                <div className="d-flex align-items-center gap-1 mb-1">
                  <i className={`bi ${TYPE_ICONS[type] || 'bi-file-code'}`} style={{ fontSize: 12, color: TYPE_COLORS[type] || '#6b7280' }}></i>
                  <span className="fw-medium text-capitalize" style={{ fontSize: 11 }}>{type === 'analytics' ? 'Analytics' : type + 's'} ({caps.length})</span>
                </div>
                <div className="d-flex flex-wrap gap-1">
                  {caps.map((cap: any, i: number) => (
                    <span key={i} className="badge bg-light text-dark" style={{ fontSize: 9, fontWeight: 500 }}
                      title={cap.file_path}>
                      {cap.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}

            {/* Agent names from DB */}
            {(process.agent_names || []).length > 0 && (
              <div className="mt-3">
                <h6 className="fw-semibold small mb-1">Registered Agents</h6>
                <div className="d-flex flex-wrap gap-1">
                  {process.agent_names.map((name: string) => (
                    <span key={name} className="badge" style={{ fontSize: 9, background: '#8b5cf620', color: '#8b5cf6' }}>
                      <i className="bi bi-cpu me-1"></i>{name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
