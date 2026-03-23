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
  const [loading, setLoading] = useState(true);
  const [responseFilter, setResponseFilter] = useState('');
  const [expandedResponse, setExpandedResponse] = useState<string | null>(null);
  const [markPostedUrl, setMarkPostedUrl] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Governance controls state
  const [requireApproval, setRequireApproval] = useState(true);
  const [autoPostDevto, setAutoPostDevto] = useState(false);
  const [activePlatforms, setActivePlatforms] = useState<string[]>(['reddit', 'hackernews', 'devto', 'hashnode', 'medium', 'discourse']);
  const [savingConfig, setSavingConfig] = useState<string | null>(null);

  // Manual URL submission state
  const [submitUrl, setSubmitUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string } | null>(null);

  // LinkedIn post generator state
  const [linkedinTopic, setLinkedinTopic] = useState('');
  const [generatingLinkedin, setGeneratingLinkedin] = useState(false);
  const [linkedinResult, setLinkedinResult] = useState<{ success: boolean; message: string } | null>(null);

  // Agent drill-down state
  const [selectedAgent, setSelectedAgent] = useState<SelectedAgent | null>(null);
  const [agentActivity, setAgentActivity] = useState<OpenclawAgentActivity[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityFilter, setActivityFilter] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [dashRes, respRes] = await Promise.all([
        getOpenclawDashboard(),
        getOpenclawResponses(responseFilter ? { post_status: responseFilter } : undefined),
      ]);
      setDashboard(dashRes.data);
      setResponses(respRes.data.responses || []);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [responseFilter]);

  // Load governance config on mount
  useEffect(() => {
    getOpenclawConfig().then(res => {
      const agents = res.data?.agents || [];
      for (const a of agents) {
        if (a.name === 'OpenclawContentResponseAgent') {
          setRequireApproval(a.config?.require_approval !== false);
        }
        if (a.name === 'OpenclawBrowserWorkerAgent') {
          setAutoPostDevto(!!a.enabled);
        }
        if (a.name === 'OpenclawMarketSignalAgent' && Array.isArray(a.config?.platforms)) {
          setActivePlatforms(a.config.platforms);
        }
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

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

  const handleToggleApproval = async () => {
    setSavingConfig('approval');
    try {
      await updateOpenclawConfig({ agent_name: 'OpenclawContentResponseAgent', config: { require_approval: !requireApproval } });
      setRequireApproval(!requireApproval);
    } catch {}
    setSavingConfig(null);
  };

  const handleToggleAutoPost = async () => {
    setSavingConfig('autopost');
    try {
      await updateOpenclawConfig({ agent_name: 'OpenclawBrowserWorkerAgent', enabled: !autoPostDevto });
      setAutoPostDevto(!autoPostDevto);
    } catch {}
    setSavingConfig(null);
  };

  const handleTogglePlatform = async (platform: string) => {
    const updated = activePlatforms.includes(platform)
      ? activePlatforms.filter(p => p !== platform)
      : [...activePlatforms, platform];
    setSavingConfig(`platform-${platform}`);
    try {
      await updateOpenclawConfig({ agent_name: 'OpenclawMarketSignalAgent', config: { platforms: updated } });
      setActivePlatforms(updated);
    } catch {}
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
      setExpandedResponse(null);
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
            { label: 'Signals (24h)', value: kpis.signals_24h, color: 'var(--color-primary)' },
            { label: 'Posted', value: kpis.responses_posted, color: 'var(--color-accent)' },
            { label: 'Drafts', value: kpis.responses_draft, color: '#dd6b20' },
            { label: 'Sessions', value: kpis.active_sessions, color: '#2b6cb0' },
            { label: 'Queue', value: kpis.queue_depth, color: '#805ad5' },
            { label: 'Learnings', value: kpis.learnings, color: '#319795' },
          ].map((kpi) => (
            <div key={kpi.label} className="col-4 col-md-2">
              <div className="card border-0 shadow-sm text-center py-2 px-1">
                <div className="fw-bold" style={{ fontSize: '1.3rem', color: kpi.color }}>
                  {kpi.value}
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

      {/* Governance Controls */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold small">Governance Controls</div>
        <div className="card-body py-3 px-3">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div>
              <div className="fw-medium small">Require Manual Approval</div>
              <div className="text-muted" style={{ fontSize: '0.68rem' }}>
                When ON, all responses stay as &ldquo;draft&rdquo; until you approve. When OFF, responses auto-queue for posting.
              </div>
            </div>
            <div className="form-check form-switch ms-3">
              <input
                type="checkbox"
                className="form-check-input"
                role="switch"
                checked={requireApproval}
                onChange={handleToggleApproval}
                disabled={savingConfig === 'approval'}
              />
            </div>
          </div>

          <hr className="my-2" />

          <div className="d-flex justify-content-between align-items-center mb-3">
            <div>
              <div className="fw-medium small">Auto-Post (Dev.to, Hashnode, Medium, Discourse)</div>
              <div className="text-muted" style={{ fontSize: '0.68rem' }}>
                When ON, approved responses are posted automatically via API to platforms with configured credentials. Medium publishes as draft articles. Other platforms remain manual copy-paste.
              </div>
            </div>
            <div className="form-check form-switch ms-3">
              <input
                type="checkbox"
                className="form-check-input"
                role="switch"
                checked={autoPostDevto}
                onChange={handleToggleAutoPost}
                disabled={savingConfig === 'autopost'}
              />
            </div>
          </div>

          <hr className="my-2" />

          <div>
            <div className="fw-medium small mb-2">Active Scanning Platforms</div>
            <div className="text-muted mb-2" style={{ fontSize: '0.65rem' }}>
              Scan + Auto-Post: Dev.to, Hashnode, Medium, Discourse &bull; Scan for Intel Only: Reddit, HN (no links — ban risk)
            </div>
            <div className="d-flex gap-3 flex-wrap">
              {['reddit', 'hackernews', 'devto', 'hashnode', 'medium', 'discourse'].map(p => {
                const intelOnly = p === 'reddit' || p === 'hackernews';
                const label = p === 'hackernews' ? 'Hacker News' : p === 'devto' ? 'Dev.to' : p === 'hashnode' ? 'Hashnode' : p === 'discourse' ? 'Discourse Forums' : p.charAt(0).toUpperCase() + p.slice(1);
                return (
                  <div className="form-check" key={p}>
                    <input
                      type="checkbox"
                      className="form-check-input"
                      id={`platform-${p}`}
                      checked={activePlatforms.includes(p)}
                      onChange={() => handleTogglePlatform(p)}
                      disabled={savingConfig === `platform-${p}`}
                    />
                    <label className="form-check-label small" htmlFor={`platform-${p}`}>
                      {label}
                      {intelOnly && <span className="badge bg-info ms-1" style={{ fontSize: '0.5rem', verticalAlign: 'middle' }}>Intel</span>}
                    </label>
                  </div>
                );
              })}
              <div className="form-check">
                <input type="checkbox" className="form-check-input" disabled checked={false} />
                <label className="form-check-label small text-muted">
                  Quora <span className="badge bg-secondary ms-1" style={{ fontSize: '0.55rem', verticalAlign: 'middle' }}>Manual Only</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Manual URL Submission */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold small">
          Submit Question URL
          <span className="badge bg-secondary ms-2" style={{ fontSize: '0.55rem', verticalAlign: 'middle' }}>Any Platform</span>
        </div>
        <div className="card-body py-3 px-3">
          <div className="text-muted small mb-2">
            Paste a question URL from any platform. The system will extract the content and generate a response for your review.
          </div>
          <div className="d-flex gap-2">
            <input
              type="url"
              className="form-control form-control-sm"
              placeholder="https://www.quora.com/What-is-..."
              value={submitUrl}
              onChange={e => setSubmitUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submitUrl.trim() && !submitting && handleSubmitUrl()}
            />
            <button
              className="btn btn-sm btn-primary px-3"
              disabled={!submitUrl.trim() || submitting}
              onClick={handleSubmitUrl}
            >
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </div>
          {submitResult && (
            <div className={`alert alert-${submitResult.success ? 'success' : 'danger'} mt-2 py-1 px-2 small mb-0`}>
              {submitResult.message}
            </div>
          )}
        </div>
      </div>

      {/* LinkedIn Post Generator */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold small">
          Generate LinkedIn Post
          <span className="badge ms-2" style={{ fontSize: '0.55rem', verticalAlign: 'middle', backgroundColor: '#0A66C2', color: '#fff' }}>LinkedIn</span>
        </div>
        <div className="card-body py-3 px-3">
          <div className="text-muted mb-2" style={{ fontSize: '0.68rem' }}>
            Enter a topic or trend. AI generates a practitioner-voice LinkedIn post with a tracked link to your strategy call booking page.
          </div>
          <div className="d-flex gap-2">
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="e.g., Why most AI pilots fail at the enterprise level"
              value={linkedinTopic}
              onChange={e => setLinkedinTopic(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && linkedinTopic.trim() && !generatingLinkedin && handleGenerateLinkedIn()}
            />
            <button
              className="btn btn-sm btn-primary text-nowrap"
              onClick={handleGenerateLinkedIn}
              disabled={!linkedinTopic.trim() || generatingLinkedin}
            >
              {generatingLinkedin ? 'Generating...' : 'Generate'}
            </button>
          </div>
          {linkedinResult && (
            <div className={`alert alert-${linkedinResult.success ? 'success' : 'danger'} mt-2 py-1 px-2 small mb-0`}>
              {linkedinResult.message}
            </div>
          )}
        </div>
      </div>

      {/* Agent Status (collapsible) */}
      {dashboard?.agents && dashboard.agents.length > 0 && (
        <details className="mb-4">
          <summary className="fw-semibold small mb-2" style={{ cursor: 'pointer', color: 'var(--color-text-light)' }}>Agent Status — {dashboard.agents.filter(a => a.enabled).length} active agents</summary>
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white fw-semibold small">Click any row for details</div>
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
        </details>
      )}

      {/* Response Review Cards */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6 className="fw-semibold mb-0">Response Queue</h6>
        <div className="d-flex gap-2 align-items-center">
          <span className="text-muted small">{responses.length} responses</span>
          <select
            className="form-select form-select-sm"
            style={{ width: 'auto', fontSize: '0.75rem' }}
            value={responseFilter}
            onChange={(e) => setResponseFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft — Needs Review</option>
            <option value="approved">Approved</option>
            <option value="ready_to_post">Ready to Post</option>
            <option value="posted">Posted</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {responses.length === 0 && (
        <div className="card border-0 bg-light mx-auto" style={{ maxWidth: 650 }}>
          <div className="card-body py-4 px-4">
            <div className="text-center mb-3 text-muted">No responses yet</div>
            <div className="fw-semibold small mb-2">How AI Outreach Works</div>
            <ol className="small text-muted mb-0 ps-3" style={{ lineHeight: 1.8 }}>
              <li><strong>Signal Scanning</strong> — agents scan Dev.to, Reddit, and HN for AI-related conversations ({kpis?.signals_24h || 0} signals found in last 24h)</li>
              <li><strong>Draft Generation</strong> — GPT-4o writes educational, non-promotional responses tailored to the platform</li>
              <li><strong>You Review</strong> — drafts appear here as cards. Read the original post, review the response, then approve or reject</li>
              <li><strong>Posting</strong> — Dev.to: auto-posted via API. Reddit/HN: you copy the response, post it from your account</li>
              <li><strong>Attribution</strong> — each response gets a unique tracked URL for visitor attribution</li>
            </ol>
          </div>
        </div>
      )}

      {responses.map((resp) => {
        const sig = resp.signal;
        const details = sig?.details || {};
        const comments = details.num_comments || details.comments_count || 0;
        const reactions = details.score || details.points || details.positive_reactions_count || 0;
        const tags: string[] = details.tags || details.topic_tags || [];
        const publishedAt = details.published_at || details.created_at || details.created_utc;
        const isExpanded = expandedResponse === resp.id;
        const isDraft = resp.post_status === 'draft';
        const isReadyToPost = resp.post_status === 'ready_to_post' || resp.post_status === 'approved';

        return (
          <div key={resp.id} className="card border-0 shadow-sm mb-3">
            {/* Card Header — Original Post Context */}
            <div className="card-header bg-white py-2 px-3">
              <div className="d-flex justify-content-between align-items-start">
                <div className="flex-grow-1" style={{ minWidth: 0 }}>
                  <div className="d-flex align-items-center gap-2 mb-1">
                    <span
                      className="badge"
                      style={{ backgroundColor: PLATFORM_COLORS[resp.platform] || '#718096', fontSize: '0.65rem' }}
                    >
                      {resp.platform}
                    </span>
                    <span className={`badge bg-${STATUS_BADGES[resp.post_status] || 'secondary'}`} style={{ fontSize: '0.65rem' }}>
                      {resp.post_status === 'ready_to_post' ? 'Ready to Post' : resp.post_status}
                    </span>
                    <span className="badge bg-secondary" style={{ fontSize: '0.6rem' }}>{resp.tone}</span>
                    <span className="text-muted" style={{ fontSize: '0.65rem' }}>{timeAgo(resp.created_at)}</span>
                  </div>
                  {sig?.title && (
                    <a
                      href={sig.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="fw-semibold text-decoration-none d-block"
                      style={{ fontSize: '0.88rem', color: 'var(--color-primary)' }}
                    >
                      {sig.title} <span style={{ fontSize: '0.7rem' }}>&#8599;</span>
                    </a>
                  )}
                </div>
                {/* Engagement stats */}
                <div className="d-flex gap-3 ms-3 text-nowrap" style={{ fontSize: '0.75rem' }}>
                  {reactions > 0 && (
                    <div className="text-center">
                      <div className="fw-bold" style={{ color: 'var(--color-accent)' }}>{reactions}</div>
                      <div className="text-muted" style={{ fontSize: '0.6rem' }}>reactions</div>
                    </div>
                  )}
                  <div className="text-center">
                    <div className="fw-bold" style={{ color: '#2b6cb0' }}>{comments}</div>
                    <div className="text-muted" style={{ fontSize: '0.6rem' }}>comments</div>
                  </div>
                  {publishedAt && (
                    <div className="text-center">
                      <div className="fw-bold text-muted">{timeAgo(typeof publishedAt === 'number' ? new Date(publishedAt * 1000).toISOString() : publishedAt)}</div>
                      <div className="text-muted" style={{ fontSize: '0.6rem' }}>published</div>
                    </div>
                  )}
                </div>
              </div>
              {/* Tags */}
              {tags.length > 0 && (
                <div className="d-flex gap-1 mt-1">
                  {tags.slice(0, 6).map((tag: string) => (
                    <span key={tag} className="badge bg-light text-muted border" style={{ fontSize: '0.6rem' }}>#{tag}</span>
                  ))}
                </div>
              )}
              {/* Author */}
              {sig?.author && (
                <div className="text-muted mt-1" style={{ fontSize: '0.68rem' }}>by {sig.author}</div>
              )}
            </div>

            <div className="card-body py-2 px-3">
              {/* Original Post Excerpt */}
              {sig?.content_excerpt && (
                <div className="mb-2">
                  <div className="fw-medium text-muted" style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Original Post</div>
                  <div
                    className="text-muted border-start ps-2"
                    style={{ fontSize: '0.78rem', borderColor: 'var(--color-border)', lineHeight: 1.5 }}
                  >
                    {sig.content_excerpt.length > 400 ? sig.content_excerpt.slice(0, 400) + '...' : sig.content_excerpt}
                  </div>
                </div>
              )}

              {/* Generated Response */}
              <div className="mb-2">
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <div className="fw-medium text-muted" style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Our Response ({resp.content.length} chars)
                  </div>
                  <button
                    className={`btn btn-sm py-0 px-2 ${copiedId === resp.id ? 'btn-success' : 'btn-outline-secondary'}`}
                    style={{ fontSize: '0.72rem' }}
                    onClick={() => handleCopy(resp.content, resp.id)}
                  >
                    {copiedId === resp.id ? 'Copied!' : 'Copy Response'}
                  </button>
                </div>
                <div
                  className="bg-light rounded p-2"
                  style={{
                    fontSize: '0.8rem',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    maxHeight: isExpanded ? 'none' : 120,
                    overflow: isExpanded ? 'visible' : 'hidden',
                    position: 'relative',
                  }}
                >
                  {resp.content}
                  {!isExpanded && resp.content.length > 300 && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: 40,
                        background: 'linear-gradient(transparent, #f8f9fa)',
                      }}
                    />
                  )}
                </div>
                {resp.content.length > 300 && (
                  <button
                    className="btn btn-sm btn-link p-0 mt-1"
                    style={{ fontSize: '0.72rem' }}
                    onClick={() => setExpandedResponse(isExpanded ? null : resp.id)}
                  >
                    {isExpanded ? 'Show less' : 'Show full response'}
                  </button>
                )}
              </div>

              {/* Tracked URL */}
              {resp.tracked_url && (
                <div className="d-flex align-items-center gap-2 mb-2" style={{ fontSize: '0.72rem' }}>
                  <span className="text-muted">Tracking:</span>
                  <code style={{ fontSize: '0.7rem' }}>{resp.short_id}</code>
                  <button
                    className={`btn btn-sm py-0 px-1 ${copiedId === `url-${resp.id}` ? 'btn-success' : 'btn-outline-secondary'}`}
                    style={{ fontSize: '0.65rem' }}
                    onClick={() => handleCopy(resp.tracked_url!, `url-${resp.id}`)}
                  >
                    {copiedId === `url-${resp.id}` ? 'Copied!' : 'Copy URL'}
                  </button>
                </div>
              )}
            </div>

            {/* Card Footer — Actions */}
            <div className="card-footer bg-white py-2 px-3 d-flex align-items-center gap-2">
              {isDraft && (
                <>
                  <button className="btn btn-sm btn-success px-3" onClick={() => handleApprove(resp.id)}>
                    Approve &amp; Queue
                  </button>
                  <button className="btn btn-sm btn-outline-danger px-3" onClick={() => handleReject(resp.id)}>
                    Reject
                  </button>
                  <a
                    href={sig?.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-sm btn-outline-secondary px-3 ms-auto"
                  >
                    View Original Post
                  </a>
                </>
              )}
              {isReadyToPost && (
                <>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="Paste the URL where you posted this comment..."
                    style={{ maxWidth: 400, fontSize: '0.75rem' }}
                    value={expandedResponse === resp.id ? markPostedUrl : ''}
                    onChange={(e) => { setExpandedResponse(resp.id); setMarkPostedUrl(e.target.value); }}
                  />
                  <button
                    className="btn btn-sm btn-primary px-3"
                    disabled={!markPostedUrl.trim() || expandedResponse !== resp.id}
                    onClick={() => handleMarkPosted(resp.id)}
                  >
                    Mark as Posted
                  </button>
                  <a
                    href={sig?.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-sm btn-outline-secondary px-3 ms-auto"
                  >
                    Open Post to Comment
                  </a>
                </>
              )}
              {resp.post_status === 'posted' && resp.post_url && (
                <a href={resp.post_url} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-success px-3">
                  View Posted Comment
                </a>
              )}
            </div>
          </div>
        );
      })}

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
