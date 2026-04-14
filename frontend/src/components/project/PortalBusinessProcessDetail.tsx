import React, { useEffect, useState } from 'react';
import * as bpApi from '../../services/portalBusinessProcessApi';
import SystemIntelligencePanel from './SystemIntelligencePanel';
import PredictionModal from './PredictionModal';

interface Props { processId: string; onClose: () => void; onUpdate: () => void; }

const PROMPT_TARGETS = [
  { key: 'backend_improvement', label: 'Fix Backend', icon: 'bi-gear' },
  { key: 'frontend_exposure', label: 'Add UI', icon: 'bi-layout-wtf' },
  { key: 'agent_enhancement', label: 'Enhance Agent', icon: 'bi-cpu' },
];

const MATURITY_COLORS: Record<number, string> = { 0: '#9ca3af', 1: 'var(--color-danger)', 2: 'var(--color-warning)', 3: 'var(--color-info)', 4: 'var(--color-success)', 5: '#8b5cf6' };

function StatusDot({ status }: { status: string }) {
  const c: Record<string, string> = { ready: 'var(--color-success)', partial: 'var(--color-warning)', missing: 'var(--color-danger)' };
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
  const [predictionAction, setPredictionAction] = useState<{ type: string; label: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [resyncModal, setResyncModal] = useState<any>(null);
  const [showSync, setShowSync] = useState(false);
  const [uiFeedback, setUiFeedback] = useState('');
  const [uiAnalyzing, setUiAnalyzing] = useState(false);
  const [uiSuggestions, setUiSuggestions] = useState<any>(null);
  const [previewUrlInput, setPreviewUrlInput] = useState('');
  const [elementFeedback, setElementFeedback] = useState<any>(null);
  const [analyzingPage, setAnalyzingPage] = useState(false);

  const load = () => { bpApi.getProcess(processId).then(r => setP(r.data)).catch(() => {}); };
  // Project context comes from the process detail API response (p.project_system_prompt)
  const projectContext = p?.project_system_prompt || '';
  useEffect(load, [processId]);
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
  const isPageBP = p.is_page_bp || p.source === 'frontend_page';
  const accentColor = isPageBP ? '#8b5cf6' : 'var(--color-primary)';

  return (
    <div className="card border-0 shadow" style={isPageBP ? { background: '#faf5ff' } : undefined}>
      <div className="card-header bg-white py-3 d-flex justify-content-between align-items-start" style={{ borderBottom: `3px solid ${isPageBP ? '#8b5cf6' : u.usable ? 'var(--color-success)' : 'var(--color-danger)'}` }}>
        <div>
          <h5 className="fw-bold mb-1" style={{ color: accentColor }}>
            {isPageBP && <i className="bi bi-layout-wtf me-2"></i>}
            {p.name}
          </h5>
          <span className="text-muted" style={{ fontSize: 12 }}>
            {isPageBP ? (p.frontend_route || 'Frontend page') : `${p.total_requirements} requirements`}
            {isPageBP && <span className="badge ms-2" style={{ fontSize: 9, background: '#8b5cf620', color: '#8b5cf6' }}>Page BP</span>}
          </span>
        </div>
        <div className="d-flex align-items-center gap-2">
          <button className="btn btn-sm" style={{ background: '#3b82f620', color: 'var(--color-info)', fontSize: 10, fontWeight: 700, border: '1px solid #3b82f640' }}
            disabled={resyncing}
            onClick={async () => {
              setResyncing(true);
              // Capture before state
              const before = {
                matched: p.matched_requirements || 0,
                verified: p.verified_requirements || 0,
                readiness: p.metrics?.system_readiness || 0,
                quality: p.metrics?.quality_score || 0,
                maturity: p.maturity?.level || 1,
                gaps: p.gap_count || 0,
              };
              try {
                const r = await bpApi.resyncProcess(processId);
                const rs = r.data?.resync;
                const wc = r.data?.what_changed;
                // Reload to get after state
                const afterRes = await bpApi.getProcess(processId);
                const after = afterRes.data;
                const afterMetrics = {
                  matched: after.matched_requirements || 0,
                  verified: after.verified_requirements || 0,
                  readiness: after.metrics?.system_readiness || 0,
                  quality: after.metrics?.quality_score || 0,
                  maturity: after.maturity?.level || 1,
                  gaps: after.gap_count || 0,
                };
                setResyncModal({ before, after: afterMetrics, resync: rs, what_changed: wc, summary: r.data?.summary });
                setP(after);
                // Don't call onUpdate() here — it triggers parent reload which unmounts this component
                // and loses the modal state. onUpdate will be called when modal is dismissed.
              } catch {
                const el = document.createElement('div');
                el.innerHTML = '<div style="position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999;background:#ef4444;color:#fff;padding:12px 20px;border-radius:10px;font-size:12px">Resync failed</div>';
                document.body.appendChild(el); setTimeout(() => el.remove(), 3000);
              } finally { setResyncing(false); }
            }}>
            {resyncing ? <><span className="spinner-border spinner-border-sm me-1" style={{ width: 10, height: 10 }}></span>Syncing...</> : <><i className="bi bi-arrow-repeat me-1"></i>Resync</>}
          </button>
          <span className="badge px-2 py-1" style={{ background: `${matColor}20`, color: matColor, fontSize: 10, fontWeight: 700 }}>L{mat.level} {mat.label}</span>
          <button className="btn btn-sm" style={{ background: '#6366f120', color: '#6366f1', fontSize: 10, fontWeight: 700, border: '1px solid #6366f140' }} onClick={async () => {
            const featureList = features.map((f: any) => `- ${f.name}: ${f.description || 'No description'}`).join('\n');
            const gapList = gaps.slice(0, 10).map((g: any) => `- [${g.gap_type}] ${g.text}`).join('\n');
            const reqList = features.flatMap((f: any) => (f.requirements || []).map((r: any) => `- ${r.key}: ${r.text}`)).slice(0, 20).join('\n');
            const learnPrompt = `You are operating in LEARN MODE.

DO NOT write code. DO NOT give implementation instructions. DO NOT suggest building anything.
Your ONLY job is to help the learner UNDERSTAND what this business process is, why it matters, and how it works.

---

You are a Technical Mentor helping someone deeply understand a business process before they build it.

Assume the learner has NO prior knowledge of this system or the domain. Your job is to help them fully understand what this process is, why it matters, what it does, and how it works — so they can make informed decisions.

---

# PROJECT CONTEXT (THE BIGGER PICTURE)

${projectContext || 'No project system prompt set yet.'}

---

BUSINESS PROCESS: ${p.name}

DESCRIPTION: ${p.description || 'No description available.'}

CURRENT STATE:
- Backend: ${u.backend || 'missing'}
- Frontend: ${u.frontend || 'missing'}
- Agents: ${u.agent || 'missing'}
- System Readiness: ${m.system_readiness || 0}%
- Quality Score: ${m.quality_score || 0}%
- Maturity: L${mat.level} ${mat.label}

FEATURES THIS PROCESS NEEDS (${features.length}):
${featureList || 'None defined yet'}

REQUIREMENTS (${p.total_requirements || 0}):
${reqList || 'None extracted yet'}

CURRENT GAPS (${gaps.length}):
${gapList || 'No gaps detected'}

---

YOUR MISSION:

Help the learner understand:
1. What "${p.name}" is in plain, non-technical language
2. What business problem it solves and why it matters
3. Each feature listed above — what it does and why it's needed
4. The current gaps — what's missing and what that means
5. How the different layers (backend, frontend, agents, database) work together
6. What questions they should be asking before building

RULES:
- Explain ONE concept at a time
- Use analogies and real-world examples
- Ask comprehension questions before moving to the next concept
- Never assume the learner already knows something
- Focus purely on understanding — do NOT give coding instructions or tell them to build anything
- If the learner asks a question, answer it thoroughly before continuing

Begin by greeting the learner and explaining what "${p.name}" is and why it matters for their business.`;
            // Clipboard fallback for HTTP (dev) — uses textarea trick
            try { await navigator.clipboard.writeText(learnPrompt); } catch {
              const ta = document.createElement('textarea'); ta.value = learnPrompt; ta.style.position = 'fixed'; ta.style.left = '-9999px';
              document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
            }
            window.open('https://chatgpt.com', '_blank');
            const toast = document.createElement('div');
            toast.innerHTML = '<div style="position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999;background:#6366f1;color:#fff;padding:12px 20px;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.2);font-size:13px"><i class="bi bi-clipboard-check me-2"></i>Learn Mode prompt copied — paste in ChatGPT</div>';
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 4000);
          }}>
            <i className="bi bi-mortarboard me-1"></i>Learn
          </button>
          <span className="badge px-3 py-2" style={{ background: u.usable ? 'var(--color-success)' : 'var(--color-danger)', color: '#fff', fontSize: 13, fontWeight: 700 }}>{u.usable ? 'USABLE' : 'NOT READY'}</span>
          <button className="btn btn-link text-muted p-0" onClick={onClose}><i className="bi bi-x-lg" style={{ fontSize: 18 }}></i></button>
        </div>
      </div>

      <div className="card-body p-3">
       <div className="d-flex gap-3">
        {/* Left: Intelligence Panel (70% for code BPs, 100% for page BPs) */}
        <div style={{ flex: isPageBP ? '1 1 100%' : '1 1 70%', minWidth: 0 }}>
        {/* 1: Overview */}
        <Section num={1} title="Process Overview">
          <p className="text-muted small mb-0">{p.description || 'No description available.'}</p>
        </Section>

        {/* 2: System Truth — 3 metrics + usability */}
        {isPageBP ? (
          <Section num={2} title="Page Status">
            <div className="d-flex gap-3 mb-2" style={{ fontSize: 11 }}>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: u.frontend === 'ready' ? '#10b981' : '#ef4444', marginRight: 4 }}></span>Frontend: {u.frontend === 'ready' ? 'Ready' : 'Missing'}</span>
              {p.frontend_route && <span className="text-muted"><i className="bi bi-signpost me-1"></i>{p.frontend_route}</span>}
              {p.preview_url && <span className="text-muted"><i className="bi bi-eye me-1"></i>Preview connected</span>}
            </div>
          </Section>
        ) : (
        <Section num={2} title="System Truth">
          <div className="row g-3 mb-3">
            <div className="col-md-4"><MetricBar label="Req. Matched (auto)" value={m.requirements_coverage || 0} color={m.requirements_coverage >= 70 ? 'var(--color-success)' : m.requirements_coverage >= 30 ? 'var(--color-warning)' : 'var(--color-danger)'} /></div>
            <div className="col-md-4"><MetricBar label="System Readiness" value={m.system_readiness || 0} color={m.system_readiness >= 70 ? 'var(--color-success)' : m.system_readiness >= 30 ? 'var(--color-warning)' : 'var(--color-danger)'} /></div>
            <div className="col-md-4"><MetricBar label="Quality Score" value={m.quality_score || 0} color={m.quality_score >= 70 ? 'var(--color-success)' : m.quality_score >= 30 ? 'var(--color-warning)' : 'var(--color-danger)'} /></div>
          </div>
          <div className="d-flex gap-4 mb-2">
            <div><span className="text-muted" style={{ fontSize: 11 }}>Backend</span><br/><StatusDot status={u.backend || 'missing'} /></div>
            <div><span className="text-muted" style={{ fontSize: 11 }}>Frontend</span><br/><StatusDot status={u.frontend || 'missing'} /></div>
            <div><span className="text-muted" style={{ fontSize: 11 }}>Agents</span><br/><StatusDot status={u.agent || 'missing'} /></div>
          </div>
          {!u.usable && (u.why_not || []).length > 0 && (
            <div className="mt-1">{(u.why_not || []).map((w: string, i: number) => <div key={i} className="text-muted small"><i className="bi bi-arrow-right me-1" style={{ color: 'var(--color-danger)' }}></i>{w}</div>)}</div>
          )}
        </Section>
        )}

        {/* 3: What Exists — hidden for page BPs */}
        {!isPageBP && (
        <Section num={3} title="What Exists" collapsible defaultOpen={false}>
          {(links.backend?.length > 0 || links.frontend?.length > 0 || links.agents?.length > 0 || links.models?.length > 0) ? (
            <div className="row g-3">
              {[
                { key: 'backend', label: 'Services', icon: 'bi-gear', color: 'var(--color-info)' },
                { key: 'models', label: 'Database', icon: 'bi-database', color: 'var(--color-warning)' },
                { key: 'frontend', label: 'Frontend', icon: 'bi-layout-wtf', color: 'var(--color-success)' },
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
        )}

        {/* 3a: Frontend Preview & Feedback — only show when THIS BP has frontend files */}
        {links.frontend?.length > 0 && (
          <Section num={3.1} title="Frontend Preview" collapsible defaultOpen>
            {p.preview_url ? (
              <>
                {/* Route selector */}
                <div className="d-flex align-items-center gap-2 mb-2">
                  <span className="text-muted" style={{ fontSize: 10 }}><i className="bi bi-signpost me-1"></i>Route:</span>
                  <span className="fw-medium" style={{ fontSize: 11 }}>{p.frontend_route || '/'}</span>
                  <select className="form-select form-select-sm" style={{ fontSize: 10, width: 'auto', maxWidth: 200 }}
                    value={p.frontend_route || ''}
                    onChange={async (e) => {
                      try {
                        const portalApi = (await import('../../utils/portalApi')).default;
                        await portalApi.put(`/api/portal/project/business-processes/${processId}/frontend-route`, { route: e.target.value || null });
                        load();
                      } catch {}
                    }}>
                    <option value="">/ (home)</option>
                    <optgroup label="Admin">
                      {['/admin/dashboard','/admin/campaigns','/admin/leads','/admin/pipeline','/admin/visitors','/admin/marketing','/admin/tickets','/admin/intelligence','/admin/orchestration','/admin/settings','/admin/revenue','/admin/governance','/admin/communications','/admin/accelerator','/admin/events','/admin/import','/admin/war-room','/admin/projects'].map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Portal">
                      {['/portal/project','/portal/curriculum','/portal/sessions','/portal/assignments','/portal/progress'].map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Public">
                      {['/','/program','/pricing','/enroll','/contact','/case-studies','/advisory','/sponsorship'].map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>
                <iframe
                  src={p.preview_url}
                  title="Frontend Preview"
                  style={{ width: '100%', height: 400, border: '1px solid var(--color-border)', borderRadius: 8, background: '#fff' }}
                  sandbox="allow-scripts allow-same-origin allow-forms"
                />
                <div className="d-flex justify-content-between align-items-center mt-1">
                  <div className="d-flex gap-2 align-items-center">
                    <button className="btn btn-sm btn-outline-primary" style={{ fontSize: 10 }}
                      disabled={analyzingPage}
                      onClick={async () => {
                        setAnalyzingPage(true);
                        try {
                          const portalApi = (await import('../../utils/portalApi')).default;
                          // Send a basic element map from known file structure
                          const feFiles = (p.implementation_links?.frontend || []) as string[];
                          const elements = feFiles.map((f: string, i: number) => {
                            const name = f.split('/').pop()?.replace(/\.(tsx|jsx)$/, '') || f;
                            return { element_id: `component-${i}`, type: 'component', tag: 'div', selector: name, text: name, depth: 0 };
                          });
                          await portalApi.post(`/api/portal/project/business-processes/${processId}/element-map`, { elements, route: p.frontend_route || '/' });
                          const result = await portalApi.post(`/api/portal/project/business-processes/${processId}/analyze-page`, {});
                          // Load feedback
                          const fbRes = await portalApi.get(`/api/portal/project/business-processes/${processId}/element-feedback`);
                          setElementFeedback(fbRes.data);
                        } catch {} finally { setAnalyzingPage(false); }
                      }}>
                      {analyzingPage ? <><span className="spinner-border spinner-border-sm me-1" style={{ width: 10, height: 10 }}></span>Analyzing...</> : <><i className="bi bi-search me-1"></i>Analyze UI</>}
                    </button>
                    {elementFeedback?.summary && (
                      <span style={{ fontSize: 10 }}>
                        <span className="badge bg-danger me-1">{elementFeedback.summary.open}</span>open
                        <span className="badge bg-success ms-2 me-1">{elementFeedback.summary.resolved}</span>resolved
                      </span>
                    )}
                  </div>
                  <a href={p.preview_url} target="_blank" rel="noopener noreferrer" className="text-muted" style={{ fontSize: 10 }}>
                    <i className="bi bi-box-arrow-up-right me-1"></i>Open in new tab
                  </a>
                </div>

                {/* Element Feedback Results */}
                {elementFeedback?.items?.length > 0 && (
                  <div className="mt-2 p-2" style={{ background: 'var(--color-bg-alt)', borderRadius: 8, maxHeight: 300, overflowY: 'auto' }}>
                    <div className="fw-medium small mb-2">
                      <i className="bi bi-clipboard2-check me-1" style={{ color: 'var(--color-info)' }}></i>
                      UI Issues ({elementFeedback.items.filter((f: any) => f.status === 'open').length} open)
                    </div>
                    {elementFeedback.items.filter((f: any) => f.status !== 'resolved').map((f: any) => (
                      <div key={f.id} className="d-flex gap-2 align-items-start py-1" style={{ borderBottom: '1px solid var(--color-border)', fontSize: 10 }}>
                        <span className="badge" style={{ fontSize: 8, flexShrink: 0, background: f.severity === 'high' ? '#ef444420' : f.severity === 'medium' ? '#f59e0b20' : '#10b98120', color: f.severity === 'high' ? '#ef4444' : f.severity === 'medium' ? '#f59e0b' : '#10b981' }}>{f.severity}</span>
                        <div className="flex-grow-1">
                          <div className="fw-medium">{f.title}</div>
                          <div className="text-muted">{f.description?.substring(0, 100)}</div>
                          {f.suggestion && <div style={{ color: 'var(--color-info)' }}>Fix: {f.suggestion?.substring(0, 100)}</div>}
                        </div>
                        <div className="d-flex gap-1 flex-shrink-0">
                          <button className="btn btn-sm btn-outline-success" style={{ fontSize: 8, padding: '1px 4px' }}
                            onClick={async () => {
                              try {
                                const portalApi = (await import('../../utils/portalApi')).default;
                                await portalApi.put(`/api/portal/project/element-feedback/${f.id}`, { status: 'resolved', resolved_by: 'manual' });
                                const fbRes = await portalApi.get(`/api/portal/project/business-processes/${processId}/element-feedback`);
                                setElementFeedback(fbRes.data);
                              } catch {}
                            }}>
                            <i className="bi bi-check"></i>
                          </button>
                          <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: 8, padding: '1px 4px' }}
                            onClick={async () => {
                              try {
                                const portalApi = (await import('../../utils/portalApi')).default;
                                await portalApi.put(`/api/portal/project/element-feedback/${f.id}`, { status: 'dismissed' });
                                const fbRes = await portalApi.get(`/api/portal/project/business-processes/${processId}/element-feedback`);
                                setElementFeedback(fbRes.data);
                              } catch {}
                            }}>
                            <i className="bi bi-x"></i>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="p-3 text-center" style={{ background: 'var(--color-bg-alt)', borderRadius: 8, border: '1px dashed var(--color-border)' }}>
                <i className="bi bi-layout-wtf d-block mb-2" style={{ fontSize: 24, color: 'var(--color-text-light)' }}></i>
                <div className="fw-medium small mb-2">Frontend files detected — connect a preview URL to see it live</div>
                <div className="d-flex gap-2 justify-content-center align-items-center flex-wrap">
                  <input className="form-control form-control-sm" style={{ maxWidth: 300, fontSize: 11 }}
                    placeholder="https://your-app.vercel.app" value={previewUrlInput}
                    onChange={e => setPreviewUrlInput(e.target.value)} />
                  <button className="btn btn-sm btn-primary" disabled={!previewUrlInput.trim()} onClick={async () => {
                    try {
                      const portalApi = (await import('../../utils/portalApi')).default;
                      await portalApi.put('/api/portal/project/preview-url', { url: previewUrlInput.trim() });
                      load();
                    } catch {}
                  }}>
                    <i className="bi bi-link-45deg me-1"></i>Connect
                  </button>
                  {repoUrl && (
                    <>
                      <span className="text-muted" style={{ fontSize: 10 }}>or</span>
                      <a
                        href={`https://vercel.com/new/clone?repository-url=${encodeURIComponent(repoUrl)}&root-directory=frontend`}
                        target="_blank" rel="noopener noreferrer"
                        className="btn btn-sm btn-dark" style={{ fontSize: 10 }}
                      >
                        <i className="bi bi-box-arrow-up-right me-1"></i>Deploy to Vercel
                      </a>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Unified UI Feedback Panel — uses new element-level engine */}
            <div className="mt-3 p-2" style={{ background: 'var(--color-bg-alt)', borderRadius: 8 }}>
              <div className="fw-medium small mb-2"><i className="bi bi-clipboard2-check me-1" style={{ color: 'var(--color-info)' }}></i>UI Feedback</div>

              {/* Quick analysis actions */}
              <div className="d-flex gap-1 flex-wrap mb-2">
                {[
                  { label: 'Improve Layout', icon: 'bi-layout-wtf', feedback: 'Improve the page layout, spacing, and visual hierarchy' },
                  { label: 'Fix UX Issues', icon: 'bi-exclamation-triangle', feedback: 'Find and fix usability issues, broken interactions, and confusing flows' },
                  { label: 'Make Enterprise Ready', icon: 'bi-building', feedback: 'Add enterprise features: accessibility, security, error handling, loading states' },
                  { label: 'Optimize for Conversion', icon: 'bi-graph-up-arrow', feedback: 'Optimize CTAs, user flow, and conversion funnel' },
                  { label: 'Mobile Responsive', icon: 'bi-phone', feedback: 'Make the layout responsive for mobile and tablet' },
                  { label: 'Accessibility Audit', icon: 'bi-universal-access', feedback: 'Run WCAG 2.1 AA compliance check: alt text, labels, contrast, keyboard nav' },
                ].map(action => (
                  <button key={action.label} className="btn btn-sm btn-outline-secondary" style={{ fontSize: 9 }}
                    disabled={analyzingPage}
                    onClick={async () => {
                      setAnalyzingPage(true);
                      try {
                        const portalApi = (await import('../../utils/portalApi')).default;
                        const feFiles = (p.implementation_links?.frontend || []) as string[];
                        const elements = feFiles.map((f: string, i: number) => {
                          const name = f.split('/').pop()?.replace(/\.(tsx|jsx)$/, '') || f;
                          return { element_id: `component-${i}`, type: 'component', tag: 'div', selector: name, text: name, depth: 0 };
                        });
                        await portalApi.post(`/api/portal/project/business-processes/${processId}/element-map`, { elements, route: p.frontend_route || '/' });
                        await portalApi.post(`/api/portal/project/business-processes/${processId}/analyze-page`, { user_feedback: action.feedback });
                        const fbRes = await portalApi.get(`/api/portal/project/business-processes/${processId}/element-feedback`);
                        setElementFeedback(fbRes.data);
                      } catch {} finally { setAnalyzingPage(false); }
                    }}>
                    <i className={`bi ${action.icon} me-1`}></i>{action.label}
                  </button>
                ))}
              </div>

              {/* Custom feedback input */}
              <div className="d-flex gap-2 mb-2">
                <input className="form-control form-control-sm" style={{ fontSize: 11 }}
                  placeholder="Describe a specific improvement..."
                  value={uiFeedback} onChange={e => setUiFeedback(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && uiFeedback.trim()) {
                      setAnalyzingPage(true);
                      try {
                        const portalApi = (await import('../../utils/portalApi')).default;
                        const feFiles = (p.implementation_links?.frontend || []) as string[];
                        const elements = feFiles.map((f: string, i: number) => {
                          const name = f.split('/').pop()?.replace(/\.(tsx|jsx)$/, '') || f;
                          return { element_id: `component-${i}`, type: 'component', tag: 'div', selector: name, text: name, depth: 0 };
                        });
                        await portalApi.post(`/api/portal/project/business-processes/${processId}/element-map`, { elements, route: p.frontend_route || '/' });
                        await portalApi.post(`/api/portal/project/business-processes/${processId}/analyze-page`, { user_feedback: uiFeedback });
                        const fbRes = await portalApi.get(`/api/portal/project/business-processes/${processId}/element-feedback`);
                        setElementFeedback(fbRes.data);
                        setUiFeedback('');
                      } catch {} finally { setAnalyzingPage(false); }
                    }
                  }} />
              </div>

              {/* Persistent feedback results */}
              {elementFeedback?.items?.length > 0 && (
                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <span className="fw-medium" style={{ fontSize: 10 }}>
                      {elementFeedback.items.filter((f: any) => f.status === 'open').length} open issues
                    </span>
                    <span className="text-muted" style={{ fontSize: 9 }}>
                      {elementFeedback.summary?.resolved || 0} resolved
                    </span>
                  </div>
                  {elementFeedback.items.filter((f: any) => f.status !== 'resolved' && f.status !== 'dismissed').map((f: any) => (
                    <div key={f.id} className="d-flex gap-2 align-items-start py-1" style={{ borderBottom: '1px solid var(--color-border)', fontSize: 10 }}>
                      <span className="badge" style={{ fontSize: 8, flexShrink: 0, background: f.severity === 'high' ? '#ef444420' : f.severity === 'medium' ? '#f59e0b20' : '#10b98120', color: f.severity === 'high' ? '#ef4444' : f.severity === 'medium' ? '#f59e0b' : '#10b981' }}>{f.severity}</span>
                      <div className="flex-grow-1">
                        <div className="fw-medium">{f.title}</div>
                        <div className="text-muted">{f.description?.substring(0, 120)}</div>
                        {f.suggestion && <div style={{ color: 'var(--color-info)', fontSize: 9 }}><i className="bi bi-lightbulb me-1"></i>{f.suggestion?.substring(0, 120)}</div>}
                      </div>
                      <div className="d-flex gap-1 flex-shrink-0">
                        <button className="btn btn-sm btn-outline-success" style={{ fontSize: 8, padding: '1px 4px' }} title="Resolve"
                          onClick={async () => {
                            try {
                              const portalApi = (await import('../../utils/portalApi')).default;
                              await portalApi.put(`/api/portal/project/element-feedback/${f.id}`, { status: 'resolved', resolved_by: 'manual' });
                              const fbRes = await portalApi.get(`/api/portal/project/business-processes/${processId}/element-feedback`);
                              setElementFeedback(fbRes.data);
                            } catch {}
                          }}>
                          <i className="bi bi-check"></i>
                        </button>
                        <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: 8, padding: '1px 4px' }} title="Dismiss"
                          onClick={async () => {
                            try {
                              const portalApi = (await import('../../utils/portalApi')).default;
                              await portalApi.put(`/api/portal/project/element-feedback/${f.id}`, { status: 'dismissed' });
                              const fbRes = await portalApi.get(`/api/portal/project/business-processes/${processId}/element-feedback`);
                              setElementFeedback(fbRes.data);
                            } catch {}
                          }}>
                          <i className="bi bi-x"></i>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>
        )}

        {/* 3b: Agent Mappings — hidden for page BPs */}
        {!isPageBP && (
        {p.agent_mappings?.length > 0 && (
          <Section num={3.5} title={`Agents (${p.agent_mappings.length})`} collapsible defaultOpen={false}>
            {p.effective_mode && (
              <div className="mb-2 p-2 d-flex align-items-center gap-2" style={{ background: 'var(--color-bg-alt)', borderRadius: 6, fontSize: 10 }}>
                <i className="bi bi-cpu" style={{ color: 'var(--color-info)' }}></i>
                <span>Agents operating in <strong>{p.effective_mode.toUpperCase()}</strong> mode</span>
                <span className="text-muted">({p.mode_source === 'capability' ? 'set on this process' : p.mode_source === 'campaign' ? 'inherited from campaign' : 'inherited from project'})</span>
              </div>
            )}
            <div className="table-responsive">
              <table className="table table-sm table-hover mb-0" style={{ fontSize: 11 }}>
                <thead className="table-light">
                  <tr><th>Agent</th><th>Role</th><th>Status</th><th className="text-end">Runs</th><th className="text-end">Errors</th><th>Last Run</th></tr>
                </thead>
                <tbody>
                  {p.agent_mappings.map((a: any) => {
                    const statusColor = a.agent_status === 'running' ? 'var(--color-info)' : a.agent_status === 'error' ? 'var(--color-danger)' : a.agent_status === 'idle' ? 'var(--color-accent)' : 'var(--color-text-light)';
                    return (
                      <tr key={a.agent_name}>
                        <td>
                          <span style={{ color: statusColor, fontSize: 8 }}>&#9679;</span>{' '}
                          <span className="fw-medium">{a.agent_name}</span>
                          {a.agent_description && <div className="text-muted" style={{ fontSize: 9 }}>{a.agent_description.substring(0, 60)}</div>}
                        </td>
                        <td><span className="badge bg-light text-dark" style={{ fontSize: 9 }}>{a.role}</span></td>
                        <td><span className="badge" style={{ fontSize: 9, background: `${statusColor}20`, color: statusColor }}>{a.agent_status}</span></td>
                        <td className="text-end">{a.run_count || 0}</td>
                        <td className="text-end" style={{ color: a.error_count > 0 ? 'var(--color-danger)' : undefined }}>{a.error_count || 0}</td>
                        <td className="text-muted" style={{ fontSize: 10 }}>{a.last_run_at ? new Date(a.last_run_at).toLocaleDateString() : 'Never'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        )}

        {/* 4-8: Code BP sections — hidden for page BPs */}
        {!isPageBP && (<>
        {/* 4: Gaps */}
        <Section num={4} title={`Gaps (${gaps.length})`} collapsible defaultOpen={gaps.length > 0 && gaps.length <= 10}>
          {gaps.length === 0 ? <div className="text-muted small"><i className="bi bi-check-circle me-1" style={{ color: 'var(--color-success)' }}></i>No gaps detected.</div> : (
            <>
              {gaps.filter((g: any) => g.gap_type === 'system').map((g: any, i: number) => (
                <div key={`s${i}`} className="py-1" style={{ borderBottom: '1px solid var(--color-border)' }}><span className="badge me-2" style={{ background: '#ef444420', color: 'var(--color-danger)', fontSize: 8 }}>System</span><span style={{ fontSize: 11, color: 'var(--color-danger)' }}>{g.text}</span></div>
              ))}
              {gaps.filter((g: any) => g.gap_type === 'quality').map((g: any, i: number) => (
                <div key={`q${i}`} className="py-1" style={{ borderBottom: '1px solid var(--color-border)' }}><span className="badge me-2" style={{ background: '#9ca3af20', color: '#9ca3af', fontSize: 8 }}>Quality</span><span className="text-muted" style={{ fontSize: 11 }}>{g.text}</span></div>
              ))}
              {(showAllGaps ? gaps.filter((g: any) => g.gap_type === 'requirement') : gaps.filter((g: any) => g.gap_type === 'requirement').slice(0, 5)).map((g: any, i: number) => {
                const exp = expandedReqs.has(`g-${g.key}`);
                return (<div key={`r${i}`} className="py-1" style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }} onClick={() => toggleReq(`g-${g.key}`)}>
                  <span className="badge me-2" style={{ background: '#f59e0b20', color: 'var(--color-warning)', fontSize: 8 }}>Req</span>
                  <strong style={{ fontSize: 10 }}>{g.key}</strong> <span className="text-muted" style={{ fontSize: 11 }}>{exp ? g.text : (g.text?.length > 80 ? g.text.substring(0, 80) + '...' : g.text)}</span>
                </div>);
              })}
              {!showAllGaps && gaps.filter((g: any) => g.gap_type === 'requirement').length > 5 && <button className="btn btn-link btn-sm p-0 mt-1" style={{ fontSize: 10 }} onClick={() => setShowAllGaps(true)}>Show all {gaps.filter((g: any) => g.gap_type === 'requirement').length} requirement gaps</button>}
            </>
          )}
        </Section>

        {/* 5: Requirements Status */}
        <Section num={5} title="Requirements Status">
          {(() => {
            const total = p.total_requirements || 0;
            const verified = p.verified_requirements || 0;
            const autoMatched = p.auto_matched_requirements || 0;
            const partial = p.partial_requirements || 0;
            const unmapped = p.unmatched_requirements || 0;
            return (
              <div>
                <div className="d-flex gap-4 mb-2">
                  <div className="text-center"><div className="fw-bold" style={{ fontSize: 20, color: 'var(--color-success)' }}>{verified}</div><div className="text-muted" style={{ fontSize: 9 }}>Verified</div></div>
                  <div className="text-center"><div className="fw-bold" style={{ fontSize: 20, color: '#9ca3af' }}>{autoMatched}</div><div className="text-muted" style={{ fontSize: 9 }}>Auto-Matched</div></div>
                  <div className="text-center"><div className="fw-bold" style={{ fontSize: 20, color: 'var(--color-warning)' }}>{partial}</div><div className="text-muted" style={{ fontSize: 9 }}>Planned</div></div>
                  <div className="text-center"><div className="fw-bold" style={{ fontSize: 20, color: 'var(--color-danger)' }}>{unmapped}</div><div className="text-muted" style={{ fontSize: 9 }}>Unmapped</div></div>
                </div>
                <div className="progress" style={{ height: 8 }}>
                  <div className="progress-bar" style={{ width: `${total > 0 ? (verified / total) * 100 : 0}%`, background: 'var(--color-success)' }} />
                  <div className="progress-bar" style={{ width: `${total > 0 ? (autoMatched / total) * 100 : 0}%`, background: '#cbd5e1' }} />
                  <div className="progress-bar" style={{ width: `${total > 0 ? (partial / total) * 100 : 0}%`, background: 'var(--color-warning)' }} />
                </div>
                <div className="d-flex justify-content-between mt-1" style={{ fontSize: 9 }}>
                  <span className="text-muted">{total} total requirements</span>
                  <span style={{ color: 'var(--color-success)' }}>{total > 0 ? Math.round((verified / total) * 100) : 0}% verified</span>
                </div>
              </div>
            );
          })()}
        </Section>

        {/* 6: Quality Scores */}
        <Section num={6} title="Quality Scores" collapsible defaultOpen={false}>
          {Object.entries(q).map(([dim, val]: [string, any]) => (
            <div key={dim} className="d-flex align-items-center gap-2 mb-1">
              <span className="text-muted text-capitalize" style={{ fontSize: 11, width: 130 }}>{dim.replace(/_/g, ' ')}</span>
              <div className="progress flex-grow-1" style={{ height: 6 }}><div className="progress-bar" style={{ width: `${val * 10}%`, background: val >= 7 ? 'var(--color-success)' : val >= 4 ? 'var(--color-warning)' : 'var(--color-danger)' }} /></div>
              <span className="fw-medium" style={{ fontSize: 11, width: 25 }}>{val}/10</span>
            </div>
          ))}
        </Section>

        {/* 7: Maturity Path (mode-aware) */}
        <Section num={7} title={`Maturity: L${mat.level} ${mat.label}${mat.target_level ? ` → L${mat.target_level} Target` : ''}`} collapsible defaultOpen={false}>
          <div className="d-flex gap-1 mb-2">
            {[1,2,3,4,5].map(l => (
              <div key={l} style={{
                width: 40, height: 6, borderRadius: 3,
                background: l <= mat.level ? matColor : l === mat.target_level ? `${matColor}40` : '#e2e8f0',
                border: l === mat.target_level ? `1px dashed ${matColor}` : 'none',
              }}></div>
            ))}
          </div>
          {p.effective_mode && (() => {
            const sourceLabel = p.mode_source === 'capability' ? 'overridden at process' : p.mode_source === 'campaign' ? 'from campaign' : p.mode_source === 'project' ? 'from project' : 'default';
            const sourceIcon = p.mode_source === 'capability' ? 'bi-gear' : p.mode_source === 'campaign' ? 'bi-megaphone' : 'bi-folder';
            return (
              <div className="mb-2 d-flex align-items-center gap-2 flex-wrap">
                <span className="badge" style={{ background: 'var(--color-info, #3b82f6)15', color: 'var(--color-info, #3b82f6)', fontSize: 10 }}>
                  <i className={`bi ${sourceIcon} me-1`}></i>
                  {p.effective_mode.toUpperCase()} mode
                </span>
                <span className="text-muted" style={{ fontSize: 9 }}>{sourceLabel}</span>
                {p.mode_completion?.complete_for_mode ? (
                  <span className="text-success small"><i className="bi bi-check-circle me-1"></i>Complete</span>
                ) : p.mode_completion?.gap_reason ? (
                  <span className="text-muted small"><i className="bi bi-arrow-right me-1"></i>{p.mode_completion.gap_reason}</span>
                ) : null}
              </div>
            );
          })()}
          {mat.mode_gap && (
            <div className="mb-2 small" style={{ color: 'var(--color-warning)' }}>
              <i className="bi bi-arrow-up-right me-1"></i>{mat.mode_gap}
            </div>
          )}
          {(mat.next_level_requirements || []).length > 0 && (
            <div><div className="fw-medium small mb-1">To reach next level:</div>{mat.next_level_requirements.map((r: string, i: number) => <div key={i} className="text-muted small"><i className="bi bi-arrow-right me-1" style={{ color: 'var(--color-primary-light)' }}></i>{r}</div>)}</div>
          )}
        </Section>

        {/* 8: Execution Plan (dynamic from backend) */}
        <Section num={8} title="Execution Plan">
          {(() => {
            const steps = p.execution_plan || [];
            if (steps.length === 0) return <div className="text-muted small"><i className="bi bi-check-circle me-1" style={{ color: 'var(--color-success)' }}></i>No actions needed — system is fully built.</div>;
            const firstAvailable = steps.findIndex((s: any) => !s.blocked);
            return steps.map((s: any, i: number) => {
              const isNext = i === firstAvailable;
              return (
              <div key={s.key} className="mb-3 pb-3" style={{ borderBottom: i < steps.length - 1 ? '1px dashed var(--color-border)' : 'none', background: isNext ? '#eff6ff' : 'transparent', borderRadius: isNext ? 8 : 0, padding: isNext ? 12 : 0 }}>
                {isNext && <div className="mb-2"><span className="badge" style={{ background: 'var(--color-info)', color: '#fff', fontSize: 9 }}><i className="bi bi-star-fill me-1"></i>Recommended Next Step</span></div>}
                <div className="d-flex align-items-start gap-3">
                  <div className="text-center" style={{ flexShrink: 0 }}>
                    <span className="badge rounded-circle d-flex align-items-center justify-content-center" style={{ width: 28, height: 28, background: s.blocked ? '#e2e8f0' : isNext ? 'var(--color-info)' : 'var(--color-primary)', color: s.blocked ? '#9ca3af' : '#fff', fontSize: 12 }}>{s.step}</span>
                    {i < steps.length - 1 && <div style={{ width: 2, height: 20, background: '#e2e8f0', margin: '4px auto' }}></div>}
                  </div>
                  <div className="flex-grow-1">
                    <div className="d-flex justify-content-between align-items-start">
                      <div>
                        <div className="fw-semibold" style={{ fontSize: 13, color: s.blocked ? '#9ca3af' : 'var(--color-primary)' }}>
                          {s.label}
                          <span className="badge ms-2" style={{ background: '#10b98120', color: 'var(--color-success)', fontSize: 9 }}>{s.impact}</span>
                        </div>
                        <div className="text-muted" style={{ fontSize: 10 }}>Depends on: {s.depends_on}</div>
                      </div>
                      <button className="btn btn-sm btn-outline-primary" disabled={s.blocked} onClick={() => setPredictionAction({ type: s.prompt_target, label: s.label })} style={{ fontSize: 10, padding: '2px 8px' }}>
                        <i className="bi bi-eye me-1"></i>Preview
                      </button>
                    </div>
                    <div className="d-flex gap-3 mt-1" style={{ fontSize: 10 }}>
                      <span style={{ color: 'var(--color-success)' }}><i className="bi bi-check-circle me-1"></i>Fixes: {s.fixes.join(', ')}</span>
                      <span style={{ color: 'var(--color-info)' }}><i className="bi bi-unlock me-1"></i>Enables: {s.enables.join(', ')}</span>
                    </div>
                    {s.blocked && <div style={{ fontSize: 9, color: 'var(--color-danger)' }} className="mt-1"><i className="bi bi-lock me-1"></i>{s.block_reason || 'Blocked'}</div>}
                  </div>
                </div>
              </div>
            );});
          })()}
        </Section>
        </>)}

        {/* Resync Results Modal */}
        {resyncModal && (
          <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => { setResyncModal(null); onUpdate(); }}>
            <div className="modal-dialog modal-dialog-centered" onClick={e => e.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header py-2" style={{ borderBottom: `3px solid ${resyncModal.what_changed?.status === 'complete' ? 'var(--color-success)' : resyncModal.what_changed?.status === 'incomplete' ? 'var(--color-warning)' : 'var(--color-info)'}` }}>
                  <h6 className="modal-title fw-bold" style={{ color: 'var(--color-primary)' }}>
                    <i className="bi bi-arrow-repeat me-2"></i>Resync Complete
                  </h6>
                  <button className="btn-close" onClick={() => { setResyncModal(null); onUpdate(); }}></button>
                </div>
                <div className="modal-body">
                  {/* Last Step Verification */}
                  {resyncModal.what_changed && (
                    <div className="mb-3 p-2" style={{ background: resyncModal.what_changed.status === 'complete' ? '#10b98110' : '#f59e0b10', borderRadius: 8, border: `1px solid ${resyncModal.what_changed.status === 'complete' ? '#10b98130' : '#f59e0b30'}` }}>
                      <div className="fw-medium small">
                        {resyncModal.what_changed.status === 'complete' ? (
                          <><i className="bi bi-check-circle me-1" style={{ color: 'var(--color-success)' }}></i>Last step verified: {resyncModal.what_changed.last_step}</>
                        ) : (
                          <><i className="bi bi-exclamation-triangle me-1" style={{ color: 'var(--color-warning)' }}></i>Last step incomplete: {resyncModal.what_changed.last_step}</>
                        )}
                      </div>
                      {resyncModal.what_changed.missing?.length > 0 && (
                        <div className="mt-1 text-muted" style={{ fontSize: 10 }}>
                          Missing: {resyncModal.what_changed.missing.map((f: string) => f.split('/').pop()).join(', ')}
                        </div>
                      )}
                    </div>
                  )}

                  {/* LLM Summary */}
                  {resyncModal.summary && (
                    <div className="mb-3 p-2" style={{ background: 'var(--color-bg-alt)', borderRadius: 8, border: '1px solid var(--color-border)' }}>
                      <p className="mb-0 small" style={{ color: 'var(--color-text)', lineHeight: 1.5 }}>{resyncModal.summary}</p>
                    </div>
                  )}

                  {/* KPI Changes */}
                  <h6 className="fw-semibold small mb-2">What Changed</h6>
                  <div className="table-responsive">
                    <table className="table table-sm mb-0" style={{ fontSize: 12 }}>
                      <thead className="table-light">
                        <tr><th>Metric</th><th className="text-end">Before</th><th className="text-end">After</th><th className="text-end">Change</th></tr>
                      </thead>
                      <tbody>
                        {[
                          { label: 'Verified Reqs', before: resyncModal.before.verified, after: resyncModal.after.verified },
                          { label: 'Matched Reqs', before: resyncModal.before.matched, after: resyncModal.after.matched },
                          { label: 'System Readiness', before: resyncModal.before.readiness, after: resyncModal.after.readiness, unit: '%' },
                          { label: 'Quality Score', before: resyncModal.before.quality, after: resyncModal.after.quality, unit: '%' },
                          { label: 'Maturity Level', before: resyncModal.before.maturity, after: resyncModal.after.maturity, prefix: 'L' },
                          { label: 'Gaps', before: resyncModal.before.gaps, after: resyncModal.after.gaps },
                        ].map(row => {
                          const delta = row.after - row.before;
                          const color = row.label === 'Gaps' ? (delta < 0 ? 'var(--color-success)' : delta > 0 ? 'var(--color-danger)' : '#9ca3af') : (delta > 0 ? 'var(--color-success)' : delta < 0 ? 'var(--color-danger)' : '#9ca3af');
                          return (
                            <tr key={row.label}>
                              <td>{row.label}</td>
                              <td className="text-end text-muted">{row.prefix || ''}{row.before}{row.unit || ''}</td>
                              <td className="text-end fw-medium">{row.prefix || ''}{row.after}{row.unit || ''}</td>
                              <td className="text-end fw-bold" style={{ color }}>{delta > 0 ? '+' : ''}{delta}{row.unit || ''}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Resync Stats */}
                  {resyncModal.resync && (
                    <div className="mt-3 d-flex gap-3 text-muted" style={{ fontSize: 10 }}>
                      <span>{resyncModal.resync.matched} matched</span>
                      <span>{resyncModal.resync.partial} partial</span>
                      <span>{resyncModal.resync.unmatched} unmapped</span>
                      <span>{resyncModal.resync.files_scanned} files scanned</span>
                    </div>
                  )}
                </div>
                <div className="modal-footer py-2 d-flex justify-content-between align-items-center">
                  <div className="d-flex align-items-center gap-2 flex-grow-1 me-3">
                    <i className="bi bi-robot" style={{ color: 'var(--color-primary)', fontSize: 14 }}></i>
                    <input className="form-control form-control-sm" style={{ fontSize: 11 }}
                      placeholder="Want to improve this? Tell the Architect..."
                      onKeyDown={(e: any) => { if (e.key === 'Enter' && e.target.value.trim()) { setResyncModal(null); onUpdate(); /* ArchitectChat picks up via global state */ } }} />
                  </div>
                  <button className="btn btn-sm btn-primary" onClick={() => { setResyncModal(null); onUpdate(); }}>
                    <i className="bi bi-arrow-right me-1"></i>Continue
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Prediction Modal */}
        {predictionAction && (
          <PredictionModal processId={processId} actionType={predictionAction.type} actionLabel={predictionAction.label} onClose={() => setPredictionAction(null)} onResync={async () => {
            // Trigger the same resync flow as the header Resync button
            setResyncing(true);
            const before = {
              matched: p.matched_requirements || 0, verified: p.verified_requirements || 0,
              readiness: p.metrics?.system_readiness || 0, quality: p.metrics?.quality_score || 0,
              maturity: p.maturity?.level || 1, gaps: p.gap_count || 0,
            };
            try {
              const r = await bpApi.resyncProcess(processId);
              const afterRes = await bpApi.getProcess(processId);
              const after = afterRes.data;
              setResyncModal({
                before, after: {
                  matched: after.matched_requirements || 0, verified: after.verified_requirements || 0,
                  readiness: after.metrics?.system_readiness || 0, quality: after.metrics?.quality_score || 0,
                  maturity: after.maturity?.level || 1, gaps: after.gap_count || 0,
                }, resync: r.data?.resync, what_changed: r.data?.what_changed, summary: r.data?.summary,
              });
              setP(after);
            } catch {} finally { setResyncing(false); }
          }} />
        )}
        </div>
        {/* Right: System Intelligence Panel (30%) — hidden for page BPs */}
        {!isPageBP && (
          <div style={{ flex: '0 0 30%', minWidth: 280 }} className="d-none d-lg-block">
            <SystemIntelligencePanel links={links} usability={u} metrics={m} repoUrl={repoUrl} />
          </div>
        )}
       </div>
      </div>
    </div>
  );
}
