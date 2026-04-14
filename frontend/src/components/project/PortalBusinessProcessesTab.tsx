import React, { useEffect, useState } from 'react';
import * as bpApi from '../../services/portalBusinessProcessApi';
import PortalBusinessProcessDetail from './PortalBusinessProcessDetail';
import SteeringPanel from './SteeringPanel';

function completionColor(pct: number): string {
  if (pct >= 80) return 'var(--color-accent)';
  if (pct >= 40) return 'var(--color-warning)';
  return 'var(--color-secondary)';
}

export default function PortalBusinessProcessesTab() {
  const [processes, setProcesses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [reclassifying, setReclassifying] = useState(false);
  const [lifecycleFilter, setLifecycleFilter] = useState<'active' | 'deferred' | 'all'>('active');

  const load = (selectTop = false) => {
    setLoading(true);
    bpApi.getProcesses().then(r => {
      const procs = r.data || [];
      setProcesses(procs);
      // After resync: auto-select the #1 priority process
      if (selectTop && procs.length > 0) {
        const top = procs.find((p: any) => !p.is_complete) || procs[0];
        setSelected(top?.id || null);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => load(), []);

  if (loading) return <div className="text-center py-4"><div className="spinner-border spinner-border-sm"></div></div>;

  if (processes.length === 0) return (
    <div className="text-center py-5">
      <i className="bi bi-diagram-3 d-block mb-3" style={{ fontSize: 40, color: 'var(--color-text-light)' }}></i>
      <h6 className="fw-semibold" style={{ color: 'var(--color-primary)' }}>No Business Processes Yet</h6>
      <p className="text-muted small mb-0">Upload your requirements document and click "Extract Requirements" on the Requirements tab to generate business processes.</p>
    </div>
  );

  const filteredProcesses = lifecycleFilter === 'all' ? processes : processes.filter((p: any) => (p.applicability_status || p.lifecycle_status || 'active') === lifecycleFilter);
  const totalReqs = processes.reduce((s: number, p: any) => s + (p.total_requirements || 0), 0);
  const matchedReqs = processes.reduce((s: number, p: any) => s + (p.matched_requirements || 0), 0);
  const overallPct = totalReqs > 0 ? Math.round((matchedReqs / totalReqs) * 100) : 0;
  const uncatProcess = processes.find((p: any) => (p.name || '').toLowerCase().includes('uncategorized'));
  const uncatCount = uncatProcess?.total_requirements || 0;

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h6 className="fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>Business Processes</h6>
          <p className="text-muted small mb-0">
            {processes.filter((p: any) => p.usability?.usable).length}/{processes.length} processes completed · {matchedReqs}/{totalReqs} requirements
          </p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <div className="btn-group btn-group-sm">
            {(['active', 'deferred', 'all'] as const).map(f => (
              <button key={f} className={`btn btn-sm ${lifecycleFilter === f ? 'btn-primary' : 'btn-outline-secondary'}`} style={{ fontSize: 10 }}
                onClick={() => setLifecycleFilter(f)}>{f.charAt(0).toUpperCase() + f.slice(1)}</button>
            ))}
          </div>
          <span className="badge" style={{ background: `${completionColor(overallPct)}20`, color: completionColor(overallPct), fontSize: 12, fontWeight: 700, padding: '6px 12px' }}>
            {overallPct}%
          </span>
        </div>
      </div>

      {/* Overall progress bar */}
      <div className="progress mb-3" style={{ height: 8 }}>
        <div className="progress-bar" style={{ width: `${overallPct}%`, background: completionColor(overallPct) }} />
      </div>

      {/* Reclassification banner */}
      {uncatCount > 10 && (
        <div className="d-flex align-items-center justify-content-between p-2 mb-3" style={{ background: '#f59e0b10', border: '1px solid #f59e0b30', borderRadius: 8 }}>
          <div>
            <span className="fw-medium" style={{ fontSize: 12, color: '#92400e' }}>
              <i className="bi bi-exclamation-triangle me-1"></i>{uncatCount} requirements need classification
            </span>
            <div className="text-muted" style={{ fontSize: 10 }}>Redistribute uncategorized requirements to existing or new business processes</div>
          </div>
          <button className="btn btn-sm btn-warning" disabled={reclassifying} onClick={async () => {
            setReclassifying(true);
            try {
              const r = await bpApi.reclassifyRequirements();
              const d = r.data;
              const el = document.createElement('div');
              const dbg = d._debug ? ` [${d._debug.uncatCount} uncat, ${d._debug.otherProcessCount} targets, ${d._debug.llmCategories || 0} LLM cats${d._debug.llmError ? ', ERR: ' + d._debug.llmError.substring(0, 60) : ''}]` : '';
              const color = (d.matched + d.clustered) > 0 ? '#1a365d' : '#92400e';
              el.innerHTML = `<div style="position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999;background:${color};color:#fff;padding:12px 20px;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.2);font-size:12px;max-width:600px"><i class="bi bi-${(d.matched + d.clustered) > 0 ? 'check-circle' : 'exclamation-triangle'} me-2"></i>Reclassified: ${d.matched} matched to existing, ${d.clustered} clustered into ${d.new_processes?.length || 0} new processes, ${d.remaining} remaining${dbg}</div>`;
              document.body.appendChild(el); setTimeout(() => el.remove(), 5000);
              load();
            } catch (err: any) {
              const msg = err?.response?.data?.error || err?.message || 'Reclassification failed';
              const el = document.createElement('div');
              el.innerHTML = `<div style="position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999;background:#e53e3e;color:#fff;padding:12px 20px;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.2);font-size:12px"><i class="bi bi-x-circle me-2"></i>${msg}</div>`;
              document.body.appendChild(el); setTimeout(() => el.remove(), 5000);
            } finally { setReclassifying(false); }
          }}>
            {reclassifying ? <><span className="spinner-border spinner-border-sm me-1" style={{ width: 12, height: 12 }}></span>Classifying...</> : <><i className="bi bi-arrow-repeat me-1"></i>Reclassify Now</>}
          </button>
        </div>
      )}

      {/* Detail panel appears here — above the card grid */}
      {selected && (
        <div className="mb-4" id="bp-detail-panel">
          <PortalBusinessProcessDetail processId={selected} onClose={() => setSelected(null)} onUpdate={() => load(true)} />
        </div>
      )}

      <div className="row g-3">
        {filteredProcesses.map((p: any) => {
          const m = p.metrics || {};
          const mat = p.maturity || {};
          const gaps = p.gap_count || 0;
          const featureCount = (p.features || []).length;
          const isSelected = selected === p.id;
          const u = p.usability || {};
          const usable = u.usable;
          const readiness = m.system_readiness || 0;
          const matColors: Record<number, string> = { 0: '#9ca3af', 1: 'var(--color-danger)', 2: 'var(--color-warning)', 3: '#3b82f6', 4: 'var(--color-success)', 5: '#8b5cf6' };
          const matColor = matColors[mat.level] || '#9ca3af';
          const statusDot = (s: string) => ({ ready: 'var(--color-success)', partial: 'var(--color-warning)', missing: 'var(--color-danger)' }[s] || '#9ca3af');

          const isPageBP = p.is_page_bp || p.source === 'frontend_page';

          return (
            <div key={p.id} className="col-md-6 col-lg-4">
              <div className={`card border-0 shadow-sm h-100`}
                style={{
                  borderLeft: isPageBP ? '4px solid #8b5cf6' : `4px solid ${matColor}`,
                  background: isPageBP ? '#faf5ff' : undefined,
                  cursor: 'pointer',
                  outline: isSelected ? '2px solid var(--color-primary-light)' : 'none',
                }}
                onClick={() => { setSelected(isSelected ? null : p.id); if (!isSelected) setTimeout(() => document.getElementById('bp-detail-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100); }}>
                <div className="card-body p-3">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <div className="d-flex align-items-center gap-2">
                      {p.priority_rank && (
                        <span className="badge" style={{ background: isPageBP ? '#8b5cf6' : 'var(--color-primary)', color: '#fff', fontSize: 10, fontWeight: 700, minWidth: 22, textAlign: 'center' }} title={p.priority_reason || ''}>#{p.priority_rank}</span>
                      )}
                      {isPageBP && <i className="bi bi-layout-wtf" style={{ color: '#8b5cf6', fontSize: 12 }}></i>}
                      <h6 className="fw-semibold mb-0" style={{ fontSize: 13, color: isPageBP ? '#8b5cf6' : 'var(--color-primary)' }}>{p.name}</h6>
                    </div>
                    <div className="d-flex align-items-center gap-1">
                      {p.effective_mode && p.effective_mode !== 'production' && (
                        <span className="badge" style={{ background: 'var(--color-info, #3b82f6)20', color: 'var(--color-info, #3b82f6)', fontSize: 8, fontWeight: 700 }}>
                          {p.effective_mode}{p.mode_override ? ' ✦' : ''}
                        </span>
                      )}
                      <span className="badge" style={{ background: `${matColor}20`, color: matColor, fontSize: 8, fontWeight: 700 }}>L{mat.level}</span>
                      <span className="badge" style={{ background: usable ? 'var(--color-success, #10b981)20' : 'var(--color-danger, #ef4444)20', color: usable ? 'var(--color-success)' : 'var(--color-danger)', fontSize: 9 }}>
                        {usable ? 'Usable' : 'Not Ready'}
                      </span>
                    </div>
                  </div>

                  {/* Layer status dots */}
                  {/* Layer dots */}
                  <div className="d-flex gap-3 mb-2" style={{ fontSize: 9 }}>
                    {isPageBP ? (
                      <>
                        <span><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: statusDot(u.frontend), marginRight: 3 }}></span>Frontend</span>
                        <span className="text-muted">Page BP</span>
                      </>
                    ) : (
                      <>
                        <span><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: statusDot(u.backend), marginRight: 3 }}></span>Backend</span>
                        <span><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: statusDot(u.frontend), marginRight: 3 }}></span>Frontend</span>
                        <span><span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: statusDot(u.agent), marginRight: 3 }}></span>Agents</span>
                      </>
                    )}
                  </div>

                  {/* 3 metric mini bars — different for page BPs */}
                  {(isPageBP ? [
                    { label: 'UX Improvements', val: p.total_requirements > 0 ? Math.round((p.matched_requirements / p.total_requirements) * 100) : 0 },
                    { label: 'Page Health', val: m.system_readiness || 0 },
                    { label: 'Visual Quality', val: m.quality_score || 0 },
                  ] : [
                    { label: 'Matched', val: m.requirements_coverage || 0 },
                    { label: 'Readiness', val: m.system_readiness || 0 },
                    { label: 'Quality', val: m.quality_score || 0 },
                  ]).map(mb => (
                    <div key={mb.label} className="d-flex align-items-center gap-1 mb-1">
                      <span className="text-muted" style={{ fontSize: 8, width: 50 }}>{mb.label}</span>
                      <div className="progress flex-grow-1" style={{ height: 3 }}>
                        <div className="progress-bar" style={{ width: `${mb.val}%`, background: mb.val >= 70 ? 'var(--color-success)' : mb.val >= 30 ? 'var(--color-warning)' : 'var(--color-danger)' }} />
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
                    {gaps > 0 && <span style={{ color: 'var(--color-danger)' }}>{gaps} gaps</span>}
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
