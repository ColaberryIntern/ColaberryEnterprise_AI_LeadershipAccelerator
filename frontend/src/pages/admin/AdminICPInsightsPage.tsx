import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell,
} from 'recharts';
import api from '../../utils/api';
import Breadcrumb from '../../components/ui/Breadcrumb';

const COLORS = ['#0d6efd', '#198754', '#6f42c1', '#fd7e14', '#0dcaf0', '#dc3545', '#ffc107', '#20c997'];

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
  const outcomeChartData = React.useMemo(() => {
    const byOutcome: Record<string, number> = {};
    for (const s of outcomeStats) {
      byOutcome[s.outcome] = (byOutcome[s.outcome] || 0) + parseInt(s.count, 10);
    }
    return Object.entries(byOutcome)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [outcomeStats]);

  const channelChartData = React.useMemo(() => {
    const byChannel: Record<string, number> = {};
    for (const s of outcomeStats) {
      byChannel[s.channel] = (byChannel[s.channel] || 0) + parseInt(s.count, 10);
    }
    return Object.entries(byChannel).map(([name, value]) => ({ name, value }));
  }, [outcomeStats]);

  // Build daily trend chart data
  const trendChartData = React.useMemo(() => {
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

  const formatPercent = (v: number) => `${(v * 100).toFixed(1)}%`;
  const confidenceLabel = (c: number) => {
    if (c >= 0.3) return 'High';
    if (c >= 0.15) return 'Medium';
    return 'Low';
  };
  const confidenceColor = (c: number) => {
    if (c >= 0.3) return 'success';
    if (c >= 0.15) return 'warning';
    return 'secondary';
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

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

  return (
    <>
      <Breadcrumb items={[{ label: 'Dashboard', to: '/admin/dashboard' }, { label: 'Insights' }]} />
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h3 fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>
          ICP Insights & Intelligence
        </h1>
        <button
          className="btn btn-outline-primary"
          onClick={handleCompute}
          disabled={computing}
        >
          {computing ? 'Computing...' : 'Recompute Insights'}
        </button>
      </div>

      {/* Filters */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body py-3">
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
        </div>
      </div>

      {/* Stats Overview */}
      <div className="row g-4 mb-4">
        <div className="col-md-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body text-center">
              <div className="text-muted small">Total Interactions</div>
              <div className="fs-2 fw-bold" style={{ color: 'var(--color-primary)' }}>
                {summary?._stats?.total_outcomes?.toLocaleString() || 0}
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body text-center">
              <div className="text-muted small">Last 90 Days</div>
              <div className="fs-2 fw-bold text-success">
                {summary?._stats?.recent_outcomes_90d?.toLocaleString() || 0}
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body text-center">
              <div className="text-muted small">Top Recommendations</div>
              <div className="fs-2 fw-bold text-primary">
                {recommendations.length}
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body text-center">
              <div className="text-muted small">Last Computed</div>
              <div className="fs-6 fw-bold text-muted mt-2">
                {summary?._stats?.last_computed
                  ? new Date(summary._stats.last_computed).toLocaleDateString()
                  : 'Never'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Targeting Recommendations */}
      {recommendations.length > 0 && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-bold py-3">
            Targeting Recommendations — {metricLabels[metricName]}
          </div>
          <div className="card-body p-0">
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
                        <span className="badge bg-primary rounded-pill">{rec.rank}</span>
                      </td>
                      <td className="fw-bold">{rec.dimension_value}</td>
                      <td className="text-muted small">{dimensionLabels[rec.dimension_type] || rec.dimension_type}</td>
                      <td className="text-end fw-bold">{formatPercent(rec.metric_value)}</td>
                      <td className="text-end">{rec.sample_size}</td>
                      <td className="text-center">
                        <span className={`badge bg-${confidenceColor(rec.confidence)}`}>
                          {confidenceLabel(rec.confidence)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Outcome Distribution + Channel Distribution */}
      <div className="row g-4 mb-4">
        <div className="col-md-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white fw-bold py-3">Outcome Distribution</div>
            <div className="card-body">
              {outcomeChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={outcomeChartData} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#0d6efd">
                      {outcomeChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted small text-center mb-0">No outcome data yet. Interactions will appear here as campaigns run.</p>
              )}
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white fw-bold py-3">Channel Distribution</div>
            <div className="card-body">
              {channelChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={channelChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#198754">
                      {channelChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted small text-center mb-0">No channel data yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Daily Trend */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-bold py-3">Daily Interaction Trend</div>
        <div className="card-body">
          {trendChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={trendChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="sent" stroke="#0d6efd" strokeWidth={2} dot={{ r: 3 }} name="Sent" />
                <Line type="monotone" dataKey="opened" stroke="#198754" strokeWidth={2} dot={{ r: 3 }} name="Opened" />
                <Line type="monotone" dataKey="clicked" stroke="#fd7e14" strokeWidth={2} dot={{ r: 3 }} name="Clicked" />
                <Line type="monotone" dataKey="replied" stroke="#6f42c1" strokeWidth={2} dot={{ r: 3 }} name="Replied" />
                <Line type="monotone" dataKey="bounced" stroke="#dc3545" strokeWidth={2} dot={{ r: 3 }} name="Bounced" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted small text-center mb-0">No daily trend data yet.</p>
          )}
        </div>
      </div>

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
          <div key={dim} className="card border-0 shadow-sm mb-4">
            <div className="card-header bg-white fw-bold py-3">
              {dimensionLabels[dim]} — {metricLabels[metricName]}
            </div>
            <div className="card-body">
              <div className="row">
                <div className="col-md-7">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartData} layout="vertical" margin={{ left: 100 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" unit="%" />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value: any) => [`${value}%`, metricLabels[metricName]]} />
                      <Bar dataKey="rate" fill="#0d6efd">
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
                            <span className={`badge bg-${confidenceColor(d.confidence)}`}>
                              {confidenceLabel(d.confidence)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Cross-dimensional: Industry x Title */}
      {summary?.industry_x_title?.response_rate?.length > 0 && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-bold py-3">
            Industry + Title Combinations — Response Rate
          </div>
          <div className="card-body p-0">
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
                          <span className={`badge bg-${confidenceColor(d.confidence)}`}>
                            {confidenceLabel(d.confidence)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {recommendations.length === 0 && outcomeChartData.length === 0 && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-body text-center py-5">
            <h5 className="text-muted">No Insight Data Yet</h5>
            <p className="text-muted small mb-3">
              Insights are computed from interaction outcomes. As campaigns send emails, make calls, and track opens/clicks,
              the system will automatically aggregate performance data by industry, title, company size, and source type.
            </p>
            <p className="text-muted small">
              Insights are automatically computed daily at 2 AM, or you can click "Recompute Insights" above to generate them now.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

export default AdminICPInsightsPage;
