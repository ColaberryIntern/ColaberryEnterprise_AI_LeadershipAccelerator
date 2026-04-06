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

      {/* Detail panel appears here — above the card grid */}
      {selected && (
        <div className="mb-4">
          <PortalBusinessProcessDetail processId={selected} onClose={() => setSelected(null)} onUpdate={load} />
        </div>
      )}

      <div className="row g-3">
        {processes.map((p: any) => {
          const m = p.metrics || {};
          const mat = p.maturity || {};
          const gaps = p.gap_count || 0;
          const featureCount = (p.features || []).length;
          const isSelected = selected === p.id;
          const u = p.usability || {};
          const usable = u.usable;
          const readiness = m.system_readiness || 0;
          const matColors: Record<number, string> = { 0: '#9ca3af', 1: '#ef4444', 2: '#f59e0b', 3: '#3b82f6', 4: '#10b981', 5: '#8b5cf6' };
          const matColor = matColors[mat.level] || '#9ca3af';
          const statusDot = (s: string) => ({ ready: '#10b981', partial: '#f59e0b', missing: '#ef4444' }[s] || '#9ca3af');

          return (
            <div key={p.id} className="col-md-6 col-lg-4">
              <div className="card border-0 shadow-sm h-100"
                style={{ borderLeft: `4px solid ${matColor}`, cursor: 'pointer', outline: isSelected ? '2px solid var(--color-primary-light)' : 'none' }}
                onClick={() => setSelected(isSelected ? null : p.id)}>
                <div className="card-body p-3">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <h6 className="fw-semibold mb-0" style={{ fontSize: 13, color: 'var(--color-primary)' }}>{p.name}</h6>
                    <div className="d-flex align-items-center gap-1">
                      <span className="badge" style={{ background: `${matColor}20`, color: matColor, fontSize: 8, fontWeight: 700 }}>L{mat.level}</span>
                      <span className="badge" style={{ background: usable ? '#10b98120' : '#ef444420', color: usable ? '#10b981' : '#ef4444', fontSize: 9 }}>
                        {usable ? 'Usable' : 'Not Ready'}
                      </span>
                    </div>
                  </div>

                  {/* Layer status dots */}
                  {/* Layer dots */}
                  <div className="d-flex gap-3 mb-2" style={{ fontSize: 9 }}>
                    <span><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: statusDot(u.backend), marginRight: 3 }}></span>Backend</span>
                    <span><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: statusDot(u.frontend), marginRight: 3 }}></span>Frontend</span>
                    <span><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: statusDot(u.agent), marginRight: 3 }}></span>Agents</span>
                  </div>

                  {/* 3 metric mini bars */}
                  {[
                    { label: 'Matched', val: m.requirements_coverage || 0 },
                    { label: 'Readiness', val: m.system_readiness || 0 },
                    { label: 'Quality', val: m.quality_score || 0 },
                  ].map(mb => (
                    <div key={mb.label} className="d-flex align-items-center gap-1 mb-1">
                      <span className="text-muted" style={{ fontSize: 8, width: 50 }}>{mb.label}</span>
                      <div className="progress flex-grow-1" style={{ height: 3 }}>
                        <div className="progress-bar" style={{ width: `${mb.val}%`, background: mb.val >= 70 ? '#10b981' : mb.val >= 30 ? '#f59e0b' : '#ef4444' }} />
                      </div>
                      <span style={{ fontSize: 8, width: 22, textAlign: 'right' }}>{mb.val}%</span>
                    </div>
                  ))}

                  {/* Maturity threshold bar */}
                  <div className="position-relative mt-1 mb-1" style={{ height: 12 }}>
                    <div className="progress" style={{ height: 4, marginTop: 2 }}>
                      <div className="progress-bar" style={{ width: `${readiness}%`, background: matColor }} />
                    </div>
                    {/* Level markers */}
                    {[{ pct: 10, l: '1' }, { pct: 50, l: '2' }, { pct: 70, l: '3' }, { pct: 85, l: '4' }].map(mk => (
                      <span key={mk.l} style={{ position: 'absolute', left: `${mk.pct}%`, top: 0, transform: 'translateX(-50%)', fontSize: 7, color: readiness >= mk.pct ? matColor : '#cbd5e1' }}>L{mk.l}</span>
                    ))}
                  </div>

                  <div className="d-flex justify-content-between small text-muted" style={{ fontSize: 9 }}>
                    <span>{mat.label} → L{Math.min(5, (mat.level || 0) + 1)} at {[10, 50, 70, 85, 95][mat.level || 0] || 95}%</span>
                    {gaps > 0 && <span style={{ color: '#ef4444' }}>{gaps} gaps</span>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
