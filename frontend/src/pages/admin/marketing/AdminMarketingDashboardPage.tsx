import React, { useEffect, useState, useCallback, useMemo, lazy, Suspense } from 'react';
import {
  FunnelChart, Funnel, Tooltip, ResponsiveContainer, LabelList, Cell,
} from 'recharts';
import api from '../../../utils/api';
import { PageHeader, StatCard, StatusBadge, SectionCard } from '../../../components/admin/shell';
import { TrustSignal } from '../../../components/admin/shell/trust';
import { deriveMarketingTrust, MarketingDataState } from './marketingTrust';
import { formatMoneyOrUnavailable, formatRatioOrUnavailable, formatSpend } from './marketingFormat';
import MarketingScopeStrip from './MarketingScopeStrip';
import { defaultScope, scopeToQuery, type MarketingScope } from './marketingScope';
import { listBrands, type Brand as ScopeBrand } from '../../../services/adminBrandApi';
import NeedsAttentionQueue, { type AttentionItem, type ExcludedSignal } from './NeedsAttentionQueue';
import { getNeedsAttention } from '../../../services/marketingOpsApi';
import { ALL_BRANDS } from './marketingScope';
import {
  ALL_COLUMNS, DEFAULT_COLUMNS, OBJECTIVE_LABELS, loadViews, rankCampaigns, saveViews, upsertView,
  type ResolvedRanking, type SavedView,
} from './campaignTableViews';

const MarketingFunnelGraph = lazy(() => import('../../../components/admin/marketing/MarketingFunnelGraph'));
const OpenclawTab = lazy(() => import('../../../components/admin/intelligence/tabs/OpenclawTab'));

// ─── Types ──────────────────────────────────────────────────────────────────

interface CampaignMetric {
  campaign_id: string;
  campaign_name?: string;
  visitors_count: number;
  high_intent_count: number;
  leads_count: number;
  strategy_calls: number;
  enrollments_count: number;
  high_intent_pct: number;
  conversion_rate: number;
  visitor_to_lead_pct: number;
  lead_to_call_pct: number;
  call_to_enroll_pct: number;
  campaign_type: string | null;
  /** The objective the ranking ladder is chosen by. Null when never set. */
  funnel_stage: string | null;
  /** opens + clicks + replies - the governed engagement a consideration campaign ranks on. */
  engagement_count: number;
  // The backend has always returned these three; the interface simply never declared them,
  // which is why they could not be offered as columns until now.
  opens_count: number;
  clicks_count: number;
  replies_count: number;
  /**
   * Metrics the server says it cannot compute, with reasons. Revenue used to live on this
   * interface as a plain number; the server derived it from a hardcoded $4,500 price times an
   * enrollment count, so a campaign that had collected nothing still reported revenue.
   * The server now declines to answer, and this is where it says why.
   */
  unavailable: UnavailableMetric[];
}

/** A figure that cannot be computed, and the reason. Never rendered as 0. */
interface UnavailableMetric {
  key: string;
  name: string;
  reason: string;
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

/**
 * Mirrors the backend `CampaignROIReport` FIELD FOR FIELD.
 *
 * Counts are required and money is nullable, which is exactly the backend contract - not a
 * defensive guess at it. The first version of this interface marked the counts optional, and
 * TypeScript immediately produced 11 `possibly undefined` errors at call sites that had been
 * dereferencing them unguarded for as long as the state was `useState<any>`. Those errors were
 * the type system reporting the truth about the OLD code, not a problem with the new type - and
 * they are the clearest evidence available that `any` at this boundary was hiding real work.
 *
 * Kept aligned with the backend rather than loosened, so a future divergence fails the build
 * here instead of rendering something wrong.
 */
interface CampaignROI {
  campaign_id: string;
  campaign_name: string;
  channel: string | null;
  visitors: number;
  leads: number;
  engaged: number;
  enrollments: number;
  /** null = not computable, NOT zero. */
  revenue: number | null;
  budget_spent: number;
  budget_cap: number | null;
  roi: number | null;
  cost_per_lead: number | null;
  cost_per_enrollment: number | null;
  approval_status: string;
  unavailable: UnavailableMetric[];
}

interface ChannelROI {
  channel: string;
  campaign_count: number;
  total_budget_allocated: number;
  total_budget_spent: number;
  total_visitors: number;
  total_leads: number;
  total_enrollments: number;
  /** null = not knowable, NOT zero. Spend is never written and revenue has no source. */
  total_revenue: number | null;
  roi: number | null;
  unavailable: UnavailableMetric[];
}

type SortKey = Exclude<keyof CampaignMetric, 'unavailable'>;

// Funnel segment colors drawn from the shared chart palette (brand tokens).
const FUNNEL_COLORS = ['var(--chart-1)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-7)'];

type BadgeTone = 'primary' | 'success' | 'danger' | 'warning' | 'info' | 'neutral';

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

function intentTone(pct: number): BadgeTone {
  if (pct >= 40) return 'success';
  if (pct >= 20) return 'warning';
  return 'danger';
}

function conversionTone(rate: number): BadgeTone {
  if (rate >= 5) return 'success';
  if (rate >= 2) return 'warning';
  return 'danger';
}

/**
 * Render one cell for one column key. Column visibility is data-driven, so rendering has to be
 * too - a hand-written row of <td>s would silently misalign the moment a column was toggled.
 */
function renderCampaignCell(c: CampaignMetric, key: string): React.ReactNode {
  switch (key) {
    case 'campaign_type': return <span className="text-muted">{c.campaign_type || '\u2014'}</span>;
    case 'visitors_count': return c.visitors_count.toLocaleString();
    case 'high_intent_pct': return <StatusBadge label={`${c.high_intent_pct}%`} tone={intentTone(c.high_intent_pct)} />;
    case 'leads_count': return c.leads_count;
    case 'engagement_count': return c.engagement_count;
    case 'opens_count': return c.opens_count;
    case 'clicks_count': return c.clicks_count;
    case 'replies_count': return c.replies_count;
    case 'strategy_calls': return <span className={c.strategy_calls > 0 ? 'fw-bold' : ''}>{c.strategy_calls}</span>;
    case 'enrollments_count': return c.enrollments_count;
    case 'visitor_to_lead_pct': return `${c.visitor_to_lead_pct}%`;
    case 'lead_to_call_pct': return `${c.lead_to_call_pct}%`;
    case 'call_to_enroll_pct': return `${c.call_to_enroll_pct}%`;
    case 'conversion_rate': return <StatusBadge label={`${c.conversion_rate}%`} tone={conversionTone(c.conversion_rate)} />;
    default: return '\u2014';
  }
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
  /**
   * Typed rather than `any`. The $0 defect above type-checked cleanly precisely because this
   * was `any`: the backend field became `number | null` and nothing here objected. `any` at a
   * boundary does not just skip a check, it disables the one mechanism that would have caught
   * a producer changing under its consumer.
   */
  const [roi, setRoi] = useState<CampaignROI | null>(null);
  const [roiLoading, setRoiLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [visitors, setVisitors] = useState<any[]>([]);

  useEffect(() => {
    api.get(`/api/admin/campaigns/${c.id}/roi`)
      .then(res => setRoi(res.data))
      .catch(() => setRoi(null))
      .finally(() => setRoiLoading(false));
    api.get(`/api/admin/campaigns/${c.id}/roi/details`)
      .then(res => setVisitors(res.data?.visitors || []))
      .catch(() => {});
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
                  <StatusBadge label={isActive ? 'Active' : c.status || 'Draft'} tone={isActive ? 'success' : 'neutral'} />
                  {c.channel && (
                    <StatusBadge label={c.channel.replace(/_/g, ' ')} tone="info" />
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
                <>
                  <div className="row g-3 mb-3">
                    {[
                      { label: 'Visitors', value: (roi.visitors || 0).toLocaleString(), tooltip: 'Total unique visitors from this campaign' },
                      { label: 'Identified', value: (roi.leads || 0).toLocaleString(), tooltip: 'Visitors matched to a known lead' },
                      { label: 'Engaged', value: (roi.engaged || 0).toLocaleString(), tooltip: 'Visitors with 30s+ on page, 50%+ scroll, or CTA click' },
                      { label: 'Enrolled', value: (roi.enrollments || 0).toLocaleString(), tooltip: 'Visitors who completed enrollment' },
                      // `fmt$(roi.revenue || 0)` used to live here and rendered a confident $0 for a
                      // value the backend had just been changed to report as null. `null || 0` is 0,
                      // so the one field this whole change was about was the one that kept lying.
                      { label: 'Revenue', value: formatMoneyOrUnavailable(roi.revenue).text, tooltip: roi.revenue === null ? 'No payment data is joined to campaigns, so revenue cannot be computed' : 'Total revenue from enrolled visitors' },
                      { label: 'ROI', value: formatRatioOrUnavailable(roi.roi).text, tooltip: 'Return on investment: (revenue - spend) / spend' },
                      { label: 'Cost/Lead', value: formatMoneyOrUnavailable(roi.cost_per_lead).text, tooltip: 'Budget spent divided by number of identified leads' },
                      { label: 'Cost/Enroll', value: formatMoneyOrUnavailable(roi.cost_per_enrollment).text, tooltip: 'Budget spent divided by number of enrollments' },
                    ].map(kpi => (
                      <div className="col-4 col-md-3" key={kpi.label}>
                        <div className="card border-0 bg-light" title={kpi.tooltip}>
                          <div className="card-body text-center p-2">
                            <div className="small text-muted">{kpi.label}</div>
                            <div className="fw-bold" style={{ fontSize: '1rem' }}>{kpi.value}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Conversion Funnel Rates */}
                  <div className="d-flex gap-3 mb-4 flex-wrap" style={{ fontSize: '0.8rem' }}>
                    <span className="text-muted" title="Percentage of visitors who became identified leads">
                      Visitor{'\u2192'}Lead: <strong>{roi.visitors > 0 ? ((roi.leads / roi.visitors) * 100).toFixed(1) : '0'}%</strong>
                    </span>
                    <span className="text-muted" title="Percentage of leads who enrolled">
                      Lead{'\u2192'}Enroll: <strong>{roi.leads > 0 ? ((roi.enrollments / roi.leads) * 100).toFixed(1) : '0'}%</strong>
                    </span>
                    <span className="text-muted" title="Percentage of visitors who are actively engaged">
                      Engagement Rate: <strong>{roi.visitors > 0 ? (((roi.engaged || 0) / roi.visitors) * 100).toFixed(1) : '0'}%</strong>
                    </span>
                    <span className="text-muted" title="Overall conversion from visitor to enrollment">
                      Overall Conv: <strong>{roi.visitors > 0 ? ((roi.enrollments / roi.visitors) * 100).toFixed(1) : '0'}%</strong>
                    </span>
                  </div>
                </>
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
                  {/* Nothing in the codebase ever increments budget_spent - it is set to 0 at
                      creation and never touched - so a rendered $0 is the default being read as a
                      measurement of zero spend. See metricRegistry 'marketing.ad_spend'. */}
                  <DetailRow label="Budget Spent" value={formatSpend(c.budget_spent).text} />
                  <DetailRow label="Target CPL" value={c.cost_per_lead_target != null ? fmt$(Number(c.cost_per_lead_target)) : '\u2014'} />
                  <DetailRow label="Expected ROI" value={c.expected_roi != null ? `${c.expected_roi}x` : '\u2014'} />
                </div>
              </div>

              {/* Visitor Drill-Down with Engagement */}
              {visitors.length > 0 && (
                <>
                  <h6 className="fw-semibold mt-4 mb-3" style={{ color: 'var(--color-primary)' }}>Visitors ({visitors.length})</h6>
                  <div className="table-responsive" style={{ maxHeight: 220, overflow: 'auto' }}>
                    <table className="table table-sm table-hover mb-0" style={{ fontSize: '0.78rem' }}>
                      <thead className="table-light" style={{ position: 'sticky', top: 0 }}>
                        <tr>
                          <th>Last Seen</th>
                          <th>Name</th>
                          <th>Email</th>
                          <th title="Time on page in seconds">Time</th>
                          <th title="Max scroll depth reached">Scroll</th>
                          <th title="Clicked a call-to-action button">CTA</th>
                          <th title="30s+ on page, 50%+ scroll, or CTA click">Engaged</th>
                          <th>Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visitors.map((v: any, i: number) => (
                          <tr key={i}>
                            <td className="text-muted">{v.last_seen_at ? new Date(v.last_seen_at).toLocaleDateString() : '-'}</td>
                            <td className="fw-medium">{v.lead_name || <span className="text-muted">Anonymous</span>}</td>
                            <td>{v.lead_email || '-'}</td>
                            <td>{v.time_on_page ? `${v.time_on_page}s` : '-'}</td>
                            <td>{v.scroll_depth ? `${v.scroll_depth}%` : '-'}</td>
                            <td>{v.cta_clicked ? <span className="badge bg-info text-dark" style={{ fontSize: 9 }}>Yes</span> : '-'}</td>
                            <td>{v.engaged ? <span className="badge bg-success" style={{ fontSize: 9 }}>Yes</span> : <span className="badge bg-secondary" style={{ fontSize: 9 }}>No</span>}</td>
                            <td><span className="badge bg-secondary" style={{ fontSize: 9 }}>{v.utm_source || 'direct'}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
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
  const [campaignKPIs, setCampaignKPIs] = useState<Record<string, { visitors: number; leads: number; engaged: number; enrollments: number }>>({});
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
      const kpis: Record<string, { visitors: number; leads: number; engaged: number; enrollments: number }> = {};
      await Promise.all(live.map(async (c: any) => {
        try {
          const res = await api.get(`/api/admin/campaigns/${c.id}/roi`);
          kpis[c.id] = { visitors: res.data?.visitors || 0, leads: res.data?.leads || 0, engaged: res.data?.engaged || 0, enrollments: res.data?.enrollments || 0 };
        } catch { kpis[c.id] = { visitors: 0, leads: 0, engaged: 0, enrollments: 0 }; }
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
        <h2 className="h4 fw-bold mb-0">Campaign Link Registry</h2>
        <div className="d-flex gap-2">
          <button className="btn btn-sm btn-outline-primary" onClick={fetchCampaigns} disabled={loading}>
            <i className="ri-refresh-line" aria-hidden="true" /> {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => setShowCreate(true)}>
            <i className="ri-add-line" aria-hidden="true" /> Create Campaign
          </button>
        </div>
      </div>

      {/* Channel ROI Summary */}
      {channelROI.length > 0 && (
        <div className="row g-3 mb-4">
          {channelROI.map(ch => (
            <div className="col-6 col-lg-3" key={ch.channel}>
              <SectionCard>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className="small fw-semibold text-uppercase">{ch.channel.replace(/_/g, ' ')}</span>
                  <StatusBadge label={String(ch.campaign_count)} tone="neutral" />
                </div>
                <div className="d-flex justify-content-between small">
                  <span className="text-muted">Spend</span>
                  <span className={`fw-medium ${formatSpend(ch.total_budget_spent).unavailable ? 'text-muted fst-italic fw-normal' : ''}`}>
                    {formatSpend(ch.total_budget_spent).text}
                  </span>
                </div>
                <div className="d-flex justify-content-between small">
                  <span className="text-muted">Revenue</span>
                  <span
                    className={`fw-medium ${ch.total_revenue === null ? 'text-muted fst-italic' : ''}`}
                    title={ch.total_revenue === null ? (ch.unavailable?.[0]?.reason || 'Not computable') : undefined}
                  >
                    {formatMoneyOrUnavailable(ch.total_revenue).text}
                  </span>
                </div>
                <div className="d-flex justify-content-between small">
                  <span className="text-muted">ROI</span>
                  <span className={`fw-bold ${ch.roi === null ? 'text-muted fst-italic fw-normal' : ch.roi > 0 ? 'text-success' : ch.roi < 0 ? 'text-danger' : ''}`}>
                    {ch.roi === null
                      ? 'Unavailable'
                      : `${ch.roi > 0 ? '+' : ''}${(ch.roi * 100).toFixed(0)}%`}
                  </span>
                </div>
              </SectionCard>
            </div>
          ))}
        </div>
      )}

      {/* Campaign Registry Table */}
      <SectionCard
        title="Registered Campaigns"
        icon="links-line"
        padded={false}
        actions={<small className="text-muted fw-normal">{campaigns.length} campaigns</small>}
      >
        <div>
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
                    <th className="text-end">Engaged</th>
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
                        <td className="fw-medium text-primary">
                          {c.name}
                        </td>
                        <td>
                          {c.channel
                            ? <StatusBadge label={c.channel.replace(/_/g, ' ')} tone="info" />
                            : <span className="text-muted">{'\u2014'}</span>}
                        </td>
                        <td>
                          <StatusBadge label={isActive ? 'Active' : c.status || 'Draft'} tone={isActive ? 'success' : 'neutral'} />
                        </td>
                        <td className="small">{c.destination_path || '\u2014'}</td>
                        <td className="text-end fw-medium text-primary text-decoration-underline" onClick={e => { e.stopPropagation(); openDrillDown(c); }} style={{ cursor: 'pointer' }}>
                          {campaignKPIs[c.id]?.visitors || 0}
                        </td>
                        <td className="text-end fw-medium" style={{ color: (campaignKPIs[c.id]?.engaged || 0) > 0 ? 'var(--chart-5)' : undefined }}>
                          {campaignKPIs[c.id]?.engaged || 0}
                        </td>
                        <td className="text-end fw-medium text-primary text-decoration-underline" onClick={e => { e.stopPropagation(); openDrillDown(c); }} style={{ cursor: 'pointer' }}>
                          {campaignKPIs[c.id]?.leads || 0}
                        </td>
                        <td className={`text-end fw-medium ${(campaignKPIs[c.id]?.enrollments || 0) > 0 ? 'text-success' : ''}`}>
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
      </SectionCard>

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

function RevenueIntelligenceTab(
  { onDataState, scope }: { onDataState?: (s: MarketingDataState) => void; scope: MarketingScope },
) {
  const [campaigns, setCampaigns] = useState<CampaignMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /* ---------- objective-aware ranking ----------
   * `manualSort` null means "rank each objective on its own metric, grouped" - the default,
   * and the reason this table exists in this form. Clicking a header switches to a flat manual
   * sort on that column; the reset button returns to objective ranking. The old behaviour
   * (everything sorted by visitor count) is what "ranked on likes" looked like here. */
  const [ranking, setRanking] = useState<Record<string, ResolvedRanking>>({});
  const [manualSort, setManualSort] = useState<{ key: SortKey; asc: boolean } | null>(null);
  const sortKey = manualSort?.key ?? 'visitors_count';
  const sortAsc = manualSort?.asc ?? false;

  /* ---------- columns and saved views (per-viewer convenience, localStorage) ---------- */
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => new Set(DEFAULT_COLUMNS));
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [views, setViews] = useState<SavedView[]>(() =>
    loadViews(typeof window !== 'undefined' ? window.localStorage : null));
  const [newViewName, setNewViewName] = useState('');

  const persistViews = (next: SavedView[]) => {
    setViews(next);
    saveViews(typeof window !== 'undefined' ? window.localStorage : null, next);
  };
  // Dates come from the page-level scope strip. This tab used to own a second pair of date
  // inputs, which meant the strip could say one range while the table below showed another -
  // two controls for one concept, disagreeing silently.
  const [selectedCampaign, setSelectedCampaign] = useState<RegisteredCampaign | null>(null);

  const openCampaignDetail = async (campaignId: string) => {
    try {
      const res = await api.get(`/api/admin/campaigns/${campaignId}`);
      const camp = res.data?.campaign || res.data;
      if (camp && camp.id) {
        // Ensure required fields for CampaignDetailModal
        if (!camp.type) camp.type = camp.campaign_type || 'marketing';
        if (!camp.status) camp.status = 'active';
        setSelectedCampaign(camp);
      }
    } catch (err) {
      console.error('[Marketing] Failed to load campaign detail:', err);
    }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Built by the tested helper rather than assembled here, so the brand sentinel and the
      // comparison window cannot be encoded two different ways on two different screens.
      const params = scopeToQuery(scope);
      const res = await api.get('/api/admin/marketing/campaigns', { params });
      const rows: CampaignMetric[] = res.data.campaigns || [];
      setCampaigns(rows);
      // Resolved server-side from the registry. The table applies these; it never decides them.
      setRanking(res.data.ranking || {});
      // Report the REAL fetch time and the server's own unavailable list to the page badge.
      // Reported here rather than during render so the badge cannot claim freshness for a
      // render that fetched nothing.
      onDataState?.({
        loading: false,
        error: false,
        unavailable: rows[0]?.unavailable ?? [],
        fetchedAt: new Date().toISOString(),
      });
    } catch {
      setError('Failed to load campaign data');
      setCampaigns([]);
      // A failed fetch must degrade the badge. The previous implementation left it reading
      // 'live' with a just-now timestamp after a 500.
      onDataState?.({ loading: false, error: true, unavailable: undefined, fetchedAt: null });
    } finally {
      setLoading(false);
    }
  }, [scope, onDataState]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /** Flat manual sort - only used when the operator has clicked a column header. */
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

  /** Objective-ranked groups - the default view. Unlike objectives are never interleaved. */
  const grouped = useMemo(() => rankCampaigns(campaigns, ranking), [campaigns, ranking]);

  const activeColumns = useMemo(
    () => ALL_COLUMNS.filter((c) => visibleColumns.has(c.key)),
    [visibleColumns],
  );

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

  // platform and creative are gone: the server used to select `NULL AS platform, NULL AS
  // creative`, so these columns rendered an em dash on every row of every campaign forever
  // while looking like a dimension that simply had no data yet.
  const hasMetadata = useMemo(() => campaigns.some(c => c.campaign_type), [campaigns]);

  /** What the server says it cannot compute. Same list for every row; read it once. */
  const unavailable = useMemo<UnavailableMetric[]>(() => campaigns[0]?.unavailable ?? [], [campaigns]);

  const handleSort = (key: SortKey) => {
    setManualSort((cur) =>
      cur && cur.key === key ? { key, asc: !cur.asc } : { key, asc: false });
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

  const kpiCards: { label: string; value: string; icon: string; tone: BadgeTone }[] = [
    { label: 'Total Visitors', value: totals.visitors.toLocaleString(), icon: 'group-line', tone: 'info' },
    { label: 'Total Leads', value: totals.leads.toLocaleString(), icon: 'user-add-line', tone: 'success' },
    { label: 'High Intent %', value: `${avgIntentPct}%`, icon: 'fire-line', tone: 'primary' },
    // NOT `fmt$(0)`. A revenue KPI reading "$0" in a success-green card states that the
    // campaigns earned nothing; the truth is that no payment data is joined to campaigns at
    // all. The card says so instead.
    { label: 'Total Revenue', value: 'Unavailable', icon: 'money-dollar-circle-line', tone: 'neutral' },
    { label: 'Enrollments', value: totals.enrollments.toLocaleString(), icon: 'graduation-cap-line', tone: 'primary' },
    { label: 'Conversion Rate', value: `${overallConversion}%`, icon: 'percent-line', tone: overallConversion >= 5 ? 'success' : overallConversion >= 2 ? 'warning' : 'danger' },
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
        <h2 className="h4 fw-bold mb-0">Revenue Intelligence</h2>
        <button className="btn btn-sm btn-outline-primary" onClick={fetchData} disabled={loading}>
          <i className="ri-refresh-line" aria-hidden="true" /> {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>


      {/* KPI Summary Cards */}
      <div className="row g-3 mb-4">
        {kpiCards.map((kpi) => (
          <div className="col-6 col-lg-2" key={kpi.label}>
            <StatCard label={kpi.label} value={loading ? '-' : kpi.value} icon={kpi.icon} tone={kpi.tone} />
          </div>
        ))}
      </div>

      {/* Funnel Visualization */}
      {!loading && funnelData.length > 0 && (
        <SectionCard title="Conversion Funnel" icon="filter-3-line" className="mb-4">
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
                <LabelList position="center" fill="var(--text-on-accent)" fontSize={12} fontWeight={600} />
                {funnelData.map((_, i) => (
                  <Cell key={i} fill={FUNNEL_COLORS[i]} />
                ))}
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
        </SectionCard>
      )}

      {/* Error State */}
      {error && (
        <div className="alert alert-danger alert-dismissible" role="alert">
          {error}
          <button type="button" className="btn-close" onClick={() => setError(null)} aria-label="Close" />
        </div>
      )}

      {/* Why the money figures are blank - stated, not implied by an empty cell. */}
      {unavailable.length > 0 && (
        <div className="alert alert-secondary d-flex gap-2 mb-4" role="note">
          <i className="ri-information-line mt-1" aria-hidden="true" />
          <div className="small">
            <div className="fw-semibold mb-1">
              {unavailable.length} metric{unavailable.length === 1 ? '' : 's'} on this page cannot be computed
            </div>
            <ul className="mb-0 ps-3">
              {unavailable.map((u) => (
                <li key={u.key}>
                  <span className="fw-medium">{u.name}:</span> {u.reason}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Campaign Performance Table */}
      <SectionCard
        title="Campaign Performance"
        icon="bar-chart-2-line"
        padded={false}
        actions={<small className="text-muted fw-normal">{campaigns.length} campaigns</small>}
      >
        <div>
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
            <div>
              {/* ---- view controls: objective ranking / manual sort, columns, saved views ---- */}
              <div className="d-flex flex-wrap align-items-center gap-2 px-3 py-2 border-bottom small">
                {manualSort ? (
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setManualSort(null)}>
                    Sorted by {ALL_COLUMNS.find((c) => c.key === manualSort.key)?.label ?? manualSort.key} - reset to objective ranking
                  </button>
                ) : (
                  <span className="text-muted">Ranked by each campaign's own objective. Click a column to sort manually.</span>
                )}
                <div className="ms-auto d-flex gap-2 align-items-center">
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setShowColumnPicker((v) => !v)}>
                    Columns ({activeColumns.length})
                  </button>
                  {views.length > 0 && (
                    <select
                      className="form-select form-select-sm"
                      style={{ width: 'auto' }}
                      value=""
                      onChange={(e) => {
                        const v = views.find((x) => x.name === e.target.value);
                        if (v) setVisibleColumns(new Set(v.columns));
                      }}
                    >
                      <option value="">Saved views...</option>
                      {views.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
                    </select>
                  )}
                </div>
              </div>

              {showColumnPicker && (
                <div className="px-3 py-2 border-bottom bg-light small">
                  <div className="d-flex flex-wrap gap-3 mb-2">
                    {ALL_COLUMNS.map((col) => (
                      <label key={col.key} className="form-check-label d-flex align-items-center gap-1">
                        <input
                          type="checkbox"
                          className="form-check-input"
                          checked={visibleColumns.has(col.key)}
                          onChange={(e) => {
                            const next = new Set(visibleColumns);
                            if (e.target.checked) next.add(col.key); else next.delete(col.key);
                            setVisibleColumns(next);
                          }}
                        />
                        {col.label}
                      </label>
                    ))}
                  </div>
                  <div className="d-flex gap-2 align-items-center">
                    <input
                      className="form-control form-control-sm"
                      style={{ maxWidth: 220 }}
                      placeholder="Save this column set as..."
                      value={newViewName}
                      onChange={(e) => setNewViewName(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      disabled={!newViewName.trim()}
                      onClick={() => {
                        persistViews(upsertView(views, { name: newViewName.trim(), columns: Array.from(visibleColumns) }));
                        setNewViewName('');
                      }}
                    >
                      Save view
                    </button>
                    <button type="button" className="btn btn-sm btn-link" onClick={() => setVisibleColumns(new Set(DEFAULT_COLUMNS))}>
                      Reset columns
                    </button>
                  </div>
                </div>
              )}

              <div className="table-responsive">
                <table className="table table-hover mb-0" style={{ fontSize: '0.82rem' }}>
                  <thead className="table-light">
                    <tr>
                      <SortTh k="campaign_id">Campaign</SortTh>
                      {activeColumns.map((col) => (
                        <SortTh key={col.key} k={col.key as SortKey}>{col.label}</SortTh>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(manualSort
                      ? [{ objective: null as string | null, ranking: null as ResolvedRanking | null, campaigns: sorted }]
                      : grouped
                    ).map((group) => (
                      <React.Fragment key={group.objective ?? '__flat'}>
                        {/* One header row per objective group, carrying the ranking reason. This
                            is the line that makes a fallback VISIBLE: an acquisition group today
                            reads "ranked by leads instead of cost per lead (no ad-spend source)". */}
                        {group.ranking && (
                          <tr className="table-secondary">
                            <td colSpan={activeColumns.length + 1} className="small py-1">
                              <span className="fw-semibold">{OBJECTIVE_LABELS[group.ranking.objective]}</span>
                              <span className={`ms-2 ${group.ranking.fallback ? 'text-warning-emphasis' : 'text-muted'}`}>
                                {group.ranking.fallback && <i className="ri-error-warning-line me-1" aria-hidden="true" />}
                                {group.ranking.reason}
                              </span>
                            </td>
                          </tr>
                        )}
                        {group.campaigns.map((c) => (
                          <tr key={c.campaign_id} style={{ cursor: 'pointer' }} onClick={() => openCampaignDetail(c.campaign_id)}>
                            <td className="fw-medium text-primary">{c.campaign_name || c.campaign_id}</td>
                            {activeColumns.map((col) => (
                              <td
                                key={col.key}
                                className={group.ranking?.rung?.column === col.key ? 'fw-semibold' : undefined}
                                title={group.ranking?.rung?.column === col.key ? 'This group is ranked on this column' : undefined}
                              >
                                {renderCampaignCell(c, col.key)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </SectionCard>
      {selectedCampaign && (
        <CampaignDetailModal
          campaign={selectedCampaign}
          onClose={() => setSelectedCampaign(null)}
          onEdit={() => setSelectedCampaign(null)}
          onRefresh={() => { setSelectedCampaign(null); fetchData(); }}
        />
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

function AdminMarketingDashboardPage() {
  const [activeTab, setActiveTab] = useState<'funnel' | 'revenue' | 'registry' | 'outreach'>('funnel');

  /* ---------- per-page trust signal ----------
   * Derived from the data the page actually received. This was previously a literal
   * `level: 'live'` with `updatedAt: new Date()` inside an empty-dependency useMemo, which
   * reported the component's MOUNT TIME as the data's freshness and read "live" even when the
   * fetch had failed. See marketingTrust.ts for the full account. */
  const [dataState, setDataState] = useState<MarketingDataState>({});

  /**
   * Scope owned here, at the page, because it governs every tab. `defaultScope` is seeded from
   * today's date ONCE rather than recomputed each render - a scope that silently shifted its
   * own window between renders would make two figures on the same screen describe different
   * periods.
   */
  const [scope, setScope] = useState<MarketingScope>(() =>
    defaultScope(new Date().toISOString().slice(0, 10)));
  const [scopeBrands, setScopeBrands] = useState<ScopeBrand[]>([]);

  /* ---------- Needs-Attention queue ----------
   * Refetched whenever the brand scope changes. The queue is the one thing on this page that
   * tells the operator what to DO, so it follows the same scope as the numbers - a queue for
   * all brands sitting above a table filtered to one would be two views disagreeing. */
  const [attentionItems, setAttentionItems] = useState<AttentionItem[]>([]);
  const [attentionExcluded, setAttentionExcluded] = useState<ExcludedSignal[]>([]);
  const [attentionLoading, setAttentionLoading] = useState(true);
  const [attentionError, setAttentionError] = useState<string | null>(null);

  const fetchAttention = useCallback(async (brand: string) => {
    setAttentionLoading(true);
    setAttentionError(null);
    try {
      const q = await getNeedsAttention(brand === ALL_BRANDS ? undefined : { brand_id: brand });
      setAttentionItems(q.items);
      setAttentionExcluded(q.excluded);
    } catch {
      // Cleared rather than left stale: a queue from the previous brand shown under a failed
      // fetch for the new one would be the wrong brand's to-do list wearing the new label.
      setAttentionItems([]);
      setAttentionExcluded([]);
      setAttentionError('The attention queue could not be loaded.');
    } finally {
      setAttentionLoading(false);
    }
  }, []);

  useEffect(() => { fetchAttention(scope.brand); }, [fetchAttention, scope.brand]);
  const [brandsLoading, setBrandsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listBrands()
      .then((r) => { if (!cancelled) setScopeBrands(r.brands); })
      // A failed brand list leaves the selector on "All authorized brands", which is the
      // correct fallback: it narrows nothing and claims nothing.
      .catch(() => { if (!cancelled) setScopeBrands([]); })
      .finally(() => { if (!cancelled) setBrandsLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const handleDataState = useCallback((next: MarketingDataState) => setDataState(next), []);
  const trust: TrustSignal = useMemo(() => deriveMarketingTrust(dataState), [dataState]);

  return (
    <>
      <PageHeader
        title="Marketing"
        icon="broadcast-line"
        subtitle="Funnel performance, revenue intelligence, campaign tracking links, and AI outreach."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Marketing' }]}
        trust={trust}
      >
        {/* Tab Navigation */}
        <ul className="nav nav-tabs">
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'funnel' ? 'active' : ''}`}
              onClick={() => setActiveTab('funnel')}
            >
              Marketing Funnel
            </button>
          </li>
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
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'outreach' ? 'active' : ''}`}
              onClick={() => setActiveTab('outreach')}
            >
              AI Outreach
            </button>
          </li>
        </ul>
      </PageHeader>

      <MarketingScopeStrip
        scope={scope}
        brands={scopeBrands}
        brandsLoading={brandsLoading}
        fetchedAt={dataState.fetchedAt ?? null}
        now={Date.now()}
        onScopeChange={setScope}
      />

      <div className="px-3 pt-3">
        <SectionCard title="Needs attention" icon="alarm-warning-line" padded={false}>
          <NeedsAttentionQueue
            loading={attentionLoading}
            error={attentionError}
            items={attentionItems}
            excluded={attentionExcluded}
            onRetry={() => fetchAttention(scope.brand)}
          />
        </SectionCard>
      </div>

      {activeTab === 'funnel' && (
        <div style={{ height: 'calc(100vh - 170px)', minHeight: 400 }}>
          <Suspense fallback={
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
            </div>
          }>
            <MarketingFunnelGraph />
          </Suspense>
        </div>
      )}
      {activeTab === 'revenue' && <RevenueIntelligenceTab onDataState={handleDataState} scope={scope} />}
      {activeTab === 'registry' && <CampaignLinkRegistryTab />}
      {activeTab === 'outreach' && (
        <Suspense fallback={
          <div className="text-center py-5">
            <div className="spinner-border spinner-border-sm text-primary" role="status">
              <span className="visually-hidden">Loading outreach...</span>
            </div>
          </div>
        }>
          <OpenclawTab />
        </Suspense>
      )}
    </>
  );
}

export default AdminMarketingDashboardPage;
