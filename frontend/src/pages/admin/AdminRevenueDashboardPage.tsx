import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, FunnelChart, Funnel, LabelList, Cell,
} from 'recharts';
import api from '../../utils/api';
import Breadcrumb from '../../components/ui/Breadcrumb';

interface DashboardData {
  pipelineCounts: Record<string, number>;
  funnelConversions: { from: string; to: string; rate: number }[];
  leadVelocity: { week: string; count: number }[];
  conversionBySource: { source: string; total: number; enrolled: number; rate: number }[];
  revenueForecast: {
    actualRevenue: number;
    projectedEnrollments: number;
    projectedRevenue: number;
    pipelineValue: number;
    enrolled: number;
    qualifiedLeads: number;
  };
  upcomingAppointments: any[];
  recentActivities: any[];
  campaignAttribution?: {
    campaigns: Array<{
      id: string;
      name: string;
      type: string;
      status: string;
      total_leads: number;
      total_sent: number;
      meetings_booked: number;
      conversions: number;
      conversion_rate: number;
      budget_spent: number;
    }>;
    by_type: Array<{
      type: string;
      campaigns: number;
      leads: number;
      conversions: number;
      meetings: number;
    }>;
  };
}

const STAGE_LABELS: Record<string, string> = {
  new_lead: 'New Lead',
  contacted: 'Contacted',
  meeting_scheduled: 'Meeting',
  proposal_sent: 'Proposal',
  negotiation: 'Negotiation',
  enrolled: 'Enrolled',
  lost: 'Lost',
};

const FUNNEL_COLORS = ['#0dcaf0', '#0d6efd', '#6f42c1', '#fd7e14', '#ffc107', '#198754'];

const TYPE_COLORS: Record<string, string> = {
  warm_nurture: 'warning',
  cold_outbound: 'info',
  re_engagement: 'secondary',
};

function AdminRevenueDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const res = await api.get('/api/admin/revenue/dashboard');
      setData(res.data);
    } catch (err) {
      console.error('Failed to fetch revenue dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number) => {
    return '$' + val.toLocaleString();
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="text-center text-muted py-5">Failed to load dashboard</div>;
  }

  // Prepare funnel data
  const funnelData = Object.entries(data.pipelineCounts)
    .filter(([stage]) => stage !== 'lost')
    .map(([stage, count]) => ({
      name: STAGE_LABELS[stage] || stage,
      value: count,
    }));

  return (
    <>
      <Breadcrumb items={[{ label: 'Dashboard', to: '/admin/dashboard' }, { label: 'Revenue' }]} />
      <h1 className="h3 fw-bold mb-4" style={{ color: 'var(--color-primary)' }}>
        Revenue Dashboard
      </h1>

      {/* Revenue KPI Cards */}
      <div className="row g-3 mb-4">
        <div className="col-md-3">
          <div className="card border-0 shadow-sm p-3 text-center">
            <div className="text-muted small mb-1">Actual Revenue</div>
            <div className="h4 fw-bold mb-0 text-success">
              {formatCurrency(data.revenueForecast.actualRevenue)}
            </div>
            <div className="text-muted small">{data.revenueForecast.enrolled} enrolled</div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card border-0 shadow-sm p-3 text-center">
            <div className="text-muted small mb-1">Pipeline Value</div>
            <div className="h4 fw-bold mb-0 text-primary">
              {formatCurrency(data.revenueForecast.pipelineValue)}
            </div>
            <div className="text-muted small">{data.revenueForecast.qualifiedLeads} qualified</div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card border-0 shadow-sm p-3 text-center">
            <div className="text-muted small mb-1">Projected Revenue</div>
            <div className="h4 fw-bold mb-0" style={{ color: '#6f42c1' }}>
              {formatCurrency(data.revenueForecast.projectedRevenue)}
            </div>
            <div className="text-muted small">~{data.revenueForecast.projectedEnrollments} projected</div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card border-0 shadow-sm p-3 text-center">
            <div className="text-muted small mb-1">Price / Seat</div>
            <div className="h4 fw-bold mb-0">$4,500</div>
          </div>
        </div>
      </div>

      <div className="row g-4">
        {/* Left Column */}
        <div className="col-lg-8">
          {/* Pipeline Funnel */}
          <div className="card border-0 shadow-sm mb-4">
            <div className="card-header bg-white fw-bold py-3">Pipeline Funnel</div>
            <div className="card-body">
              <div className="row g-2 mb-3">
                {Object.entries(data.pipelineCounts).map(([stage, count]) => (
                  <div key={stage} className="col">
                    <div className="text-center">
                      <div className="small text-muted">{STAGE_LABELS[stage] || stage}</div>
                      <div className="h5 fw-bold mb-0">{count}</div>
                    </div>
                  </div>
                ))}
              </div>
              {funnelData.length > 0 && (
                <ResponsiveContainer width="100%" height={200}>
                  <FunnelChart>
                    <Tooltip />
                    <Funnel dataKey="value" data={funnelData} isAnimationActive>
                      <LabelList position="center" fill="#fff" fontSize={12} />
                      {funnelData.map((_entry, index) => (
                        <Cell key={`cell-${index}`} fill={FUNNEL_COLORS[index % FUNNEL_COLORS.length]} />
                      ))}
                    </Funnel>
                  </FunnelChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Lead Velocity */}
          <div className="card border-0 shadow-sm mb-4">
            <div className="card-header bg-white fw-bold py-3">Lead Velocity (Last 12 Weeks)</div>
            <div className="card-body">
              {data.leadVelocity.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={data.leadVelocity}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="count" stroke="#0d6efd" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted small text-center mb-0">No data yet</p>
              )}
            </div>
          </div>

          {/* Conversion by Source */}
          <div className="card border-0 shadow-sm mb-4">
            <div className="card-header bg-white fw-bold py-3">Conversion by Source</div>
            <div className="card-body">
              {data.conversionBySource.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.conversionBySource}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="source" tick={{ fontSize: 10 }} />
                    <YAxis unit="%" />
                    <Tooltip />
                    <Bar dataKey="rate" fill="#198754" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted small text-center mb-0">No data yet</p>
              )}
            </div>
          </div>

          {/* Campaign Attribution */}
          {data.campaignAttribution && (
            <>
              {/* By Type Summary */}
              {data.campaignAttribution.by_type.length > 0 && (
                <div className="card border-0 shadow-sm mb-4">
                  <div className="card-header bg-white fw-bold py-3">Campaign Performance by Type</div>
                  <div className="card-body">
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={data.campaignAttribution.by_type}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="type"
                          tick={{ fontSize: 10 }}
                          tickFormatter={(v: string) => v.replace(/_/g, ' ')}
                        />
                        <YAxis allowDecimals={false} />
                        <Tooltip labelFormatter={(v: any) => String(v).replace(/_/g, ' ')} />
                        <Bar dataKey="leads" fill="#0d6efd" name="Leads" />
                        <Bar dataKey="meetings" fill="#fd7e14" name="Meetings" />
                        <Bar dataKey="conversions" fill="#198754" name="Conversions" />
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="table-responsive mt-3">
                      <table className="table table-sm mb-0">
                        <thead className="table-light">
                          <tr>
                            <th>Type</th>
                            <th className="text-end">Campaigns</th>
                            <th className="text-end">Leads</th>
                            <th className="text-end">Meetings</th>
                            <th className="text-end">Conversions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.campaignAttribution.by_type.map((t) => (
                            <tr key={t.type}>
                              <td>
                                <span className={`badge bg-${TYPE_COLORS[t.type] || 'secondary'} me-1`}>
                                  {t.type.replace(/_/g, ' ')}
                                </span>
                              </td>
                              <td className="text-end">{t.campaigns}</td>
                              <td className="text-end">{t.leads}</td>
                              <td className="text-end">{t.meetings}</td>
                              <td className="text-end">{t.conversions}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Per-Campaign Table */}
              {data.campaignAttribution.campaigns.length > 0 && (
                <div className="card border-0 shadow-sm mb-4">
                  <div className="card-header bg-white fw-bold py-3">Campaign Attribution</div>
                  <div className="card-body p-0">
                    <div className="table-responsive">
                      <table className="table table-hover mb-0">
                        <thead className="table-light">
                          <tr>
                            <th>Campaign</th>
                            <th>Type</th>
                            <th>Status</th>
                            <th className="text-end">Leads</th>
                            <th className="text-end">Sent</th>
                            <th className="text-end">Meetings</th>
                            <th className="text-end">Conv.</th>
                            <th className="text-end">Conv. Rate</th>
                            <th className="text-end">Spent</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.campaignAttribution.campaigns.map((c) => (
                            <tr key={c.id}>
                              <td>
                                <Link to={`/admin/campaigns/${c.id}`} className="text-decoration-none fw-medium">
                                  {c.name}
                                </Link>
                              </td>
                              <td>
                                <span className={`badge bg-${TYPE_COLORS[c.type] || 'secondary'}`}>
                                  {c.type.replace(/_/g, ' ')}
                                </span>
                              </td>
                              <td>
                                <span className={`badge bg-${c.status === 'active' ? 'success' : c.status === 'completed' ? 'info' : c.status === 'paused' ? 'warning' : 'secondary'}`}>
                                  {c.status}
                                </span>
                              </td>
                              <td className="text-end">{c.total_leads}</td>
                              <td className="text-end">{c.total_sent}</td>
                              <td className="text-end">{c.meetings_booked}</td>
                              <td className="text-end">{c.conversions}</td>
                              <td className="text-end">{pct(c.conversion_rate)}</td>
                              <td className="text-end">{formatCurrency(c.budget_spent)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right Column */}
        <div className="col-lg-4">
          {/* Upcoming Appointments */}
          <div className="card border-0 shadow-sm mb-4">
            <div className="card-header bg-white fw-bold py-3">Upcoming Appointments</div>
            <div className="card-body">
              {data.upcomingAppointments.length === 0 ? (
                <p className="text-muted small mb-0">No upcoming appointments</p>
              ) : (
                data.upcomingAppointments.map((apt: any) => (
                  <div key={apt.id} className="mb-3 pb-2 border-bottom">
                    <div className="fw-medium small">{apt.title}</div>
                    {apt.lead && (
                      <Link to={`/admin/leads/${apt.lead.id}`} className="text-decoration-none small">
                        {apt.lead.name}
                        {apt.lead.company ? ` (${apt.lead.company})` : ''}
                      </Link>
                    )}
                    <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                      {formatDate(apt.scheduled_at)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Activities */}
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white fw-bold py-3">Recent Activity</div>
            <div className="card-body">
              {data.recentActivities.length === 0 ? (
                <p className="text-muted small mb-0">No recent activity</p>
              ) : (
                data.recentActivities.map((act: any) => (
                  <div key={act.id} className="mb-2 pb-2 border-bottom">
                    <div className="d-flex justify-content-between">
                      <span className="small fw-medium">
                        {act.subject || act.type}
                      </span>
                      <span className="text-muted" style={{ fontSize: '0.7rem' }}>
                        {formatDate(act.created_at)}
                      </span>
                    </div>
                    {act.lead && (
                      <Link to={`/admin/leads/${act.lead.id}`} className="text-muted text-decoration-none" style={{ fontSize: '0.75rem' }}>
                        {act.lead.name}
                      </Link>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default AdminRevenueDashboardPage;
