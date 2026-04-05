import React, { useEffect, useState } from 'react';
import * as bpApi from '../../services/portalBusinessProcessApi';

interface Props { processId: string; onClose: () => void; onUpdate: () => void; }

const PROMPT_TARGETS = [
  { key: 'backend_improvement', label: 'Fix Backend', icon: 'bi-gear' },
  { key: 'frontend_exposure', label: 'Add UI', icon: 'bi-layout-wtf' },
  { key: 'agent_enhancement', label: 'Enhance Agent', icon: 'bi-cpu' },
];

const MATURITY_COLORS: Record<number, string> = { 0: '#9ca3af', 1: '#ef4444', 2: '#f59e0b', 3: '#3b82f6', 4: '#10b981', 5: '#8b5cf6' };

function StatusDot({ status }: { status: string }) {
  const c: Record<string, string> = { ready: '#10b981', partial: '#f59e0b', missing: '#ef4444' };
  const l: Record<string, string> = { ready: 'Ready', partial: 'Partial', missing: 'Missing' };
  return <span className="d-flex align-items-center gap-1"><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: c[status] || '#9ca3af' }}></span><strong style={{ color: c[status] || '#9ca3af', fontSize: 12 }}>{l[status] || status}</strong></span>;
}

function MetricBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="mb-2">
      <div className="d-flex justify-content-between" style={{ fontSize: 11 }}><span className="text-muted">{label}</span><strong style={{ color }}>{value}%</strong></div>
      <div className="progress" style={{ height: 6 }}><div className="progress-bar" style={{ width: `${value}%`, background: color }} /></div>
    </div>
  );
}

function showToast(msg: string) {
  const el = document.createElement('div');
  el.innerHTML = `<div style="position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999;background:#1a365d;color:#fff;padding:12px 20px;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.2);font-size:13px"><i class="bi bi-clipboard-check me-2"></i>${msg}</div>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

export default function PortalBusinessProcessDetail({ processId, onClose, onUpdate }: Props) {
  const [p, setP] = useState<any>(null);
  const [expandedReqs, setExpandedReqs] = useState<Set<string>>(new Set());
  const [showAllGaps, setShowAllGaps] = useState(false);
  const [showAllLinks, setShowAllLinks] = useState(false);
  const [generatingPrompt, setGeneratingPrompt] = useState<string | null>(null);

  useEffect(() => { bpApi.getProcess(processId).then(r => setP(r.data)).catch(() => {}); }, [processId]);
  if (!p) return <div className="text-center py-3"><div className="spinner-border spinner-border-sm"></div></div>;

  const m = p.metrics || {};
  const q = p.quality || {};
  const mat = p.maturity || {};
  const u = p.usability || {};
  const links = p.implementation_links || {};
  const gaps = p.gaps || [];
  const recs = p.recommendations || [];
  const features = p.features || [];
  const repoUrl = p.repo_url ? p.repo_url.replace(/\.git$/, '') : null;

  const toggleReq = (id: string) => setExpandedReqs(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const handlePrompt = async (target: string) => { setGeneratingPrompt(target); try { const r = await bpApi.generatePrompt(processId, target); await navigator.clipboard.writeText(r.data.prompt_text); showToast(`Prompt copied: ${r.data.title}`); } catch {} finally { setGeneratingPrompt(null); } };

  const Section = ({ num, title, children, collapsible, defaultOpen = true }: { num: number; title: string; children: React.ReactNode; collapsible?: boolean; defaultOpen?: boolean }) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
      <div className="mb-3">
        <div className="d-flex align-items-center gap-2 mb-2" style={{ cursor: collapsible ? 'pointer' : 'default' }} onClick={() => collapsible && setOpen(!open)}>
          <span className="badge" style={{ background: 'var(--color-primary)', color: '#fff', fontSize: 10, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>{num}</span>
          <h6 className="fw-semibold mb-0" style={{ fontSize: 13, color: 'var(--color-primary)' }}>{title}</h6>
          {collapsible && <i className={`bi bi-chevron-${open ? 'up' : 'down'} ms-auto`} style={{ fontSize: 12, color: '#9ca3af' }}></i>}
        </div>
        {(!collapsible || open) && <div className="ps-4">{children}</div>}
      </div>
    );
  };

  const matColor = MATURITY_COLORS[mat.level] || '#9ca3af';

  return (
    <div className="card border-0 shadow">
      <div className="card-header bg-white py-3 d-flex justify-content-between align-items-start" style={{ borderBottom: `3px solid ${u.usable ? '#10b981' : '#ef4444'}` }}>
        <div>
          <h5 className="fw-bold mb-1" style={{ color: 'var(--color-primary)' }}>{p.name}</h5>
          <span className="text-muted" style={{ fontSize: 12 }}>{p.matched_requirements}/{p.total_requirements} requirements</span>
        </div>
        <div className="d-flex align-items-center gap-2">
          <span className="badge px-2 py-1" style={{ background: `${matColor}20`, color: matColor, fontSize: 10, fontWeight: 700 }}>L{mat.level} {mat.label}</span>
          <span className="badge px-3 py-2" style={{ background: u.usable ? '#10b981' : '#ef4444', color: '#fff', fontSize: 13, fontWeight: 700 }}>{u.usable ? 'USABLE' : 'NOT READY'}</span>
          <button className="btn btn-link text-muted p-0" onClick={onClose}><i className="bi bi-x-lg" style={{ fontSize: 18 }}></i></button>
        </div>
      </div>

      <div className="card-body p-3">
        {/* 1: Overview */}
        <Section num={1} title="Process Overview">
          <p className="text-muted small mb-0">{p.description || 'No description available.'}</p>
        </Section>

        {/* 2: System Truth — 3 metrics + usability */}
        <Section num={2} title="System Truth">
          <div className="row g-3 mb-3">
            <div className="col-md-4"><MetricBar label="Requirements Coverage" value={m.requirements_coverage || 0} color={m.requirements_coverage >= 70 ? '#10b981' : m.requirements_coverage >= 30 ? '#f59e0b' : '#ef4444'} /></div>
            <div className="col-md-4"><MetricBar label="System Readiness" value={m.system_readiness || 0} color={m.system_readiness >= 70 ? '#10b981' : m.system_readiness >= 30 ? '#f59e0b' : '#ef4444'} /></div>
            <div className="col-md-4"><MetricBar label="Quality Score" value={m.quality_score || 0} color={m.quality_score >= 70 ? '#10b981' : m.quality_score >= 30 ? '#f59e0b' : '#ef4444'} /></div>
          </div>
          <div className="d-flex gap-4 mb-2">
            <div><span className="text-muted" style={{ fontSize: 11 }}>Backend</span><br/><StatusDot status={u.backend || 'missing'} /></div>
            <div><span className="text-muted" style={{ fontSize: 11 }}>Frontend</span><br/><StatusDot status={u.frontend || 'missing'} /></div>
            <div><span className="text-muted" style={{ fontSize: 11 }}>Agents</span><br/><StatusDot status={u.agent || 'missing'} /></div>
          </div>
          {!u.usable && (u.why_not || []).length > 0 && (
            <div className="mt-1">{(u.why_not || []).map((w: string, i: number) => <div key={i} className="text-muted small"><i className="bi bi-arrow-right me-1" style={{ color: '#ef4444' }}></i>{w}</div>)}</div>
          )}
        </Section>

        {/* 3: What Exists */}
        <Section num={3} title="What Exists" collapsible defaultOpen={true}>
          {(links.backend?.length > 0 || links.frontend?.length > 0 || links.agents?.length > 0 || links.models?.length > 0) ? (
            <div className="row g-3">
              {[
                { key: 'backend', label: 'Services', icon: 'bi-gear', color: '#3b82f6' },
                { key: 'models', label: 'Database', icon: 'bi-database', color: '#f59e0b' },
                { key: 'frontend', label: 'Frontend', icon: 'bi-layout-wtf', color: '#10b981' },
                { key: 'agents', label: 'Agents', icon: 'bi-cpu', color: '#8b5cf6' },
              ].filter(l => (links[l.key] || []).length > 0).map(l => (
                <div key={l.key} className="col-md-3">
                  <div className="fw-medium small mb-1"><i className={`bi ${l.icon} me-1`} style={{ color: l.color }}></i>{l.label} ({links[l.key].length})</div>
                  {(showAllLinks ? links[l.key] : links[l.key].slice(0, 5)).map((f: string, i: number) => (
                    <div key={i} style={{ fontSize: 10 }}>{repoUrl ? <a href={`${repoUrl}/blob/main/${f}`} target="_blank" rel="noopener noreferrer" className="text-decoration-none">{f.split('/').pop()}</a> : f.split('/').pop()}</div>
                  ))}
                  {!showAllLinks && links[l.key].length > 5 && <button className="btn btn-link btn-sm p-0" style={{ fontSize: 9 }} onClick={() => setShowAllLinks(true)}>+{links[l.key].length - 5} more</button>}
                </div>
              ))}
            </div>
          ) : <div className="text-muted small"><i className="bi bi-info-circle me-1"></i>No implementations detected. Run "Match to Repo" on Requirements tab.</div>}
        </Section>

        {/* 4: Gaps */}
        <Section num={4} title={`Gaps (${gaps.length})`} collapsible defaultOpen={gaps.length > 0 && gaps.length <= 10}>
          {gaps.length === 0 ? <div className="text-muted small"><i className="bi bi-check-circle me-1" style={{ color: '#10b981' }}></i>No gaps detected.</div> : (
            <>
              {gaps.filter((g: any) => g.gap_type === 'system').map((g: any, i: number) => (
                <div key={`s${i}`} className="py-1" style={{ borderBottom: '1px solid var(--color-border)' }}><span className="badge me-2" style={{ background: '#ef444420', color: '#ef4444', fontSize: 8 }}>System</span><span style={{ fontSize: 11, color: '#ef4444' }}>{g.text}</span></div>
              ))}
              {gaps.filter((g: any) => g.gap_type === 'quality').map((g: any, i: number) => (
                <div key={`q${i}`} className="py-1" style={{ borderBottom: '1px solid var(--color-border)' }}><span className="badge me-2" style={{ background: '#9ca3af20', color: '#9ca3af', fontSize: 8 }}>Quality</span><span className="text-muted" style={{ fontSize: 11 }}>{g.text}</span></div>
              ))}
              {(showAllGaps ? gaps.filter((g: any) => g.gap_type === 'requirement') : gaps.filter((g: any) => g.gap_type === 'requirement').slice(0, 5)).map((g: any, i: number) => {
                const exp = expandedReqs.has(`g-${g.key}`);
                return (<div key={`r${i}`} className="py-1" style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }} onClick={() => toggleReq(`g-${g.key}`)}>
                  <span className="badge me-2" style={{ background: '#f59e0b20', color: '#f59e0b', fontSize: 8 }}>Req</span>
                  <strong style={{ fontSize: 10 }}>{g.key}</strong> <span className="text-muted" style={{ fontSize: 11 }}>{exp ? g.text : (g.text?.length > 80 ? g.text.substring(0, 80) + '...' : g.text)}</span>
                </div>);
              })}
              {!showAllGaps && gaps.filter((g: any) => g.gap_type === 'requirement').length > 5 && <button className="btn btn-link btn-sm p-0 mt-1" style={{ fontSize: 10 }} onClick={() => setShowAllGaps(true)}>Show all {gaps.filter((g: any) => g.gap_type === 'requirement').length} requirement gaps</button>}
            </>
          )}
        </Section>

        {/* 5: Completion */}
        <Section num={5} title="Completion">
          <div className="d-flex gap-4 mb-2">
            <div className="text-center"><div className="fw-bold" style={{ fontSize: 20, color: '#10b981' }}>{p.matched_requirements || 0}</div><div className="text-muted" style={{ fontSize: 9 }}>Implemented</div></div>
            <div className="text-center"><div className="fw-bold" style={{ fontSize: 20, color: '#f59e0b' }}>{p.partial_requirements || 0}</div><div className="text-muted" style={{ fontSize: 9 }}>Partial</div></div>
            <div className="text-center"><div className="fw-bold" style={{ fontSize: 20, color: '#ef4444' }}>{p.unmatched_requirements || 0}</div><div className="text-muted" style={{ fontSize: 9 }}>Missing</div></div>
            <div className="text-center"><div className="fw-bold" style={{ fontSize: 20, color: 'var(--color-primary)' }}>{features.length}</div><div className="text-muted" style={{ fontSize: 9 }}>Features</div></div>
          </div>
        </Section>

        {/* 6: Quality Scores */}
        <Section num={6} title="Quality Scores" collapsible defaultOpen={false}>
          {Object.entries(q).map(([dim, val]: [string, any]) => (
            <div key={dim} className="d-flex align-items-center gap-2 mb-1">
              <span className="text-muted text-capitalize" style={{ fontSize: 11, width: 130 }}>{dim.replace(/_/g, ' ')}</span>
              <div className="progress flex-grow-1" style={{ height: 6 }}><div className="progress-bar" style={{ width: `${val * 10}%`, background: val >= 7 ? '#10b981' : val >= 4 ? '#f59e0b' : '#ef4444' }} /></div>
              <span className="fw-medium" style={{ fontSize: 11, width: 25 }}>{val}/10</span>
            </div>
          ))}
        </Section>

        {/* 7: Maturity Path */}
        <Section num={7} title={`Maturity: L${mat.level} ${mat.label}`} collapsible defaultOpen={false}>
          <div className="d-flex gap-1 mb-2">
            {[1,2,3,4,5].map(l => <div key={l} style={{ width: 40, height: 6, borderRadius: 3, background: l <= mat.level ? matColor : '#e2e8f0' }}></div>)}
          </div>
          {(mat.next_level_requirements || []).length > 0 && (
            <div><div className="fw-medium small mb-1">To reach next level:</div>{mat.next_level_requirements.map((r: string, i: number) => <div key={i} className="text-muted small"><i className="bi bi-arrow-right me-1" style={{ color: 'var(--color-primary-light)' }}></i>{r}</div>)}</div>
          )}
        </Section>

        {/* 8: Recommendations */}
        <Section num={8} title="Recommendations" collapsible defaultOpen={recs.length > 0 && recs.length <= 5}>
          {recs.length === 0 ? <div className="text-muted small">No recommendations — process is fully implemented.</div> : (
            recs.map((r: any) => (
              <div key={r.step} className="d-flex gap-2 mb-2 py-1" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <span className="badge" style={{ background: 'var(--color-primary)', color: '#fff', fontSize: 10, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', flexShrink: 0 }}>{r.step}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{r.action}</div>
                  <div className="d-flex gap-2" style={{ fontSize: 9 }}>
                    <span style={{ color: '#10b981' }}>{r.impact}</span>
                    {r.dependency && <span className="text-muted">Depends on: {r.dependency}</span>}
                  </div>
                </div>
              </div>
            ))
          )}
        </Section>

        {/* 9: Feature Breakdown */}
        <Section num={9} title="Feature Breakdown" collapsible defaultOpen={false}>
          {features.map((f: any) => {
            const reqs = f.requirements || [];
            const fM = reqs.filter((r: any) => r.status === 'matched' || r.status === 'verified').length;
            const fP = reqs.length > 0 ? Math.round((fM / reqs.length) * 100) : 0;
            return (<div key={f.id} className="mb-1 py-1 d-flex justify-content-between align-items-center" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <span style={{ fontSize: 12 }}>{f.name}</span>
              <div className="d-flex align-items-center gap-2"><span className="text-muted" style={{ fontSize: 10 }}>{fM}/{reqs.length}</span><div className="progress" style={{ width: 60, height: 4 }}><div className="progress-bar" style={{ width: `${fP}%`, background: fP >= 70 ? '#10b981' : fP >= 30 ? '#f59e0b' : '#ef4444' }} /></div><span className="fw-medium" style={{ fontSize: 10, width: 28 }}>{fP}%</span></div>
            </div>);
          })}
        </Section>

        {/* 10: Action Buttons */}
        <div className="d-flex flex-wrap gap-2 pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
          {PROMPT_TARGETS.map(t => (
            <button key={t.key} className="btn btn-sm btn-outline-primary" onClick={() => handlePrompt(t.key)} disabled={generatingPrompt === t.key} style={{ fontSize: 12 }}>
              {generatingPrompt === t.key ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className={`bi ${t.icon} me-1`}></i>}{t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
