import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';
import Pagination from '../../components/ui/Pagination';
import useDebounce from '../../hooks/useDebounce';
import { PageHeader, StatCard, StatusBadge, SectionCard } from '../../components/admin/shell';
import { TrustSignal } from '../../components/admin/shell/trust';

/* ------------------------------------------------------------------ */
/*  Interfaces                                                         */
/* ------------------------------------------------------------------ */

interface CommRow {
  id: string;
  lead_id: number;
  campaign_id: string;
  channel: string;
  status: string;
  to_address: string;
  subject: string;
  body_preview: string;
  provider: string;
  error_message: string | null;
  metadata: any;
  created_at: string;
  call_duration: string | null;
  call_disposition: string | null;
  has_transcript: boolean;
  lead_name: string;
  lead_email: string;
  lead_company: string;
  lead_temperature: string;
  pipeline_stage: string;
  campaign_name: string;
  outcomes: Array<{ outcome: string; at: string }> | null;
}

interface CommDetail {
  communication: any;
  outcomes: Array<{ outcome: string; channel: string; step_index: number; created_at: string }>;
  temperature_changes: Array<{ previous_temperature: string; new_temperature: string; trigger_type: string; created_at: string }>;
  enrollment: { enrollment_status: string; enrolled_at: string; steps_completed: number; total_steps: number } | null;
  scheduled_action: { step_index: number; ai_generated: boolean; subject: string; body: string } | null;
}

interface CampaignOption {
  id: string;
  name: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CHANNEL_OPTIONS = [
  { value: '', label: 'All Channels' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'voice', label: 'Voice' },
];

const DATE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: '', label: 'All Time' },
];

type BadgeTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'primary';

const OUTCOME_BADGES: Record<string, { label: string; tone: BadgeTone }> = {
  sent: { label: 'Sent', tone: 'neutral' },
  opened: { label: 'Opened', tone: 'success' },
  clicked: { label: 'Clicked', tone: 'info' },
  replied: { label: 'Replied', tone: 'primary' },
  bounced: { label: 'Bounced', tone: 'danger' },
  failed: { label: 'Failed', tone: 'danger' },
  delivered: { label: 'Delivered', tone: 'success' },
  voicemail: { label: 'Voicemail', tone: 'warning' },
  answered: { label: 'Answered', tone: 'success' },
  no_answer: { label: 'No Answer', tone: 'neutral' },
  declined: { label: 'Declined', tone: 'neutral' },
  pending: { label: 'Pending', tone: 'warning' },
};

const CHANNEL_ICONS: Record<string, string> = {
  email: 'mail-line',
  sms: 'message-2-line',
  voice: 'phone-line',
};

/* ------------------------------------------------------------------ */
/*  Campaign Colors                                                    */
/* ------------------------------------------------------------------ */

// Deterministic color palette for campaigns — drawn from the design-system
// data-viz tokens (color-blind safe, max adjacent separation). Cycled by index.
const CAMPAIGN_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
  'var(--chart-8)',
];

function getCampaignColor(campaignId: string, campaignMap: Map<string, number>): string {
  if (!campaignId) return 'transparent';
  if (!campaignMap.has(campaignId)) {
    campaignMap.set(campaignId, campaignMap.size);
  }
  return CAMPAIGN_COLORS[campaignMap.get(campaignId)! % CAMPAIGN_COLORS.length];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function AdminCommunicationsPage() {
  const [rows, setRows] = useState<CommRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [channelFilter, setChannelFilter] = useState(() => new URLSearchParams(window.location.search).get('channel') || '');
  const [datePreset, setDatePreset] = useState('today');
  const [campaignFilter, setCampaignFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CommDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Stable campaign → color mapping (built from campaigns list)
  const [campaignColorMap] = useState(() => new Map<string, number>());

  // Compute date range from preset
  const getDateRange = () => {
    const now = new Date();
    if (datePreset === 'today') {
      return { dateFrom: now.toISOString().slice(0, 10) };
    } else if (datePreset === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 86400000);
      return { dateFrom: weekAgo.toISOString().slice(0, 10) };
    } else if (datePreset === 'month') {
      const monthAgo = new Date(now.getTime() - 30 * 86400000);
      return { dateFrom: monthAgo.toISOString().slice(0, 10) };
    }
    return {};
  };

  // Debounce free-text search so typing "john" fires 1 request, not 4.
  const debouncedSearch = useDebounce(searchInput, 300);

  const fetchRows = useCallback(async () => {
    try {
      const params: Record<string, string> = { page: String(page), limit: '25' };
      if (channelFilter) params.channel = channelFilter;
      if (campaignFilter) params.campaign_id = campaignFilter;
      if (debouncedSearch) params.search = debouncedSearch;
      const dateRange = getDateRange();
      if (dateRange.dateFrom) params.dateFrom = dateRange.dateFrom;
      const res = await api.get('/api/admin/communications', { params });
      setRows(res.data.rows || []);
      setTotal(res.data.total || 0);
      setTotalPages(res.data.totalPages || 1);
    } catch (err) {
      console.error('Failed to fetch communications:', err);
    }
  // eslint-disable-next-line
  }, [page, channelFilter, datePreset, campaignFilter, debouncedSearch]);

  useEffect(() => {
    api.get('/api/admin/communications/campaigns').then(res => {
      setCampaigns(Array.isArray(res.data) ? res.data : []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchRows().finally(() => setLoading(false));
  }, [fetchRows]);

  /* ---------- channel mix (KPI row) ---------- */

  const channelMix = useMemo(() => {
    let email = 0, sms = 0, voice = 0;
    rows.forEach(r => {
      if (r.channel === 'email') email++;
      else if (r.channel === 'sms') sms++;
      else if (r.channel === 'voice') voice++;
    });
    return { email, sms, voice };
  }, [rows]);

  /* ---------- per-page trust signal ---------- */

  const trust: TrustSignal = useMemo(() => ({
    level: 'live',
    source: 'communications',
    updatedAt: new Date().toISOString(),
    summary: `${total} communications across email, SMS, and voice.`,
    href: '/admin/trust',
    pillars: [
      {
        name: 'Channel Activity',
        status: 'live',
        evidence: [
          { label: 'Email', value: String(channelMix.email) },
          { label: 'SMS', value: String(channelMix.sms) },
          { label: 'Voice', value: String(channelMix.voice) },
        ],
      },
    ],
  }), [total, channelMix]);

  const toggleDetail = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    setDetailLoading(true);
    try {
      const res = await api.get(`/api/admin/communications/${id}/detail`);
      setDetail(res.data);
    } catch {
      setDetail(null);
    }
    setDetailLoading(false);
  };

  /* ---------- formatters ---------- */

  const fmtTime = (s: string) => {
    const d = new Date(s);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const channelIcon = (ch: string) => (
    <i className={`ri-${CHANNEL_ICONS[ch] || CHANNEL_ICONS.email} me-1`} aria-hidden="true" />
  );

  const outcomeBadge = (outcome: string) => {
    const b = OUTCOME_BADGES[outcome] || { label: outcome, tone: 'neutral' as BadgeTone };
    return <StatusBadge label={b.label} tone={b.tone} />;
  };

  const bestOutcome = (row: CommRow): string => {
    if (!row.outcomes || row.outcomes.length === 0) return row.status;
    const priority = ['replied', 'clicked', 'opened', 'answered', 'bounced', 'voicemail', 'no_answer', 'sent'];
    for (const p of priority) {
      if (row.outcomes.some(o => o.outcome === p)) return p;
    }
    return row.status;
  };

  /* ---------- render ---------- */

  return (
    <>
      <PageHeader
        title="Communications"
        icon="chat-3-line"
        subtitle="Every outbound email, SMS, and voice touch across the pipeline, with per-lead engagement detail."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Communications' }]}
        trust={trust}
      >
        <div className="row g-3">
          <div className="col-6 col-lg-3">
            <StatCard label="Total" value={total} icon="chat-3-line" tone="primary" hint="matching filters" />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard label="Email" value={channelMix.email} icon="mail-line" tone="info" hint="this page" />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard label="SMS" value={channelMix.sms} icon="message-2-line" tone="success" hint="this page" />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard label="Voice" value={channelMix.voice} icon="phone-line" tone="warning" hint="this page" />
          </div>
        </div>
      </PageHeader>

      {/* Filter Bar */}
      <div className="row g-2 mb-4">
        <div className="col-md-2">
          <select className="form-select form-select-sm" value={channelFilter}
            onChange={e => { setChannelFilter(e.target.value); setPage(1); }}>
            {CHANNEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="col-md-2">
          <select className="form-select form-select-sm" value={datePreset}
            onChange={e => { setDatePreset(e.target.value); setPage(1); }}>
            {DATE_PRESETS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="col-md-3">
          <select className="form-select form-select-sm" value={campaignFilter}
            onChange={e => { setCampaignFilter(e.target.value); setPage(1); }}>
            <option value="">All Campaigns</option>
            {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="col-md-3">
          <input type="text" className="form-control form-control-sm" placeholder="Search lead name or email..."
            value={searchInput} onChange={e => { setSearchInput(e.target.value); setPage(1); }} />
        </div>
        <div className="col-md-2 text-end">
          <span className="text-muted small">{total} communications</span>
        </div>
      </div>

      {/* Campaign Color Legend */}
      {(() => {
        // Build legend from visible campaigns in current rows
        const visibleCampaigns = new Map<string, string>();
        rows.forEach(r => {
          if (r.campaign_id && r.campaign_name && !visibleCampaigns.has(r.campaign_id)) {
            visibleCampaigns.set(r.campaign_id, r.campaign_name);
          }
        });
        if (visibleCampaigns.size === 0) return null;
        return (
          <div className="d-flex flex-wrap gap-2 mb-3 align-items-center">
            <span className="small text-muted fw-medium me-1">Campaigns:</span>
            {Array.from(visibleCampaigns.entries()).map(([cid, cname]) => (
              <span key={cid} className="d-inline-flex align-items-center gap-1 small"
                style={{ cursor: 'pointer', opacity: campaignFilter && campaignFilter !== cid ? 0.4 : 1 }}
                onClick={() => { setCampaignFilter(campaignFilter === cid ? '' : cid); setPage(1); }}>
                <span style={{
                  width: 10, height: 10, borderRadius: 2,
                  backgroundColor: getCampaignColor(cid, campaignColorMap),
                  display: 'inline-block', flexShrink: 0,
                }} />
                {cname.length > 28 ? cname.substring(0, 26) + '...' : cname}
              </span>
            ))}
          </div>
        );
      })()}

      {/* Table */}
      <SectionCard padded={false}>
        <div className="table-responsive">
          <table className="table table-hover mb-0" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '12%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '30%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '6%' }} />
            </colgroup>
            <thead className="table-light">
              <tr>
                <th className="small fw-medium">Time</th>
                <th className="small fw-medium">Lead</th>
                <th className="small fw-medium">Channel</th>
                <th className="small fw-medium">Campaign</th>
                <th className="small fw-medium">Subject / Preview</th>
                <th className="small fw-medium">Outcome</th>
                <th className="small fw-medium"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-4 text-muted">Loading...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-4 text-muted">No communications found</td></tr>
              ) : rows.map(row => (
                <tr key={row.id}
                  style={{ cursor: 'pointer', borderLeft: row.campaign_id ? `4px solid ${getCampaignColor(row.campaign_id, campaignColorMap)}` : undefined }}
                  onClick={() => toggleDetail(row.id)}
                  className={expandedId === row.id ? 'table-active' : ''}>
                  <td className="small text-nowrap">{fmtTime(row.created_at)}</td>
                  <td className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <Link to={`/admin/leads/${row.lead_id}`} className="text-decoration-none fw-medium"
                      onClick={e => e.stopPropagation()}>
                      {row.lead_name || row.to_address}
                    </Link>
                    {row.lead_company && <div className="text-muted text-truncate" style={{ fontSize: '0.75rem' }}>{row.lead_company}</div>}
                  </td>
                  <td className="small text-nowrap">
                    {channelIcon(row.channel)}
                    {row.channel}
                  </td>
                  <td className="small text-truncate">
                    {row.campaign_id ? (
                      <Link to={`/admin/campaigns/${row.campaign_id}`} className="text-decoration-none"
                        onClick={e => e.stopPropagation()}>
                        {row.campaign_name || '--'}
                      </Link>
                    ) : <span className="text-muted">--</span>}
                  </td>
                  <td className="small text-truncate">
                    {row.subject || row.body_preview || (row.metadata?.trigger) || '--'}
                  </td>
                  <td className="small">{outcomeBadge(bestOutcome(row))}</td>
                  <td className="small text-end">
                    <button className="btn btn-sm btn-outline-secondary py-0 px-2"
                      onClick={e => { e.stopPropagation(); toggleDetail(row.id); }}>
                      <i className={`ri-arrow-${expandedId === row.id ? 'up' : 'down'}-s-line`} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Expanded Detail Panel — rendered outside the table to avoid layout issues */}
      {expandedId && (() => {
        const row = rows.find(r => r.id === expandedId);
        if (!row) return null;
        return (
          <div className="mt-0 mb-3" style={{ borderTop: '3px solid var(--color-primary)' }}>
            <SectionCard padded={false}>
              <div className="admin-section-card__head d-flex justify-content-between align-items-center">
                <span className="small fw-semibold">
                  {row.lead_name} &middot; {row.channel} &middot; {fmtTime(row.created_at)}
                </span>
                <button className="btn-close btn-close-sm" aria-label="Close" onClick={() => { setExpandedId(null); setDetail(null); }} />
              </div>
              <div className="p-3">
                {detailLoading ? (
                  <div className="text-center text-muted py-3">Loading details...</div>
                ) : detail ? (
                  <div className="row g-3">
                    {/* Left: Content */}
                    <div className="col-lg-8">
                      {row.channel === 'voice' && detail.communication?.transcript ? (
                        <SectionCard title="Call Transcript" className="mb-3">
                          <div className="small" style={{ maxHeight: 300, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                            {detail.communication.transcript}
                          </div>
                          {detail.communication.recording_url && (
                            <div className="mt-2">
                              <a href={detail.communication.recording_url} target="_blank" rel="noreferrer"
                                className="btn btn-sm btn-outline-primary">Listen to Recording</a>
                            </div>
                          )}
                        </SectionCard>
                      ) : (
                        <SectionCard title={row.channel === 'sms' ? 'SMS Message' : 'Email Content'} className="mb-3">
                          <div className="small">
                            {detail.communication?.subject && (
                              <div className="fw-medium mb-2">Subject: {detail.communication.subject}</div>
                            )}
                            <div style={{ maxHeight: 250, overflowY: 'auto' }}
                              dangerouslySetInnerHTML={{ __html: detail.communication?.body || detail.communication?.body_preview || '(no content)' }} />
                          </div>
                        </SectionCard>
                      )}

                      {detail.outcomes && detail.outcomes.length > 0 && (
                        <SectionCard title="Engagement Timeline" padded={false} className="mb-3">
                          <ul className="list-group list-group-flush">
                            {detail.outcomes.map((o, i) => (
                              <li key={i} className="list-group-item d-flex justify-content-between align-items-center py-2">
                                <span className="small">{outcomeBadge(o.outcome)} {o.channel}</span>
                                <span className="small text-muted">{fmtTime(o.created_at)}</span>
                              </li>
                            ))}
                          </ul>
                        </SectionCard>
                      )}

                      {detail.temperature_changes && detail.temperature_changes.length > 0 && (
                        <SectionCard title="Temperature Changes" padded={false}>
                          <ul className="list-group list-group-flush">
                            {detail.temperature_changes.map((tc, i) => (
                              <li key={i} className="list-group-item py-2 small">
                                {tc.previous_temperature} → <strong>{tc.new_temperature}</strong>
                                <span className="text-muted ms-2">({tc.trigger_type})</span>
                                <span className="text-muted float-end">{fmtTime(tc.created_at)}</span>
                              </li>
                            ))}
                          </ul>
                        </SectionCard>
                      )}
                    </div>

                    {/* Right: Lead Context */}
                    <div className="col-lg-4">
                      <SectionCard title="Lead Profile" className="mb-3">
                        <div className="small">
                          <div className="fw-medium mb-1">
                            <Link to={`/admin/leads/${row.lead_id}`}>{detail.communication?.lead_name}</Link>
                          </div>
                          <div className="text-muted">{detail.communication?.lead_email}</div>
                          {detail.communication?.lead_phone && <div className="text-muted">{detail.communication.lead_phone}</div>}
                          {detail.communication?.lead_company && <div className="text-muted">{detail.communication.lead_company}</div>}
                          <hr className="my-2" />
                          <div className="d-flex justify-content-between">
                            <span>Temperature</span>
                            <span className="fw-medium">{detail.communication?.lead_temperature || '--'}</span>
                          </div>
                          <div className="d-flex justify-content-between">
                            <span>Pipeline</span>
                            <span className="fw-medium">{detail.communication?.pipeline_stage || '--'}</span>
                          </div>
                          <div className="d-flex justify-content-between">
                            <span>Score</span>
                            <span className="fw-medium">{detail.communication?.lead_score || '--'}</span>
                          </div>
                        </div>
                      </SectionCard>

                      {detail.enrollment && (
                        <SectionCard title="Campaign" className="mb-3">
                          <div className="small">
                            <div className="fw-medium mb-1">
                              <Link to={`/admin/campaigns/${row.campaign_id}`}>{detail.communication?.campaign_name}</Link>
                            </div>
                            <div className="d-flex justify-content-between align-items-center">
                              <span>Status</span>
                              <StatusBadge label={detail.enrollment.enrollment_status} tone="success" />
                            </div>
                            <div className="d-flex justify-content-between mt-1">
                              <span>Progress</span>
                              <span>{detail.enrollment.steps_completed}/{detail.enrollment.total_steps || '?'} steps</span>
                            </div>
                          </div>
                        </SectionCard>
                      )}

                      {detail.scheduled_action && (
                        <SectionCard title="Action Details">
                          <div className="small">
                            <div className="d-flex justify-content-between">
                              <span>Step</span>
                              <span>{detail.scheduled_action.step_index}</span>
                            </div>
                            <div className="d-flex justify-content-between mt-1">
                              <span>AI Generated</span>
                              <span>{detail.scheduled_action.ai_generated ? 'Yes' : 'No'}</span>
                            </div>
                          </div>
                        </SectionCard>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-muted py-3">Failed to load details</div>
                )}
              </div>
            </SectionCard>
          </div>
        );
      })()}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-3">
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
    </>
  );
}

export default AdminCommunicationsPage;
