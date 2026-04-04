import React, { useEffect, useState } from 'react';
import * as bpApi from '../../services/portalBusinessProcessApi';
import PortalBusinessProcessDetail from './PortalBusinessProcessDetail';

const AUTONOMY_COLORS: Record<string, string> = { manual: '#9ca3af', assisted: '#3b82f6', supervised: '#f59e0b', autonomous: '#10b981' };

export default function PortalBusinessProcessesTab() {
  const [processes, setProcesses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    bpApi.getProcesses().then(r => setProcesses(r.data)).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, []);

  if (loading) return <div className="text-center py-4"><div className="spinner-border spinner-border-sm"></div></div>;

  if (processes.length === 0) return (
    <div className="text-center py-5">
      <i className="bi bi-diagram-3 d-block mb-3" style={{ fontSize: 40, color: 'var(--color-text-light)' }}></i>
      <h6 className="fw-semibold" style={{ color: 'var(--color-primary)' }}>No Business Processes Yet</h6>
      <p className="text-muted small mb-0">Business processes will appear here once your requirements are extracted and grouped into capabilities.</p>
    </div>
  );

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h6 className="fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>Your Business Processes</h6>
          <p className="text-muted small mb-0">{processes.length} processes — manage AI controls, track health, and generate improvements</p>
        </div>
      </div>

      <div className="row g-3">
        {processes.map((p: any) => {
          const scores = p.strength_scores || {};
          const overall = scores.overall || Math.round(Object.values(scores).reduce((s: number, v: any) => s + (typeof v === 'number' ? v : 0), 0) / Math.max(Object.keys(scores).length, 1));
          const color = AUTONOMY_COLORS[p.autonomy_level] || '#9ca3af';
          const isSelected = selected === p.id;

          return (
            <div key={p.id} className="col-md-6 col-lg-4">
              <div className={`card border-0 shadow-sm h-100 ${isSelected ? 'ring-primary' : ''}`}
                style={{ borderLeft: `4px solid ${color}`, cursor: 'pointer', outline: isSelected ? '2px solid var(--color-primary-light)' : 'none' }}
                onClick={() => setSelected(isSelected ? null : p.id)}>
                <div className="card-body p-3">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <h6 className="fw-semibold mb-0" style={{ fontSize: 13, color: 'var(--color-primary)' }}>{p.name}</h6>
                    <span className="badge" style={{ background: `${color}20`, color, fontSize: 10, fontWeight: 600 }}>
                      {(p.autonomy_level || 'manual').toUpperCase()}
                    </span>
                  </div>
                  {p.description && <div className="text-muted mb-2" style={{ fontSize: 11 }}>{p.description.substring(0, 100)}{p.description.length > 100 ? '...' : ''}</div>}

                  {/* Strength bars */}
                  <div className="mb-2">
                    {['determinism', 'reliability', 'observability', 'automation', 'ai_maturity'].map(dim => (
                      <div key={dim} className="d-flex align-items-center gap-1 mb-1">
                        <span className="text-muted text-capitalize" style={{ fontSize: 9, width: 70 }}>{dim.replace('_', ' ')}</span>
                        <div className="progress flex-grow-1" style={{ height: 4 }}>
                          <div className="progress-bar" style={{ width: `${scores[dim] || 0}%`, background: (scores[dim] || 0) >= 70 ? 'var(--color-accent)' : (scores[dim] || 0) >= 40 ? '#f59e0b' : 'var(--color-secondary)' }} />
                        </div>
                        <span style={{ fontSize: 9, width: 20, textAlign: 'right' }}>{scores[dim] || 0}</span>
                      </div>
                    ))}
                  </div>

                  <div className="d-flex justify-content-between small text-muted" style={{ fontSize: 10 }}>
                    <span><i className="bi bi-cpu me-1"></i>{(p.linked_agents || []).length} agents</span>
                    <span>Overall: <strong>{overall}/100</strong></span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selected && (
        <div className="mt-4">
          <PortalBusinessProcessDetail processId={selected} onClose={() => setSelected(null)} onUpdate={load} />
        </div>
      )}
    </div>
  );
}
