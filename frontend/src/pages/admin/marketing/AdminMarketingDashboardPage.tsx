import React, { useEffect, useState, useCallback } from 'react';
import api from '../../../utils/api';

interface KPIs {
  visitors: number;
  highIntent: number;
  alumniLeads: number;
  strategyCalls: number;
  enrollments: number;
  revenue: number;
}

interface CampaignDef {
  name: string;
  slug: string;
  type: string;
  status: 'active' | 'paused';
}

const CAMPAIGNS: CampaignDef[] = [
  { name: 'Alumni Q1 Re-engagement', slug: 'alumni-q1-2026', type: 'alumni_reengagement', status: 'active' },
  { name: 'Alumni Corporate Sponsor', slug: 'alumni-corp-sponsor', type: 'alumni_reengagement', status: 'active' },
  { name: 'Alumni Self-Pay Offer', slug: 'alumni-self-pay', type: 'alumni_reengagement', status: 'active' },
];

interface LeadRecord {
  id: string;
  form_type?: string;
  source?: string;
  created_at?: string;
}

function generateTrackingLink(slug: string): string {
  const origin = window.location.origin.replace(/:\d+$/, '').replace('localhost', 'enterprise.colaberry.ai');
  const base = origin.includes('enterprise.colaberry.ai') ? 'https://enterprise.colaberry.ai' : origin;
  return `${base}/alumni-ai-champion?campaign_id=${slug}&utm_source=alumni&utm_campaign=${slug}`;
}

function AdminMarketingDashboardPage() {
  const [kpis, setKpis] = useState<KPIs>({ visitors: 0, highIntent: 0, alumniLeads: 0, strategyCalls: 0, enrollments: 0, revenue: 0 });
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [visitorRes, leadsRes, dashRes] = await Promise.allSettled([
        api.get('/api/admin/visitors/stats'),
        api.get('/api/admin/leads'),
        api.get('/api/admin/dashboard'),
      ]);

      const vStats = visitorRes.status === 'fulfilled' ? visitorRes.value.data : {};
      const leadsData: LeadRecord[] = leadsRes.status === 'fulfilled' ? (leadsRes.value.data.leads || leadsRes.value.data || []) : [];
      const dashData = dashRes.status === 'fulfilled' ? dashRes.value.data : {};

      const alumniLeads = leadsData.filter((l) => l.form_type === 'alumni_referral');
      const strategyCalls = leadsData.filter((l) => l.form_type === 'strategy_call');

      setLeads(leadsData);
      setKpis({
        visitors: vStats.total_visitors || 0,
        highIntent: vStats.high_intent_count || 0,
        alumniLeads: alumniLeads.length,
        strategyCalls: strategyCalls.length,
        enrollments: dashData.total_enrollments || dashData.enrollments || 0,
        revenue: dashData.total_revenue || dashData.revenue || 0,
      });
    } catch {
      // silent — KPIs show 0
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const copyLink = async (slug: string) => {
    const link = generateTrackingLink(slug);
    try {
      await navigator.clipboard.writeText(link);
      setCopiedSlug(slug);
      setTimeout(() => setCopiedSlug(null), 2000);
    } catch {
      // fallback
      const el = document.createElement('textarea');
      el.value = link;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopiedSlug(slug);
      setTimeout(() => setCopiedSlug(null), 2000);
    }
  };

  const getCampaignLeadCount = (slug: string): number => {
    return leads.filter((l) => l.source === `campaign:${slug}`).length;
  };

  const kpiCards = [
    { label: 'Visitors (30d)', value: kpis.visitors, color: '#3182ce' },
    { label: 'High Intent', value: kpis.highIntent, color: '#805ad5' },
    { label: 'Alumni Leads', value: kpis.alumniLeads, color: '#38a169' },
    { label: 'Strategy Calls', value: kpis.strategyCalls, color: '#dd6b20' },
    { label: 'Enrollments', value: kpis.enrollments, color: '#1a365d' },
    { label: 'Revenue', value: `$${kpis.revenue.toLocaleString()}`, color: '#e53e3e' },
  ];

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h3 fw-bold mb-0">Marketing Dashboard</h1>
        <button className="btn btn-sm btn-outline-primary" onClick={fetchData} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="row g-3 mb-4">
        {kpiCards.map((kpi) => (
          <div className="col-6 col-lg-2" key={kpi.label}>
            <div className="card border-0 shadow-sm">
              <div className="card-body text-center p-3">
                <div className="small text-muted mb-1">{kpi.label}</div>
                <div className="h4 fw-bold mb-0" style={{ color: kpi.color }}>
                  {typeof kpi.value === 'number' ? kpi.value.toLocaleString() : kpi.value}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Campaign Registry */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold">Campaign Registry</div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th>Campaign</th>
                  <th>Slug</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Leads</th>
                  <th>Tracking Link</th>
                </tr>
              </thead>
              <tbody>
                {CAMPAIGNS.map((c) => (
                  <tr key={c.slug}>
                    <td className="fw-medium">{c.name}</td>
                    <td><code className="small">{c.slug}</code></td>
                    <td><span className="badge bg-info">{c.type}</span></td>
                    <td>
                      <span className={`badge ${c.status === 'active' ? 'bg-success' : 'bg-secondary'}`}>
                        {c.status}
                      </span>
                    </td>
                    <td>{getCampaignLeadCount(c.slug)}</td>
                    <td>
                      <button
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => copyLink(c.slug)}
                      >
                        {copiedSlug === c.slug ? 'Copied!' : 'Copy Link'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Campaign Analytics */}
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-semibold">Campaign Performance</div>
        <div className="card-body">
          {CAMPAIGNS.map((c) => {
            const campaignLeads = leads.filter((l) => l.source === `campaign:${c.slug}`);
            const alumni = campaignLeads.filter((l) => l.form_type === 'alumni_referral').length;
            const calls = campaignLeads.filter((l) => l.form_type === 'strategy_call').length;
            const other = campaignLeads.length - alumni - calls;

            return (
              <div key={c.slug} className="mb-4 pb-3 border-bottom">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <h6 className="fw-bold mb-0">{c.name}</h6>
                  <span className="badge bg-light text-dark border">{campaignLeads.length} leads</span>
                </div>
                <div className="d-flex gap-3 flex-wrap">
                  <div className="small">
                    <span className="text-muted">Alumni Forms:</span>{' '}
                    <span className="fw-bold text-success">{alumni}</span>
                  </div>
                  <div className="small">
                    <span className="text-muted">Strategy Calls:</span>{' '}
                    <span className="fw-bold text-warning">{calls}</span>
                  </div>
                  {other > 0 && (
                    <div className="small">
                      <span className="text-muted">Other:</span>{' '}
                      <span className="fw-bold">{other}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {leads.filter((l) => l.source?.startsWith('campaign:')).length === 0 && !loading && (
            <p className="text-muted text-center mb-0">No campaign-attributed leads yet. Share tracking links to start collecting data.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminMarketingDashboardPage;
