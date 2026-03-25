import { useState, useEffect, useCallback } from 'react';
import {
  getOpenclawDashboard,
  getOpenclawResponses,
  getOpenclawConfig,
  updateOpenclawConfig,
  approveOpenclawResponse,
  rejectOpenclawResponse,
  markOpenclawResponsePosted,
  submitOpenclawSignal,
  generateLinkedInPost,
  getOpenclawAgentActivity,
  OpenclawDashboard,
  OpenclawResponseItem,
  OpenclawAgentActivity,
} from '../../../../services/openclawApi';
import {
  getAuthorityContent,
  generateAuthorityContent,
  approveAuthorityContent,
  markAuthorityContentPosted,
  getEngagements,
  createEngagement,
  getResponseQueue,
  approveResponse,
  rejectResponse,
  markResponsePosted,
  getLinkedInActions,
  completeLinkedInAction,
  skipLinkedInAction,
  type AuthorityContentItem,
  type EngagementEventItem,
  type ResponseQueueItem,
  type LinkedInActionItem,
} from '../../../../services/openclawReputationApi';

const PLATFORM_COLORS: Record<string, string> = {
  reddit: '#FF4500',
  hackernews: '#FF6600',
  linkedin: '#0A66C2',
  devto: '#0A0A0A',
  quora: '#B92B27',
  medium: '#00AB6C',
  hashnode: '#2962FF',
  discourse: '#FFC107',
};

const STATUS_BADGES: Record<string, string> = {
  draft: 'warning',
  approved: 'info',
  ready_to_post: 'primary',
  posted: 'success',
  failed: 'danger',
  removed: 'secondary',
};

const RESULT_BADGES: Record<string, string> = {
  success: 'success',
  failed: 'danger',
  skipped: 'secondary',
  pending: 'warning',
  flagged: 'info',
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatMs(ms: number | null): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

type SelectedAgent = OpenclawDashboard['agents'][number];

export default function OpenclawTab() {
  const [dashboard, setDashboard] = useState<OpenclawDashboard | null>(null);
  const [responses, setResponses] = useState<OpenclawResponseItem[]>([]);
  const [responsesTotal, setResponsesTotal] = useState(0);
  const [responsePage, setResponsePage] = useState(1);
  const responsesPerPage = 25;
  const [loading, setLoading] = useState(true);
  const [responseFilter, setResponseFilter] = useState('');
  const [markPostedUrl, setMarkPostedUrl] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Governance controls state
  const [requireApproval, setRequireApproval] = useState(true);
  const [autoPostDevto, setAutoPostDevto] = useState(false);
  const [activePlatforms, setActivePlatforms] = useState<string[]>(['reddit', 'hackernews', 'devto', 'hashnode', 'discourse']);
  const [savingConfig, setSavingConfig] = useState<string | null>(null);

  // Manual URL submission state
  const [submitUrl, setSubmitUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string } | null>(null);

  // LinkedIn post generator state
  const [linkedinTopic, setLinkedinTopic] = useState('');
  const [generatingLinkedin, setGeneratingLinkedin] = useState(false);
  const [linkedinResult, setLinkedinResult] = useState<{ success: boolean; message: string } | null>(null);

  // Response detail drill-down state
  const [selectedResponse, setSelectedResponse] = useState<OpenclawResponseItem | null>(null);

  // Agent drill-down state
  const [selectedAgent, setSelectedAgent] = useState<SelectedAgent | null>(null);
  const [agentActivity, setAgentActivity] = useState<OpenclawAgentActivity[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityFilter, setActivityFilter] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const params: Record<string, string> = { page: String(responsePage), limit: String(responsesPerPage) };
      if (responseFilter) params.post_status = responseFilter;
      const [dashRes, respRes] = await Promise.all([
        getOpenclawDashboard(),
        getOpenclawResponses(params),
      ]);
      setDashboard(dashRes.data);
      setResponses(respRes.data.responses || []);
      setResponsesTotal(respRes.data.total || 0);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [responseFilter, responsePage]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Load governance config on mount
  useEffect(() => {
    getOpenclawConfig().then(res => {
      const agents = res.data.agents || [];
      const content = agents.find((a: any) => a.agent_name === 'OpenclawContentResponseAgent');
      const worker = agents.find((a: any) => a.agent_name === 'OpenclawBrowserWorkerAgent');
      const scanner = agents.find((a: any) => a.agent_name === 'OpenclawMarketSignalAgent');
      if (content?.config?.require_approval !== undefined) setRequireApproval(content.config.require_approval);
      if (worker) setAutoPostDevto(worker.enabled);
      if (scanner?.config?.platforms) setActivePlatforms(scanner.config.platforms);
    }).catch(() => {});
  }, []);

  const handleToggleApproval = async () => {
    setSavingConfig('approval');
    try {
      await updateOpenclawConfig({ agent_name: 'OpenclawContentResponseAgent', config: { require_approval: !requireApproval } });
      setRequireApproval(!requireApproval);
    } catch { /* ignore */ }
    setSavingConfig(null);
  };

  const handleToggleAutoPost = async () => {
    setSavingConfig('autopost');
    try {
      await updateOpenclawConfig({ agent_name: 'OpenclawBrowserWorkerAgent', enabled: !autoPostDevto });
      setAutoPostDevto(!autoPostDevto);
    } catch { /* ignore */ }
    setSavingConfig(null);
  };

  const handleTogglePlatform = async (platform: string) => {
    setSavingConfig(`platform-${platform}`);
    const updated = activePlatforms.includes(platform)
      ? activePlatforms.filter(p => p !== platform)
      : [...activePlatforms, platform];
    try {
      await updateOpenclawConfig({ agent_name: 'OpenclawMarketSignalAgent', config: { platforms: updated } });
      setActivePlatforms(updated);
    } catch { /* ignore */ }
    setSavingConfig(null);
  };

  const handleSubmitUrl = async () => {
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const res = await submitOpenclawSignal(submitUrl.trim());
      setSubmitResult({ success: true, message: `Signal created for "${res.data.signal.title?.slice(0, 60) || 'URL'}". Response will appear in the queue shortly.` });
      setSubmitUrl('');
      setTimeout(fetchData, 3000);
    } catch (err: any) {
      setSubmitResult({ success: false, message: err?.response?.data?.error || 'Failed to submit URL' });
    }
    setSubmitting(false);
  };

  const handleGenerateLinkedIn = async () => {
    setGeneratingLinkedin(true);
    setLinkedinResult(null);
    try {
      const res = await generateLinkedInPost(linkedinTopic.trim());
      setLinkedinResult({ success: true, message: `LinkedIn post generated (${res.data.short_id}). Check the response queue to review and copy.` });
      setLinkedinTopic('');
      setTimeout(fetchData, 2000);
    } catch (err: any) {
      setLinkedinResult({ success: false, message: err?.response?.data?.error || 'Failed to generate post' });
    }
    setGeneratingLinkedin(false);
  };

  const handleAgentClick = useCallback(async (agent: SelectedAgent) => {
    setSelectedAgent(agent);
    setActivityLoading(true);
    setActivityFilter('');
    try {
      const res = await getOpenclawAgentActivity(agent.id);
      setAgentActivity(res.data.activities || []);
      setActivityTotal(res.data.total || 0);
    } catch {
      setAgentActivity([]);
      setActivityTotal(0);
    }
    setActivityLoading(false);
  }, []);

  const fetchActivity = useCallback(async (agentId: string, result?: string) => {
    setActivityLoading(true);
    try {
      const params: Record<string, string> = {};
      if (result) params.result = result;
      const res = await getOpenclawAgentActivity(agentId, params);
      setAgentActivity(res.data.activities || []);
      setActivityTotal(res.data.total || 0);
    } catch {
      setAgentActivity([]);
    }
    setActivityLoading(false);
  }, []);

  const handleActivityFilterChange = useCallback((val: string) => {
    setActivityFilter(val);
    if (selectedAgent) {
      fetchActivity(selectedAgent.id, val || undefined);
    }
  }, [selectedAgent, fetchActivity]);

  const closeModal = useCallback(() => {
    setSelectedAgent(null);
    setAgentActivity([]);
    setActivityTotal(0);
    setActivityFilter('');
  }, []);

  const handleApprove = async (id: string) => {
    try {
      await approveOpenclawResponse(id);
      fetchData();
    } catch {
      /* ignore */
    }
  };

  const handleReject = async (id: string) => {
    try {
      await rejectOpenclawResponse(id);
      fetchData();
    } catch {
      /* ignore */
    }
  };

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      /* ignore */
    }
  };

  const handleMarkPosted = async (id: string) => {
    if (!markPostedUrl.trim()) return;
    try {
      await markOpenclawResponsePosted(id, markPostedUrl.trim());
      setSelectedResponse(null);
      setMarkPostedUrl('');
      fetchData();
    } catch {
      /* ignore */
    }
  };

  if (loading && !dashboard) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border spinner-border-sm text-primary" role="status">
          <span className="visually-hidden">Loading outreach data...</span>
        </div>
      </div>
    );
  }

  const kpis = dashboard?.kpis;

  return (
    <div className="p-3">
      <h6 className="fw-semibold mb-3">OpenClaw Autonomous Outreach</h6>

      {/* KPI Row */}
      {kpis && (
        <div className="row g-2 mb-4">
          {[
            { label: 'Active Agents', value: kpis.active_agents, color: 'var(--color-primary)' },
            { label: 'Replies Sent', value: kpis.replies_sent, color: 'var(--color-accent)' },
            { label: 'Engagement Score', value: Math.round(kpis.total_engagement_score), color: '#dd6b20' },
            { label: 'CTR', value: `${(kpis.ctr * 100).toFixed(1)}%`, color: '#2b6cb0' },
            { label: 'Reply Rate', value: `${(kpis.reply_rate * 100).toFixed(1)}%`, color: '#805ad5' },
            { label: 'Best Tone', value: kpis.best_tone, color: '#319795', isBadge: true },
            { label: 'Content Pipeline', value: kpis.content_pipeline, color: '#d69e2e' },
            { label: 'Signals (24h)', value: kpis.signals_24h, color: 'var(--color-primary-light)' },
          ].map((kpi: any) => (
            <div key={kpi.label} className="col-6 col-md-3">
              <div className="card border-0 shadow-sm text-center py-2 px-1">
                <div className="fw-bold" style={{ fontSize: kpi.isBadge ? '0.85rem' : '1.3rem', color: kpi.color }}>
                  {kpi.isBadge ? <span className="badge bg-info">{kpi.value}</span> : kpi.value}
                </div>
                <div className="text-muted" style={{ fontSize: '0.65rem' }}>{kpi.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Platform Breakdown */}
      {dashboard?.platforms && dashboard.platforms.length > 0 && (
        <div className="d-flex gap-2 mb-3 flex-wrap">
          {dashboard.platforms.map((p: any) => (
            <span
              key={p.platform}
              className="badge"
              style={{
                backgroundColor: PLATFORM_COLORS[p.platform] || '#718096',
                fontSize: '0.7rem',
              }}
            >
              {p.platform}: {p.count}
            </span>
          ))}
        </div>
      )}

      {/* Content Performance */}
      {dashboard?.performance && (
        <div className="card border-0 shadow-sm mb-4">
          <div
            className="card-header bg-white fw-semibold small d-flex justify-content-between align-items-center"
            style={{ cursor: 'pointer' }}
            onClick={() => {
              const el = document.getElementById('perf-collapse');
              if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
            }}
          >
            Content Performance
            <span className="text-muted" style={{ fontSize: '0.65rem' }}>click to expand</span>
          </div>
          <div id="perf-collapse" style={{ display: 'none' }}>
            {/* Top Responses Leaderboard */}
            {dashboard.performance.top_responses.length > 0 && (
              <div className="card-body p-0 border-bottom">
                <div className="px-3 py-2 fw-medium small text-muted">Top Performing Content</div>
                <div className="table-responsive">
                  <table className="table table-hover mb-0 small">
                    <thead className="table-light">
                      <tr>
                        <th>#</th>
                        <th>Platform</th>
                        <th>Tone</th>
                        <th>Signal</th>
                        <th>Eng. Score</th>
                        <th>Clicks</th>
                        <th>Replies</th>
                        <th>Posted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.performance.top_responses.map((r, i) => (
                        <tr key={r.id}>
                          <td className="fw-bold text-muted">{i + 1}</td>
                          <td>
                            <span className="badge" style={{ backgroundColor: PLATFORM_COLORS[r.platform] || '#718096', fontSize: '0.6rem' }}>
                              {r.platform}
                            </span>
                          </td>
                          <td><span className="badge bg-secondary" style={{ fontSize: '0.55rem' }}>{r.tone}</span></td>
                          <td>
                            <span className="text-truncate d-inline-block" style={{ maxWidth: 180, fontSize: '0.7rem' }} title={r.signal_title}>
                              {r.signal_title || r.content_preview}
                            </span>
                          </td>
                          <td>
                            <span className={`badge bg-${(r.engagement_score || 0) > 5 ? 'success' : (r.engagement_score || 0) > 0 ? 'warning' : 'secondary'}`}>
                              {r.engagement_score || 0}
                            </span>
                          </td>
                          <td>{r.clicks || 0}</td>
                          <td>{r.replies || 0}</td>
                          <td className="text-muted text-nowrap">{timeAgo(r.posted_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tone & Platform Breakdown */}
            <div className="card-body">
              <div className="row">
                {dashboard.performance.tone_breakdown.length > 0 && (
                  <div className="col-md-6 mb-3">
                    <div className="fw-medium small mb-2">Tone Effectiveness</div>
                    {dashboard.performance.tone_breakdown.map((t) => {
                      const maxEng = Math.max(...dashboard!.performance.tone_breakdown.map(x => x.avg_engagement), 1);
                      const pct = (t.avg_engagement / maxEng) * 100;
                      return (
                        <div key={t.tone} className="mb-2">
                          <div className="d-flex justify-content-between" style={{ fontSize: '0.7rem' }}>
                            <span className="fw-medium">{t.tone}</span>
                            <span className="text-muted">avg {t.avg_engagement.toFixed(1)} (n={t.sample_size})</span>
                          </div>
                          <div className="progress" style={{ height: 6 }}>
                            <div className="progress-bar bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {dashboard.performance.platform_breakdown.length > 0 && (
                  <div className="col-md-6 mb-3">
                    <div className="fw-medium small mb-2">Platform Engagement</div>
                    {dashboard.performance.platform_breakdown.map((p) => {
                      const maxEng = Math.max(...dashboard!.performance.platform_breakdown.map(x => x.avg_engagement), 1);
                      const pct = (p.avg_engagement / maxEng) * 100;
                      return (
                        <div key={p.platform} className="mb-2">
                          <div className="d-flex justify-content-between" style={{ fontSize: '0.7rem' }}>
                            <span className="fw-medium">{p.platform}</span>
                            <span className="text-muted">avg {p.avg_engagement.toFixed(1)} (n={p.sample_size})</span>
                          </div>
                          <div className="progress" style={{ height: 6 }}>
                            <div className="progress-bar" style={{ width: `${pct}%`, backgroundColor: PLATFORM_COLORS[p.platform] || '#718096' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Agent Status */}
      {dashboard?.agents && dashboard.agents.length > 0 && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold small">Agent Status — click any row for details</div>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover mb-0 small">
                <thead className="table-light">
                  <tr>
                    <th>Agent</th>
                    <th>Status</th>
                    <th>Enabled</th>
                    <th>Runs</th>
                    <th>Errors</th>
                    <th>Avg Duration</th>
                    <th>Last Run</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.agents.map((agent) => (
                    <tr
                      key={agent.name}
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleAgentClick(agent)}
                    >
                      <td className="fw-medium" style={{ color: 'var(--color-primary-light)' }}>
                        {agent.name.replace(/^Openclaw/, '')}
                      </td>
                      <td>
                        <span className={`badge bg-${agent.status === 'idle' ? 'success' : agent.status === 'running' ? 'primary' : agent.status === 'error' ? 'danger' : 'secondary'}`}>
                          {agent.status}
                        </span>
                      </td>
                      <td>
                        <span className={`badge bg-${agent.enabled ? 'success' : 'secondary'}`}>
                          {agent.enabled ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td>{agent.run_count}</td>
                      <td>{agent.error_count > 0 ? <span className="text-danger fw-medium">{agent.error_count}</span> : '0'}</td>
                      <td className="text-muted">{formatMs(agent.avg_duration_ms)}</td>
                      <td className="text-muted">{timeAgo(agent.last_run_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Governance Controls */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold small">Governance Controls</div>
        <div className="card-body py-3 px-3">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div>
              <div className="fw-medium small">Require Manual Approval</div>
              <div className="text-muted" style={{ fontSize: '0.68rem' }}>When ON, all generated responses start as drafts requiring admin approval before posting.</div>
            </div>
            <div className="form-check form-switch ms-3">
              <input type="checkbox" className="form-check-input" role="switch" checked={requireApproval} onChange={handleToggleApproval} disabled={savingConfig === 'approval'} />
            </div>
          </div>
          <hr className="my-2" />
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div>
              <div className="fw-medium small">Auto-Post (Dev.to, Hashnode, Discourse)</div>
              <div className="text-muted" style={{ fontSize: '0.68rem' }}>When ON, approved responses are posted automatically via API to platforms with configured credentials.</div>
            </div>
            <div className="form-check form-switch ms-3">
              <input type="checkbox" className="form-check-input" role="switch" checked={autoPostDevto} onChange={handleToggleAutoPost} disabled={savingConfig === 'autopost'} />
            </div>
          </div>
          <hr className="my-2" />
          <div>
            <div className="fw-medium small mb-2">Active Scanning Platforms</div>
            <div className="text-muted mb-2" style={{ fontSize: '0.65rem' }}>
              Scan + Auto-Post: Dev.to, Hashnode, Discourse &bull; Scan for Intel Only: Reddit, HN (no links — ban risk)
            </div>
            <div className="d-flex gap-3 flex-wrap">
              {['reddit', 'hackernews', 'devto', 'hashnode', 'discourse'].map(p => {
                const intelOnly = p === 'reddit' || p === 'hackernews';
                const label = p === 'hackernews' ? 'Hacker News' : p === 'devto' ? 'Dev.to' : p === 'hashnode' ? 'Hashnode' : p === 'discourse' ? 'Discourse Forums' : p.charAt(0).toUpperCase() + p.slice(1);
                return (
                  <div className="form-check" key={p}>
                    <input type="checkbox" className="form-check-input" id={`platform-${p}`} checked={activePlatforms.includes(p)} onChange={() => handleTogglePlatform(p)} disabled={savingConfig === `platform-${p}`} />
                    <label className="form-check-label small" htmlFor={`platform-${p}`}>
                      {label}
                      {intelOnly && <span className="badge bg-info ms-1" style={{ fontSize: '0.5rem', verticalAlign: 'middle' }}>Intel</span>}
                    </label>
                  </div>
                );
              })}
              <div className="form-check">
                <input type="checkbox" className="form-check-input" disabled checked={false} />
                <label className="form-check-label small text-muted">Quora <span className="badge bg-secondary ms-1" style={{ fontSize: '0.55rem', verticalAlign: 'middle' }}>Manual Only</span></label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Manual URL Submission */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold small">Submit Question URL <span className="badge bg-secondary ms-2" style={{ fontSize: '0.55rem', verticalAlign: 'middle' }}>Any Platform</span></div>
        <div className="card-body py-3 px-3">
          <div className="text-muted mb-2" style={{ fontSize: '0.68rem' }}>Paste a question URL from any platform. The system will extract the content and generate a response for your review.</div>
          <div className="d-flex gap-2">
            <input type="text" className="form-control form-control-sm" placeholder="https://www.quora.com/What-is-..." value={submitUrl} onChange={e => setSubmitUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitUrl.trim() && !submitting && handleSubmitUrl()} />
            <button className="btn btn-sm btn-primary text-nowrap" onClick={handleSubmitUrl} disabled={!submitUrl.trim() || submitting}>{submitting ? 'Submitting...' : 'Submit'}</button>
          </div>
          {submitResult && (<div className={`alert alert-${submitResult.success ? 'success' : 'danger'} mt-2 py-1 px-2 small mb-0`}>{submitResult.message}</div>)}
        </div>
      </div>

      {/* LinkedIn Post Generator */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold small">
          Generate LinkedIn Post
          <span className="badge ms-2" style={{ fontSize: '0.55rem', verticalAlign: 'middle', backgroundColor: '#0A66C2', color: '#fff' }}>LinkedIn</span>
        </div>
        <div className="card-body py-3 px-3">
          <div className="text-muted mb-2" style={{ fontSize: '0.68rem' }}>Enter a topic or trend. AI generates a practitioner-voice LinkedIn post with a tracked link to your strategy call booking page.</div>
          <div className="d-flex gap-2">
            <input type="text" className="form-control form-control-sm" placeholder="e.g., Why most AI pilots fail at the enterprise level" value={linkedinTopic} onChange={e => setLinkedinTopic(e.target.value)} onKeyDown={e => e.key === 'Enter' && linkedinTopic.trim() && !generatingLinkedin && handleGenerateLinkedIn()} />
            <button className="btn btn-sm btn-primary text-nowrap" onClick={handleGenerateLinkedIn} disabled={!linkedinTopic.trim() || generatingLinkedin}>{generatingLinkedin ? 'Generating...' : 'Generate'}</button>
          </div>
          {linkedinResult && (<div className={`alert alert-${linkedinResult.success ? 'success' : 'danger'} mt-2 py-1 px-2 small mb-0`}>{linkedinResult.message}</div>)}
        </div>
      </div>

      {/* Responses Table */}
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white d-flex justify-content-between align-items-center">
          <span className="fw-semibold small">Recent Responses</span>
          <select
            className="form-select form-select-sm"
            style={{ width: 'auto', fontSize: '0.75rem' }}
            value={responseFilter}
            onChange={(e) => { setResponseFilter(e.target.value); setResponsePage(1); }}
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="approved">Approved</option>
            <option value="ready_to_post">Ready to Post</option>
            <option value="posted">Posted</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover mb-0 small">
              <thead className="table-light">
                <tr>
                  <th>Platform</th>
                  <th>Signal</th>
                  <th>Tone</th>
                  <th>Content</th>
                  <th>Eng.</th>
                  <th>Status</th>
                  <th>Time</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {responses.map((resp) => (
                  <tr
                    key={resp.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedResponse(resp)}
                  >
                    <td>
                      <span
                        className="badge"
                        style={{ backgroundColor: PLATFORM_COLORS[resp.platform] || '#718096', fontSize: '0.65rem' }}
                      >
                        {resp.platform}
                      </span>
                    </td>
                    <td>
                      {resp.signal?.title ? (
                        <span
                          className="text-truncate d-inline-block"
                          style={{ maxWidth: 200, fontSize: '0.75rem', color: 'var(--color-primary-light)' }}
                          title={resp.signal.title}
                        >
                          {resp.signal.title}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td><span className="badge bg-secondary" style={{ fontSize: '0.6rem' }}>{resp.tone}</span></td>
                    <td>
                      <span
                        className="text-truncate d-inline-block text-muted"
                        style={{ maxWidth: 250, fontSize: '0.7rem' }}
                        title={resp.content}
                      >
                        {resp.content}
                      </span>
                    </td>
                    <td>
                      {(() => {
                        const score = resp.engagement_metrics?.engagement_score || 0;
                        const variant = score > 5 ? 'success' : score > 0 ? 'warning' : 'secondary';
                        return <span className={`badge bg-${variant}`} style={{ fontSize: '0.6rem' }}>{score}</span>;
                      })()}
                    </td>
                    <td>
                      <span className={`badge bg-${STATUS_BADGES[resp.post_status] || 'secondary'}`}>
                        {resp.post_status === 'ready_to_post' ? 'Ready' : resp.post_status}
                      </span>
                    </td>
                    <td className="text-muted text-nowrap">{timeAgo(resp.created_at)}</td>
                    <td>
                      {resp.post_status === 'draft' && (
                        <div className="d-flex gap-1">
                          <button
                            className="btn btn-sm btn-outline-success py-0 px-2"
                            onClick={(e) => { e.stopPropagation(); handleApprove(resp.id); }}
                          >
                            Approve
                          </button>
                          <button
                            className="btn btn-sm btn-outline-danger py-0 px-2"
                            onClick={(e) => { e.stopPropagation(); handleReject(resp.id); }}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                      {resp.post_status === 'ready_to_post' && (
                        <button
                          className="btn btn-sm btn-outline-primary py-0 px-2"
                          style={{ fontSize: '0.65rem' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(resp.content);
                            if (resp.signal?.source_url) window.open(resp.signal.source_url, '_blank');
                            setCopiedId(resp.id);
                            setTimeout(() => setCopiedId(null), 2000);
                          }}
                        >
                          {copiedId === resp.id ? 'Copied!' : 'Copy & Open'}
                        </button>
                      )}
                      {resp.post_url && (
                        <a href={resp.post_url} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-primary py-0 px-2" onClick={(e) => e.stopPropagation()}>
                          View
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
                {responses.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-muted text-center py-4">
                      No responses yet — signals will appear once the Market Signal agent runs
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          {responsesTotal > responsesPerPage && (
            <div className="card-footer bg-white d-flex justify-content-between align-items-center py-2">
              <span className="text-muted small">
                Showing {(responsePage - 1) * responsesPerPage + 1}–{Math.min(responsePage * responsesPerPage, responsesTotal)} of {responsesTotal}
              </span>
              <div className="d-flex gap-1">
                <button
                  className="btn btn-sm btn-outline-secondary py-0 px-2"
                  disabled={responsePage <= 1}
                  onClick={() => setResponsePage(p => p - 1)}
                >
                  Prev
                </button>
                {Array.from({ length: Math.min(Math.ceil(responsesTotal / responsesPerPage), 5) }, (_, i) => {
                  const totalPages = Math.ceil(responsesTotal / responsesPerPage);
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (responsePage <= 3) {
                    pageNum = i + 1;
                  } else if (responsePage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = responsePage - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      className={`btn btn-sm py-0 px-2 ${pageNum === responsePage ? 'btn-primary' : 'btn-outline-secondary'}`}
                      onClick={() => setResponsePage(pageNum)}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  className="btn btn-sm btn-outline-secondary py-0 px-2"
                  disabled={responsePage >= Math.ceil(responsesTotal / responsesPerPage)}
                  onClick={() => setResponsePage(p => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══════ Reputation & Demand Engine Sections ══════ */}
      <AuthorityContentSection />
      <EngagementMonitorSection />
      <ResponseQueueSection />
      <LinkedInCommandCenter />

      {/* Response Detail Modal */}
      {selectedResponse && (
        <>
          <div className="modal-backdrop show" style={{ opacity: 0.5 }} onClick={() => setSelectedResponse(null)} />
          <div className="modal show d-block" role="dialog" aria-modal="true" onClick={() => setSelectedResponse(null)}>
            <div className="modal-dialog modal-lg modal-dialog-scrollable" style={{ maxWidth: 800 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header py-2">
                  <h6 className="modal-title fw-semibold mb-0 d-flex align-items-center gap-2">
                    <span className="badge" style={{ backgroundColor: PLATFORM_COLORS[selectedResponse.platform] || '#718096', fontSize: '0.7rem' }}>
                      {selectedResponse.platform}
                    </span>
                    <span className={`badge bg-${STATUS_BADGES[selectedResponse.post_status] || 'secondary'}`} style={{ fontSize: '0.7rem' }}>
                      {selectedResponse.post_status === 'ready_to_post' ? 'Ready to Post' : selectedResponse.post_status}
                    </span>
                    <span className="badge bg-secondary" style={{ fontSize: '0.65rem' }}>{selectedResponse.tone}</span>
                  </h6>
                  <button type="button" className="btn-close btn-close-sm" onClick={() => setSelectedResponse(null)} aria-label="Close" />
                </div>
                <div className="modal-body p-3">
                  {/* Signal / Source Info */}
                  {selectedResponse.signal && (
                    <div className="card border-0 bg-light mb-3">
                      <div className="card-body py-2 px-3">
                        <div className="fw-semibold small mb-1">Original Signal</div>
                        <div className="mb-1">
                          {(() => {
                            const sig = selectedResponse.signal!;
                            const href = sig.source_url?.startsWith('http') ? sig.source_url
                              : sig.title?.startsWith('http') ? sig.title
                              : sig.details?.linkedin_profile || null;
                            const label = sig.title?.startsWith('http')
                              ? (sig.title.length > 80 ? sig.title.slice(0, 80) + '...' : sig.title)
                              : sig.title || sig.source_url;
                            return href ? (
                              <a href={href} target="_blank" rel="noopener noreferrer" className="small fw-medium" style={{ color: 'var(--color-primary-light)' }}>
                                {label}
                                <span className="ms-1" style={{ fontSize: '0.65rem' }}>&#8599;</span>
                              </a>
                            ) : (
                              <span className="small fw-medium">{label}</span>
                            );
                          })()}
                        </div>
                        {selectedResponse.signal.author && (
                          <div style={{ fontSize: '0.72rem' }} className="text-muted mb-1">
                            Author: <strong>{selectedResponse.signal.author}</strong>
                          </div>
                        )}
                        {selectedResponse.signal.content_excerpt && (
                          <div className="mt-1">
                            <div className="text-muted" style={{ fontSize: '0.68rem', fontStyle: 'italic' }}>
                              "{selectedResponse.signal.content_excerpt.slice(0, 300)}{selectedResponse.signal.content_excerpt.length > 300 ? '...' : ''}"
                            </div>
                          </div>
                        )}
                        <div className="d-flex gap-3 mt-2" style={{ fontSize: '0.68rem' }}>
                          {selectedResponse.signal.relevance_score != null && (
                            <span>Relevance: <strong>{(selectedResponse.signal.relevance_score * 100).toFixed(0)}%</strong></span>
                          )}
                          {selectedResponse.signal.engagement_score != null && (
                            <span>Engagement: <strong>{(selectedResponse.signal.engagement_score * 100).toFixed(0)}%</strong></span>
                          )}
                        </div>
                        {selectedResponse.signal.details && Object.keys(selectedResponse.signal.details).length > 0 && (
                          <details className="mt-2">
                            <summary className="text-muted" style={{ fontSize: '0.65rem', cursor: 'pointer' }}>Signal Details</summary>
                            <pre className="bg-white border rounded p-2 mt-1 mb-0" style={{ fontSize: '0.65rem', maxHeight: 120, overflow: 'auto' }}>
                              {JSON.stringify(selectedResponse.signal.details, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Response Content */}
                  <div className="mb-3">
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span className="fw-semibold small">Response Content ({selectedResponse.content.length} chars)</span>
                      <button
                        className={`btn btn-sm py-0 px-2 ${copiedId === selectedResponse.id ? 'btn-success' : 'btn-outline-secondary'}`}
                        onClick={() => handleCopy(selectedResponse.content, selectedResponse.id)}
                      >
                        {copiedId === selectedResponse.id ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <pre className="bg-light border rounded p-2 mb-0" style={{ fontSize: '0.75rem', whiteSpace: 'pre-wrap', maxHeight: 250, overflow: 'auto' }}>
                      {selectedResponse.content}
                    </pre>
                    {/* Post to LinkedIn button */}
                    {selectedResponse.platform === 'linkedin' && selectedResponse.post_status !== 'posted' && (
                      <div className="mt-2">
                        <button
                          className="btn btn-sm text-white fw-medium"
                          style={{ backgroundColor: '#0A66C2' }}
                          onClick={() => {
                            const url = `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(selectedResponse.content)}`;
                            window.open(url, '_blank');
                          }}
                        >
                          <i className="bi bi-linkedin me-1" />
                          Open in LinkedIn
                        </button>
                        <span className="text-muted ms-2" style={{ fontSize: '0.65rem' }}>Opens LinkedIn with post pre-filled — just click Post</span>
                      </div>
                    )}
                  </div>

                  {/* Tracking Info */}
                  {selectedResponse.tracked_url && (
                    <div className="card border-0 bg-light mb-3">
                      <div className="card-body py-2 px-3">
                        <div className="fw-semibold small mb-1">Tracking</div>
                        <div className="d-flex align-items-center gap-2 mb-1">
                          <span className="text-muted small">Tracked URL:</span>
                          <code className="small">{selectedResponse.tracked_url}</code>
                          <button
                            className={`btn btn-sm py-0 px-1 ${copiedId === `url-${selectedResponse.id}` ? 'btn-success' : 'btn-outline-secondary'}`}
                            style={{ fontSize: '0.65rem' }}
                            onClick={() => handleCopy(selectedResponse.tracked_url!, `url-${selectedResponse.id}`)}
                          >
                            {copiedId === `url-${selectedResponse.id}` ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                        {selectedResponse.short_id && (
                          <div style={{ fontSize: '0.68rem' }} className="text-muted">Tag: <code>{selectedResponse.short_id}</code></div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Post Info */}
                  {selectedResponse.post_url && (
                    <div className="mb-3">
                      <span className="fw-semibold small">Posted: </span>
                      <a href={selectedResponse.post_url} target="_blank" rel="noopener noreferrer" className="small">
                        {selectedResponse.post_url} <span style={{ fontSize: '0.65rem' }}>&#8599;</span>
                      </a>
                      {selectedResponse.posted_at && (
                        <span className="text-muted ms-2" style={{ fontSize: '0.68rem' }}>{timeAgo(selectedResponse.posted_at)}</span>
                      )}
                    </div>
                  )}

                  {/* Engagement Metrics */}
                  {selectedResponse.engagement_metrics && Object.keys(selectedResponse.engagement_metrics).length > 0 && (
                    <div className="card border-0 bg-light mb-3">
                      <div className="card-body py-2 px-3">
                        <div className="fw-semibold small mb-1">Engagement Metrics</div>
                        <div className="d-flex gap-3 flex-wrap" style={{ fontSize: '0.72rem' }}>
                          {Object.entries(selectedResponse.engagement_metrics).map(([key, val]) => (
                            <span key={key}>{key}: <strong>{String(val)}</strong></span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Metadata */}
                  <div className="d-flex gap-4 text-muted" style={{ fontSize: '0.68rem' }}>
                    <span>Created: {new Date(selectedResponse.created_at).toLocaleString()}</span>
                    <span>ID: <code style={{ fontSize: '0.6rem' }}>{selectedResponse.id.slice(0, 8)}</code></span>
                  </div>

                  {/* Mark as Posted (for approved/ready_to_post) */}
                  {(selectedResponse.post_status === 'approved' || selectedResponse.post_status === 'ready_to_post') && (
                    <div className="border-top mt-3 pt-3">
                      <div className="fw-semibold small mb-2">Mark as Manually Posted</div>
                      <div className="d-flex align-items-center gap-2">
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          placeholder="Paste the URL where you posted this..."
                          style={{ fontSize: '0.75rem' }}
                          value={markPostedUrl}
                          onChange={(e) => setMarkPostedUrl(e.target.value)}
                        />
                        <button
                          className="btn btn-sm btn-primary py-0 px-3 text-nowrap"
                          disabled={!markPostedUrl.trim()}
                          onClick={() => handleMarkPosted(selectedResponse.id)}
                        >
                          Mark Posted
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="modal-footer py-2">
                  {selectedResponse.post_status === 'draft' && (
                    <div className="me-auto d-flex gap-2">
                      <button className="btn btn-sm btn-outline-success" onClick={() => { handleApprove(selectedResponse.id); setSelectedResponse(null); }}>Approve</button>
                      <button className="btn btn-sm btn-outline-danger" onClick={() => { handleReject(selectedResponse.id); setSelectedResponse(null); }}>Reject</button>
                    </div>
                  )}
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => setSelectedResponse(null)}>Close</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Agent Detail Modal */}
      {selectedAgent && (
        <>
          <div className="modal-backdrop show" style={{ opacity: 0.5 }} onClick={closeModal} />
          <div className="modal show d-block" role="dialog" aria-modal="true" onClick={closeModal}>
            <div
              className="modal-dialog modal-lg modal-dialog-scrollable"
              style={{ maxWidth: 800 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-content">
                <div className="modal-header py-2">
                  <h6 className="modal-title fw-semibold mb-0">
                    {selectedAgent.name.replace(/^Openclaw/, '')} Agent
                  </h6>
                  <button type="button" className="btn-close btn-close-sm" onClick={closeModal} aria-label="Close" />
                </div>
                <div className="modal-body p-3">
                  {/* Agent Overview */}
                  <div className="row g-2 mb-3">
                    <div className="col-6 col-md-3">
                      <div className="card border-0 bg-light text-center py-2 px-1">
                        <div className="fw-bold" style={{ color: 'var(--color-primary)' }}>{selectedAgent.run_count}</div>
                        <div className="text-muted" style={{ fontSize: '0.65rem' }}>Total Runs</div>
                      </div>
                    </div>
                    <div className="col-6 col-md-3">
                      <div className="card border-0 bg-light text-center py-2 px-1">
                        <div className="fw-bold" style={{ color: selectedAgent.error_count > 0 ? '#e53e3e' : 'var(--color-accent)' }}>
                          {selectedAgent.error_count}
                        </div>
                        <div className="text-muted" style={{ fontSize: '0.65rem' }}>Errors</div>
                      </div>
                    </div>
                    <div className="col-6 col-md-3">
                      <div className="card border-0 bg-light text-center py-2 px-1">
                        <div className="fw-bold" style={{ color: '#2b6cb0' }}>{formatMs(selectedAgent.avg_duration_ms)}</div>
                        <div className="text-muted" style={{ fontSize: '0.65rem' }}>Avg Duration</div>
                      </div>
                    </div>
                    <div className="col-6 col-md-3">
                      <div className="card border-0 bg-light text-center py-2 px-1">
                        <span className={`badge bg-${selectedAgent.status === 'idle' ? 'success' : selectedAgent.status === 'running' ? 'primary' : selectedAgent.status === 'error' ? 'danger' : 'secondary'}`}>
                          {selectedAgent.status}
                        </span>
                        <div className="text-muted mt-1" style={{ fontSize: '0.65rem' }}>Status</div>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  {selectedAgent.description && (
                    <p className="text-muted small mb-3">{selectedAgent.description}</p>
                  )}

                  {/* Last Result Summary */}
                  {selectedAgent.last_result && (
                    <div className="card border-0 bg-light mb-3">
                      <div className="card-body py-2 px-3">
                        <div className="fw-semibold small mb-1">Last Execution Result</div>
                        <div style={{ fontSize: '0.75rem' }}>
                          {selectedAgent.last_result.entities_processed != null && (
                            <span className="me-3">Entities: <strong>{selectedAgent.last_result.entities_processed}</strong></span>
                          )}
                          {selectedAgent.last_result.duration_ms != null && (
                            <span className="me-3">Duration: <strong>{formatMs(selectedAgent.last_result.duration_ms)}</strong></span>
                          )}
                          {selectedAgent.last_result.errors && selectedAgent.last_result.errors.length > 0 && (
                            <span className="text-danger">Errors: {selectedAgent.last_result.errors.join(', ')}</span>
                          )}
                          {selectedAgent.last_result.actions_taken && selectedAgent.last_result.actions_taken.length > 0 && (
                            <div className="mt-1">
                              <strong>Actions:</strong>
                              <ul className="mb-0 ps-3" style={{ fontSize: '0.7rem' }}>
                                {selectedAgent.last_result.actions_taken.slice(0, 8).map((a: any, i: number) => (
                                  <li key={i} className="text-muted">
                                    <span className={`badge bg-${RESULT_BADGES[a.result] || 'secondary'} me-1`} style={{ fontSize: '0.6rem' }}>
                                      {a.result}
                                    </span>
                                    {a.action}: {a.reason}
                                  </li>
                                ))}
                                {selectedAgent.last_result.actions_taken.length > 8 && (
                                  <li className="text-muted">...and {selectedAgent.last_result.actions_taken.length - 8} more</li>
                                )}
                              </ul>
                            </div>
                          )}
                          {(!selectedAgent.last_result.actions_taken || selectedAgent.last_result.actions_taken.length === 0) &&
                           (!selectedAgent.last_result.errors || selectedAgent.last_result.errors.length === 0) && (
                            <span className="text-muted">No actions taken in last run</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Config */}
                  {selectedAgent.config && Object.keys(selectedAgent.config).length > 0 && (
                    <details className="mb-3">
                      <summary className="fw-semibold small" style={{ cursor: 'pointer' }}>Configuration</summary>
                      <pre className="bg-light rounded p-2 mt-1 mb-0" style={{ fontSize: '0.7rem', maxHeight: 150, overflow: 'auto' }}>
                        {JSON.stringify(selectedAgent.config, null, 2)}
                      </pre>
                    </details>
                  )}

                  {/* Activity Log */}
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="fw-semibold small">Activity Log ({activityTotal})</span>
                    <select
                      className="form-select form-select-sm"
                      style={{ width: 'auto', fontSize: '0.7rem' }}
                      value={activityFilter}
                      onChange={(e) => handleActivityFilterChange(e.target.value)}
                    >
                      <option value="">All Results</option>
                      <option value="success">Success</option>
                      <option value="failed">Failed</option>
                      <option value="skipped">Skipped</option>
                      <option value="flagged">Flagged</option>
                    </select>
                  </div>

                  {activityLoading ? (
                    <div className="text-center py-3">
                      <div className="spinner-border spinner-border-sm text-primary" role="status">
                        <span className="visually-hidden">Loading activity...</span>
                      </div>
                    </div>
                  ) : agentActivity.length > 0 ? (
                    <div className="table-responsive" style={{ maxHeight: 350, overflow: 'auto' }}>
                      <table className="table table-hover mb-0" style={{ fontSize: '0.72rem' }}>
                        <thead className="table-light sticky-top">
                          <tr>
                            <th>Action</th>
                            <th>Result</th>
                            <th>Reason</th>
                            <th>Confidence</th>
                            <th>Duration</th>
                            <th>Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {agentActivity.map((act) => (
                            <tr key={act.id}>
                              <td className="fw-medium">{act.action}</td>
                              <td>
                                <span className={`badge bg-${RESULT_BADGES[act.result] || 'secondary'}`} style={{ fontSize: '0.6rem' }}>
                                  {act.result}
                                </span>
                              </td>
                              <td>
                                <span
                                  className="text-muted text-truncate d-inline-block"
                                  style={{ maxWidth: 250 }}
                                  title={act.reason || ''}
                                >
                                  {act.reason || '—'}
                                </span>
                              </td>
                              <td>{act.confidence != null ? `${(act.confidence * 100).toFixed(0)}%` : '—'}</td>
                              <td>{formatMs(act.duration_ms)}</td>
                              <td className="text-muted text-nowrap">{timeAgo(act.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-muted text-center py-3 small">
                      No activity recorded yet — the agent will log actions on its next scheduled run
                    </div>
                  )}
                </div>
                <div className="modal-footer py-2">
                  <span className="text-muted me-auto" style={{ fontSize: '0.65rem' }}>
                    Last run: {timeAgo(selectedAgent.last_run_at)}
                  </span>
                  <button className="btn btn-sm btn-outline-secondary" onClick={closeModal}>Close</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Reputation & Demand Engine Sub-Components
// ══════════════════════════════════════════════════════════════════════════════

const INTENT_COLOR = (score: number | null) => {
  if (!score) return 'secondary';
  if (score >= 0.7) return 'danger';
  if (score >= 0.4) return 'warning';
  return 'secondary';
};

const SENIORITY_LABEL: Record<string, string> = {
  c_level: 'C-Level', vp: 'VP', director: 'Director', manager: 'Manager', ic: 'IC', unknown: '—',
};

function AuthorityContentSection() {
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<AuthorityContentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [topic, setTopic] = useState('');
  const [generating, setGenerating] = useState(false);
  const [postUrlInputs, setPostUrlInputs] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAuthorityContent();
      setItems(res.data.authority_content || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { if (expanded) load(); }, [expanded, load]);

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setGenerating(true);
    try {
      await generateAuthorityContent(topic);
      setTopic('');
      load();
    } catch { /* ignore */ }
    setGenerating(false);
  };

  const handleApprove = async (id: string) => {
    await approveAuthorityContent(id);
    load();
  };

  const handleMarkPosted = async (id: string) => {
    const url = postUrlInputs[id];
    if (!url) return;
    await markAuthorityContentPosted(id, url);
    setPostUrlInputs(p => ({ ...p, [id]: '' }));
    load();
  };

  const copyContent = (item: AuthorityContentItem) => {
    navigator.clipboard.writeText(item.content);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="card border-0 shadow-sm mb-3">
      <div
        className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center"
        style={{ cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}
      >
        <span><i className="bi bi-megaphone me-2" />Authority Content Engine</span>
        <i className={`bi bi-chevron-${expanded ? 'up' : 'down'}`} />
      </div>
      {expanded && (
        <div className="card-body p-3">
          {/* Generate bar */}
          <div className="d-flex gap-2 mb-3">
            <input
              className="form-control form-control-sm"
              placeholder="Enter topic for authority post..."
              value={topic}
              onChange={e => setTopic(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleGenerate()}
            />
            <button className="btn btn-sm btn-primary text-nowrap" onClick={handleGenerate} disabled={generating || !topic.trim()}>
              {generating ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="bi bi-magic me-1" />}
              Generate
            </button>
          </div>

          {loading ? (
            <div className="text-center py-3"><span className="spinner-border spinner-border-sm text-primary" /></div>
          ) : items.length === 0 ? (
            <p className="text-muted small mb-0">No authority content yet — generate your first post above</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ fontSize: '0.8rem' }}>
                <thead className="table-light">
                  <tr>
                    <th>Title</th>
                    <th>Platform</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th style={{ width: '220px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id}>
                      <td>
                        <div className="fw-medium">{item.title || 'Untitled'}</div>
                        <div className="text-muted" style={{ fontSize: '0.7rem', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.content.slice(0, 100)}...
                        </div>
                      </td>
                      <td><span className="badge" style={{ backgroundColor: PLATFORM_COLORS[item.platform] || '#6c757d', fontSize: '0.65rem' }}>{item.platform}</span></td>
                      <td><span className={`badge bg-${STATUS_BADGES[item.status] || 'secondary'}`} style={{ fontSize: '0.65rem' }}>{item.status}</span></td>
                      <td className="text-nowrap text-muted">{timeAgo(item.created_at)}</td>
                      <td>
                        <div className="d-flex gap-1 flex-wrap">
                          <button className="btn btn-outline-secondary btn-sm py-0 px-1" style={{ fontSize: '0.65rem' }} onClick={() => copyContent(item)}>
                            <i className={`bi ${copiedId === item.id ? 'bi-check' : 'bi-clipboard'} me-1`} />{copiedId === item.id ? 'Copied' : 'Copy'}
                          </button>
                          {item.status === 'draft' && (
                            <button className="btn btn-outline-success btn-sm py-0 px-1" style={{ fontSize: '0.65rem' }} onClick={() => handleApprove(item.id)}>
                              <i className="bi bi-check-circle me-1" />Approve
                            </button>
                          )}
                          {item.status === 'approved' && (
                            <div className="d-flex gap-1">
                              <input
                                className="form-control form-control-sm py-0"
                                style={{ fontSize: '0.65rem', width: '120px' }}
                                placeholder="Post URL..."
                                value={postUrlInputs[item.id] || ''}
                                onChange={e => setPostUrlInputs(p => ({ ...p, [item.id]: e.target.value }))}
                              />
                              <button className="btn btn-outline-primary btn-sm py-0 px-1" style={{ fontSize: '0.65rem' }} onClick={() => handleMarkPosted(item.id)} disabled={!postUrlInputs[item.id]}>
                                Posted
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EngagementMonitorSection() {
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<EngagementEventItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [logForm, setLogForm] = useState({ platform: 'linkedin', engagement_type: 'comment', user_name: '', user_title: '', content: '', source_url: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getEngagements();
      setItems(res.data.engagements || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { if (expanded) load(); }, [expanded, load]);

  const handleLog = async () => {
    try {
      await createEngagement(logForm);
      setShowLogModal(false);
      setLogForm({ platform: 'linkedin', engagement_type: 'comment', user_name: '', user_title: '', content: '', source_url: '' });
      load();
    } catch { /* ignore */ }
  };

  return (
    <div className="card border-0 shadow-sm mb-3">
      <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center" style={{ cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
        <span><i className="bi bi-people me-2" />Engagement Monitor</span>
        <i className={`bi bi-chevron-${expanded ? 'up' : 'down'}`} />
      </div>
      {expanded && (
        <div className="card-body p-3">
          <div className="d-flex justify-content-end mb-2">
            <button className="btn btn-sm btn-outline-primary" onClick={() => setShowLogModal(true)}>
              <i className="bi bi-plus-circle me-1" />Log Engagement
            </button>
          </div>

          {loading ? (
            <div className="text-center py-3"><span className="spinner-border spinner-border-sm text-primary" /></div>
          ) : items.length === 0 ? (
            <p className="text-muted small mb-0">No engagement events yet</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ fontSize: '0.8rem' }}>
                <thead className="table-light">
                  <tr>
                    <th>Platform</th>
                    <th>User</th>
                    <th>Type</th>
                    <th>Content</th>
                    <th>Intent</th>
                    <th>Seniority</th>
                    <th>Status</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id}>
                      <td><span className="badge" style={{ backgroundColor: PLATFORM_COLORS[item.platform] || '#6c757d', fontSize: '0.65rem' }}>{item.platform}</span></td>
                      <td>
                        <div className="fw-medium">{item.user_name || '—'}</div>
                        {item.user_title && <div className="text-muted" style={{ fontSize: '0.65rem' }}>{item.user_title}</div>}
                      </td>
                      <td><span className="badge bg-light text-dark border" style={{ fontSize: '0.65rem' }}>{item.engagement_type}</span></td>
                      <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.content || '—'}</td>
                      <td><span className={`badge bg-${INTENT_COLOR(item.intent_score)}`} style={{ fontSize: '0.65rem' }}>{item.intent_score != null ? (Number(item.intent_score) * 100).toFixed(0) + '%' : '—'}</span></td>
                      <td style={{ fontSize: '0.7rem' }}>{SENIORITY_LABEL[item.role_seniority] || '—'}</td>
                      <td><span className={`badge bg-${item.status === 'new' ? 'primary' : item.status === 'converted' ? 'success' : 'secondary'}`} style={{ fontSize: '0.65rem' }}>{item.status}</span></td>
                      <td className="text-nowrap text-muted">{timeAgo(item.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Log Engagement Modal */}
          {showLogModal && (
            <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true" onClick={() => setShowLogModal(false)}>
              <div className="modal-dialog" onClick={e => e.stopPropagation()}>
                <div className="modal-content">
                  <div className="modal-header py-2">
                    <h6 className="modal-title mb-0">Log Engagement</h6>
                    <button type="button" className="btn-close" onClick={() => setShowLogModal(false)} />
                  </div>
                  <div className="modal-body">
                    <div className="mb-2">
                      <label className="form-label small fw-medium">Platform</label>
                      <select className="form-select form-select-sm" value={logForm.platform} onChange={e => setLogForm(f => ({ ...f, platform: e.target.value }))}>
                        {['linkedin', 'reddit', 'quora', 'devto', 'hashnode', 'discourse'].map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div className="mb-2">
                      <label className="form-label small fw-medium">Type</label>
                      <select className="form-select form-select-sm" value={logForm.engagement_type} onChange={e => setLogForm(f => ({ ...f, engagement_type: e.target.value }))}>
                        {['comment', 'reply', 'mention', 'reaction', 'share'].map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="mb-2">
                      <label className="form-label small fw-medium">User Name</label>
                      <input className="form-control form-control-sm" value={logForm.user_name} onChange={e => setLogForm(f => ({ ...f, user_name: e.target.value }))} />
                    </div>
                    <div className="mb-2">
                      <label className="form-label small fw-medium">User Title</label>
                      <input className="form-control form-control-sm" value={logForm.user_title} onChange={e => setLogForm(f => ({ ...f, user_title: e.target.value }))} />
                    </div>
                    <div className="mb-2">
                      <label className="form-label small fw-medium">Content</label>
                      <textarea className="form-control form-control-sm" rows={3} value={logForm.content} onChange={e => setLogForm(f => ({ ...f, content: e.target.value }))} />
                    </div>
                    <div className="mb-2">
                      <label className="form-label small fw-medium">Source URL</label>
                      <input className="form-control form-control-sm" value={logForm.source_url} onChange={e => setLogForm(f => ({ ...f, source_url: e.target.value }))} />
                    </div>
                  </div>
                  <div className="modal-footer py-2">
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowLogModal(false)}>Cancel</button>
                    <button className="btn btn-sm btn-primary" onClick={handleLog}>Save</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResponseQueueSection() {
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<ResponseQueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getResponseQueue();
      setItems(res.data.responses || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { if (expanded) load(); }, [expanded, load]);

  const handleApprove = async (id: string) => { await approveResponse(id); load(); };
  const handleReject = async (id: string) => { await rejectResponse(id); load(); };
  const handleMarkPosted = async (id: string) => { await markResponsePosted(id); load(); };

  const isExpired = (item: ResponseQueueItem) => item.expires_at && new Date(item.expires_at) < new Date();

  return (
    <div className="card border-0 shadow-sm mb-3">
      <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center" style={{ cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
        <span><i className="bi bi-reply me-2" />Conversation Replies</span>
        <i className={`bi bi-chevron-${expanded ? 'up' : 'down'}`} />
      </div>
      {expanded && (
        <div className="card-body p-3">
          {loading ? (
            <div className="text-center py-3"><span className="spinner-border spinner-border-sm text-primary" /></div>
          ) : items.length === 0 ? (
            <p className="text-muted small mb-0">No conversation replies in queue</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ fontSize: '0.8rem' }}>
                <thead className="table-light">
                  <tr>
                    <th>Engagement</th>
                    <th>Type</th>
                    <th>Response Preview</th>
                    <th>Status</th>
                    <th>Expires</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => {
                    const expired = isExpired(item);
                    return (
                      <tr key={item.id} style={expired ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>
                        <td>
                          <div className="fw-medium">{item.engagement?.user_name || '—'}</div>
                          <span className="badge" style={{ backgroundColor: PLATFORM_COLORS[item.platform] || '#6c757d', fontSize: '0.6rem' }}>{item.platform}</span>
                        </td>
                        <td><span className={`badge bg-${item.response_type === 'follow_up' ? 'info' : 'primary'}`} style={{ fontSize: '0.65rem' }}>{item.response_type}</span></td>
                        <td style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.response_text.slice(0, 120)}</td>
                        <td><span className={`badge bg-${STATUS_BADGES[item.status] || 'secondary'}`} style={{ fontSize: '0.65rem' }}>{item.status}</span></td>
                        <td className="text-nowrap text-muted" style={{ fontSize: '0.7rem' }}>{item.expires_at ? timeAgo(item.expires_at) : '—'}</td>
                        <td>
                          <div className="d-flex gap-1">
                            <button className="btn btn-outline-secondary btn-sm py-0 px-1" style={{ fontSize: '0.65rem' }} onClick={() => { navigator.clipboard.writeText(item.response_text); setCopiedId(item.id); setTimeout(() => setCopiedId(null), 2000); }}>
                              <i className={`bi ${copiedId === item.id ? 'bi-check' : 'bi-clipboard'}`} />
                            </button>
                            {item.status === 'draft' && !expired && (
                              <>
                                <button className="btn btn-outline-success btn-sm py-0 px-1" style={{ fontSize: '0.65rem' }} onClick={() => handleApprove(item.id)}>
                                  <i className="bi bi-check-circle" />
                                </button>
                                <button className="btn btn-outline-danger btn-sm py-0 px-1" style={{ fontSize: '0.65rem' }} onClick={() => handleReject(item.id)}>
                                  <i className="bi bi-x-circle" />
                                </button>
                              </>
                            )}
                            {item.status === 'approved' && (
                              <button className="btn btn-outline-primary btn-sm py-0 px-1" style={{ fontSize: '0.65rem' }} onClick={() => handleMarkPosted(item.id)}>
                                Posted
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LinkedInCommandCenter() {
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<LinkedInActionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getLinkedInActions({ status: 'pending' });
      setItems(res.data.actions || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { if (expanded) load(); }, [expanded, load]);

  const handleComplete = async (id: string) => { await completeLinkedInAction(id); load(); };
  const handleSkip = async (id: string) => { await skipLinkedInAction(id); load(); };

  const ACTION_ICONS: Record<string, string> = {
    comment: 'bi-chat-left-text',
    connection_request: 'bi-person-plus',
    dm_followup: 'bi-envelope',
    post_engagement: 'bi-hand-thumbs-up',
  };

  const ACTION_COLORS: Record<string, string> = {
    comment: 'primary',
    connection_request: 'success',
    dm_followup: 'info',
    post_engagement: 'warning',
  };

  return (
    <div className="card border-0 shadow-sm mb-3">
      <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center" style={{ cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
        <span>
          <i className="bi bi-linkedin me-2" style={{ color: '#0A66C2' }} />
          LinkedIn Command Center
          <span className="badge bg-warning text-dark ms-2" style={{ fontSize: '0.6rem' }}>Manual Only</span>
        </span>
        <i className={`bi bi-chevron-${expanded ? 'up' : 'down'}`} />
      </div>
      {expanded && (
        <div className="card-body p-3">
          {/* Summary strip */}
          {items.length > 0 && (
            <div className="d-flex gap-2 mb-3 flex-wrap">
              {Object.entries(
                items.reduce<Record<string, number>>((acc, i) => { acc[i.action_type] = (acc[i.action_type] || 0) + 1; return acc; }, {})
              ).map(([type, count]) => (
                <span key={type} className={`badge bg-${ACTION_COLORS[type] || 'secondary'}`} style={{ fontSize: '0.7rem' }}>
                  {type.replace(/_/g, ' ')}: {count}
                </span>
              ))}
            </div>
          )}

          {loading ? (
            <div className="text-center py-3"><span className="spinner-border spinner-border-sm text-primary" /></div>
          ) : items.length === 0 ? (
            <p className="text-muted small mb-0">No pending LinkedIn actions</p>
          ) : (
            <div className="row g-2">
              {items.map(item => (
                <div key={item.id} className="col-12 col-md-6">
                  <div className="card border h-100">
                    <div className="card-body p-2">
                      <div className="d-flex justify-content-between align-items-start mb-1">
                        <span className={`badge bg-${ACTION_COLORS[item.action_type] || 'secondary'}`} style={{ fontSize: '0.65rem' }}>
                          <i className={`bi ${ACTION_ICONS[item.action_type] || 'bi-lightning'} me-1`} />
                          {item.action_type.replace(/_/g, ' ')}
                        </span>
                        <span className="text-muted" style={{ fontSize: '0.6rem' }}>P{item.priority}</span>
                      </div>
                      {item.target_user_name && (
                        <div className="fw-medium small">{item.target_user_name}</div>
                      )}
                      {item.target_user_title && (
                        <div className="text-muted" style={{ fontSize: '0.65rem' }}>{item.target_user_title}</div>
                      )}
                      <div className="mt-1 p-2 bg-light rounded small" style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem', maxHeight: '120px', overflowY: 'auto' }}>
                        {item.suggested_text}
                      </div>
                      {item.context && (
                        <div className="text-muted mt-1" style={{ fontSize: '0.6rem' }}>{item.context}</div>
                      )}
                      <div className="d-flex gap-1 mt-2">
                        <button className="btn btn-outline-secondary btn-sm py-0 px-2" style={{ fontSize: '0.65rem' }} onClick={() => { navigator.clipboard.writeText(item.suggested_text); setCopiedId(item.id); setTimeout(() => setCopiedId(null), 2000); }}>
                          <i className={`bi ${copiedId === item.id ? 'bi-check' : 'bi-clipboard'} me-1`} />{copiedId === item.id ? 'Copied' : 'Copy'}
                        </button>
                        <button className="btn btn-outline-success btn-sm py-0 px-2" style={{ fontSize: '0.65rem' }} onClick={() => handleComplete(item.id)}>
                          <i className="bi bi-check-circle me-1" />Done
                        </button>
                        <button className="btn btn-outline-secondary btn-sm py-0 px-2" style={{ fontSize: '0.65rem' }} onClick={() => handleSkip(item.id)}>
                          Skip
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
