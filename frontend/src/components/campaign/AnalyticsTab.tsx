import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, FunnelChart, Funnel, LabelList, Cell,
} from 'recharts';

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

interface Props {
  analytics: AnalyticsData | null;
  loading: boolean;
}

const FUNNEL_COLORS = ['#0d6efd', '#0dcaf0', '#6f42c1', '#fd7e14', '#198754', '#ffc107'];

export default function AnalyticsTab({ analytics, loading }: Props) {
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const currency = (v: number | null) => v != null ? `$${v.toFixed(2)}` : '—';

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" />
        <div className="text-muted mt-2">Loading analytics...</div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center py-5 text-muted">
        No analytics data available yet. Analytics require interaction outcomes to be recorded.
      </div>
    );
  }

  return (
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

      {/* Cost KPIs */}
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

      {/* Step Performance */}
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
  );
}
