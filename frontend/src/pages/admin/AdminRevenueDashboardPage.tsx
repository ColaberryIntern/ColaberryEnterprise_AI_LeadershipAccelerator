import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, FunnelChart, Funnel, LabelList, Cell,
} from 'recharts';
import api from '../../utils/api';
import { PageHeader, StatCard, StatusBadge, SectionCard } from '../../components/admin/shell';
import { TrustSignal } from '../../components/admin/shell/trust';

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

// Funnel segment colors drawn from the shared chart palette (brand tokens).
const FUNNEL_COLORS = [
  'var(--chart-1)', 'var(--chart-5)', 'var(--chart-6)',
  'var(--chart-4)', 'var(--chart-7)', 'var(--chart-3)',
];

type BadgeTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'primary';

// Campaign type -> semantic badge tone (replaces hardcoded Bootstrap bg-* on raw types).
const TYPE_TONE: Record<string, BadgeTone> = {
  warm_nurture: 'warning',
  cold_outbound: 'info',
  re_engagement: 'neutral',
};

const STATUS_TONE: Record<string, BadgeTone> = {
  active: 'success',
  completed: 'info',
  paused: 'warning',
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

  /* ---------- per-page trust signal ---------- */

  const trust: TrustSignal = useMemo(() => ({
    level: 'live',
    source: 'revenue / paysimple',
    updatedAt: new Date().toISOString(),
    summary: 'Live revenue, pipeline forecast, and campaign attribution.',
    href: '/admin/trust',
    pillars: [
      {
        name: 'Freshness',
        status: 'live',
        evidence: [{ label: 'Source', value: 'revenue / paysimple' }],
      },
    ],
  }), []);

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
      <PageHeader
        title="Revenue Dashboard"
        icon="money-dollar-circle-line"
        subtitle="Actual revenue, weighted pipeline forecast, and campaign attribution."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Revenue' }]}
        trust={trust}
        actions={
          <button className="btn btn-outline-primary btn-sm" onClick={fetchDashboard} disabled={loading}>
            <i className="ri-refresh-line" aria-hidden="true" /> Refresh
          </button>
        }
      >
        <div className="row g-3">
          <div className="col-sm-6 col-lg-3">
            <StatCard
              label="Actual Revenue"
              value={formatCurrency(data.revenueForecast.actualRevenue)}
              icon="money-dollar-circle-line"
              tone="success"
              hint={`${data.revenueForecast.enrolled} enrolled`}
            />
          </div>
          <div className="col-sm-6 col-lg-3">
            <StatCard
              label="Pipeline Value"
              value={formatCurrency(data.revenueForecast.pipelineValue)}
              icon="funds-line"
              tone="info"
              hint={`${data.revenueForecast.qualifiedLeads} qualified`}
            />
          </div>
          <div className="col-sm-6 col-lg-3">
            <StatCard
              label="Projected Revenue"
              value={formatCurrency(data.revenueForecast.projectedRevenue)}
              icon="line-chart-line"
              tone="primary"
              hint={`~${data.revenueForecast.projectedEnrollments} projected`}
            />
          </div>
          <div className="col-sm-6 col-lg-3">
            <StatCard
              label="Price / Seat"
              value="$4,500"
              icon="price-tag-3-line"
              tone="neutral"
            />
          </div>
        </div>
      </PageHeader>

      <div className="row g-4">
        {/* Left Column */}
        <div className="col-lg-8">
          {/* Pipeline Funnel */}
          <SectionCard title="Pipeline Funnel" icon="filter-3-line" className="mb-4">
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
                    <LabelList position="center" fill="var(--text-on-accent)" fontSize={12} />
                    {funnelData.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={FUNNEL_COLORS[index % FUNNEL_COLORS.length]} />
                    ))}
                  </Funnel>
                </FunnelChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          {/* Lead Velocity */}
          <SectionCard title="Lead Velocity (Last 12 Weeks)" icon="line-chart-line" className="mb-4">
            {data.leadVelocity.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={data.leadVelocity}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted small text-center mb-0">No data yet</p>
            )}
          </SectionCard>

          {/* Conversion by Source */}
          <SectionCard title="Conversion by Source" icon="bar-chart-2-line" className="mb-4">
            {data.conversionBySource.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.conversionBySource}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="source" tick={{ fontSize: 10 }} />
                  <YAxis unit="%" />
                  <Tooltip />
                  <Bar dataKey="rate" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted small text-center mb-0">No data yet</p>
            )}
          </SectionCard>

          {/* Campaign Attribution */}
          {data.campaignAttribution && (
            <>
              {/* By Type Summary */}
              {data.campaignAttribution.by_type.length > 0 && (
                <SectionCard title="Campaign Performance by Type" icon="bar-chart-grouped-line" className="mb-4">
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
                      <Bar dataKey="leads" fill="var(--chart-1)" name="Leads" />
                      <Bar dataKey="meetings" fill="var(--chart-4)" name="Meetings" />
                      <Bar dataKey="conversions" fill="var(--chart-3)" name="Conversions" />
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
                              <StatusBadge label={t.type.replace(/_/g, ' ')} tone={TYPE_TONE[t.type] || 'neutral'} />
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
                </SectionCard>
              )}

              {/* Per-Campaign Table */}
              {data.campaignAttribution.campaigns.length > 0 && (
                <SectionCard title="Campaign Attribution" icon="megaphone-line" padded={false} className="mb-4">
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
                              <StatusBadge label={c.type.replace(/_/g, ' ')} tone={TYPE_TONE[c.type] || 'neutral'} />
                            </td>
                            <td>
                              <StatusBadge label={c.status} tone={STATUS_TONE[c.status] || 'neutral'} />
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
                </SectionCard>
              )}
            </>
          )}
        </div>

        {/* Right Column */}
        <div className="col-lg-4">
          {/* Upcoming Appointments */}
          <SectionCard title="Upcoming Appointments" icon="calendar-event-line" className="mb-4">
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
          </SectionCard>

          {/* Recent Activities */}
          <SectionCard title="Recent Activity" icon="history-line">
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
          </SectionCard>
        </div>
      </div>
    </>
  );
}

export default AdminRevenueDashboardPage;
