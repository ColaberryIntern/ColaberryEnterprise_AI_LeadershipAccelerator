import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  FunnelChart, Funnel, Tooltip, ResponsiveContainer, LabelList, Cell,
} from 'recharts';
import api from '../../../utils/api';

interface CampaignMetric {
  campaign_id: string;
  visitors_count: number;
  high_intent_count: number;
  leads_count: number;
  strategy_calls: number;
  enrollments_count: number;
  high_intent_pct: number;
  conversion_rate: number;
  total_revenue: number;
  revenue_per_visitor: number;
  revenue_per_lead: number;
  visitor_to_lead_pct: number;
  lead_to_call_pct: number;
  call_to_enroll_pct: number;
  campaign_type: string | null;
  platform: string | null;
  creative: string | null;
}

type SortKey = keyof CampaignMetric;

const FUNNEL_COLORS = ['#2b6cb0', '#38a169', '#dd6b20', '#1a365d'];

function intentBadge(pct: number) {
  if (pct >= 40) return 'bg-success';
  if (pct >= 20) return 'bg-warning text-dark';
  return 'bg-danger';
}

function conversionBadge(rate: number) {
  if (rate >= 5) return 'bg-success';
  if (rate >= 2) return 'bg-warning text-dark';
  return 'bg-danger';
}

function fmt$(n: number) {
  return `$${n.toLocaleString()}`;
}

function AdminMarketingDashboardPage() {
  const [campaigns, setCampaigns] = useState<CampaignMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('visitors_count');
  const [sortAsc, setSortAsc] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (startDate) params.start = startDate;
      if (endDate) params.end = endDate;
      const res = await api.get('/api/admin/marketing/campaigns', { params });
      setCampaigns(res.data.campaigns || []);
    } catch {
      setError('Failed to load campaign data');
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const sorted = useMemo(() => {
    const copy = [...campaigns];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'string') return sortAsc ? (av || '').localeCompare((bv as string) || '') : ((bv as string) || '').localeCompare(av || '');
      return sortAsc ? ((av as number) || 0) - ((bv as number) || 0) : ((bv as number) || 0) - ((av as number) || 0);
    });
    return copy;
  }, [campaigns, sortKey, sortAsc]);

  const totals = useMemo(() => {
    return campaigns.reduce(
      (acc, c) => ({
        visitors: acc.visitors + c.visitors_count,
        leads: acc.leads + c.leads_count,
        highIntent: acc.highIntent + c.high_intent_count,
        strategyCalls: acc.strategyCalls + c.strategy_calls,
        enrollments: acc.enrollments + c.enrollments_count,
        revenue: acc.revenue + c.total_revenue,
      }),
      { visitors: 0, leads: 0, highIntent: 0, strategyCalls: 0, enrollments: 0, revenue: 0 }
    );
  }, [campaigns]);

  const avgIntentPct = totals.visitors > 0 ? Math.round((totals.highIntent / totals.visitors) * 100) : 0;
  const overallConversion = totals.visitors > 0 ? Math.round((totals.enrollments / totals.visitors) * 10000) / 100 : 0;

  const hasMetadata = useMemo(() => campaigns.some(c => c.campaign_type || c.platform || c.creative), [campaigns]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return null;
    return <span className="ms-1">{sortAsc ? '\u2191' : '\u2193'}</span>;
  };

  // Funnel data
  const funnelData = useMemo(() => {
    if (totals.visitors === 0) return [];
    return [
      { name: 'Visitors', value: totals.visitors },
      { name: 'Leads', value: totals.leads },
      { name: 'Strategy Calls', value: totals.strategyCalls },
      { name: 'Enrollments', value: totals.enrollments },
    ];
  }, [totals]);

  const funnelConversions = useMemo(() => {
    const v = totals.visitors, l = totals.leads, s = totals.strategyCalls, e = totals.enrollments;
    return [
      { label: 'V\u2192L', pct: v > 0 ? ((l / v) * 100).toFixed(1) : '0' },
      { label: 'L\u2192C', pct: l > 0 ? ((s / l) * 100).toFixed(1) : '0' },
      { label: 'C\u2192E', pct: s > 0 ? ((e / s) * 100).toFixed(1) : '0' },
    ];
  }, [totals]);

  const kpiCards = [
    { label: 'Total Visitors', value: totals.visitors.toLocaleString(), color: 'var(--color-primary-light)' },
    { label: 'Total Leads', value: totals.leads.toLocaleString(), color: 'var(--color-accent)' },
    { label: 'High Intent %', value: `${avgIntentPct}%`, color: '#805ad5' },
    { label: 'Total Revenue', value: fmt$(totals.revenue), color: 'var(--color-secondary)' },
    { label: 'Enrollments', value: totals.enrollments.toLocaleString(), color: 'var(--color-primary)' },
    { label: 'Conversion Rate', value: `${overallConversion}%`, color: overallConversion >= 5 ? 'var(--color-accent)' : overallConversion >= 2 ? '#d69e2e' : 'var(--color-secondary)' },
  ];

  const SortTh = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <th
      role="button"
      onClick={() => handleSort(k)}
      style={{ cursor: 'pointer', whiteSpace: 'nowrap', fontSize: '0.78rem' }}
    >
      {children}{sortIndicator(k)}
    </th>
  );

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h3 fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>
          Revenue Intelligence
        </h1>
        <button className="btn btn-sm btn-outline-primary" onClick={fetchData} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Date Range Filter */}
      <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
        <label className="form-label small fw-medium mb-0">From</label>
        <input
          type="date"
          className="form-control form-control-sm"
          style={{ maxWidth: 160 }}
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <label className="form-label small fw-medium mb-0">To</label>
        <input
          type="date"
          className="form-control form-control-sm"
          style={{ maxWidth: 160 }}
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
        {(startDate || endDate) && (
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={() => { setStartDate(''); setEndDate(''); }}
          >
            Clear
          </button>
        )}
      </div>

      {/* KPI Summary Cards */}
      <div className="row g-3 mb-4">
        {kpiCards.map((kpi) => (
          <div className="col-6 col-lg-2" key={kpi.label}>
            <div className="card border-0 shadow-sm">
              <div className="card-body text-center p-3">
                <div className="small text-muted mb-1">{kpi.label}</div>
                <div className="h4 fw-bold mb-0" style={{ color: kpi.color }}>
                  {loading ? '-' : kpi.value}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Funnel Visualization */}
      {!loading && funnelData.length > 0 && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold">Conversion Funnel</div>
          <div className="card-body">
            <div className="d-flex justify-content-center gap-4 mb-3 flex-wrap">
              {funnelData.map((stage, i) => (
                <div key={stage.name} className="text-center">
                  <div className="small text-muted">{stage.name}</div>
                  <div className="fw-bold" style={{ color: FUNNEL_COLORS[i], fontSize: '1.1rem' }}>
                    {stage.value.toLocaleString()}
                  </div>
                  {i < funnelConversions.length && (
                    <div className="text-muted" style={{ fontSize: '0.65rem' }}>
                      {funnelConversions[i].label}: {funnelConversions[i].pct}%
                    </div>
                  )}
                </div>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <FunnelChart>
                <Tooltip formatter={(value: any) => [Number(value).toLocaleString(), 'Count']} />
                <Funnel dataKey="value" data={funnelData} isAnimationActive>
                  <LabelList position="center" fill="#fff" fontSize={12} fontWeight={600} />
                  {funnelData.map((_, i) => (
                    <Cell key={i} fill={FUNNEL_COLORS[i]} />
                  ))}
                </Funnel>
              </FunnelChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="alert alert-danger alert-dismissible" role="alert">
          {error}
          <button type="button" className="btn-close" onClick={() => setError(null)} aria-label="Close" />
        </div>
      )}

      {/* Campaign Performance Table */}
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
          <span>Campaign Performance</span>
          <small className="text-muted fw-normal">{campaigns.length} campaigns</small>
        </div>
        <div className="card-body p-0">
          {loading ? (
            <div className="p-4 text-center">
              <div className="spinner-border spinner-border-sm me-2" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              Loading campaign data...
            </div>
          ) : campaigns.length === 0 ? (
            <div className="p-4 text-center text-muted">
              No campaign-attributed visitors found. Visitors need a <code>campaign_id</code> to appear here.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ fontSize: '0.82rem' }}>
                <thead className="table-light">
                  <tr>
                    <SortTh k="campaign_id">Campaign</SortTh>
                    {hasMetadata && <SortTh k="campaign_type">Type</SortTh>}
                    {hasMetadata && <SortTh k="platform">Platform</SortTh>}
                    {hasMetadata && <SortTh k="creative">Creative</SortTh>}
                    <SortTh k="visitors_count">Visitors</SortTh>
                    <SortTh k="high_intent_pct">Intent %</SortTh>
                    <SortTh k="leads_count">Leads</SortTh>
                    <SortTh k="strategy_calls">Calls</SortTh>
                    <SortTh k="enrollments_count">Enrolled</SortTh>
                    <SortTh k="total_revenue">Revenue</SortTh>
                    <SortTh k="revenue_per_visitor">Rev/Visitor</SortTh>
                    <SortTh k="revenue_per_lead">Rev/Lead</SortTh>
                    <SortTh k="visitor_to_lead_pct">V{'\u2192'}L %</SortTh>
                    <SortTh k="lead_to_call_pct">L{'\u2192'}C %</SortTh>
                    <SortTh k="call_to_enroll_pct">C{'\u2192'}E %</SortTh>
                    <SortTh k="conversion_rate">Conv %</SortTh>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((c) => (
                    <tr key={c.campaign_id}>
                      <td className="fw-medium">
                        <code className="small">{c.campaign_id}</code>
                      </td>
                      {hasMetadata && <td className="text-muted">{c.campaign_type || '\u2014'}</td>}
                      {hasMetadata && <td className="text-muted">{c.platform || '\u2014'}</td>}
                      {hasMetadata && <td className="text-muted">{c.creative || '\u2014'}</td>}
                      <td>{c.visitors_count.toLocaleString()}</td>
                      <td>
                        <span className={`badge ${intentBadge(c.high_intent_pct)}`}>
                          {c.high_intent_pct}%
                        </span>
                      </td>
                      <td>{c.leads_count}</td>
                      <td className={c.strategy_calls > 0 ? 'fw-bold' : ''}>
                        {c.strategy_calls}
                      </td>
                      <td>{c.enrollments_count}</td>
                      <td className="fw-semibold">{fmt$(c.total_revenue)}</td>
                      <td>{fmt$(c.revenue_per_visitor)}</td>
                      <td>{fmt$(c.revenue_per_lead)}</td>
                      <td>{c.visitor_to_lead_pct}%</td>
                      <td>{c.lead_to_call_pct}%</td>
                      <td>{c.call_to_enroll_pct}%</td>
                      <td>
                        <span className={`badge ${conversionBadge(c.conversion_rate)}`}>
                          {c.conversion_rate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminMarketingDashboardPage;
