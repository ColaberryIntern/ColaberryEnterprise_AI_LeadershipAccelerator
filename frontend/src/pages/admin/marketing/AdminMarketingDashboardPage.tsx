import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
}

type SortKey = keyof CampaignMetric;

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
      if (typeof av === 'string') return sortAsc ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
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
      }),
      { visitors: 0, leads: 0, highIntent: 0, strategyCalls: 0, enrollments: 0 }
    );
  }, [campaigns]);

  const avgIntentPct = totals.visitors > 0 ? Math.round((totals.highIntent / totals.visitors) * 100) : 0;
  const overallConversion = totals.visitors > 0 ? Math.round((totals.enrollments / totals.visitors) * 10000) / 100 : 0;

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

  const kpiCards = [
    { label: 'Total Visitors', value: totals.visitors.toLocaleString(), color: 'var(--color-primary-light)' },
    { label: 'Total Leads', value: totals.leads.toLocaleString(), color: 'var(--color-accent)' },
    { label: 'High Intent %', value: `${avgIntentPct}%`, color: '#805ad5' },
    { label: 'Strategy Calls', value: totals.strategyCalls.toLocaleString(), color: '#dd6b20' },
    { label: 'Enrollments', value: totals.enrollments.toLocaleString(), color: 'var(--color-primary)' },
    { label: 'Conversion Rate', value: `${overallConversion}%`, color: 'var(--color-secondary)' },
  ];

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
              <table className="table table-hover mb-0">
                <thead className="table-light">
                  <tr>
                    <th role="button" onClick={() => handleSort('campaign_id')} style={{ cursor: 'pointer' }}>
                      Campaign ID{sortIndicator('campaign_id')}
                    </th>
                    <th role="button" onClick={() => handleSort('visitors_count')} style={{ cursor: 'pointer' }}>
                      Visitors{sortIndicator('visitors_count')}
                    </th>
                    <th role="button" onClick={() => handleSort('high_intent_pct')} style={{ cursor: 'pointer' }}>
                      High Intent %{sortIndicator('high_intent_pct')}
                    </th>
                    <th role="button" onClick={() => handleSort('leads_count')} style={{ cursor: 'pointer' }}>
                      Leads{sortIndicator('leads_count')}
                    </th>
                    <th role="button" onClick={() => handleSort('strategy_calls')} style={{ cursor: 'pointer' }}>
                      Strategy Calls{sortIndicator('strategy_calls')}
                    </th>
                    <th role="button" onClick={() => handleSort('enrollments_count')} style={{ cursor: 'pointer' }}>
                      Enrollments{sortIndicator('enrollments_count')}
                    </th>
                    <th role="button" onClick={() => handleSort('conversion_rate')} style={{ cursor: 'pointer' }}>
                      Conversion Rate{sortIndicator('conversion_rate')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((c) => (
                    <tr key={c.campaign_id}>
                      <td className="fw-medium">
                        <code className="small">{c.campaign_id}</code>
                      </td>
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
