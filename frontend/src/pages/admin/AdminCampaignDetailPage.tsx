import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, FunnelChart, Funnel, LabelList, Cell,
} from 'recharts';

interface CampaignDetail {
  id: string;
  name: string;
  description: string;
  type: string;
  status: string;
  sequence_id: string | null;
  sequence?: { id: string; name: string; steps: any[] };
  targeting_criteria: Record<string, any>;
  channel_config: Record<string, any>;
  budget_total: number | null;
  budget_spent: number;
  ai_system_prompt: string | null;
  lead_count: number;
  lead_status_counts: Record<string, number>;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface CampaignLead {
  id: string;
  lead_id: number;
  status: string;
  enrolled_at: string;
  outcome: string | null;
  lead: {
    id: number;
    name: string;
    email: string;
    company: string;
    title: string;
    lead_score: number;
    lead_source_type: string;
  };
}

interface Stats {
  total_leads: number;
  leads_by_status: Record<string, number>;
  total_actions: number;
  actions_by_status: Record<string, number>;
  actions_by_channel: Record<string, number>;
  ai_generated_count: number;
}

interface AnalyticsData {
  overview: {
    total_leads: number;
    total_interactions: number;
    sent_count: number;
    opened_count: number;
    clicked_count: number;
    replied_count: number;
    bounced_count: number;
    meetings_booked: number;
    conversions: number;
    open_rate: number;
    click_rate: number;
    reply_rate: number;
    bounce_rate: number;
    meeting_rate: number;
    conversion_rate: number;
    budget_total: number | null;
    budget_spent: number;
    cost_per_lead: number | null;
    cost_per_meeting: number | null;
  };
  channel_performance: Array<{
    channel: string;
    sent: number;
    opened: number;
    clicked: number;
    replied: number;
    bounced: number;
    meetings: number;
    open_rate: number;
    reply_rate: number;
  }>;
  funnel: Array<{ stage: string; count: number; rate: number }>;
  daily_series: Array<{
    date: string;
    sent: number;
    opened: number;
    clicked: number;
    replied: number;
    bounced: number;
  }>;
  step_performance: Array<{
    step_index: number;
    channel: string;
    total: number;
    sent: number;
    opened: number;
    replied: number;
    ai_generated: number;
    open_rate: number;
    reply_rate: number;
  }>;
  lead_outcomes: Array<{ outcome: string; count: number }>;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'secondary',
  active: 'success',
  paused: 'warning',
  completed: 'info',
};

const FUNNEL_COLORS = ['#0d6efd', '#0dcaf0', '#6f42c1', '#fd7e14', '#198754', '#ffc107'];

function AdminCampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [leads, setLeads] = useState<CampaignLead[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [matchingLeads, setMatchingLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<number[]>([]);
  const [enrolling, setEnrolling] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'analytics'>('overview');
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchCampaign = async () => {
    try {
      const [campRes, statsRes, leadsRes] = await Promise.all([
        fetch(`/api/admin/campaigns/${id}`, { headers }),
        fetch(`/api/admin/campaigns/${id}/stats`, { headers }),
        fetch(`/api/admin/campaigns/${id}/leads`, { headers }),
      ]);
      const campData = await campRes.json();
      const statsData = await statsRes.json();
      const leadsData = await leadsRes.json();
      setCampaign(campData);
      setStats(statsData.stats);
      setLeads(leadsData.leads || []);
    } catch (err) {
      console.error('Failed to fetch campaign:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    setAnalyticsLoading(true);
    try {
      const res = await fetch(`/api/admin/campaigns/${id}/analytics`, { headers });
      const data = await res.json();
      setAnalytics(data.analytics);
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaign();
  }, [id]);

  useEffect(() => {
    if (activeTab === 'analytics' && !analytics) {
      fetchAnalytics();
    }
  }, [activeTab]);

  const handleLifecycle = async (action: 'activate' | 'pause' | 'complete') => {
    try {
      await fetch(`/api/admin/campaigns/${id}/${action}`, { method: 'POST', headers });
      fetchCampaign();
    } catch (err) {
      console.error(`Failed to ${action} campaign:`, err);
    }
  };

  const handleShowMatchingLeads = async () => {
    try {
      const res = await fetch(`/api/admin/campaigns/${id}/matching-leads`, { headers });
      const data = await res.json();
      setMatchingLeads(data.leads || []);
      setSelectedLeadIds([]);
      setShowEnrollModal(true);
    } catch (err) {
      console.error('Failed to get matching leads:', err);
    }
  };

  const handleEnroll = async () => {
    if (selectedLeadIds.length === 0) return;
    setEnrolling(true);
    try {
      await fetch(`/api/admin/campaigns/${id}/enroll-leads`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ lead_ids: selectedLeadIds }),
      });
      setShowEnrollModal(false);
      fetchCampaign();
    } catch (err) {
      console.error('Failed to enroll leads:', err);
    } finally {
      setEnrolling(false);
    }
  };

  const handleRemoveLead = async (leadId: number) => {
    try {
      await fetch(`/api/admin/campaigns/${id}/leads/${leadId}`, { method: 'DELETE', headers });
      fetchCampaign();
    } catch (err) {
      console.error('Failed to remove lead:', err);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this campaign?')) return;
    try {
      await fetch(`/api/admin/campaigns/${id}`, { method: 'DELETE', headers });
      navigate('/admin/campaigns');
    } catch (err) {
      console.error('Failed to delete campaign:', err);
    }
  };

  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const currency = (v: number | null) => v != null ? `$${v.toFixed(2)}` : '—';

  if (loading || !campaign) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="d-flex justify-content-between align-items-start mb-4">
        <div>
          <h2 className="mb-1">{campaign.name}</h2>
          <div className="d-flex gap-2 align-items-center">
            <span className={`badge bg-${STATUS_COLORS[campaign.status] || 'secondary'}`}>
              {campaign.status}
            </span>
            <span className="badge bg-light text-dark border">{campaign.type.replace(/_/g, ' ')}</span>
            {campaign.sequence && (
              <span className="text-muted small">Sequence: {campaign.sequence.name}</span>
            )}
          </div>
        </div>
        <div className="d-flex gap-2">
          {campaign.status === 'draft' && (
            <button className="btn btn-success btn-sm" onClick={() => handleLifecycle('activate')}>
              Activate
            </button>
          )}
          {campaign.status === 'active' && (
            <button className="btn btn-warning btn-sm" onClick={() => handleLifecycle('pause')}>
              Pause
            </button>
          )}
          {campaign.status === 'paused' && (
            <button className="btn btn-success btn-sm" onClick={() => handleLifecycle('activate')}>
              Resume
            </button>
          )}
          {(campaign.status === 'active' || campaign.status === 'paused') && (
            <button className="btn btn-info btn-sm" onClick={() => handleLifecycle('complete')}>
              Complete
            </button>
          )}
          <button className="btn btn-outline-danger btn-sm" onClick={handleDelete}>
            Delete
          </button>
        </div>
      </div>

      {campaign.description && <p className="text-muted mb-4">{campaign.description}</p>}

      {/* Tabs */}
      <ul className="nav nav-tabs mb-4">
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview & Leads
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            Analytics
          </button>
        </li>
      </ul>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <>
          {/* Stats Cards */}
          {stats && (
            <div className="row g-3 mb-4">
              <div className="col-md-3">
                <div className="card border-0 shadow-sm">
                  <div className="card-body text-center">
                    <div className="fs-4 fw-bold">{stats.total_leads}</div>
                    <div className="text-muted small">Total Leads</div>
                  </div>
                </div>
              </div>
              <div className="col-md-3">
                <div className="card border-0 shadow-sm">
                  <div className="card-body text-center">
                    <div className="fs-4 fw-bold">{stats.total_actions}</div>
                    <div className="text-muted small">Total Actions</div>
                  </div>
                </div>
              </div>
              <div className="col-md-3">
                <div className="card border-0 shadow-sm">
                  <div className="card-body text-center">
                    <div className="fs-4 fw-bold text-success">{stats.actions_by_status?.sent || 0}</div>
                    <div className="text-muted small">Sent</div>
                  </div>
                </div>
              </div>
              <div className="col-md-3">
                <div className="card border-0 shadow-sm">
                  <div className="card-body text-center">
                    <div className="fs-4 fw-bold text-primary">{stats.ai_generated_count}</div>
                    <div className="text-muted small">AI Generated</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Channel & Action Breakdown */}
          {stats && (
            <div className="row g-3 mb-4">
              <div className="col-md-6">
                <div className="card border-0 shadow-sm">
                  <div className="card-header bg-white fw-semibold">Actions by Channel</div>
                  <div className="card-body">
                    {Object.entries(stats.actions_by_channel || {}).map(([ch, count]) => (
                      <div key={ch} className="d-flex justify-content-between mb-1">
                        <span className="text-capitalize">{ch}</span>
                        <span className="fw-bold">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="col-md-6">
                <div className="card border-0 shadow-sm">
                  <div className="card-header bg-white fw-semibold">Actions by Status</div>
                  <div className="card-body">
                    {Object.entries(stats.actions_by_status || {}).map(([st, count]) => (
                      <div key={st} className="d-flex justify-content-between mb-1">
                        <span className="text-capitalize">{st}</span>
                        <span className="fw-bold">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Enrolled Leads */}
          <div className="card border-0 shadow-sm mb-4">
            <div className="card-header bg-white d-flex justify-content-between align-items-center">
              <span className="fw-semibold">Enrolled Leads ({leads.length})</span>
              <div className="d-flex gap-2">
                <button className="btn btn-outline-primary btn-sm" onClick={handleShowMatchingLeads}>
                  + Enroll Matching Leads
                </button>
              </div>
            </div>
            <div className="card-body p-0">
              {leads.length === 0 ? (
                <div className="text-center py-4 text-muted">
                  No leads enrolled yet. Use the button above to find and enroll matching leads.
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>Name</th>
                        <th>Company</th>
                        <th>Title</th>
                        <th>Score</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Enrolled</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {leads.map((cl) => (
                        <tr key={cl.id}>
                          <td>{cl.lead?.name}</td>
                          <td>{cl.lead?.company}</td>
                          <td>{cl.lead?.title}</td>
                          <td>{cl.lead?.lead_score}</td>
                          <td>
                            <span className={`badge ${cl.lead?.lead_source_type === 'cold' ? 'bg-info' : 'bg-warning'} text-dark`}>
                              {cl.lead?.lead_source_type || 'warm'}
                            </span>
                          </td>
                          <td>
                            <span className={`badge bg-${cl.status === 'active' ? 'success' : cl.status === 'completed' ? 'info' : 'secondary'}`}>
                              {cl.status}
                            </span>
                          </td>
                          <td className="small">{new Date(cl.enrolled_at).toLocaleDateString()}</td>
                          <td>
                            <button
                              className="btn btn-outline-danger btn-sm"
                              onClick={() => handleRemoveLead(cl.lead_id)}
                              title="Remove from campaign"
                            >
                              x
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* AI System Prompt */}
          {campaign.ai_system_prompt && (
            <div className="card border-0 shadow-sm mb-4">
              <div className="card-header bg-white fw-semibold">AI System Prompt (Campaign Persona)</div>
              <div className="card-body">
                <pre className="mb-0 small" style={{ whiteSpace: 'pre-wrap' }}>{campaign.ai_system_prompt}</pre>
              </div>
            </div>
          )}
        </>
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <>
          {analyticsLoading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" />
              <div className="text-muted mt-2">Loading analytics...</div>
            </div>
          ) : !analytics ? (
            <div className="text-center py-5 text-muted">
              No analytics data available yet. Analytics require interaction outcomes to be recorded.
            </div>
          ) : (
            <>
              {/* KPI Cards */}
              <div className="row g-3 mb-4">
                <div className="col-md-2">
                  <div className="card border-0 shadow-sm">
                    <div className="card-body text-center p-3">
                      <div className="fs-5 fw-bold">{analytics.overview.sent_count}</div>
                      <div className="text-muted small">Sent</div>
                    </div>
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="card border-0 shadow-sm">
                    <div className="card-body text-center p-3">
                      <div className="fs-5 fw-bold text-primary">{pct(analytics.overview.open_rate)}</div>
                      <div className="text-muted small">Open Rate</div>
                    </div>
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="card border-0 shadow-sm">
                    <div className="card-body text-center p-3">
                      <div className="fs-5 fw-bold text-info">{pct(analytics.overview.click_rate)}</div>
                      <div className="text-muted small">Click Rate</div>
                    </div>
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="card border-0 shadow-sm">
                    <div className="card-body text-center p-3">
                      <div className="fs-5 fw-bold text-success">{pct(analytics.overview.reply_rate)}</div>
                      <div className="text-muted small">Reply Rate</div>
                    </div>
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="card border-0 shadow-sm">
                    <div className="card-body text-center p-3">
                      <div className="fs-5 fw-bold" style={{ color: '#6f42c1' }}>{analytics.overview.meetings_booked}</div>
                      <div className="text-muted small">Meetings</div>
                    </div>
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="card border-0 shadow-sm">
                    <div className="card-body text-center p-3">
                      <div className="fs-5 fw-bold text-warning">{pct(analytics.overview.conversion_rate)}</div>
                      <div className="text-muted small">Conversion</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Cost KPIs (only if budget exists) */}
              {(analytics.overview.budget_total || analytics.overview.budget_spent > 0) && (
                <div className="row g-3 mb-4">
                  <div className="col-md-3">
                    <div className="card border-0 shadow-sm">
                      <div className="card-body text-center p-3">
                        <div className="fs-5 fw-bold">{currency(analytics.overview.budget_total)}</div>
                        <div className="text-muted small">Budget</div>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-3">
                    <div className="card border-0 shadow-sm">
                      <div className="card-body text-center p-3">
                        <div className="fs-5 fw-bold">{currency(analytics.overview.budget_spent)}</div>
                        <div className="text-muted small">Spent</div>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-3">
                    <div className="card border-0 shadow-sm">
                      <div className="card-body text-center p-3">
                        <div className="fs-5 fw-bold">{currency(analytics.overview.cost_per_lead)}</div>
                        <div className="text-muted small">Cost / Lead</div>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-3">
                    <div className="card border-0 shadow-sm">
                      <div className="card-body text-center p-3">
                        <div className="fs-5 fw-bold">{currency(analytics.overview.cost_per_meeting)}</div>
                        <div className="text-muted small">Cost / Meeting</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Conversion Funnel */}
              {analytics.funnel.length > 0 && (
                <div className="card border-0 shadow-sm mb-4">
                  <div className="card-header bg-white fw-semibold">Conversion Funnel</div>
                  <div className="card-body">
                    <div className="row g-2 mb-3">
                      {analytics.funnel.map((s) => (
                        <div key={s.stage} className="col text-center">
                          <div className="small text-muted">{s.stage}</div>
                          <div className="h5 fw-bold mb-0">{s.count}</div>
                          <div className="small text-muted">{pct(s.rate)}</div>
                        </div>
                      ))}
                    </div>
                    <ResponsiveContainer width="100%" height={180}>
                      <FunnelChart>
                        <Tooltip formatter={(value: any) => [value, 'Count']} />
                        <Funnel
                          dataKey="count"
                          data={analytics.funnel.map((s) => ({ name: s.stage, count: s.count }))}
                          isAnimationActive
                        >
                          <LabelList position="center" fill="#fff" fontSize={12} />
                          {analytics.funnel.map((_e, i) => (
                            <Cell key={i} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} />
                          ))}
                        </Funnel>
                      </FunnelChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Channel Performance */}
              {analytics.channel_performance.length > 0 && (
                <div className="card border-0 shadow-sm mb-4">
                  <div className="card-header bg-white fw-semibold">Channel Performance</div>
                  <div className="card-body">
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={analytics.channel_performance}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="channel" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="sent" fill="#0d6efd" name="Sent" />
                        <Bar dataKey="opened" fill="#0dcaf0" name="Opened" />
                        <Bar dataKey="clicked" fill="#6f42c1" name="Clicked" />
                        <Bar dataKey="replied" fill="#198754" name="Replied" />
                        <Bar dataKey="meetings" fill="#fd7e14" name="Meetings" />
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="table-responsive mt-3">
                      <table className="table table-sm table-hover mb-0">
                        <thead className="table-light">
                          <tr>
                            <th>Channel</th>
                            <th className="text-end">Sent</th>
                            <th className="text-end">Opened</th>
                            <th className="text-end">Clicked</th>
                            <th className="text-end">Replied</th>
                            <th className="text-end">Open Rate</th>
                            <th className="text-end">Reply Rate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analytics.channel_performance.map((ch) => (
                            <tr key={ch.channel}>
                              <td className="text-capitalize fw-medium">{ch.channel}</td>
                              <td className="text-end">{ch.sent}</td>
                              <td className="text-end">{ch.opened}</td>
                              <td className="text-end">{ch.clicked}</td>
                              <td className="text-end">{ch.replied}</td>
                              <td className="text-end">{pct(ch.open_rate)}</td>
                              <td className="text-end">{pct(ch.reply_rate)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Daily Activity Trend */}
              {analytics.daily_series.length > 0 && (
                <div className="card border-0 shadow-sm mb-4">
                  <div className="card-header bg-white fw-semibold">Daily Activity</div>
                  <div className="card-body">
                    <ResponsiveContainer width="100%" height={250}>
                      <LineChart data={analytics.daily_series}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Line type="monotone" dataKey="sent" stroke="#0d6efd" strokeWidth={2} name="Sent" />
                        <Line type="monotone" dataKey="opened" stroke="#0dcaf0" strokeWidth={2} name="Opened" />
                        <Line type="monotone" dataKey="replied" stroke="#198754" strokeWidth={2} name="Replied" />
                        <Line type="monotone" dataKey="bounced" stroke="#dc3545" strokeWidth={1} name="Bounced" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Step-by-Step Performance */}
              {analytics.step_performance.length > 0 && (
                <div className="card border-0 shadow-sm mb-4">
                  <div className="card-header bg-white fw-semibold">Step-by-Step Performance</div>
                  <div className="card-body p-0">
                    <div className="table-responsive">
                      <table className="table table-hover mb-0">
                        <thead className="table-light">
                          <tr>
                            <th>Step</th>
                            <th>Channel</th>
                            <th className="text-end">Total</th>
                            <th className="text-end">Sent</th>
                            <th className="text-end">Opened</th>
                            <th className="text-end">Replied</th>
                            <th className="text-end">AI Gen</th>
                            <th className="text-end">Open Rate</th>
                            <th className="text-end">Reply Rate</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analytics.step_performance.map((step) => (
                            <tr key={`${step.step_index}-${step.channel}`}>
                              <td className="fw-medium">Step {step.step_index + 1}</td>
                              <td className="text-capitalize">{step.channel}</td>
                              <td className="text-end">{step.total}</td>
                              <td className="text-end">{step.sent}</td>
                              <td className="text-end">{step.opened}</td>
                              <td className="text-end">{step.replied}</td>
                              <td className="text-end">
                                <span className={step.ai_generated > 0 ? 'text-primary fw-bold' : ''}>
                                  {step.ai_generated}
                                </span>
                              </td>
                              <td className="text-end">{pct(step.open_rate)}</td>
                              <td className="text-end">{pct(step.reply_rate)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Lead Outcomes */}
              {analytics.lead_outcomes.length > 0 && (
                <div className="card border-0 shadow-sm mb-4">
                  <div className="card-header bg-white fw-semibold">Lead Outcomes</div>
                  <div className="card-body">
                    <div className="row g-3">
                      {analytics.lead_outcomes.map((lo) => (
                        <div key={lo.outcome} className="col-md-3 col-sm-4">
                          <div className="border rounded p-3 text-center">
                            <div className="fs-4 fw-bold">{lo.count}</div>
                            <div className="text-muted small text-capitalize">{lo.outcome.replace(/_/g, ' ')}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Enroll Modal */}
      {showEnrollModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Enroll Matching Leads ({matchingLeads.length} found)</h5>
                <button className="btn-close" onClick={() => setShowEnrollModal(false)} />
              </div>
              <div className="modal-body" style={{ maxHeight: '400px', overflow: 'auto' }}>
                {matchingLeads.length === 0 ? (
                  <p className="text-muted text-center">No matching leads found. Try adjusting targeting criteria.</p>
                ) : (
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>
                          <input
                            type="checkbox"
                            checked={selectedLeadIds.length === matchingLeads.length}
                            onChange={(e) =>
                              setSelectedLeadIds(e.target.checked ? matchingLeads.map((l: any) => l.id) : [])
                            }
                          />
                        </th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Company</th>
                        <th>Title</th>
                        <th>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchingLeads.map((lead: any) => (
                        <tr key={lead.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedLeadIds.includes(lead.id)}
                              onChange={(e) =>
                                setSelectedLeadIds(
                                  e.target.checked
                                    ? [...selectedLeadIds, lead.id]
                                    : selectedLeadIds.filter((i) => i !== lead.id)
                                )
                              }
                            />
                          </td>
                          <td>{lead.name}</td>
                          <td className="small">{lead.email}</td>
                          <td>{lead.company}</td>
                          <td>{lead.title}</td>
                          <td>{lead.lead_score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowEnrollModal(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  disabled={selectedLeadIds.length === 0 || enrolling}
                  onClick={handleEnroll}
                >
                  {enrolling ? 'Enrolling...' : `Enroll ${selectedLeadIds.length} Lead(s)`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminCampaignDetailPage;
