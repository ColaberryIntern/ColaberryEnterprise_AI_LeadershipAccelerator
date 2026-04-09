import React, { useEffect, useState, useCallback } from 'react';
// react-router-dom Link removed — no longer used in this file
import portalApi from '../../utils/portalApi';
import ProjectHeader from '../../components/project/ProjectHeader';
import ProjectProgress from '../../components/project/ProjectProgress';
import ProjectNextActionPanel from '../../components/project/ProjectNextActionPanel';
import WarRoomTab from '../../components/project/WarRoomTab';
import ProjectLockInScreen from '../../components/project/ProjectLockInScreen';
import ProjectSelectionScreen from '../../components/project/ProjectSelectionScreen';
import WorkstationLauncher from '../../components/project/WorkstationLauncher';
import ProjectSetupWizard from '../../components/project/ProjectSetupWizard';
import CapabilityGrid from '../../components/project/CapabilityGrid';
import RepoComponentsPanel from '../../components/project/RepoComponentsPanel';
import PortalBusinessProcessesTab from '../../components/project/PortalBusinessProcessesTab';

// Execution Overview — capability grid + repo analysis
function ExecutionOverview() {
  const [repoData, setRepoData] = useState<any>(null);

  useEffect(() => {
    portalApi.get('/api/portal/project/execution-status')
      .then(res => setRepoData(res.data?.repo))
      .catch(() => {});
  }, []);

  return (
    <>
      <CapabilityGrid />
      <div className="mt-4">
        <RepoComponentsPanel repo={repoData} />
      </div>
    </>
  );
}

interface ProjectData {
  id: string;
  organization_name?: string;
  industry?: string;
  project_stage: string;
  primary_business_problem?: string;
  selected_use_case?: string;
  automation_goal?: string;
  data_sources?: any;
  project_variables?: Record<string, any>;
  github_repo_url?: string;
  portfolio_url?: string;
  executive_summary?: string;
  portfolio_updated_at?: string;
  executive_updated_at?: string;
  maturity_score?: number;
  portfolio_cache?: any;
  requirements_completion_pct?: number;
  readiness_score_breakdown?: any;
  setup_status?: {
    requirements_loaded: boolean;
    claude_md_loaded: boolean;
    github_connected: boolean;
    activated: boolean;
  } | null;
  created_at: string;
  updated_at: string;
}

type TabKey = 'overview' | 'business-processes' | 'execution' | 'code-intelligence' | 'system-evolution';

function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Requirements Tab
// ---------------------------------------------------------------------------
function RequirementsTab() {
  const [reqData, setReqData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [extractStep, setExtractStep] = useState('');
  const [extractProgress, setExtractProgress] = useState(0);
  const [extractResult, setExtractResult] = useState<any>(null);
  const [matching, setMatching] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [filterProcess, setFilterProcess] = useState('');

  const loadRequirements = useCallback(() => {
    setLoading(true);
    portalApi.get('/api/portal/project/requirements/map')
      .then(res => setReqData(res.data))
      .catch(() => setReqData(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadRequirements(); }, [loadRequirements]);

  const handleExtract = async () => {
    setExtracting(true);
    setExtractResult(null);
    setExtractStep('Parsing requirements document...');
    setExtractProgress(20);
    try {
      setExtractStep('Extracting & clustering requirements...');
      setExtractProgress(50);
      const res = await portalApi.post('/api/portal/project/requirements/extract');
      setExtractProgress(90);
      setExtractStep(`Done — ${res.data.total} requirements extracted${res.data.clustered ? ' & clustered into capabilities' : ''}`);
      setExtractResult(res.data);
      setExtractProgress(100);
      loadRequirements();
    } catch (err: any) {
      setExtractStep('');
      setExtractProgress(0);
      alert(err.response?.data?.error || 'Extract failed');
    } finally {
      setTimeout(() => { setExtracting(false); setExtractProgress(0); setExtractStep(''); }, 3000);
    }
  };

  const handleMatch = async () => {
    setMatching(true);
    try {
      await portalApi.post('/api/portal/project/requirements/match');
      loadRequirements();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Match failed');
    } finally { setMatching(false); }
  };

  if (loading) return <div className="text-center py-4"><div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Loading...</span></div></div>;

  const statusBadge = (status: string) => {
    const map: Record<string, string> = { matched: 'bg-success', verified: 'bg-primary', partial: 'bg-warning text-dark', unmatched: 'bg-secondary' };
    return <span className={`badge ${map[status] || 'bg-secondary'}`}>{status}</span>;
  };

  return (
    <>
      <div className="d-flex gap-2 mb-3 align-items-center">
        <button className="btn btn-sm btn-primary" onClick={handleExtract} disabled={extracting}>
          {extracting ? <><span className="spinner-border spinner-border-sm me-1"></span>Extracting...</> : <><i className="bi bi-file-earmark-text me-1"></i>Extract Requirements</>}
        </button>
        <button className="btn btn-sm btn-outline-primary" onClick={handleMatch} disabled={matching || extracting}>
          {matching ? <><span className="spinner-border spinner-border-sm me-1"></span>Matching...</> : <><i className="bi bi-github me-1"></i>Match to Repo</>}
        </button>
      </div>

      {/* Progress bar during extraction */}
      {(extracting || extractStep) && (
        <div className="card border-0 shadow-sm mb-3">
          <div className="card-body p-3">
            <div className="d-flex justify-content-between small mb-1">
              <span className="text-muted">{extractStep}</span>
              <span className="fw-medium">{extractProgress}%</span>
            </div>
            <div className="progress" style={{ height: 6 }}>
              <div className="progress-bar" style={{
                width: `${extractProgress}%`,
                background: extractProgress >= 100 ? 'var(--color-accent)' : 'var(--color-primary-light)',
                transition: 'width 0.5s ease',
              }} />
            </div>
            {extractResult && (
              <div className="mt-2 small" style={{ color: 'var(--color-accent)' }}>
                <i className="bi bi-check-circle me-1"></i>
                {extractResult.total} requirements extracted
                {extractResult.clustered && ' and grouped into capabilities'}
              </div>
            )}
          </div>
        </div>
      )}

      {reqData && reqData.total > 0 ? (() => {
        const allReqs = reqData.requirements || [];
        const processNames = [...new Set(allReqs.map((r: any) => r.capability_name || 'Unassigned').filter(Boolean))].sort() as string[];
        const filtered = allReqs.filter((r: any) => {
          const textMatch = !filterText || (r.requirement_text || '').toLowerCase().includes(filterText.toLowerCase()) || (r.requirement_key || '').toLowerCase().includes(filterText.toLowerCase());
          const procMatch = !filterProcess || (r.capability_name || 'Unassigned') === filterProcess;
          return textMatch && procMatch;
        });
        return (
          <>
            <div className="d-flex gap-3 mb-3 flex-wrap align-items-center">
              <div className="small"><strong>{reqData.total}</strong> total</div>
              <div className="small text-success"><strong>{reqData.matched + (reqData.verified || 0)}</strong> matched</div>
              <div className="small text-warning"><strong>{reqData.partial}</strong> partial</div>
              <div className="small text-muted"><strong>{reqData.unmatched}</strong> unmatched</div>
            </div>
            {/* Filters */}
            <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
              <input type="text" className="form-control form-control-sm" placeholder="Search requirements..." value={filterText} onChange={e => setFilterText(e.target.value)} style={{ maxWidth: 250, fontSize: 12 }} />
              <select className="form-select form-select-sm" value={filterProcess} onChange={e => setFilterProcess(e.target.value)} style={{ maxWidth: 250, fontSize: 12 }}>
                <option value="">All Business Processes</option>
                {processNames.map((n: string) => <option key={n} value={n}>{n}</option>)}
              </select>
              {(filterText || filterProcess) && <button className="btn btn-sm btn-link text-muted" onClick={() => { setFilterText(''); setFilterProcess(''); }}>Clear</button>}
              <span className="text-muted small ms-auto">{filtered.length} shown</span>
            </div>
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="table-light">
                  <tr>
                    <th className="small">Key</th>
                    <th className="small">Requirement</th>
                    <th className="small">Business Process</th>
                    <th className="small">Status</th>
                    <th className="small">Confidence</th>
                    <th className="small">Files</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 100).map((r: any) => (
                    <tr key={r.id}>
                      <td className="small fw-medium">{r.requirement_key}</td>
                      <td className="small" style={{ maxWidth: 350 }}>{r.requirement_text}</td>
                      <td className="small"><span className="badge bg-light text-dark" style={{ fontSize: 9 }}>{r.capability_name || 'Unassigned'}</span></td>
                      <td>{statusBadge(r.status)}</td>
                      <td className="small">{r.confidence_score != null ? `${Math.round(r.confidence_score * 100)}%` : '-'}</td>
                      <td className="small text-muted">{(r.github_file_paths || []).length > 0 ? `${r.github_file_paths.length} files` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length > 100 && <div className="text-muted small text-center py-2">Showing first 100 of {filtered.length} results</div>}
            </div>
          </>
        );
      })() : (
        <div className="text-center py-4">
          <i className="bi bi-file-earmark-text d-block mb-2" style={{ fontSize: 28, color: 'var(--color-text-light)' }}></i>
          <p className="text-muted small mb-2">No requirements extracted yet.</p>
          <p className="text-muted small">Click <strong>Extract Requirements</strong> to parse your uploaded requirements document into trackable items.</p>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// GitHub Tab
// ---------------------------------------------------------------------------
function GitHubTab() {
  const [ghData, setGhData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [commitLimit, setCommitLimit] = useState(5);
  const [selectedCommit, setSelectedCommit] = useState<any>(null);

  const loadStatus = useCallback(() => {
    setLoading(true);
    portalApi.get(`/api/portal/project/github/status?limit=${commitLimit}`)
      .then(res => setGhData(res.data))
      .catch(() => setGhData(null))
      .finally(() => setLoading(false));
  }, [commitLimit]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await portalApi.post('/api/portal/project/github/sync');
      loadStatus();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Sync failed');
    } finally { setSyncing(false); }
  };

  if (loading) return <div className="text-center py-4"><div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Loading...</span></div></div>;

  if (!ghData?.connected) {
    return <div className="text-center py-4 text-muted small">No GitHub repository connected.</div>;
  }

  const commits = ghData.recent_commits || [];
  const repoBase = ghData.repo_url?.replace(/\.git$/, '');

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <strong className="small">Repository:</strong>{' '}
          <a href={ghData.repo_url} target="_blank" rel="noopener noreferrer" className="small">
            <i className="bi bi-github me-1"></i>{ghData.repo_owner}/{ghData.repo_name}
          </a>
        </div>
        <button className="btn btn-sm btn-outline-primary" onClick={handleSync} disabled={syncing}>
          {syncing ? <><span className="spinner-border spinner-border-sm me-1" style={{ width: 12, height: 12 }}></span>Syncing...</> : <><i className="bi bi-arrow-repeat me-1"></i>Sync Now</>}
        </button>
      </div>

      <div className="row g-3 mb-4">
        {[
          { value: ghData.file_count || 0, label: 'Files', icon: 'bi-file-earmark-code', color: 'var(--color-primary)' },
          { value: ghData.language || '-', label: 'Language', icon: 'bi-braces', color: 'var(--color-accent)' },
          { value: ghData.total_commits || commits.length, label: 'Total Commits', icon: 'bi-git', color: '#8b5cf6' },
          { value: ghData.last_sync ? formatTimeAgo(ghData.last_sync) : 'Never', label: 'Last Sync', icon: 'bi-clock', color: '#f59e0b' },
        ].map(card => (
          <div key={card.label} className="col-md-3">
            <div className="card border-0 shadow-sm">
              <div className="card-body text-center py-3">
                <i className={`bi ${card.icon} d-block mb-1`} style={{ fontSize: 18, color: card.color }}></i>
                <div className="fw-bold" style={{ fontSize: 18, color: card.color }}>{card.value}</div>
                <div className="text-muted" style={{ fontSize: 10 }}>{card.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Commit Timeline */}
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white d-flex justify-content-between align-items-center py-2">
          <span className="fw-semibold small"><i className="bi bi-git me-2"></i>Commit History</span>
          <span className="text-muted" style={{ fontSize: 10 }}>Showing {commits.length} of {ghData.total_commits || commits.length}</span>
        </div>
        <div className="card-body p-0">
          {commits.map((c: any, i: number) => {
            const commitDate = c.date ? new Date(c.date) : null;
            const timeAgo = commitDate ? formatTimeAgo(c.date) : '';
            const dateStr = commitDate ? commitDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
            const timeStr = commitDate ? commitDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';

            return (
              <div key={i} className="d-flex align-items-start gap-3 px-3 py-2" style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer', transition: 'background 0.15s' }}
                onClick={() => setSelectedCommit(c)}
                onMouseEnter={e => (e.currentTarget.style.background = '#f7fafc')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                {/* Timeline dot */}
                <div className="d-flex flex-column align-items-center" style={{ width: 20, flexShrink: 0 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: i === 0 ? '#10b981' : '#cbd5e1', marginTop: 4 }}></div>
                  {i < commits.length - 1 && <div style={{ width: 2, flexGrow: 1, background: '#e2e8f0', minHeight: 20 }}></div>}
                </div>
                {/* Content */}
                <div className="flex-grow-1" style={{ minWidth: 0 }}>
                  <div className="d-flex justify-content-between align-items-start">
                    <div style={{ minWidth: 0 }}>
                      <div className="fw-medium" style={{ fontSize: 12 }}>{c.message}</div>
                      <div className="d-flex gap-2 mt-1" style={{ fontSize: 10 }}>
                        <span className="text-muted"><i className="bi bi-person me-1"></i>{c.author || 'Unknown'}</span>
                        <code style={{ color: 'var(--color-primary-light)', background: '#eef2ff', padding: '0 4px', borderRadius: 3 }}>{c.sha}</code>
                        {c.files_changed > 0 && <span className="text-muted"><i className="bi bi-file-diff me-1"></i>{c.files_changed} files</span>}
                      </div>
                    </div>
                    <div className="text-end text-muted" style={{ fontSize: 10, flexShrink: 0, marginLeft: 8 }}>
                      <div>{timeAgo}</div>
                      <div>{dateStr} {timeStr}</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {ghData.has_more && (
          <div className="card-footer bg-white text-center py-2">
            <button className="btn btn-sm btn-link text-muted" onClick={() => setCommitLimit(prev => prev + 10)} style={{ fontSize: 11 }}>
              <i className="bi bi-chevron-down me-1"></i>Load More Commits
            </button>
          </div>
        )}
      </div>

      {/* Commit Detail Modal */}
      {selectedCommit && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setSelectedCommit(null)}>
          <div className="modal-dialog modal-dialog-centered" onClick={e => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header py-2">
                <h6 className="modal-title fw-semibold" style={{ fontSize: 13 }}><i className="bi bi-git me-2"></i>Commit Details</h6>
                <button className="btn-close" onClick={() => setSelectedCommit(null)}></button>
              </div>
              <div className="modal-body">
                <div className="fw-medium mb-2">{selectedCommit.message}</div>
                <div className="d-flex gap-3 mb-3 text-muted" style={{ fontSize: 11 }}>
                  <span><i className="bi bi-person me-1"></i>{selectedCommit.author || 'Unknown'}</span>
                  <span><i className="bi bi-clock me-1"></i>{selectedCommit.date ? new Date(selectedCommit.date).toLocaleString() : '-'}</span>
                  <code style={{ color: 'var(--color-primary-light)' }}>{selectedCommit.sha}</code>
                </div>
                {repoBase && (
                  <a href={`${repoBase}/commit/${selectedCommit.sha}`} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-primary mb-3" style={{ fontSize: 11 }}>
                    <i className="bi bi-github me-1"></i>View on GitHub
                  </a>
                )}
                <div className="border-top pt-2">
                  <div className="fw-medium small mb-1">What This Commit Likely Contains:</div>
                  <div className="text-muted small">
                    {selectedCommit.message?.toLowerCase().includes('agent') && <div><i className="bi bi-cpu me-1" style={{ color: '#8b5cf6' }}></i>Agent implementation</div>}
                    {selectedCommit.message?.toLowerCase().includes('service') && <div><i className="bi bi-gear me-1" style={{ color: '#3b82f6' }}></i>Backend service</div>}
                    {selectedCommit.message?.toLowerCase().includes('route') && <div><i className="bi bi-signpost me-1" style={{ color: '#f59e0b' }}></i>API route</div>}
                    {selectedCommit.message?.toLowerCase().includes('model') && <div><i className="bi bi-database me-1" style={{ color: '#10b981' }}></i>Database model</div>}
                    {selectedCommit.message?.toLowerCase().includes('ui') || selectedCommit.message?.toLowerCase().includes('page') || selectedCommit.message?.toLowerCase().includes('frontend') ? <div><i className="bi bi-layout-wtf me-1" style={{ color: '#ec4899' }}></i>Frontend UI</div> : null}
                    {selectedCommit.message?.toLowerCase().includes('fix') && <div><i className="bi bi-wrench me-1" style={{ color: '#ef4444' }}></i>Bug fix</div>}
                    {selectedCommit.message?.toLowerCase().includes('test') && <div><i className="bi bi-check2-square me-1" style={{ color: '#06b6d4' }}></i>Tests</div>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Compile Tab
// ---------------------------------------------------------------------------
function CompileTab() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [compiling, setCompiling] = useState<string | null>(null);
  const [compiledDoc, setCompiledDoc] = useState<string | null>(null);

  const loadStatus = useCallback(() => {
    setLoading(true);
    portalApi.get('/api/portal/project/compile/status')
      .then(res => setStatus(res.data))
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleCompile = async (docType: string) => {
    setCompiling(docType);
    setCompiledDoc(null);
    try {
      const res = await portalApi.post('/api/portal/project/compile', { document_type: docType });
      setCompiledDoc(res.data.document);
      loadStatus();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Compilation failed');
    } finally { setCompiling(null); }
  };

  const handleCompileAll = async () => {
    setCompiling('all');
    try {
      await portalApi.post('/api/portal/project/compile/all');
      loadStatus();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Compilation failed');
    } finally { setCompiling(null); }
  };

  if (loading) return <div className="text-center py-4"><div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Loading...</span></div></div>;

  const [selectedDoc, setSelectedDoc] = useState<{ type: string; content: string } | null>(null);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);

  const docTypes = ['requirements', 'claude_md', 'system_prompt', 'interaction_protocol'] as const;
  const docLabels: Record<string, string> = {
    requirements: 'Requirements Document',
    claude_md: 'CLAUDE.md',
    system_prompt: 'System Prompt',
    interaction_protocol: 'Interaction Protocol',
  };
  const docIcons: Record<string, string> = {
    requirements: 'bi-file-earmark-text', claude_md: 'bi-file-code',
    system_prompt: 'bi-terminal', interaction_protocol: 'bi-chat-dots',
  };

  const handleOpenDoc = async (dt: string) => {
    try {
      const res = await portalApi.post('/api/portal/project/compile', { document_type: dt });
      setSelectedDoc({ type: dt, content: res.data.document || '' });
      setEditContent(res.data.document || '');
    } catch { setSelectedDoc({ type: dt, content: 'Failed to load document.' }); setEditContent(''); }
  };

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <p className="small text-muted mb-0">System documents compiled from your project. Click to view, edit, or replace.</p>
        <button className="btn btn-sm btn-primary" onClick={handleCompileAll} disabled={!!compiling}>
          {compiling === 'all' ? 'Compiling All...' : 'Compile All'}
        </button>
      </div>

      <div className="row g-3 mb-3">
        {docTypes.map(dt => {
          const docStatus = status?.documents?.[dt];
          return (
            <div key={dt} className="col-md-6">
              <div className="card border-0 shadow-sm h-100" style={{ cursor: 'pointer' }} onClick={() => handleOpenDoc(dt)}>
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <h6 className="fw-semibold mb-0"><i className={`bi ${docIcons[dt]} me-2`}></i>{docLabels[dt]}</h6>
                    <button className="btn btn-sm btn-outline-primary" onClick={e => { e.stopPropagation(); handleCompile(dt); }} disabled={!!compiling}>
                      {compiling === dt ? 'Compiling...' : 'Compile'}
                    </button>
                  </div>
                  <div className="small text-muted">
                    Sources: {docStatus?.sourceArtifactsAvailable || 0} / {docStatus?.sourceArtifactsTotal || 0} available
                  </div>
                  <div className="small text-muted mt-1"><i className="bi bi-eye me-1"></i>Click to view & edit</div>
                  {docStatus?.lastCompiled && (
                    <div className="small text-muted">
                      Last compiled: {formatTimeAgo(docStatus.lastCompiled)}
                    </div>
                  )}
                  {!docStatus?.canCompile && (
                    <div className="small text-warning mt-1">No source artifacts available</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {compiledDoc && (
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white fw-semibold small d-flex justify-content-between">
            <span>Compiled Output</span>
            <button className="btn btn-sm btn-outline-secondary" onClick={() => setCompiledDoc(null)}>Close</button>
          </div>
          <div className="card-body">
            <pre className="small mb-0" style={{ whiteSpace: 'pre-wrap', maxHeight: 400, overflow: 'auto' }}>{compiledDoc}</pre>
          </div>
        </div>
      )}

      {/* Document drill-down modal */}
      {selectedDoc && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setSelectedDoc(null)}>
          <div className="modal-dialog modal-lg modal-dialog-scrollable" onClick={e => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <h6 className="modal-title fw-semibold"><i className={`bi ${docIcons[selectedDoc.type]} me-2`}></i>{docLabels[selectedDoc.type]}</h6>
                <button className="btn-close" onClick={() => setSelectedDoc(null)}></button>
              </div>
              <div className="modal-body">
                <textarea className="form-control form-control-sm" rows={20} value={editContent} onChange={e => setEditContent(e.target.value)}
                  style={{ fontFamily: 'monospace', fontSize: 11, resize: 'vertical' }} />
              </div>
              <div className="modal-footer">
                <button className="btn btn-sm btn-outline-secondary" onClick={() => setSelectedDoc(null)}>Cancel</button>
                <button className="btn btn-sm btn-outline-primary" onClick={() => { navigator.clipboard.writeText(editContent); }}>
                  <i className="bi bi-clipboard me-1"></i>Copy
                </button>
                <button className="btn btn-sm btn-primary" disabled={saving} onClick={async () => {
                  setSaving(true);
                  try {
                    if (selectedDoc.type === 'requirements') {
                      await portalApi.post('/api/portal/project/setup/requirements', { content: editContent });
                    } else if (selectedDoc.type === 'claude_md') {
                      await portalApi.post('/api/portal/project/setup/claude-md', { content: editContent });
                    }
                    setSelectedDoc(null);
                    loadStatus();
                    const el = document.createElement('div');
                    el.innerHTML = '<div style="position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999;background:#1a365d;color:#fff;padding:10px 16px;border-radius:8px;font-size:12px">Document saved</div>';
                    document.body.appendChild(el); setTimeout(() => el.remove(), 2500);
                  } catch { alert('Save failed'); } finally { setSaving(false); }
                }}>
                  {saving ? 'Saving...' : <><i className="bi bi-check-circle me-1"></i>Save & Replace</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Readiness Tab
// ---------------------------------------------------------------------------
function ReadinessTab() {
  const [progress, setProgress] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadProgress = useCallback(() => {
    setLoading(true);
    portalApi.get('/api/portal/project/progress')
      .then(res => setProgress(res.data))
      .catch(() => setProgress(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadProgress(); }, [loadProgress]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await portalApi.post('/api/portal/project/progress/refresh');
      setProgress(res.data);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Refresh failed');
    } finally { setRefreshing(false); }
  };

  if (loading) return <div className="text-center py-4"><div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Loading...</span></div></div>;

  if (!progress) {
    return <div className="text-center py-4 text-muted small">Unable to load progress data.</div>;
  }

  const bd = progress.breakdown;
  const scoreColor = (s: number) => s >= 0.7 ? 'var(--color-accent)' : s >= 0.4 ? '#f59e0b' : 'var(--color-secondary)';

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6 className="fw-semibold mb-0">Production Readiness</h6>
        <button className="btn btn-sm btn-outline-primary" onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? 'Refreshing...' : 'Refresh Scores'}
        </button>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-md-6">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center py-4">
              <div className="fs-1 fw-bold" style={{ color: scoreColor(progress.productionReadinessScore / 100) }}>
                {progress.productionReadinessScore}%
              </div>
              <div className="text-muted small">Production Readiness Score</div>
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center py-4">
              <div className="fs-1 fw-bold" style={{ color: scoreColor(progress.requirementsCompletionPct / 100) }}>
                {progress.requirementsCompletionPct}%
              </div>
              <div className="text-muted small">Requirements Completion</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-semibold small">Score Breakdown</div>
        <div className="card-body p-0">
          <table className="table table-hover mb-0">
            <thead className="table-light">
              <tr>
                <th className="small">Category</th>
                <th className="small">Score</th>
                <th className="small">Weight</th>
                <th className="small">Details</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="small fw-medium">Artifact Completion</td>
                <td className="small">{Math.round(bd.artifactCompletion.score * 100)}%</td>
                <td className="small text-muted">25%</td>
                <td className="small text-muted">{bd.artifactCompletion.submitted} / {bd.artifactCompletion.required} submitted</td>
              </tr>
              <tr>
                <td className="small fw-medium">Requirements Coverage</td>
                <td className="small">{Math.round(bd.requirementsCoverage.score * 100)}%</td>
                <td className="small text-muted">25%</td>
                <td className="small text-muted">{bd.requirementsCoverage.matched} / {bd.requirementsCoverage.total} matched</td>
              </tr>
              <tr>
                <td className="small fw-medium">GitHub Health</td>
                <td className="small">{Math.round(bd.githubHealth.score * 100)}%</td>
                <td className="small text-muted">20%</td>
                <td className="small text-muted">
                  {bd.githubHealth.hasRepo ? 'Connected' : 'No repo'}{' '}
                  {bd.githubHealth.hasRecentCommits ? '| Active' : ''}{' '}
                  | {bd.githubHealth.fileCount} files
                </td>
              </tr>
              <tr>
                <td className="small fw-medium">Portfolio Quality</td>
                <td className="small">{Math.round(bd.portfolioQuality.score * 100)}%</td>
                <td className="small text-muted">20%</td>
                <td className="small text-muted">{bd.portfolioQuality.scoredCount} scored submissions, avg {Math.round(bd.portfolioQuality.avgScore)}%</td>
              </tr>
              <tr>
                <td className="small fw-medium">Workflow Progress</td>
                <td className="small">{Math.round(bd.workflowProgress.score * 100)}%</td>
                <td className="small text-muted">10%</td>
                <td className="small text-muted">Stage: {bd.workflowProgress.stage} ({bd.workflowProgress.stageIndex + 1}/{bd.workflowProgress.totalStages})</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Add Business Process Card — NLP input for System Evolution
// ---------------------------------------------------------------------------
function AddBusinessProcessCard({ onAdded }: { onAdded: () => void }) {
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleAdd = async () => {
    if (!input.trim()) return;
    setAdding(true);
    try {
      const res = await portalApi.post('/api/portal/project/business-processes/add', { description: input });
      setResult(res.data);
      setInput('');
      setTimeout(() => { setResult(null); onAdded(); }, 2000);
    } catch (err: any) {
      setResult({ error: err.response?.data?.error || 'Failed to add process' });
    } finally { setAdding(false); }
  };

  return (
    <div className="card border-0 shadow-sm mb-4">
      <div className="card-body">
        <h6 className="fw-semibold small mb-2"><i className="bi bi-plus-circle me-2" style={{ color: 'var(--color-accent)' }}></i>Add Business Process</h6>
        <p className="text-muted small mb-3">Describe what you want to add. The system will create a new business process with requirements.</p>
        <div className="d-flex gap-2">
          <input type="text" className="form-control form-control-sm" placeholder="e.g., I want automated email onboarding for new customers..."
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            style={{ fontSize: 12 }} />
          <button className="btn btn-sm btn-primary" onClick={handleAdd} disabled={adding || !input.trim()} style={{ whiteSpace: 'nowrap' }}>
            {adding ? <><span className="spinner-border spinner-border-sm me-1" style={{ width: 12, height: 12 }}></span>Adding...</> : <><i className="bi bi-plus-lg me-1"></i>Add</>}
          </button>
        </div>
        {result && (
          <div className={`mt-2 small ${result.error ? 'text-danger' : 'text-success'}`}>
            {result.error ? <><i className="bi bi-exclamation-triangle me-1"></i>{result.error}</> : <><i className="bi bi-check-circle me-1"></i>Process "{result.name}" created with {result.requirements_count || 0} requirements</>}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Project Mode Selector — set project-wide target mode
// ---------------------------------------------------------------------------
function ProjectModeSelector() {
  const [mode, setMode] = useState<string>('production');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    portalApi.get('/api/portal/project/business-processes')
      .then(res => {
        const procs = res.data || [];
        if (procs.length > 0 && procs[0].effective_mode) setMode(procs[0].effective_mode);
      }).catch(() => {});
  }, []);

  const handleChange = async (newMode: string) => {
    setSaving(true);
    try {
      await portalApi.put('/api/portal/project/target-mode', { mode: newMode });
      setMode(newMode);
    } catch {} finally { setSaving(false); }
  };

  const modes = [
    { value: 'mvp', label: 'MVP', desc: 'L2 · 60% coverage', color: 'var(--color-warning, #f59e0b)' },
    { value: 'production', label: 'Production', desc: 'L3 · 90% coverage', color: 'var(--color-info, #3b82f6)' },
    { value: 'enterprise', label: 'Enterprise', desc: 'L4 · 95% coverage', color: 'var(--color-purple, #6366f1)' },
    { value: 'autonomous', label: 'Autonomous', desc: 'L5 · 98% coverage', color: 'var(--color-accent, #38a169)' },
  ];

  return (
    <div className="card border-0 shadow-sm mb-3">
      <div className="card-body p-3">
        <div className="d-flex justify-content-between align-items-center">
          <div>
            <span className="fw-semibold small" style={{ color: 'var(--color-primary)' }}>
              <i className="bi bi-sliders me-2"></i>Project Target Mode
            </span>
            <span className="text-muted ms-2" style={{ fontSize: 10 }}>Controls completion criteria for all processes</span>
          </div>
          <div className="btn-group btn-group-sm">
            {modes.map(m => (
              <button
                key={m.value}
                className={`btn btn-sm ${mode === m.value ? 'btn-primary' : 'btn-outline-secondary'}`}
                style={{ fontSize: 10, padding: '3px 10px' }}
                onClick={() => handleChange(m.value)}
                disabled={saving}
                title={m.desc}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Readiness KPI Bar — compact version of ReadinessTab for Overview
// ---------------------------------------------------------------------------
function ReadinessKPIBar() {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    Promise.all([
      portalApi.get('/api/portal/project/progress').catch(() => ({ data: null })),
      portalApi.get('/api/portal/project/warroom').catch(() => ({ data: null })),
    ]).then(([progRes, wrRes]) => {
      const prog = progRes.data;
      const wr = wrRes.data;
      setData({
        readiness: prog ? Math.round(prog.productionReadinessScore) : 0,
        requirements: prog ? Math.round(prog.requirementsCompletionPct) : 0,
        health: wr?.risk?.health?.health_score ? Math.round(wr.risk.health.health_score * 100) : 0,
        velocity: wr?.risk?.health?.velocity_score ? Math.round(wr.risk.health.velocity_score * 100) : 0,
        stability: wr?.risk?.health?.stability_score ? Math.round(wr.risk.health.stability_score * 100) : 0,
      });
    });
  }, []);

  if (!data) return null;

  const kpis = [
    { label: 'Readiness', value: data.readiness, color: data.readiness >= 70 ? '#10b981' : data.readiness >= 40 ? '#f59e0b' : '#ef4444' },
    { label: 'Requirements', value: data.requirements, color: data.requirements >= 70 ? '#10b981' : data.requirements >= 40 ? '#f59e0b' : '#ef4444' },
    { label: 'Health', value: data.health, color: data.health >= 70 ? '#10b981' : data.health >= 40 ? '#f59e0b' : '#ef4444' },
    { label: 'Velocity', value: data.velocity, color: data.velocity >= 50 ? '#10b981' : data.velocity >= 20 ? '#f59e0b' : '#ef4444' },
    { label: 'Stability', value: data.stability, color: data.stability >= 70 ? '#10b981' : data.stability >= 40 ? '#f59e0b' : '#ef4444' },
  ];

  return (
    <div className="row g-2 mb-4">
      {kpis.map(k => (
        <div key={k.label} className="col">
          <div className="card border-0 shadow-sm text-center py-2">
            <div className="fw-bold" style={{ fontSize: 22, color: k.color }}>{k.value}%</div>
            <div className="text-muted" style={{ fontSize: 10 }}>{k.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Project System Prompt — editable on Overview tab
// ---------------------------------------------------------------------------
function ProjectSystemPromptCard() {
  const [prompt, setPrompt] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    portalApi.get('/api/portal/project/system-prompt')
      .then(res => {
        const d = res.data;
        setPrompt(d.system_prompt || `${d.organization_name || 'Our organization'} is building ${d.selected_use_case || 'an AI system'} to solve: ${d.primary_business_problem || 'business challenges'}. Industry: ${d.industry || 'Technology'}. Goal: ${d.automation_goal || 'Automate key processes'}.`);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await portalApi.put('/api/portal/project/system-prompt', { system_prompt: prompt });
      setEditing(false);
    } catch {} finally { setSaving(false); }
  };

  if (!loaded) return null;

  return (
    <div className="card border-0 shadow-sm mb-4">
      <div className="card-header bg-white d-flex justify-content-between align-items-center py-2">
        <span className="fw-semibold small"><i className="bi bi-file-text me-2"></i>Project System Prompt</span>
        {!editing ? (
          <button className="btn btn-sm btn-outline-primary" style={{ fontSize: 10 }} onClick={() => setEditing(true)}>
            <i className="bi bi-pencil me-1"></i>Edit
          </button>
        ) : (
          <div className="d-flex gap-1">
            <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: 10 }} onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn btn-sm btn-primary" style={{ fontSize: 10 }} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </div>
      <div className="card-body py-2 px-3">
        {editing ? (
          <textarea className="form-control form-control-sm" rows={4} value={prompt} onChange={e => setPrompt(e.target.value)}
            style={{ fontSize: 12, fontFamily: 'inherit', resize: 'vertical', minHeight: 80 }}
            placeholder="Describe who this project is for, what you're building, and what you're trying to accomplish..." />
        ) : (
          <p className="text-muted small mb-0" style={{ whiteSpace: 'pre-wrap', maxHeight: 60, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as any }}>{prompt}</p>
        )}
        <div className="text-muted mt-1" style={{ fontSize: 9 }}>This context is included in all Learn prompts so the AI mentor understands your project.</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Next Business Process Action — shows top priority process to work on
// ---------------------------------------------------------------------------
function NextBusinessProcessAction({ onNavigate }: { onNavigate: () => void }) {
  const [topProcess, setTopProcess] = useState<any>(null);
  useEffect(() => {
    portalApi.get('/api/portal/project/business-processes')
      .then(res => {
        const procs = res.data || [];
        // Find first incomplete process (already sorted by priority from backend)
        const next = procs.find((p: any) => !p.is_complete) || procs[0] || null;
        setTopProcess(next);
      })
      .catch(() => {});
  }, []);

  if (!topProcess) return null;

  const m = topProcess.metrics || {};
  const mat = topProcess.maturity || {};
  const readiness = m.system_readiness || 0;
  const u = topProcess.usability || {};

  return (
    <div className="card border-0 shadow-sm mb-4">
      <div className="card-body p-3">
        <div className="d-flex justify-content-between align-items-start">
          <div>
            <div className="text-muted small mb-1">
              <i className="bi bi-flag me-1"></i>Next Business Process
              {topProcess.priority_rank && <span className="badge bg-primary ms-2" style={{ fontSize: 9 }}>#{topProcess.priority_rank}</span>}
            </div>
            <h6 className="fw-bold mb-1" style={{ color: 'var(--color-primary)' }}>{topProcess.name}</h6>
            <div className="d-flex gap-3 text-muted" style={{ fontSize: 11 }}>
              <span>{topProcess.total_requirements || 0} requirements</span>
              <span>Readiness: {readiness}%</span>
              <span>L{mat.level || 1} {mat.label || 'Prototype'}</span>
              <span style={{ color: u.usable ? '#10b981' : '#ef4444' }}>{u.usable ? 'Usable' : 'Not Ready'}</span>
            </div>
          </div>
          <button className="btn btn-sm btn-primary" onClick={onNavigate}>
            <i className="bi bi-arrow-right me-1"></i>Start Work
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard Component
// ---------------------------------------------------------------------------
function ProjectDashboard() {
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Persist active tab in URL hash
  const getInitialTab = (): TabKey => {
    const hash = window.location.hash.replace('#', '');
    const valid: TabKey[] = ['overview', 'business-processes', 'execution', 'code-intelligence', 'system-evolution'];
    return valid.includes(hash as TabKey) ? (hash as TabKey) : 'overview';
  };
  const [activeTab, setActiveTabState] = useState<TabKey>(getInitialTab);
  const setActiveTab = (tab: TabKey) => { setActiveTabState(tab); window.location.hash = tab; };

  useEffect(() => {
    portalApi.get('/api/portal/project')
      .then(res => setProject(res.data))
      .catch(err => {
        if (err.response?.status === 404) {
          setError('no-project');
        } else {
          setError(err.response?.data?.error || 'Failed to load project');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border" style={{ color: 'var(--color-primary)' }} role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (error === 'no-project') {
    return <ProjectSetupWizard onActivated={() => window.location.reload()} />;
  }

  if (error || !project) {
    return <div className="alert alert-danger">{error || 'Failed to load project.'}</div>;
  }

  // Show setup wizard if project exists but not yet activated (user-driven flow)
  if (project.setup_status && !project.setup_status.activated) {
    return <ProjectSetupWizard initialStatus={project.setup_status} onActivated={() => window.location.reload()} />;
  }

  const variables = project.project_variables || {};
  const tabs: Array<{ key: TabKey; label: string; icon: string }> = [
    { key: 'overview', label: 'Overview', icon: 'bi-speedometer2' },
    { key: 'business-processes', label: 'Business Processes', icon: 'bi-diagram-3' },
    { key: 'execution', label: 'Execution', icon: 'bi-activity' },
    { key: 'code-intelligence', label: 'Code Intelligence', icon: 'bi-code-slash' },
    { key: 'system-evolution', label: 'System Evolution', icon: 'bi-rocket-takeoff' },
  ];

  return (
    <>
      <ProjectHeader
        organizationName={project.organization_name}
        industry={project.industry}
        projectStage={project.project_stage}
        selectedUseCase={project.selected_use_case}
        primaryBusinessProblem={project.primary_business_problem}
      />

      <ProjectProgress currentStage={project.project_stage} />

      {/* Next Action: highest priority business process */}
      <NextBusinessProcessAction onNavigate={() => setActiveTab('business-processes')} />

      <nav className="nav nav-tabs mb-4">
        {tabs.map(t => (
          <button
            key={t.key}
            className={`nav-link${activeTab === t.key ? ' active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            <i className={`bi ${t.icon} me-1`}></i>{t.label}
          </button>
        ))}
      </nav>

      {activeTab === 'overview' && (
        <>
          {/* Project Mode Selector */}
          <ProjectModeSelector />
          {/* KPI Bar — merged from Readiness */}
          <ReadinessKPIBar />
          <ProjectSystemPromptCard />
          <ExecutionOverview />
        </>
      )}

      {activeTab === 'business-processes' && <PortalBusinessProcessesTab />}

      {activeTab === 'execution' && <WarRoomTab />}

      {activeTab === 'code-intelligence' && (
        <>
          <GitHubTab />
          <div className="mt-4"><RequirementsTab /></div>
        </>
      )}

      {activeTab === 'system-evolution' && (
        <div>
          <h6 className="fw-bold mb-3" style={{ color: 'var(--color-primary)' }}><i className="bi bi-rocket-takeoff me-2"></i>System Evolution</h6>
          <p className="text-muted small mb-4">Grow your system by adding new capabilities or managing existing documents.</p>

          {/* Add Business Process */}
          <AddBusinessProcessCard onAdded={() => setActiveTab('business-processes')} />

          {/* System Documents */}
          <div className="card border-0 shadow-sm mb-3">
            <div className="card-body">
              <h6 className="fw-semibold small mb-2"><i className="bi bi-file-earmark-code me-2"></i>System Documents</h6>
              <p className="text-muted small mb-3">Compile and manage your project documents.</p>
              <div className="row g-3">
                {['Requirements', 'CLAUDE.md', 'System Prompt', 'Interaction Protocol'].map(doc => (
                  <div key={doc} className="col-md-6">
                    <div className="card border h-100" style={{ cursor: 'pointer' }}>
                      <div className="card-body py-3">
                        <div className="fw-medium small">{doc}</div>
                        <div className="text-muted" style={{ fontSize: 10 }}>Click to compile and edit</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default ProjectDashboard;
