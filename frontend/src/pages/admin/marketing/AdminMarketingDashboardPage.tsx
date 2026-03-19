import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  FunnelChart, Funnel, Tooltip, ResponsiveContainer, LabelList, Cell,
} from 'recharts';
import api from '../../../utils/api';

// ─── Types ──────────────────────────────────────────────────────────────────

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

interface RegisteredCampaign {
  id: string;
  name: string;
  type: string;
  status: string;
  channel: string | null;
  destination_path: string | null;
  tracking_link: string | null;
  objective: string | null;
  approval_status: string;
  budget_cap: number | null;
  budget_spent: number;
  budget_total: number | null;
  expected_roi: number | null;
  cost_per_lead_target: number | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

interface ChannelROI {
  channel: string;
  campaign_count: number;
  total_budget_allocated: number;
  total_budget_spent: number;
  total_visitors: number;
  total_leads: number;
  total_enrollments: number;
  total_revenue: number;
  roi: number;
}

type SortKey = keyof CampaignMetric;

const FUNNEL_COLORS = ['#2b6cb0', '#38a169', '#dd6b20', '#1a365d'];

const CAMPAIGN_TYPES = [
  { value: 'warm_nurture', label: 'Warm Nurture' },
  { value: 'cold_outbound', label: 'Cold Outbound' },
  { value: 're_engagement', label: 'Re-engagement' },
  { value: 'behavioral_trigger', label: 'Behavioral Trigger' },
  { value: 'alumni', label: 'Alumni' },
  { value: 'alumni_re_engagement', label: 'Alumni Re-engagement' },
];

const CHANNELS = [
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'social', label: 'Social' },
  { value: 'paid_search', label: 'Paid Search' },
  { value: 'paid_social', label: 'Paid Social' },
  { value: 'direct_mail', label: 'Direct Mail' },
  { value: 'referral', label: 'Referral' },
  { value: 'organic', label: 'Organic' },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

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

// ─── Landing Pages (loaded from API) ────────────────────────────────────────

// ─── Create Campaign Modal ──────────────────────────────────────────────────

function CreateCampaignModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: '', type: 'warm_nurture', channel: 'email', destination_path: '',
    objective: '', budget_cap: '', cost_per_lead_target: '', expected_roi: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [landingPages, setLandingPages] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    api.get('/api/admin/landing-pages?marketing=true')
      .then(res => {
        setLandingPages(
          (res.data || []).map((p: any) => ({ value: p.path, label: p.name }))
        );
      })
      .catch(() => {});
  }, []);

  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async () => {
    if (!form.name.trim()) { setErr('Name is required'); return; }
    if (!form.destination_path.trim()) { setErr('Destination path is required'); return; }
    setSaving(true);
    setErr('');
    try {
      const payload: Record<string, any> = {
        name: form.name, type: form.type, channel: form.channel,
        destination_path: form.destination_path, objective: form.objective,
      };
      if (form.budget_cap) payload.budget_cap = Number(form.budget_cap);
      if (form.cost_per_lead_target) payload.cost_per_lead_target = Number(form.cost_per_lead_target);
      if (form.expected_roi) payload.expected_roi = Number(form.expected_roi);

      const res = await api.post('/api/admin/campaigns', payload);
      const id = res.data?.campaign?.id || res.data?.id;
      if (id) {
        await api.post(`/api/admin/campaigns/${id}/generate-link`).catch(() => {});
      }
      onCreated();
      onClose();
    } catch (e: any) {
      setErr(e.response?.data?.error || 'Failed to create campaign');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="modal-backdrop show" style={{ zIndex: 1050 }} />
      <div className="modal show d-block" style={{ zIndex: 1055 }} role="dialog" aria-modal="true">
        <div className="modal-dialog modal-lg">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title fw-semibold">Create Tracked Campaign</h5>
              <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
            </div>
            <div className="modal-body">
              {err && <div className="alert alert-danger py-2 small">{err}</div>}
              <div className="row g-3">
                <div className="col-md-8">
                  <label className="form-label small fw-medium">Campaign Name *</label>
                  <input className="form-control form-control-sm" value={form.name} onChange={e => set('name', e.target.value)} />
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-medium">Type</label>
                  <select className="form-select form-select-sm" value={form.type} onChange={e => set('type', e.target.value)}>
                    {CAMPAIGN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-medium">Channel *</label>
                  <select className="form-select form-select-sm" value={form.channel} onChange={e => set('channel', e.target.value)}>
                    {CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div className="col-md-8">
                  <label className="form-label small fw-medium">Landing Page *</label>
                  <select className="form-select form-select-sm" value={form.destination_path} onChange={e => set('destination_path', e.target.value)}>
                    <option value="">Select a landing page...</option>
                    {landingPages.map(p => <option key={p.value} value={p.value}>{p.label} ({p.value})</option>)}
                  </select>
                </div>
                <div className="col-12">
                  <label className="form-label small fw-medium">Objective</label>
                  <textarea className="form-control form-control-sm" rows={2} value={form.objective} onChange={e => set('objective', e.target.value)} />
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-medium">Budget Cap ($)</label>
                  <input type="number" className="form-control form-control-sm" value={form.budget_cap} onChange={e => set('budget_cap', e.target.value)} />
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-medium">Target CPL ($)</label>
                  <input type="number" className="form-control form-control-sm" value={form.cost_per_lead_target} onChange={e => set('cost_per_lead_target', e.target.value)} />
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-medium">Expected ROI (x)</label>
                  <input type="number" step="0.1" className="form-control form-control-sm" value={form.expected_roi} onChange={e => set('expected_roi', e.target.value)} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-sm btn-outline-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-sm btn-primary" onClick={handleSubmit} disabled={saving}>
                {saving ? 'Creating...' : 'Create Campaign'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Edit Campaign Modal ────────────────────────────────────────────────────

function EditCampaignModal({ campaign, onClose, onSaved }: { campaign: RegisteredCampaign; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: campaign.name || '',
    type: campaign.type || 'warm_nurture',
    channel: campaign.channel || 'email',
    destination_path: campaign.destination_path || '',
    objective: campaign.objective || '',
    budget_cap: campaign.budget_cap != null ? String(campaign.budget_cap) : '',
    cost_per_lead_target: campaign.cost_per_lead_target != null ? String(campaign.cost_per_lead_target) : '',
    expected_roi: campaign.expected_roi != null ? String(campaign.expected_roi) : '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [landingPages, setLandingPages] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    api.get('/api/admin/landing-pages?marketing=true')
      .then(res => {
        setLandingPages(
          (res.data || []).map((p: any) => ({ value: p.path, label: p.name }))
        );
      })
      .catch(() => {});
  }, []);

  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async () => {
    if (!form.name.trim()) { setErr('Name is required'); return; }
    setSaving(true);
    setErr('');
    try {
      const payload: Record<string, any> = {
        name: form.name, type: form.type, channel: form.channel,
        destination_path: form.destination_path || null,
        objective: form.objective || null,
      };
      payload.budget_cap = form.budget_cap ? Number(form.budget_cap) : null;
      payload.cost_per_lead_target = form.cost_per_lead_target ? Number(form.cost_per_lead_target) : null;
      payload.expected_roi = form.expected_roi ? Number(form.expected_roi) : null;

      await api.patch(`/api/admin/campaigns/${campaign.id}`, payload);

      // Regenerate tracking link if channel and destination_path are set
      if (form.channel && form.destination_path) {
        await api.post(`/api/admin/campaigns/${campaign.id}/generate-link`).catch(() => {});
      }

      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e.response?.data?.error || 'Failed to update campaign');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="modal-backdrop show" style={{ zIndex: 1050 }} />
      <div className="modal show d-block" style={{ zIndex: 1055 }} role="dialog" aria-modal="true">
        <div className="modal-dialog modal-lg">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title fw-semibold">Edit Campaign</h5>
              <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
            </div>
            <div className="modal-body">
              {err && <div className="alert alert-danger py-2 small">{err}</div>}
              <div className="row g-3">
                <div className="col-md-8">
                  <label className="form-label small fw-medium">Campaign Name *</label>
                  <input className="form-control form-control-sm" value={form.name} onChange={e => set('name', e.target.value)} />
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-medium">Type</label>
                  <select className="form-select form-select-sm" value={form.type} onChange={e => set('type', e.target.value)}>
                    {CAMPAIGN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-medium">Channel</label>
                  <select className="form-select form-select-sm" value={form.channel} onChange={e => set('channel', e.target.value)}>
                    {CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div className="col-md-8">
                  <label className="form-label small fw-medium">Landing Page</label>
                  <select className="form-select form-select-sm" value={form.destination_path} onChange={e => set('destination_path', e.target.value)}>
                    <option value="">Select a landing page...</option>
                    {landingPages.map(p => <option key={p.value} value={p.value}>{p.label} ({p.value})</option>)}
                  </select>
                </div>
                <div className="col-12">
                  <label className="form-label small fw-medium">Objective</label>
                  <textarea className="form-control form-control-sm" rows={2} value={form.objective} onChange={e => set('objective', e.target.value)} />
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-medium">Budget Cap ($)</label>
                  <input type="number" className="form-control form-control-sm" value={form.budget_cap} onChange={e => set('budget_cap', e.target.value)} />
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-medium">Target CPL ($)</label>
                  <input type="number" className="form-control form-control-sm" value={form.cost_per_lead_target} onChange={e => set('cost_per_lead_target', e.target.value)} />
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-medium">Expected ROI (x)</label>
                  <input type="number" step="0.1" className="form-control form-control-sm" value={form.expected_roi} onChange={e => set('expected_roi', e.target.value)} />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-sm btn-outline-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-sm btn-primary" onClick={handleSubmit} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Campaign Detail Modal ──────────────────────────────────────────────────

function CampaignDetailModal({ campaign: c, onClose, onEdit, onRefresh }: {
  campaign: RegisteredCampaign;
  onClose: () => void;
  onEdit: () => void;
  onRefresh: () => void;
}) {
  const [roi, setRoi] = useState<any>(null);
  const [roiLoading, setRoiLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    api.get(`/api/admin/campaigns/${c.id}/roi`)
      .then(res => setRoi(res.data))
      .catch(() => setRoi(null))
      .finally(() => setRoiLoading(false));
  }, [c.id]);

  const handleAction = async (action: string) => {
    setActionLoading(action);
    try {
      if (action === 'delete') {
        if (!window.confirm(`Delete campaign "${c.name}"? This cannot be undone.`)) { setActionLoading(''); return; }
        await api.delete(`/api/admin/campaigns/${c.id}`);
        onRefresh();
        onClose();
        return;
      }
      if (action === 'toggle-active') {
        const newStatus = c.status === 'active' ? 'paused' : 'active';
        await api.patch(`/api/admin/campaigns/${c.id}`, { status: newStatus });
        onRefresh();
        onClose();
        return;
      }
      await api.post(`/api/admin/campaigns/${c.id}/${action}`);
      onRefresh();
      onClose();
    } catch (e: any) {
      alert(e.response?.data?.error || `Failed: ${action}`);
    } finally {
      setActionLoading('');
    }
  };

  const copyLink = () => {
    if (!c.tracking_link) return;
    navigator.clipboard.writeText(c.tracking_link).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }).catch(() => {});
  };

  const DetailRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="d-flex justify-content-between py-1 border-bottom" style={{ fontSize: '0.85rem' }}>
      <span className="text-muted">{label}</span>
      <span className="fw-medium text-end" style={{ maxWidth: '60%', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );

  const isActive = c.status === 'active';

  return (
    <>
      <div className="modal-backdrop show" style={{ zIndex: 1050 }} />
      <div className="modal show d-block" style={{ zIndex: 1055 }} role="dialog" aria-modal="true">
        <div className="modal-dialog modal-lg modal-dialog-scrollable">
          <div className="modal-content">
            <div className="modal-header">
              <div>
                <h5 className="modal-title fw-semibold mb-1">{c.name}</h5>
                <div className="d-flex gap-2 align-items-center">
                  <span className={`badge ${isActive ? 'bg-success' : 'bg-secondary'}`}>
                    {isActive ? 'Active' : c.status || 'Draft'}
                  </span>
                  {c.channel && (
                    <span className="badge bg-info text-dark">{c.channel.replace(/_/g, ' ')}</span>
                  )}
                  <span className="text-muted small">{c.type.replace(/_/g, ' ')}</span>
                </div>
              </div>
              <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
            </div>
            <div className="modal-body">
              {/* Performance KPIs */}
              <h6 className="fw-semibold mb-3" style={{ color: 'var(--color-primary)' }}>Performance</h6>
              {roiLoading ? (
                <div className="text-center py-3">
                  <div className="spinner-border spinner-border-sm me-2" role="status">
                    <span className="visually-hidden">Loading ROI...</span>
                  </div>
                  Loading performance data...
                </div>
              ) : roi ? (
                <div className="row g-3 mb-4">
                  {[
                    { label: 'Visitors', value: (roi.visitors || 0).toLocaleString() },
                    { label: 'Leads', value: (roi.leads || 0).toLocaleString() },
                    { label: 'Enrollments', value: (roi.enrollments || 0).toLocaleString() },
                    { label: 'Revenue', value: fmt$(roi.revenue || 0) },
                    { label: 'ROI', value: roi.roi != null ? `${(roi.roi * 100).toFixed(0)}%` : '\u2014' },
                    { label: 'Cost/Lead', value: roi.cost_per_lead ? fmt$(roi.cost_per_lead) : '\u2014' },
                  ].map(kpi => (
                    <div className="col-4 col-md-2" key={kpi.label}>
                      <div className="card border-0 bg-light">
                        <div className="card-body text-center p-2">
                          <div className="small text-muted">{kpi.label}</div>
                          <div className="fw-bold" style={{ fontSize: '1rem' }}>{kpi.value}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-muted small mb-4">No performance data available yet.</div>
              )}

              <div className="row g-4">
                {/* Left column: Campaign Info */}
                <div className="col-md-6">
                  <h6 className="fw-semibold mb-3" style={{ color: 'var(--color-primary)' }}>Campaign Info</h6>
                  <DetailRow label="Created" value={new Date(c.created_at).toLocaleDateString()} />
                  <DetailRow label="Objective" value={c.objective || '\u2014'} />
                  <DetailRow label="Destination" value={c.destination_path || '\u2014'} />
                </div>

                {/* Right column: Tracking & Budget */}
                <div className="col-md-6">
                  <h6 className="fw-semibold mb-3" style={{ color: 'var(--color-primary)' }}>Tracking & Budget</h6>
                  <DetailRow label="Tracking Link" value={
                    c.tracking_link
                      ? <span className="d-flex align-items-center gap-1">
                          <code className="small" style={{ wordBreak: 'break-all' }}>{c.tracking_link}</code>
                          <button className="btn btn-sm btn-outline-secondary py-0 px-1" style={{ fontSize: '0.7rem' }} onClick={copyLink}>
                            {linkCopied ? 'Copied!' : 'Copy'}
                          </button>
                        </span>
                      : '\u2014'
                  } />
                  <DetailRow label="Budget Cap" value={c.budget_cap != null ? fmt$(Number(c.budget_cap)) : '\u2014'} />
                  <DetailRow label="Budget Spent" value={fmt$(Number(c.budget_spent || 0))} />
                  <DetailRow label="Target CPL" value={c.cost_per_lead_target != null ? fmt$(Number(c.cost_per_lead_target)) : '\u2014'} />
                  <DetailRow label="Expected ROI" value={c.expected_roi != null ? `${c.expected_roi}x` : '\u2014'} />
                </div>
              </div>
            </div>
            <div className="modal-footer d-flex justify-content-between">
              <div className="d-flex gap-2">
                <button
                  className={`btn btn-sm ${isActive ? 'btn-outline-secondary' : 'btn-success'}`}
                  onClick={() => handleAction('toggle-active')}
                  disabled={actionLoading === 'toggle-active'}
                >
                  {actionLoading === 'toggle-active' ? '...' : isActive ? 'Pause Campaign' : 'Activate Campaign'}
                </button>
                <button className="btn btn-sm btn-outline-primary" onClick={onEdit}>
                  Edit
                </button>
                <button
                  className="btn btn-sm btn-outline-danger"
                  onClick={() => handleAction('delete')}
                  disabled={actionLoading === 'delete'}
                >
                  {actionLoading === 'delete' ? '...' : 'Delete'}
                </button>
              </div>
              <button className="btn btn-sm btn-outline-secondary" onClick={onClose}>Close</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Campaign Link Registry Tab ─────────────────────────────────────────────

function CampaignLinkRegistryTab() {
  const [campaigns, setCampaigns] = useState<RegisteredCampaign[]>([]);
  const [channelROI, setChannelROI] = useState<ChannelROI[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<RegisteredCampaign | null>(null);
  const [detailCampaign, setDetailCampaign] = useState<RegisteredCampaign | null>(null);
  const [copied, setCopied] = useState('');
  const [campaignKPIs, setCampaignKPIs] = useState<Record<string, { visitors: number; leads: number; enrollments: number }>>({});
  const [drillDown, setDrillDown] = useState<{ campaignId: string; campaignName: string; visitors: any[] } | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const [campRes, roiRes] = await Promise.all([
        api.get('/api/admin/campaigns'),
        api.get('/api/admin/marketing/channel-roi').catch(() => ({ data: { channels: [] } })),
      ]);
      const all = campRes.data?.campaigns || campRes.data || [];
      // Only show marketing campaigns (approval_status = 'live') — not internal automation campaigns
      const live = all.filter((c: any) => c.approval_status === 'live');
      setCampaigns(live);
      setChannelROI(roiRes.data?.channels || []);

      // Fetch KPIs for each live campaign
      const kpis: Record<string, { visitors: number; leads: number; enrollments: number }> = {};
      await Promise.all(live.map(async (c: any) => {
        try {
          const res = await api.get(`/api/admin/campaigns/${c.id}/roi`);
          kpis[c.id] = { visitors: res.data?.visitors || 0, leads: res.data?.leads || 0, enrollments: res.data?.enrollments || 0 };
        } catch { kpis[c.id] = { visitors: 0, leads: 0, enrollments: 0 }; }
      }));
      setCampaignKPIs(kpis);
    } catch {
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  const openDrillDown = async (c: RegisteredCampaign) => {
    setDrillLoading(true);
    try {
      const res = await api.get(`/api/admin/campaigns/${c.id}/roi/details`);
      setDrillDown({ campaignId: c.id, campaignName: c.name, visitors: res.data?.visitors || [] });
    } catch { setDrillDown({ campaignId: c.id, campaignName: c.name, visitors: [] }); }
    finally { setDrillLoading(false); }
  };

  const copyLink = (link: string, id: string) => {
    navigator.clipboard.writeText(link).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(''), 2000);
    }).catch(() => {});
  };

  return (
    <div>
      {showCreate && <CreateCampaignModal onClose={() => setShowCreate(false)} onCreated={fetchCampaigns} />}
      {editingCampaign && <EditCampaignModal campaign={editingCampaign} onClose={() => setEditingCampaign(null)} onSaved={fetchCampaigns} />}
      {detailCampaign && (
        <CampaignDetailModal
          campaign={detailCampaign}
          onClose={() => setDetailCampaign(null)}
          onEdit={() => { setEditingCampaign(detailCampaign); setDetailCampaign(null); }}
          onRefresh={fetchCampaigns}
        />
      )}

      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h3 fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>
          Campaign Link Registry
        </h1>
        <div className="d-flex gap-2">
          <button className="btn btn-sm btn-outline-primary" onClick={fetchCampaigns} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => setShowCreate(true)}>
            + Create Campaign
          </button>
        </div>
      </div>

      {/* Channel ROI Summary */}
      {channelROI.length > 0 && (
        <div className="row g-3 mb-4">
          {channelROI.map(ch => (
            <div className="col-6 col-lg-3" key={ch.channel}>
              <div className="card border-0 shadow-sm">
                <div className="card-body p-3">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="small fw-semibold text-uppercase">{ch.channel.replace(/_/g, ' ')}</span>
                    <span className="badge bg-secondary">{ch.campaign_count}</span>
                  </div>
                  <div className="d-flex justify-content-between small">
                    <span className="text-muted">Spend</span>
                    <span className="fw-medium">{fmt$(ch.total_budget_spent)}</span>
                  </div>
                  <div className="d-flex justify-content-between small">
                    <span className="text-muted">Revenue</span>
                    <span className="fw-medium">{fmt$(ch.total_revenue)}</span>
                  </div>
                  <div className="d-flex justify-content-between small">
                    <span className="text-muted">ROI</span>
                    <span className={`fw-bold ${ch.roi > 0 ? 'text-success' : ch.roi < 0 ? 'text-danger' : ''}`}>
                      {ch.roi > 0 ? '+' : ''}{(ch.roi * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Campaign Registry Table */}
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
          <span>Registered Campaigns</span>
          <small className="text-muted fw-normal">{campaigns.length} campaigns</small>
        </div>
        <div className="card-body p-0">
          {loading ? (
            <div className="p-4 text-center">
              <div className="spinner-border spinner-border-sm me-2" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              Loading campaigns...
            </div>
          ) : campaigns.length === 0 ? (
            <div className="p-4 text-center text-muted">
              No campaigns found. Create a campaign to get started.
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ fontSize: '0.82rem' }}>
                <thead className="table-light">
                  <tr>
                    <th style={{ minWidth: 180 }}>Name</th>
                    <th>Channel</th>
                    <th>Status</th>
                    <th>Landing Page</th>
                    <th className="text-end">Visitors</th>
                    <th className="text-end">Identified</th>
                    <th className="text-end">Enrolled</th>
                    <th style={{ minWidth: 140 }}>Tracking Link</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map(c => {
                    const isActive = c.status === 'active';
                    return (
                      <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => setDetailCampaign(c)}>
                        <td className="fw-medium" style={{ color: 'var(--color-primary-light)' }}>
                          {c.name}
                        </td>
                        <td>
                          {c.channel
                            ? <span className="badge bg-info text-dark">{c.channel.replace(/_/g, ' ')}</span>
                            : <span className="text-muted">{'\u2014'}</span>}
                        </td>
                        <td>
                          <span className={`badge ${isActive ? 'bg-success' : 'bg-secondary'}`}>
                            {isActive ? 'Active' : c.status || 'Draft'}
                          </span>
                        </td>
                        <td className="small">{c.destination_path || '\u2014'}</td>
                        <td className="text-end fw-medium" onClick={e => { e.stopPropagation(); openDrillDown(c); }} style={{ cursor: 'pointer', color: '#0d6efd', textDecoration: 'underline' }}>
                          {campaignKPIs[c.id]?.visitors || 0}
                        </td>
                        <td className="text-end fw-medium" onClick={e => { e.stopPropagation(); openDrillDown(c); }} style={{ cursor: 'pointer', color: '#0d6efd', textDecoration: 'underline' }}>
                          {campaignKPIs[c.id]?.leads || 0}
                        </td>
                        <td className="text-end fw-medium" style={{ color: (campaignKPIs[c.id]?.enrollments || 0) > 0 ? '#198754' : undefined }}>
                          {campaignKPIs[c.id]?.enrollments || 0}
                        </td>
                        <td onClick={e => e.stopPropagation()}>
                          {c.tracking_link ? (
                            <button
                              className="btn btn-sm btn-outline-secondary py-0 px-2"
                              style={{ fontSize: '0.72rem' }}
                              onClick={() => copyLink(c.tracking_link!, c.id)}
                              title={c.tracking_link}
                            >
                              {copied === c.id ? 'Copied!' : 'Copy Link'}
                            </button>
                          ) : (
                            <span className="text-muted small">Not generated</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Drill-down modal */}
      {drillDown && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setDrillDown(null)}>
          <div className="modal-dialog modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header">
                <h6 className="modal-title">Visitors — {drillDown.campaignName}</h6>
                <button className="btn-close" onClick={() => setDrillDown(null)} />
              </div>
              <div className="modal-body p-0">
                {drillLoading ? (
                  <div className="text-center py-4"><div className="spinner-border spinner-border-sm text-primary" /></div>
                ) : drillDown.visitors.length === 0 ? (
                  <p className="text-muted text-center py-4">No visitors yet for this campaign.</p>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-sm table-hover mb-0" style={{ fontSize: 12 }}>
                      <thead className="table-light">
                        <tr>
                          <th>Last Seen</th>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Source</th>
                          <th>Device</th>
                          <th>Sessions</th>
                          <th>Stage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {drillDown.visitors.map((v: any, i: number) => (
                          <tr key={i}>
                            <td className="text-muted">{v.last_seen_at ? new Date(v.last_seen_at).toLocaleDateString() : '-'}</td>
                            <td className="fw-medium">{v.lead_name || <span className="text-muted">Anonymous</span>}</td>
                            <td>{v.lead_email || '-'}</td>
                            <td><span className="badge bg-secondary" style={{ fontSize: 9 }}>{v.utm_source || 'direct'}</span></td>
                            <td className="text-muted">{v.device_type || '-'}</td>
                            <td>{v.total_sessions || 1}</td>
                            <td>{v.pipeline_stage ? <span className="badge bg-info" style={{ fontSize: 9 }}>{v.pipeline_stage}</span> : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Revenue Intelligence Tab (Original Content) ────────────────────────────

function RevenueIntelligenceTab() {
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

// ─── Main Page ──────────────────────────────────────────────────────────────

function AdminMarketingDashboardPage() {
  const [activeTab, setActiveTab] = useState<'revenue' | 'registry'>('revenue');

  return (
    <div>
      {/* Tab Navigation */}
      <ul className="nav nav-tabs mb-4">
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'revenue' ? 'active' : ''}`}
            onClick={() => setActiveTab('revenue')}
          >
            Revenue Intelligence
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${activeTab === 'registry' ? 'active' : ''}`}
            onClick={() => setActiveTab('registry')}
          >
            Campaign Link Registry
          </button>
        </li>
      </ul>

      {activeTab === 'revenue' && <RevenueIntelligenceTab />}
      {activeTab === 'registry' && <CampaignLinkRegistryTab />}
    </div>
  );
}

export default AdminMarketingDashboardPage;
