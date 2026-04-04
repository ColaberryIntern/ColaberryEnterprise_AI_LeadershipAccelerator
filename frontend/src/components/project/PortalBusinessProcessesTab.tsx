import React, { useEffect, useState } from 'react';
import * as bpApi from '../../services/portalBusinessProcessApi';
import PortalBusinessProcessDetail from './PortalBusinessProcessDetail';

function completionColor(pct: number): string {
  if (pct >= 80) return 'var(--color-accent)';
  if (pct >= 40) return '#f59e0b';
  return 'var(--color-secondary)';
}

export default function PortalBusinessProcessesTab() {
  const [processes, setProcesses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    bpApi.getProcesses().then(r => setProcesses(r.data || [])).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, []);

  if (loading) return <div className="text-center py-4"><div className="spinner-border spinner-border-sm"></div></div>;

  if (processes.length === 0) return (
    <div className="text-center py-5">
      <i className="bi bi-diagram-3 d-block mb-3" style={{ fontSize: 40, color: 'var(--color-text-light)' }}></i>
      <h6 className="fw-semibold" style={{ color: 'var(--color-primary)' }}>No Business Processes Yet</h6>
      <p className="text-muted small mb-0">Upload your requirements document and click "Extract Requirements" on the Requirements tab to generate business processes.</p>
    </div>
  );

  const totalReqs = processes.reduce((s: number, p: any) => s + (p.total_requirements || 0), 0);
  const matchedReqs = processes.reduce((s: number, p: any) => s + (p.matched_requirements || 0), 0);
  const overallPct = totalReqs > 0 ? Math.round((matchedReqs / totalReqs) * 100) : 0;

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h6 className="fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>Business Processes</h6>
          <p className="text-muted small mb-0">
            {processes.length} processes · {matchedReqs}/{totalReqs} requirements implemented · <strong>{overallPct}% complete</strong>
          </p>
        </div>
        <span className="badge" style={{ background: `${completionColor(overallPct)}20`, color: completionColor(overallPct), fontSize: 12, fontWeight: 700, padding: '6px 12px' }}>
          {overallPct}%
        </span>
      </div>

      {/* Overall progress bar */}
      <div className="progress mb-4" style={{ height: 8 }}>
        <div className="progress-bar" style={{ width: `${overallPct}%`, background: completionColor(overallPct) }} />
      </div>

      <div className="row g-3">
        {processes.map((p: any) => {
          const pct = p.completion_pct || 0;
          const totalR = p.total_requirements || 0;
          const matchedR = p.matched_requirements || 0;
          const gaps = p.gap_count || 0;
          const featureCount = (p.features || []).length;
          const isSelected = selected === p.id;
          const u = p.usability || {};
          const usable = u.usable;
          const statusDot = (s: string) => ({ ready: '#10b981', partial: '#f59e0b', missing: '#ef4444' }[s] || '#9ca3af');

          return (
            <div key={p.id} className="col-md-6 col-lg-4">
              <div className="card border-0 shadow-sm h-100"
                style={{ borderLeft: `4px solid ${completionColor(pct)}`, cursor: 'pointer', outline: isSelected ? '2px solid var(--color-primary-light)' : 'none' }}
                onClick={() => setSelected(isSelected ? null : p.id)}>
                <div className="card-body p-3">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <h6 className="fw-semibold mb-0" style={{ fontSize: 13, color: 'var(--color-primary)' }}>{p.name}</h6>
                    <div className="d-flex align-items-center gap-1">
                      <span className="badge" style={{ background: usable ? '#10b98120' : '#ef444420', color: usable ? '#10b981' : '#ef4444', fontSize: 9 }}>
                        {usable ? 'Usable' : 'Not Ready'}
                      </span>
                      <span className="badge" style={{ background: `${completionColor(pct)}20`, color: completionColor(pct), fontSize: 11, fontWeight: 700 }}>
                        {Math.round(pct)}%
                      </span>
                    </div>
                  </div>

                  {/* Layer status dots */}
                  <div className="d-flex gap-3 mb-2" style={{ fontSize: 9 }}>
                    <span><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: statusDot(u.backend), marginRight: 3 }}></span>Backend</span>
                    <span><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: statusDot(u.frontend), marginRight: 3 }}></span>Frontend</span>
                    <span><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: statusDot(u.agent), marginRight: 3 }}></span>Agents</span>
                  </div>

                  {p.description && <div className="text-muted mb-2" style={{ fontSize: 11 }}>{p.description.substring(0, 100)}{p.description.length > 100 ? '...' : ''}</div>}

                  {/* Progress bar */}
                  <div className="progress mb-2" style={{ height: 5 }}>
                    <div className="progress-bar" style={{ width: `${pct}%`, background: completionColor(pct) }} />
                  </div>

                  {/* Stats */}
                  <div className="d-flex justify-content-between small text-muted" style={{ fontSize: 10 }}>
                    <div className="d-flex gap-2">
                      <span><i className="bi bi-check-circle me-1"></i>{matchedR}/{totalR} reqs</span>
                      <span><i className="bi bi-layers me-1"></i>{featureCount} features</span>
                    </div>
                    {gaps > 0 && (
                      <span style={{ color: 'var(--color-secondary)' }}>
                        <i className="bi bi-exclamation-triangle me-1"></i>{gaps} gaps
                      </span>
                    )}
                  </div>
                  {!usable && (u.why_not || []).length > 0 && (
                    <div className="text-muted mt-1" style={{ fontSize: 9 }}>
                      <i className="bi bi-info-circle me-1"></i>{u.why_not[0]}
                    </div>
                  )}
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
