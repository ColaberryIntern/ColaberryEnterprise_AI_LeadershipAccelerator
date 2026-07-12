import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell,
} from 'recharts';
import api from '../../utils/api';
import { PageHeader, StatCard, StatusBadge, SectionCard } from '../../components/admin/shell';
import { TrustSignal } from '../../components/admin/shell/trust';

const COLORS = [
  'var(--chart-1)', 'var(--chart-3)', 'var(--chart-5)', 'var(--chart-4)',
  'var(--chart-6)', 'var(--chart-2)', 'var(--chart-7)', 'var(--chart-8)',
];

interface InsightEntry {
  value: string;
  rate: number;
  sample_size: number;
  confidence: number;
}

interface Recommendation {
  dimension_type: string;
  dimension_value: string;
  metric_name: string;
  metric_value: number;
  sample_size: number;
  confidence: number;
  rank: number;
}

interface OutcomeStat {
  outcome: string;
  channel: string;
  count: string;
}

interface DailyTrend {
  date: string;
  outcome: string;
  count: string;
}

type BadgeTone = 'success' | 'warning' | 'neutral';

function AdminICPInsightsPage() {
  const [summary, setSummary] = useState<Record<string, any> | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [outcomeStats, setOutcomeStats] = useState<OutcomeStat[]>([]);
  const [dailyTrend, setDailyTrend] = useState<DailyTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [campaignType, setCampaignType] = useState('all');
  const [metricName, setMetricName] = useState('response_rate');
  const [periodDays, setPeriodDays] = useState(30);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, recsRes, statsRes] = await Promise.all([
        api.get(`/api/admin/insights/summary?campaign_type=${campaignType}`),
        api.get(`/api/admin/insights/recommendations?campaign_type=${campaignType}&metric_name=${metricName}`),
        api.get(`/api/admin/insights/outcome-stats?days=${periodDays}`),
      ]);
      setSummary(summaryRes.data.summary);
      setRecommendations(recsRes.data.recommendations);
      setOutcomeStats(statsRes.data.outcomes || []);
      setDailyTrend(statsRes.data.daily_trend || []);
    } catch (err) {
      console.error('Failed to fetch insights:', err);
    } finally {
      setLoading(false);
    }
  }, [campaignType, metricName, periodDays]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCompute = async () => {
    setComputing(true);
    try {
      await api.post('/api/admin/insights/compute', { period_days: 90 });
      await fetchData();
    } catch (err) {
      console.error('Failed to compute insights:', err);
    } finally {
      setComputing(false);
    }
  };

  // Aggregate outcome stats for charts
  const outcomeChartData = useMemo(() => {
    const byOutcome: Record<string, number> = {};
    for (const s of outcomeStats) {
      byOutcome[s.outcome] = (byOutcome[s.outcome] || 0) + parseInt(s.count, 10);
    }
    return Object.entries(byOutcome)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [outcomeStats]);

  const channelChartData = useMemo(() => {
    const byChannel: Record<string, number> = {};
    for (const s of outcomeStats) {
      byChannel[s.channel] = (byChannel[s.channel] || 0) + parseInt(s.count, 10);
    }
    return Object.entries(byChannel).map(([name, value]) => ({ name, value }));
  }, [outcomeStats]);

  // Build daily trend chart data
  const trendChartData = useMemo(() => {
    const dateMap: Record<string, Record<string, number>> = {};
    for (const d of dailyTrend) {
      const date = d.date?.substring(0, 10) || '';
      if (!dateMap[date]) dateMap[date] = {};
      dateMap[date][d.outcome] = parseInt(d.count, 10);
    }
    return Object.entries(dateMap)
      .map(([date, outcomes]) => ({ date, ...outcomes }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [dailyTrend]);

  // Per-page trust signal — ICP analytics are recomputed from live interaction outcomes.
  const trust: TrustSignal = useMemo(() => {
    const totalOutcomes = summary?._stats?.total_outcomes ?? 0;
    const lastComputed = summary?._stats?.last_computed ?? null;
    return {
      level: 'live',
      source: 'ICP analytics',
      updatedAt: new Date().toISOString(),
      summary: `${recommendations.length} targeting recommendations from ${Number(totalOutcomes).toLocaleString()} interaction outcomes.`,
      href: '/admin/trust',
      pillars: [
        {
          name: 'Freshness',
          status: 'live',
          evidence: [
            { label: 'Last computed', value: lastComputed ? new Date(lastComputed).toLocaleDateString() : 'Never' },
          ],
        },
      ],
    };
  }, [summary, recommendations.length]);

  const formatPercent = (v: number) => `${(v * 100).toFixed(1)}%`;
  const confidenceLabel = (c: number) => {
    if (c >= 0.3) return 'High';
    if (c >= 0.15) return 'Medium';
    return 'Low';
  };
  const confidenceTone = (c: number): BadgeTone => {
    if (c >= 0.3) return 'success';
    if (c >= 0.15) return 'warning';
    return 'neutral';
  };

  const metricLabels: Record<string, string> = {
    response_rate: 'Response Rate',
    booking_rate: 'Booking Rate',
    open_rate: 'Open Rate',
    conversion_rate: 'Conversion Rate',
  };

  const dimensionLabels: Record<string, string> = {
    industry: 'Industry',
    title_category: 'Title Category',
    company_size: 'Company Size',
    source_type: 'Source Type',
    industry_x_title: 'Industry + Title',
  };

  if (loading) {
    return (
      <>
        <PageHeader
          title="ICP Insights"
          icon="lightbulb-line"
          subtitle="Targeting intelligence computed from interaction outcomes by industry, title, company size, and source."
          breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Insights' }]}
          trust={trust}
        />
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="ICP Insights"
        icon="lightbulb-line"
        subtitle="Targeting intelligence computed from interaction outcomes by industry, title, company size, and source."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Insights' }]}
        trust={trust}
        actions={
          <button className="btn btn-outline-primary btn-sm" onClick={handleCompute} disabled={computing}>
            <i className="ri-refresh-line" aria-hidden="true" /> {computing ? 'Computing...' : 'Recompute Insights'}
          </button>
        }
      >
        <div className="row g-3">
          <div className="col-6 col-lg-3">
            <StatCard
              label="Total Interactions"
              value={(summary?._stats?.total_outcomes ?? 0).toLocaleString()}
              icon="exchange-line"
              tone="primary"
            />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard
              label="Last 90 Days"
              value={(summary?._stats?.recent_outcomes_90d ?? 0).toLocaleString()}
              icon="calendar-check-line"
              tone="success"
            />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard
              label="Top Recommendations"
              value={recommendations.length}
              icon="medal-line"
              tone="info"
            />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard
              label="Last Computed"
              value={summary?._stats?.last_computed
                ? new Date(summary._stats.last_computed).toLocaleDateString()
                : 'Never'}
              icon="time-line"
              tone="neutral"
            />
          </div>
        </div>
      </PageHeader>

      {/* Filters */}
      <SectionCard className="mb-4">
        <div className="row g-3 align-items-end">
          <div className="col-md-3">
            <label className="form-label small fw-bold">Campaign Type</label>
            <select
              className="form-select form-select-sm"
              value={campaignType}
              onChange={(e) => setCampaignType(e.target.value)}
            >
              <option value="all">All Campaigns</option>
              <option value="cold_outbound">Cold Outbound</option>
              <option value="warm_nurture">Warm Nurture</option>
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label small fw-bold">Metric</label>
            <select
              className="form-select form-select-sm"
              value={metricName}
              onChange={(e) => setMetricName(e.target.value)}
            >
              {Object.entries(metricLabels).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="col-md-3">
            <label className="form-label small fw-bold">Period</label>
            <select
              className="form-select form-select-sm"
              value={periodDays}
              onChange={(e) => setPeriodDays(parseInt(e.target.value, 10))}
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </div>
        </div>
      </SectionCard>

      {/* Targeting Recommendations */}
      {recommendations.length > 0 && (
        <SectionCard
          title={`Targeting Recommendations — ${metricLabels[metricName]}`}
          icon="focus-3-line"
          padded={false}
          className="mb-4"
        >
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th style={{ width: 50 }}>#</th>
                  <th>Segment</th>
                  <th>Dimension</th>
                  <th className="text-end">{metricLabels[metricName]}</th>
                  <th className="text-end">Sample Size</th>
                  <th className="text-center">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {recommendations.map((rec) => (
                  <tr key={`${rec.dimension_type}-${rec.dimension_value}`}>
                    <td>
                      <span className="badge rounded-pill" style={{ background: 'var(--red-500)' }}>{rec.rank}</span>
                    </td>
                    <td className="fw-bold">{rec.dimension_value}</td>
                    <td className="text-muted small">{dimensionLabels[rec.dimension_type] || rec.dimension_type}</td>
                    <td className="text-end fw-bold">{formatPercent(rec.metric_value)}</td>
                    <td className="text-end">{rec.sample_size}</td>
                    <td className="text-center">
                      <StatusBadge label={confidenceLabel(rec.confidence)} tone={confidenceTone(rec.confidence)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Outcome Distribution + Channel Distribution */}
      <div className="row g-4 mb-4">
        <div className="col-md-6">
          <SectionCard title="Outcome Distribution" icon="pie-chart-line" className="h-100">
            {outcomeChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={outcomeChartData} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="var(--chart-1)">
                    {outcomeChartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted small text-center mb-0">No outcome data yet. Interactions will appear here as campaigns run.</p>
            )}
          </SectionCard>
        </div>
        <div className="col-md-6">
          <SectionCard title="Channel Distribution" icon="bar-chart-grouped-line" className="h-100">
            {channelChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={channelChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" fill="var(--chart-3)">
                    {channelChartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted small text-center mb-0">No channel data yet.</p>
            )}
          </SectionCard>
        </div>
      </div>

      {/* Daily Trend */}
      <SectionCard title="Daily Interaction Trend" icon="line-chart-line" className="mb-4">
        {trendChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={trendChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="sent" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 3 }} name="Sent" />
              <Line type="monotone" dataKey="opened" stroke="var(--chart-3)" strokeWidth={2} dot={{ r: 3 }} name="Opened" />
              <Line type="monotone" dataKey="clicked" stroke="var(--chart-4)" strokeWidth={2} dot={{ r: 3 }} name="Clicked" />
              <Line type="monotone" dataKey="replied" stroke="var(--chart-5)" strokeWidth={2} dot={{ r: 3 }} name="Replied" />
              <Line type="monotone" dataKey="bounced" stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 3 }} name="Bounced" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-muted small text-center mb-0">No daily trend data yet.</p>
        )}
      </SectionCard>

      {/* Dimension Breakdowns */}
      {summary && ['industry', 'title_category', 'company_size', 'source_type'].map((dim) => {
        const dimData = summary[dim]?.[metricName] as InsightEntry[] | undefined;
        if (!dimData || dimData.length === 0) return null;

        const chartData = dimData.map((d) => ({
          name: d.value.length > 20 ? d.value.substring(0, 18) + '...' : d.value,
          rate: parseFloat((d.rate * 100).toFixed(1)),
          sample_size: d.sample_size,
        }));

        return (
          <SectionCard
            key={dim}
            title={`${dimensionLabels[dim]} — ${metricLabels[metricName]}`}
            icon="bar-chart-horizontal-line"
            className="mb-4"
          >
            <div className="row">
              <div className="col-md-7">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData} layout="vertical" margin={{ left: 100 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" unit="%" />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value: any) => [`${value}%`, metricLabels[metricName]]} />
                    <Bar dataKey="rate" fill="var(--chart-1)">
                      {chartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="col-md-5">
                <table className="table table-sm small mb-0">
                  <thead>
                    <tr>
                      <th>{dimensionLabels[dim]}</th>
                      <th className="text-end">Rate</th>
                      <th className="text-end">n</th>
                      <th className="text-center">Conf.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dimData.map((d) => (
                      <tr key={d.value}>
                        <td>{d.value}</td>
                        <td className="text-end fw-bold">{formatPercent(d.rate)}</td>
                        <td className="text-end">{d.sample_size}</td>
                        <td className="text-center">
                          <StatusBadge label={confidenceLabel(d.confidence)} tone={confidenceTone(d.confidence)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </SectionCard>
        );
      })}

      {/* Cross-dimensional: Industry x Title */}
      {summary?.industry_x_title?.response_rate?.length > 0 && (
        <SectionCard
          title="Industry + Title Combinations — Response Rate"
          icon="grid-line"
          padded={false}
          className="mb-4"
        >
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th>Industry</th>
                  <th>Title Category</th>
                  <th className="text-end">Response Rate</th>
                  <th className="text-end">Sample Size</th>
                  <th className="text-center">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {(summary!.industry_x_title.response_rate as InsightEntry[]).map((d) => {
                  const [industry, title] = d.value.split('::');
                  return (
                    <tr key={d.value}>
                      <td>{industry}</td>
                      <td>{title}</td>
                      <td className="text-end fw-bold">{formatPercent(d.rate)}</td>
                      <td className="text-end">{d.sample_size}</td>
                      <td className="text-center">
                        <StatusBadge label={confidenceLabel(d.confidence)} tone={confidenceTone(d.confidence)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Empty state */}
      {recommendations.length === 0 && outcomeChartData.length === 0 && (
        <SectionCard className="mb-4">
          <div className="text-center py-5">
            <h5 style={{ color: 'var(--text-muted)' }}>No Insight Data Yet</h5>
            <p className="text-muted small mb-3">
              Insights are computed from interaction outcomes. As campaigns send emails, make calls, and track opens/clicks,
              the system will automatically aggregate performance data by industry, title, company size, and source type.
            </p>
            <p className="text-muted small">
              Insights are automatically computed daily at 2 AM, or you can click "Recompute Insights" above to generate them now.
            </p>
          </div>
        </SectionCard>
      )}
    </>
  );
}

export default AdminICPInsightsPage;
