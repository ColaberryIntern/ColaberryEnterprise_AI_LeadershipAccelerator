import React, { useEffect, useState } from 'react';
import * as bpApi from '../../../../services/businessProcessApi';
import BusinessProcessDetailPanel from '../BusinessProcessDetailPanel';

const AUTONOMY_COLORS: Record<string, string> = { manual: '#9ca3af', assisted: '#3b82f6', supervised: '#f59e0b', autonomous: '#10b981' };

export default function BusinessProcessesTab() {
  const [processes, setProcesses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const load = () => {
    setLoading(true);
    bpApi.getBusinessProcesses().then(r => setProcesses(r.data)).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleSeed = async () => {
    setSeeding(true);
    try { await bpApi.seedProcesses(); load(); } catch {} finally { setSeeding(false); }
  };

  if (loading) return <div className="text-center py-4"><div className="spinner-border spinner-border-sm"></div></div>;

  if (processes.length === 0) return (
    <div className="text-center py-5">
      <i className="bi bi-diagram-3 d-block mb-3" style={{ fontSize: 40, color: 'var(--color-text-light)' }}></i>
      <h6 className="fw-semibold" style={{ color: 'var(--color-primary)' }}>No Business Processes Configured</h6>
      <p className="text-muted small mb-3">Seed the platform with initial business processes to begin tracking autonomy, health, and evolution.</p>
      <button className="btn btn-primary btn-sm" onClick={handleSeed} disabled={seeding}>
        {seeding ? <><span className="spinner-border spinner-border-sm me-1"></span>Seeding...</> : <><i className="bi bi-plus-lg me-1"></i>Seed Business Processes</>}
      </button>
    </div>
  );

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h5 className="fw-bold mb-1" style={{ color: 'var(--color-primary)' }}>Business Processes</h5>
          <p className="text-muted small mb-0">{processes.length} processes · Track autonomy, health, and evolution</p>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-sm btn-outline-primary" onClick={async () => { try { await bpApi.runOptimization(); load(); } catch {} }}>
            <i className="bi bi-lightning me-1"></i>Optimize
          </button>
        </div>
      </div>

      <div className="row g-3">
        {processes.map((p: any) => {
          const scores = p.strength_scores || {};
          const overall = scores.overall || Math.round(Object.values(scores).reduce((s: number, v: any) => s + (typeof v === 'number' ? v : 0), 0) / 7);
          const color = AUTONOMY_COLORS[p.autonomy_level] || '#9ca3af';

          return (
            <div key={p.id} className="col-md-6 col-lg-4">
              <div className="card border-0 shadow-sm h-100" style={{ borderLeft: `4px solid ${color}`, cursor: 'pointer' }}
                onClick={() => setSelected(selected === p.id ? null : p.id)}>
                <div className="card-body p-3">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <div>
                      <h6 className="fw-semibold mb-0" style={{ fontSize: 13, color: 'var(--color-primary)' }}>{p.name}</h6>
                      <div className="text-muted" style={{ fontSize: 11 }}>{p.description?.substring(0, 80)}...</div>
                    </div>
                    <span className="badge" style={{ background: `${color}20`, color, fontSize: 10, fontWeight: 600 }}>
                      {p.autonomy_level?.toUpperCase()}
                    </span>
                  </div>

                  {/* Mini strength bars */}
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
          <BusinessProcessDetailPanel processId={selected} onClose={() => setSelected(null)} onUpdate={load} />
        </div>
      )}
    </div>
  );
}
