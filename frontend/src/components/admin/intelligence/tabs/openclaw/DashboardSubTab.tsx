import { useState, useEffect, useCallback } from 'react';
import { useOpenclawContext } from './OpenclawContext';
import AgentDetailModal from './AgentDetailModal';
import {
  PLATFORM_COLORS,
  STATUS_BADGES,
  INTENT_COLOR,
  SENIORITY_LABEL,
  timeAgo,
  formatMs,
} from './openclawUtils';
import {
  getOpenclawAgentActivity,
  getCircuitStatus,
  getRateLimits,
  type OpenclawDashboard,
  type OpenclawAgentActivity,
  type CircuitStatus,
  type RateLimitStatus,
} from '../../../../../services/openclawApi';
import {
  getEngagements,
  createEngagement,
  type EngagementEventItem,
} from '../../../../../services/openclawReputationApi';

type SelectedAgent = OpenclawDashboard['agents'][number];

// ══════════════════════════════════════════════════════════════════════════════
// Dashboard Sub-Tab
// ══════════════════════════════════════════════════════════════════════════════

export default function DashboardSubTab() {
  const { dashboard, loading, fetchData } = useOpenclawContext();

  // Agent detail drill-down state
  const [selectedAgent, setSelectedAgent] = useState<SelectedAgent | null>(null);
  const [agentActivity, setAgentActivity] = useState<OpenclawAgentActivity[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityFilter, setActivityFilter] = useState('');

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

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading dashboard...</span>
        </div>
      </div>
    );
  }

  const kpis = dashboard?.kpis;

  return (
    <div>
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
            { label: 'Manual Queue', value: kpis.responses_manual_queue, color: '#e53e3e' },
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

      {/* Revenue Pipeline */}
      {kpis?.pipeline_funnel && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold small">Revenue Pipeline</div>
          <div className="card-body">
            <div className="row g-3">
              {/* Funnel View */}
              <div className="col-md-6">
                <div className="fw-medium small mb-2">Conversation Funnel</div>
                {[
                  { stage: 1, label: 'Initial Engagement', color: '#e2e8f0' },
                  { stage: 2, label: 'Qualification', color: '#bee3f8' },
                  { stage: 3, label: 'Deepening', color: '#90cdf4' },
                  { stage: 4, label: 'Transition', color: '#63b3ed' },
                  { stage: 5, label: 'Interest Expressed', color: '#4299e1' },
                  { stage: 6, label: 'Conversion Ready', color: '#3182ce' },
                  { stage: 7, label: 'Call Scheduled', color: '#2b6cb0' },
                  { stage: 8, label: 'Closed', color: '#1a365d' },
                ].map(s => {
                  const count = kpis.pipeline_funnel[`stage_${s.stage}`] || 0;
                  const maxCount = Math.max(...Object.values(kpis.pipeline_funnel), 1);
                  const pct = (count / maxCount) * 100;
                  return (
                    <div key={s.stage} className="mb-1">
                      <div className="d-flex justify-content-between" style={{ fontSize: '0.7rem' }}>
                        <span>Stage {s.stage}: {s.label}</span>
                        <span className="fw-bold">{count}</span>
                      </div>
                      <div className="progress" style={{ height: 6 }}>
                        <div className="progress-bar" style={{ width: `${pct}%`, backgroundColor: s.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Priority + Revenue */}
              <div className="col-md-6">
                <div className="fw-medium small mb-2">Priority Breakdown</div>
                <div className="d-flex gap-2 mb-3">
                  {[
                    { tier: 'hot', label: 'Hot', bg: 'danger' },
                    { tier: 'warm', label: 'Warm', bg: 'warning' },
                    { tier: 'cold', label: 'Cold', bg: 'secondary' },
                  ].map(t => (
                    <div key={t.tier} className="text-center flex-fill">
                      <div className={`badge bg-${t.bg} fs-6 w-100 py-2`}>
                        {kpis.priority_breakdown?.[t.tier as keyof typeof kpis.priority_breakdown] || 0}
                      </div>
                      <div className="text-muted" style={{ fontSize: '0.65rem' }}>{t.label}</div>
                    </div>
                  ))}
                </div>

                <div className="fw-medium small mb-2">Conversion Rate</div>
                <div className="mb-3">
                  <div className="progress" style={{ height: 20 }}>
                    <div
                      className="progress-bar bg-success"
                      style={{ width: `${(kpis.conversion_rate || 0) * 100}%` }}
                    >
                      {((kpis.conversion_rate || 0) * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>

                {kpis.revenue_pipeline && (
                  <>
                    <div className="fw-medium small mb-2">Revenue Pipeline</div>
                    <div className="d-flex gap-2 flex-wrap">
                      {['detected', 'validated', 'pursued', 'converted'].map(status => {
                        const data = kpis.revenue_pipeline[status];
                        const colors: Record<string, string> = { detected: 'info', validated: 'primary', pursued: 'warning', converted: 'success' };
                        return data ? (
                          <div key={status} className="text-center flex-fill">
                            <div className={`badge bg-${colors[status]} w-100 py-2`} style={{ fontSize: '0.8rem' }}>
                              {data.count} (${data.value.toLocaleString()})
                            </div>
                            <div className="text-muted text-capitalize" style={{ fontSize: '0.65rem' }}>{status}</div>
                          </div>
                        ) : null;
                      })}
                    </div>
                  </>
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

      {/* Engagement Monitor */}
      <EngagementMonitorSection />

      {/* Circuit Breaker Status */}
      <CircuitBreakerStatus />

      {/* Agent Detail Modal */}
      <AgentDetailModal
        agent={selectedAgent}
        onClose={closeModal}
        activity={agentActivity}
        activityLoading={activityLoading}
        activityTotal={activityTotal}
        activityFilter={activityFilter}
        onActivityFilterChange={handleActivityFilterChange}
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Engagement Monitor Section (inline sub-component)
// ══════════════════════════════════════════════════════════════════════════════

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
                        <div className="fw-medium">{item.user_name || '\u2014'}</div>
                        {item.user_title && <div className="text-muted" style={{ fontSize: '0.65rem' }}>{item.user_title}</div>}
                      </td>
                      <td><span className="badge bg-light text-dark border" style={{ fontSize: '0.65rem' }}>{item.engagement_type}</span></td>
                      <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.content || '\u2014'}</td>
                      <td><span className={`badge bg-${INTENT_COLOR(item.intent_score)}`} style={{ fontSize: '0.65rem' }}>{item.intent_score != null ? (Number(item.intent_score) * 100).toFixed(0) + '%' : '\u2014'}</span></td>
                      <td style={{ fontSize: '0.7rem' }}>{SENIORITY_LABEL[item.role_seniority] || '\u2014'}</td>
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

// ══════════════════════════════════════════════════════════════════════════════
// Circuit Breaker Status (inline sub-component)
// ══════════════════════════════════════════════════════════════════════════════

function CircuitBreakerStatus() {
  const [circuits, setCircuits] = useState<CircuitStatus[]>([]);
  const [rateLimits, setRateLimits] = useState<RateLimitStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [circuitRes, rateRes] = await Promise.all([getCircuitStatus(), getRateLimits()]);
        if (!mounted) return;
        setCircuits(circuitRes.data.circuit_statuses || []);
        setRateLimits(rateRes.data.rate_limits || []);
      } catch { /* ignore */ }
      if (mounted) setLoading(false);
    };
    load();
    const interval = setInterval(load, 60000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  const nonClosed = circuits.filter(c => c.state !== 'CLOSED');
  const nearLimit = rateLimits.filter(r => r.limit_hour > 0 && r.hour >= r.limit_hour * 0.8);

  if (loading || (nonClosed.length === 0 && nearLimit.length === 0)) return null;

  const circuitBadge = (state: string) => state === 'OPEN' ? 'danger' : state === 'HALF_OPEN' ? 'warning' : 'success';

  return (
    <div className="card border-0 shadow-sm mb-3">
      <div className="card-header bg-white fw-semibold">
        <i className="bi bi-shield-exclamation me-2" />Automation Safeguards
      </div>
      <div className="card-body p-3">
        {nonClosed.length > 0 && (
          <div className="mb-3">
            <div className="small fw-medium text-muted mb-2">Circuit Breakers</div>
            <div className="d-flex gap-2 flex-wrap">
              {nonClosed.map(c => (
                <div key={c.platform} className="d-flex align-items-center gap-1 px-2 py-1 rounded" style={{ backgroundColor: 'var(--color-bg-alt)', fontSize: '0.75rem' }}>
                  <span className={`badge bg-${circuitBadge(c.state)}`} style={{ fontSize: '0.6rem' }}>{c.state}</span>
                  <span className="fw-medium">{c.platform}</span>
                  <span className="text-muted">({c.error_rate}% errors, {c.total_count} tasks)</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {nearLimit.length > 0 && (
          <div>
            <div className="small fw-medium text-muted mb-2">Rate Limits (near capacity)</div>
            <div className="d-flex gap-2 flex-wrap">
              {nearLimit.map(r => (
                <div key={r.platform} className="d-flex align-items-center gap-1 px-2 py-1 rounded" style={{ backgroundColor: 'var(--color-bg-alt)', fontSize: '0.75rem' }}>
                  <span className="fw-medium">{r.platform}</span>
                  <span className="text-muted">{r.hour}/{r.limit_hour} hr, {r.day}/{r.limit_day} day</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
