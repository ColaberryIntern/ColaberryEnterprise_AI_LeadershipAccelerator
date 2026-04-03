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
import RequirementsSectionBreakdown from '../../components/project/RequirementsSectionBreakdown';
import RepoComponentsPanel from '../../components/project/RepoComponentsPanel';

// Execution Overview — fetches from /execution-status and renders requirements-driven dashboard
function ExecutionOverview() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    portalApi.get('/api/portal/project/execution-status')
      .then(res => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-3"><div className="spinner-border spinner-border-sm"></div></div>;
  if (!data) return null;

  return (
    <>
      {data.progress && (
        <RequirementsSectionBreakdown
          sections={data.progress.sections || []}
          requirements={data.progress.requirements || []}
          completionPct={data.progress.completion_percentage || 0}
          nextAction={data.progress.next_action}
        />
      )}
      <div className="mt-4">
        <RepoComponentsPanel repo={data.repo} />
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

type TabKey = 'overview' | 'requirements' | 'github' | 'compile' | 'readiness' | 'warroom' | 'contract' | 'discover';

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
  const [matching, setMatching] = useState(false);

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
    try {
      await portalApi.post('/api/portal/project/requirements/extract');
      loadRequirements();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Extract failed');
    } finally { setExtracting(false); }
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
      <div className="d-flex gap-2 mb-3">
        <button className="btn btn-sm btn-outline-primary" onClick={handleExtract} disabled={extracting}>
          {extracting ? 'Extracting...' : 'Extract Requirements'}
        </button>
        <button className="btn btn-sm btn-outline-primary" onClick={handleMatch} disabled={matching}>
          {matching ? 'Matching...' : 'Match to Repo'}
        </button>
      </div>

      {reqData && reqData.total > 0 ? (
        <>
          <div className="d-flex gap-3 mb-3 flex-wrap">
            <div className="small"><strong>{reqData.total}</strong> total</div>
            <div className="small text-success"><strong>{reqData.matched + (reqData.verified || 0)}</strong> matched</div>
            <div className="small text-warning"><strong>{reqData.partial}</strong> partial</div>
            <div className="small text-muted"><strong>{reqData.unmatched}</strong> unmatched</div>
            <div className="small"><strong>{Math.round((reqData.overallScore || 0) * 100)}%</strong> coverage</div>
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th className="small">Key</th>
                  <th className="small">Requirement</th>
                  <th className="small">Status</th>
                  <th className="small">Confidence</th>
                  <th className="small">Files</th>
                </tr>
              </thead>
              <tbody>
                {(reqData.requirements || []).map((r: any) => (
                  <tr key={r.id}>
                    <td className="small fw-medium">{r.requirement_key}</td>
                    <td className="small" style={{ maxWidth: 400 }}>{r.requirement_text}</td>
                    <td>{statusBadge(r.status)}</td>
                    <td className="small">{r.confidence_score != null ? `${Math.round(r.confidence_score * 100)}%` : '-'}</td>
                    <td className="small text-muted">{(r.github_file_paths || []).length > 0 ? `${r.github_file_paths.length} files` : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="text-center py-4 text-muted small">
          No requirements extracted yet. Compile your requirements document first, then click "Extract Requirements".
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

  const loadStatus = useCallback(() => {
    setLoading(true);
    portalApi.get('/api/portal/project/github/status')
      .then(res => setGhData(res.data))
      .catch(() => setGhData(null))
      .finally(() => setLoading(false));
  }, []);

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
    return (
      <div className="text-center py-4 text-muted small">
        No GitHub repository connected. Connect a repo through your project settings.
      </div>
    );
  }

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <strong className="small">Repository:</strong>{' '}
          <a href={ghData.repo_url} target="_blank" rel="noopener noreferrer" className="small">{ghData.repo_owner}/{ghData.repo_name}</a>
        </div>
        <button className="btn btn-sm btn-outline-primary" onClick={handleSync} disabled={syncing}>
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>

      <div className="row g-3 mb-3">
        <div className="col-md-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center py-3">
              <div className="fs-4 fw-bold" style={{ color: 'var(--color-primary)' }}>{ghData.file_count || 0}</div>
              <div className="text-muted small">Files</div>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center py-3">
              <div className="fs-4 fw-bold" style={{ color: 'var(--color-accent)' }}>{ghData.language || '-'}</div>
              <div className="text-muted small">Language</div>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center py-3">
              <div className="fs-4 fw-bold" style={{ color: 'var(--color-primary)' }}>{(ghData.recent_commits || []).length}</div>
              <div className="text-muted small">Recent Commits</div>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center py-3">
              <div className="fs-6 fw-bold" style={{ color: 'var(--color-primary)' }}>{ghData.last_sync ? formatTimeAgo(ghData.last_sync) : 'Never'}</div>
              <div className="text-muted small">Last Sync</div>
            </div>
          </div>
        </div>
      </div>

      {ghData.recent_commits?.length > 0 && (
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white fw-semibold small">Recent Commits</div>
          <div className="card-body p-0">
            <div className="list-group list-group-flush">
              {ghData.recent_commits.map((c: any, i: number) => (
                <div key={i} className="list-group-item d-flex justify-content-between align-items-start py-2">
                  <div>
                    <code className="small me-2">{c.sha}</code>
                    <span className="small">{c.message}</span>
                  </div>
                  <div className="text-muted small text-nowrap">{c.date ? new Date(c.date).toLocaleDateString() : ''}</div>
                </div>
              ))}
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

  const docTypes = ['requirements', 'claude_md', 'system_prompt', 'interaction_protocol'] as const;
  const docLabels: Record<string, string> = {
    requirements: 'Requirements',
    claude_md: 'CLAUDE.md',
    system_prompt: 'System Prompt',
    interaction_protocol: 'Interaction Protocol',
  };

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <p className="small text-muted mb-0">Compile your project artifacts into system documents.</p>
        <button className="btn btn-sm btn-primary" onClick={handleCompileAll} disabled={!!compiling}>
          {compiling === 'all' ? 'Compiling All...' : 'Compile All'}
        </button>
      </div>

      <div className="row g-3 mb-3">
        {docTypes.map(dt => {
          const docStatus = status?.documents?.[dt];
          return (
            <div key={dt} className="col-md-6">
              <div className="card border-0 shadow-sm h-100">
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <h6 className="fw-semibold mb-0">{docLabels[dt]}</h6>
                    <button
                      className="btn btn-sm btn-outline-primary"
                      onClick={() => handleCompile(dt)}
                      disabled={!!compiling}
                    >
                      {compiling === dt ? 'Compiling...' : 'Compile'}
                    </button>
                  </div>
                  <div className="small text-muted">
                    Sources: {docStatus?.sourceArtifactsAvailable || 0} / {docStatus?.sourceArtifactsTotal || 0} available
                  </div>
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
// Main Dashboard Component
// ---------------------------------------------------------------------------
function ProjectDashboard() {
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

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
    { key: 'overview', label: 'Overview', icon: 'bi-grid' },
    { key: 'readiness', label: 'Readiness', icon: 'bi-speedometer2' },
    { key: 'requirements', label: 'Requirements', icon: 'bi-list-check' },
    { key: 'github', label: 'GitHub', icon: 'bi-github' },
    { key: 'compile', label: 'System Validation', icon: 'bi-shield-check' },
    { key: 'warroom', label: 'War Room', icon: 'bi-activity' },
    { key: 'contract', label: 'Design Contract', icon: 'bi-file-earmark-code' },
    { key: 'discover', label: 'Project Selection', icon: 'bi-lightbulb' },
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

      <ProjectNextActionPanel />

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
          <div className="mb-4">
            <WorkstationLauncher />
          </div>
          <ExecutionOverview />
        </>
      )}

      {activeTab === 'readiness' && <ReadinessTab />}
      {activeTab === 'requirements' && <RequirementsTab />}
      {activeTab === 'github' && <GitHubTab />}
      {activeTab === 'compile' && <CompileTab />}
      {activeTab === 'warroom' && <WarRoomTab />}
      {activeTab === 'contract' && <ProjectLockInScreen />}
      {activeTab === 'discover' && <ProjectSelectionScreen onSelected={() => setActiveTab('contract')} />}
    </>
  );
}

export default ProjectDashboard;
