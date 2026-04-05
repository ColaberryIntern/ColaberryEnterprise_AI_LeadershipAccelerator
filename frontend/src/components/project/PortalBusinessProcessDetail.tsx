import React, { useEffect, useState } from 'react';
import * as bpApi from '../../services/portalBusinessProcessApi';

interface Props { processId: string; onClose: () => void; onUpdate: () => void; }

const PROMPT_TARGETS = [
  { key: 'backend_improvement', label: 'Fix Backend', icon: 'bi-gear' },
  { key: 'frontend_exposure', label: 'Add UI', icon: 'bi-layout-wtf' },
  { key: 'agent_enhancement', label: 'Enhance Agent', icon: 'bi-cpu' },
];

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = { ready: '#10b981', partial: '#f59e0b', missing: '#ef4444' };
  const labels: Record<string, string> = { ready: 'Ready', partial: 'Partial', missing: 'Missing' };
  return (
    <span className="d-flex align-items-center gap-1">
      <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: colors[status] || '#9ca3af' }}></span>
      <strong style={{ color: colors[status] || '#9ca3af', fontSize: 12 }}>{labels[status] || status}</strong>
    </span>
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

  const load = () => { bpApi.getProcess(processId).then(r => setP(r.data)).catch(() => {}); };
  useEffect(load, [processId]);

  if (!p) return <div className="text-center py-3"><div className="spinner-border spinner-border-sm"></div></div>;

  const features = p.features || [];
  const totalR = p.total_requirements || 0;
  const matchedR = p.matched_requirements || 0;
  const partialR = p.partial_requirements || 0;
  const unmatchedR = p.unmatched_requirements || 0;
  const gaps = p.gaps || [];
  const pct = totalR > 0 ? Math.round((matchedR / totalR) * 100) : 0;
  const u = p.usability || {};
  const links = p.implementation_links || {};
  const repoUrl = p.repo_url ? p.repo_url.replace(/\.git$/, '') : null;

  const toggleReq = (id: string) => {
    setExpandedReqs(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const handlePrompt = async (target: string) => {
    setGeneratingPrompt(target);
    try { const r = await bpApi.generatePrompt(processId, target); await navigator.clipboard.writeText(r.data.prompt_text); showToast(`Prompt copied: ${r.data.title}`); } catch {} finally { setGeneratingPrompt(null); }
  };

  // Section divider
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

  return (
    <div className="card border-0 shadow">
      {/* Header */}
      <div className="card-header bg-white py-3 d-flex justify-content-between align-items-start" style={{ borderBottom: `3px solid ${u.usable ? '#10b981' : '#ef4444'}` }}>
        <div>
          <h5 className="fw-bold mb-1" style={{ color: 'var(--color-primary)' }}>{p.name}</h5>
          <span className="text-muted" style={{ fontSize: 12 }}>{matchedR}/{totalR} requirements · {pct}% complete</span>
        </div>
        <div className="d-flex align-items-center gap-2">
          {/* Big usability badge */}
          <span className="badge px-3 py-2" style={{ background: u.usable ? '#10b981' : '#ef4444', color: '#fff', fontSize: 13, fontWeight: 700 }}>
            {u.usable ? 'USABLE' : 'NOT READY'}
          </span>
          <button className="btn btn-link text-muted p-0" onClick={onClose}><i className="bi bi-x-lg" style={{ fontSize: 18 }}></i></button>
        </div>
      </div>

      <div className="card-body p-3">

        {/* ── SECTION 1: Overview ── */}
        <Section num={1} title="Process Overview">
          <p className="text-muted small mb-0">{p.description || 'No description available.'}</p>
        </Section>

        {/* ── SECTION 2: Usability Status ── */}
        <Section num={2} title="Usability Status">
          <div className="d-flex gap-4 mb-2">
            <div><span className="text-muted" style={{ fontSize: 11 }}>Backend</span><br/><StatusDot status={u.backend || 'missing'} /></div>
            <div><span className="text-muted" style={{ fontSize: 11 }}>Frontend</span><br/><StatusDot status={u.frontend || 'missing'} /></div>
            <div><span className="text-muted" style={{ fontSize: 11 }}>Agents</span><br/><StatusDot status={u.agent || 'missing'} /></div>
          </div>
          {!u.usable && (u.why_not || []).length > 0 && (
            <div className="mt-1">
              {(u.why_not || []).map((w: string, i: number) => (
                <div key={i} className="text-muted small"><i className="bi bi-arrow-right me-1" style={{ color: '#ef4444' }}></i>{w}</div>
              ))}
            </div>
          )}
        </Section>

        {/* ── SECTION 3: What Exists ── */}
        <Section num={3} title="What Exists" collapsible defaultOpen={true}>
          {(links.backend?.length > 0 || links.frontend?.length > 0 || links.agents?.length > 0 || links.models?.length > 0) ? (
            <div className="row g-3">
              {links.backend?.length > 0 && (
                <div className="col-md-3">
                  <div className="fw-medium small mb-1"><i className="bi bi-gear me-1" style={{ color: '#3b82f6' }}></i>Services ({links.backend.length})</div>
                  {(showAllLinks ? links.backend : links.backend.slice(0, 5)).map((f: string, i: number) => (
                    <div key={i} style={{ fontSize: 10 }}>
                      {repoUrl ? <a href={`${repoUrl}/blob/main/${f}`} target="_blank" rel="noopener noreferrer" className="text-decoration-none">{f.split('/').pop()}</a> : <span>{f.split('/').pop()}</span>}
                    </div>
                  ))}
                  {!showAllLinks && links.backend.length > 5 && <button className="btn btn-link btn-sm p-0" style={{ fontSize: 9 }} onClick={() => setShowAllLinks(true)}>+{links.backend.length - 5} more</button>}
                </div>
              )}
              {links.models?.length > 0 && (
                <div className="col-md-3">
                  <div className="fw-medium small mb-1"><i className="bi bi-database me-1" style={{ color: '#f59e0b' }}></i>Database ({links.models.length})</div>
                  {links.models.slice(0, 5).map((f: string, i: number) => (
                    <div key={i} style={{ fontSize: 10 }}>{repoUrl ? <a href={`${repoUrl}/blob/main/${f}`} target="_blank" rel="noopener noreferrer" className="text-decoration-none">{f.split('/').pop()}</a> : <span>{f.split('/').pop()}</span>}</div>
                  ))}
                </div>
              )}
              {links.frontend?.length > 0 && (
                <div className="col-md-3">
                  <div className="fw-medium small mb-1"><i className="bi bi-layout-wtf me-1" style={{ color: '#10b981' }}></i>Frontend ({links.frontend.length})</div>
                  {links.frontend.slice(0, 5).map((f: string, i: number) => (
                    <div key={i} style={{ fontSize: 10 }}>{repoUrl ? <a href={`${repoUrl}/blob/main/${f}`} target="_blank" rel="noopener noreferrer" className="text-decoration-none">{f.split('/').pop()}</a> : <span>{f.split('/').pop()}</span>}</div>
                  ))}
                </div>
              )}
              {links.agents?.length > 0 && (
                <div className="col-md-3">
                  <div className="fw-medium small mb-1"><i className="bi bi-cpu me-1" style={{ color: '#8b5cf6' }}></i>Agents ({links.agents.length})</div>
                  {links.agents.slice(0, 5).map((f: string, i: number) => (
                    <div key={i} style={{ fontSize: 10 }}>{repoUrl ? <a href={`${repoUrl}/blob/main/${f}`} target="_blank" rel="noopener noreferrer" className="text-decoration-none">{f.split('/').pop()}</a> : <span>{f.split('/').pop()}</span>}</div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-muted small"><i className="bi bi-info-circle me-1"></i>No implementations detected yet. Run "Match to Repo" on the Requirements tab.</div>
          )}
        </Section>

        {/* ── SECTION 4: Gaps ── */}
        <Section num={4} title={`Gaps (${gaps.length})`} collapsible defaultOpen={gaps.length > 0 && gaps.length <= 10}>
          {gaps.length === 0 ? (
            <div className="text-muted small"><i className="bi bi-check-circle me-1" style={{ color: '#10b981' }}></i>No gaps detected.</div>
          ) : (
            <>
              {/* Usability gaps first */}
              {gaps.filter((g: any) => g.gap_type === 'usability').map((g: any, i: number) => (
                <div key={`ug-${i}`} className="py-1 mb-1" style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <div className="d-flex align-items-start gap-2">
                    <span className="badge" style={{ background: '#ef444420', color: '#ef4444', fontSize: 8, flexShrink: 0, marginTop: 2 }}>System</span>
                    <span style={{ fontSize: 11, color: '#ef4444' }}><i className="bi bi-exclamation-triangle me-1"></i>{g.text}</span>
                  </div>
                </div>
              ))}
              {/* Requirement gaps */}
              {(showAllGaps ? gaps.filter((g: any) => g.gap_type !== 'usability') : gaps.filter((g: any) => g.gap_type !== 'usability').slice(0, 8)).map((g: any, i: number) => {
                const expanded = expandedReqs.has(`gap-${g.key}`);
                return (
                  <div key={i} className="py-1" style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }} onClick={() => toggleReq(`gap-${g.key}`)}>
                    <div className="d-flex align-items-start gap-2">
                      <span className="badge" style={{ background: '#ef444420', color: '#ef4444', fontSize: 8, flexShrink: 0, marginTop: 2 }}>Missing</span>
                      <div style={{ fontSize: 11 }}>
                        <strong className="me-1">{g.key}</strong>
                        <span className="text-muted">{expanded ? g.text : (g.text?.length > 100 ? g.text.substring(0, 100) + '...' : g.text)}</span>
                        {!expanded && g.text?.length > 100 && <span style={{ color: 'var(--color-primary-light)', fontSize: 9 }}> [more]</span>}
                      </div>
                    </div>
                    {g.feature_name && <div className="text-muted ps-4" style={{ fontSize: 9 }}>Feature: {g.feature_name}</div>}
                  </div>
                );
              })}
              {!showAllGaps && gaps.length > 8 && (
                <button className="btn btn-link btn-sm p-0 mt-1" style={{ fontSize: 10 }} onClick={() => setShowAllGaps(true)}>Show all {gaps.length} gaps</button>
              )}
            </>
          )}
        </Section>

        {/* ── SECTION 5: Completion ── */}
        <Section num={5} title="Completion">
          <div className="d-flex gap-4 mb-2">
            <div className="text-center"><div className="fw-bold" style={{ fontSize: 20, color: '#10b981' }}>{matchedR}</div><div className="text-muted" style={{ fontSize: 9 }}>Implemented</div></div>
            <div className="text-center"><div className="fw-bold" style={{ fontSize: 20, color: '#f59e0b' }}>{partialR}</div><div className="text-muted" style={{ fontSize: 9 }}>Partial</div></div>
            <div className="text-center"><div className="fw-bold" style={{ fontSize: 20, color: '#ef4444' }}>{unmatchedR}</div><div className="text-muted" style={{ fontSize: 9 }}>Missing</div></div>
            <div className="text-center"><div className="fw-bold" style={{ fontSize: 20, color: 'var(--color-primary)' }}>{features.length}</div><div className="text-muted" style={{ fontSize: 9 }}>Features</div></div>
          </div>
          <div className="progress" style={{ height: 8 }}>
            <div className="progress-bar" style={{ width: `${pct}%`, background: pct >= 70 ? '#10b981' : pct >= 30 ? '#f59e0b' : '#ef4444' }} />
          </div>
          <div className="text-end text-muted mt-1" style={{ fontSize: 10 }}>{pct}% complete</div>
        </Section>

        {/* ── SECTION 6: Why This % ── */}
        <Section num={6} title={`Why ${pct}%`} collapsible defaultOpen={false}>
          <div className="text-muted small">
            <div className="mb-1">{matchedR} of {totalR} requirements have matching code in the repository.</div>
            {partialR > 0 && <div className="mb-1">{partialR} requirements have weak or partial matches.</div>}
            {unmatchedR > 0 && <div className="mb-1">{unmatchedR} requirements have no matching implementation detected.</div>}
            <div className="mb-1">{features.filter((f: any) => (f.requirements || []).some((r: any) => r.status === 'matched' || r.status === 'verified')).length} of {features.length} features have at least one implemented requirement.</div>
            <div style={{ fontSize: 9, color: '#9ca3af' }}>Note: Matching is based on keyword analysis of file paths. Manually verify critical requirements.</div>
          </div>
        </Section>

        {/* ── SECTION 7: Recommendations ── */}
        <Section num={7} title="Recommendations" collapsible defaultOpen={false}>
          <div className="text-muted small">
            {unmatchedR > 0 && <div className="mb-1"><i className="bi bi-arrow-right me-1" style={{ color: 'var(--color-primary-light)' }}></i>Implement {unmatchedR} missing requirements to increase completion.</div>}
            {u.backend === 'missing' && <div className="mb-1"><i className="bi bi-arrow-right me-1" style={{ color: 'var(--color-primary-light)' }}></i>Build backend services for this process — no backend code detected.</div>}
            {u.frontend === 'missing' && <div className="mb-1"><i className="bi bi-arrow-right me-1" style={{ color: 'var(--color-primary-light)' }}></i>Create frontend UI — no user-facing pages detected.</div>}
            {u.agent === 'missing' && <div className="mb-1"><i className="bi bi-arrow-right me-1" style={{ color: 'var(--color-primary-light)' }}></i>Add AI agent support for automation.</div>}
            {u.usable && <div className="mb-1"><i className="bi bi-check-circle me-1" style={{ color: '#10b981' }}></i>This process is operational. Focus on enhancing coverage.</div>}
          </div>
        </Section>

        {/* ── SECTION 8: Feature Breakdown (collapsed) ── */}
        <Section num={8} title="Feature Breakdown" collapsible defaultOpen={false}>
          {features.map((f: any) => {
            const reqs = f.requirements || [];
            const fMatched = reqs.filter((r: any) => r.status === 'matched' || r.status === 'verified').length;
            const fPct = reqs.length > 0 ? Math.round((fMatched / reqs.length) * 100) : 0;
            return (
              <div key={f.id} className="mb-2 py-1" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <div className="d-flex justify-content-between align-items-center">
                  <span style={{ fontSize: 12 }}>{f.name}</span>
                  <div className="d-flex align-items-center gap-2">
                    <span className="text-muted" style={{ fontSize: 10 }}>{fMatched}/{reqs.length}</span>
                    <div className="progress" style={{ width: 60, height: 4 }}>
                      <div className="progress-bar" style={{ width: `${fPct}%`, background: fPct >= 70 ? '#10b981' : fPct >= 30 ? '#f59e0b' : '#ef4444' }} />
                    </div>
                    <span className="fw-medium" style={{ fontSize: 10, width: 28 }}>{fPct}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </Section>

        {/* ── SECTION 9: Action Buttons ── */}
        <div className="d-flex flex-wrap gap-2 pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
          {PROMPT_TARGETS.map(t => (
            <button key={t.key} className="btn btn-sm btn-outline-primary" onClick={() => handlePrompt(t.key)} disabled={generatingPrompt === t.key} style={{ fontSize: 12 }}>
              {generatingPrompt === t.key ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className={`bi ${t.icon} me-1`}></i>}
              {t.label}
            </button>
          ))}
        </div>

      </div>
    </div>
  );
}
