import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';
import Pagination from '../../components/ui/Pagination';

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

const OUTCOME_BADGES: Record<string, { label: string; cls: string }> = {
  sent: { label: 'Sent', cls: 'bg-secondary' },
  opened: { label: 'Opened', cls: 'bg-success' },
  clicked: { label: 'Clicked', cls: 'bg-info' },
  replied: { label: 'Replied', cls: 'bg-primary' },
  bounced: { label: 'Bounced', cls: 'bg-danger' },
  failed: { label: 'Failed', cls: 'bg-danger' },
  delivered: { label: 'Delivered', cls: 'bg-success' },
  voicemail: { label: 'Voicemail', cls: 'bg-warning text-dark' },
  answered: { label: 'Answered', cls: 'bg-success' },
  no_answer: { label: 'No Answer', cls: 'bg-secondary' },
  declined: { label: 'Declined', cls: 'bg-secondary' },
  pending: { label: 'Pending', cls: 'bg-light text-muted' },
};

const CHANNEL_ICONS: Record<string, string> = {
  email: 'M0 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V4zm2-1a1 1 0 0 0-1 1v.217l7 4.2 7-4.2V4a1 1 0 0 0-1-1H2zm13 2.383-4.758 2.855L15 11.114v-5.73zm-.034 6.878L9.271 8.82 8 9.583 6.728 8.82l-5.694 3.44A1 1 0 0 0 2 13h12a1 1 0 0 0 .966-.739zM1 11.114l4.758-2.876L1 5.383v5.73z',
  sms: 'M5 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm4 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 1a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M2.165 15.803l.02-.004c1.83-.363 2.948-.842 3.468-1.105A9.06 9.06 0 0 0 8 15c4.418 0 8-3.134 8-7s-3.582-7-8-7-8 3.134-8 7c0 1.76.743 3.37 1.97 4.6a10.437 10.437 0 0 1-.524 2.318l-.003.011a10.722 10.722 0 0 1-.244.637c-.079.186.074.394.272.362a21.673 21.673 0 0 0 .693-.125z',
  voice: 'M3.654 1.328a.678.678 0 0 0-1.015-.063L1.605 2.3c-.483.484-.661 1.169-.45 1.77a17.568 17.568 0 0 0 4.168 6.608 17.569 17.569 0 0 0 6.608 4.168c.601.211 1.286.033 1.77-.45l1.034-1.034a.678.678 0 0 0-.063-1.015l-2.307-1.794a.678.678 0 0 0-.58-.122l-2.19.547a1.745 1.745 0 0 1-1.657-.459L5.482 8.062a1.745 1.745 0 0 1-.46-1.657l.548-2.19a.678.678 0 0 0-.122-.58L3.654 1.328zM1.884.511a1.745 1.745 0 0 1 2.612.163L6.29 2.98c.329.423.445.974.315 1.494l-.547 2.19a.678.678 0 0 0 .178.643l2.457 2.457a.678.678 0 0 0 .644.178l2.189-.547a1.745 1.745 0 0 1 1.494.315l2.306 1.794c.829.645.905 1.87.163 2.611l-1.034 1.034c-.74.74-1.846 1.065-2.877.702a18.634 18.634 0 0 1-7.01-4.42 18.634 18.634 0 0 1-4.42-7.009c-.362-1.03-.037-2.137.703-2.877L1.885.511z',
};

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

  const fetchRows = useCallback(async () => {
    try {
      const params: Record<string, string> = { page: String(page), limit: '25' };
      if (channelFilter) params.channel = channelFilter;
      if (campaignFilter) params.campaign_id = campaignFilter;
      if (searchInput) params.search = searchInput;
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
  }, [page, channelFilter, datePreset, campaignFilter, searchInput]);

  useEffect(() => {
    api.get('/api/admin/communications/campaigns').then(res => {
      setCampaigns(Array.isArray(res.data) ? res.data : []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchRows().finally(() => setLoading(false));
  }, [fetchRows]);

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
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="me-1">
      <path d={CHANNEL_ICONS[ch] || CHANNEL_ICONS.email} />
    </svg>
  );

  const outcomeBadge = (outcome: string) => {
    const b = OUTCOME_BADGES[outcome] || { label: outcome, cls: 'bg-secondary' };
    return <span className={`badge ${b.cls} me-1`}>{b.label}</span>;
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
      <h1 className="h3 fw-bold mb-4" style={{ color: 'var(--color-primary)' }}>Communications</h1>

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

      {/* Table */}
      <div className="card border-0 shadow-sm">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
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
                <React.Fragment key={row.id}>
                  <tr style={{ cursor: 'pointer' }} onClick={() => toggleDetail(row.id)}
                    className={expandedId === row.id ? 'table-active' : ''}>
                    <td className="small text-nowrap">{fmtTime(row.created_at)}</td>
                    <td className="small">
                      <Link to={`/admin/leads/${row.lead_id}`} className="text-decoration-none fw-medium"
                        onClick={e => e.stopPropagation()}>
                        {row.lead_name || row.to_address}
                      </Link>
                      {row.lead_company && <div className="text-muted" style={{ fontSize: '0.75rem' }}>{row.lead_company}</div>}
                    </td>
                    <td className="small text-nowrap">
                      {channelIcon(row.channel)}
                      {row.channel}
                      {row.call_duration && <span className="text-muted ms-1">({row.call_duration}s)</span>}
                    </td>
                    <td className="small">
                      {row.campaign_id ? (
                        <Link to={`/admin/campaigns/${row.campaign_id}`} className="text-decoration-none"
                          onClick={e => e.stopPropagation()}>
                          {row.campaign_name ? (row.campaign_name.length > 25 ? row.campaign_name.substring(0, 23) + '...' : row.campaign_name) : '--'}
                        </Link>
                      ) : <span className="text-muted">--</span>}
                    </td>
                    <td className="small" style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.subject || row.body_preview || (row.metadata?.trigger) || '--'}
                    </td>
                    <td className="small">{outcomeBadge(bestOutcome(row))}</td>
                    <td className="small">
                      <button className="btn btn-sm btn-outline-secondary py-0 px-2"
                        onClick={e => { e.stopPropagation(); toggleDetail(row.id); }}>
                        {expandedId === row.id ? '▲' : '▼'}
                      </button>
                    </td>
                  </tr>

                  {/* Expanded Detail */}
                  {expandedId === row.id && (
                    <tr>
                      <td colSpan={7} className="p-0">
                        <div className="bg-light p-3 border-top">
                          {detailLoading ? (
                            <div className="text-center text-muted py-3">Loading details...</div>
                          ) : detail ? (
                            <div className="row g-3">
                              {/* Left: Content */}
                              <div className="col-lg-8">
                                {/* Message content */}
                                {row.channel === 'voice' && detail.communication?.transcript ? (
                                  <div className="card border-0 mb-3">
                                    <div className="card-header bg-white fw-semibold small">Call Transcript</div>
                                    <div className="card-body small" style={{ maxHeight: 300, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                                      {detail.communication.transcript}
                                    </div>
                                    {detail.communication.recording_url && (
                                      <div className="card-footer bg-white">
                                        <a href={detail.communication.recording_url} target="_blank" rel="noreferrer"
                                          className="btn btn-sm btn-outline-primary">Listen to Recording</a>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="card border-0 mb-3">
                                    <div className="card-header bg-white fw-semibold small">
                                      {row.channel === 'sms' ? 'SMS Message' : 'Email Content'}
                                    </div>
                                    <div className="card-body small">
                                      {detail.communication?.subject && (
                                        <div className="fw-medium mb-2">Subject: {detail.communication.subject}</div>
                                      )}
                                      <div style={{ maxHeight: 200, overflowY: 'auto' }}
                                        dangerouslySetInnerHTML={{ __html: detail.communication?.body || detail.communication?.body_preview || '(no content)' }} />
                                    </div>
                                  </div>
                                )}

                                {/* Outcomes timeline */}
                                {detail.outcomes && detail.outcomes.length > 0 && (
                                  <div className="card border-0 mb-3">
                                    <div className="card-header bg-white fw-semibold small">Engagement Timeline</div>
                                    <div className="card-body p-0">
                                      <ul className="list-group list-group-flush">
                                        {detail.outcomes.map((o, i) => (
                                          <li key={i} className="list-group-item d-flex justify-content-between align-items-center py-2">
                                            <span className="small">{outcomeBadge(o.outcome)} {o.channel}</span>
                                            <span className="small text-muted">{fmtTime(o.created_at)}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  </div>
                                )}

                                {/* Temperature changes */}
                                {detail.temperature_changes && detail.temperature_changes.length > 0 && (
                                  <div className="card border-0">
                                    <div className="card-header bg-white fw-semibold small">Temperature Changes</div>
                                    <div className="card-body p-0">
                                      <ul className="list-group list-group-flush">
                                        {detail.temperature_changes.map((tc, i) => (
                                          <li key={i} className="list-group-item py-2 small">
                                            {tc.previous_temperature} → <strong>{tc.new_temperature}</strong>
                                            <span className="text-muted ms-2">({tc.trigger_type})</span>
                                            <span className="text-muted float-end">{fmtTime(tc.created_at)}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Right: Lead Context */}
                              <div className="col-lg-4">
                                <div className="card border-0 mb-3">
                                  <div className="card-header bg-white fw-semibold small">Lead Profile</div>
                                  <div className="card-body small">
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
                                </div>

                                {/* Campaign context */}
                                {detail.enrollment && (
                                  <div className="card border-0 mb-3">
                                    <div className="card-header bg-white fw-semibold small">Campaign</div>
                                    <div className="card-body small">
                                      <div className="fw-medium mb-1">
                                        <Link to={`/admin/campaigns/${row.campaign_id}`}>{detail.communication?.campaign_name}</Link>
                                      </div>
                                      <div className="d-flex justify-content-between">
                                        <span>Status</span>
                                        <span className="badge bg-success">{detail.enrollment.enrollment_status}</span>
                                      </div>
                                      <div className="d-flex justify-content-between mt-1">
                                        <span>Progress</span>
                                        <span>{detail.enrollment.steps_completed}/{detail.enrollment.total_steps || '?'} steps</span>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Scheduled action context */}
                                {detail.scheduled_action && (
                                  <div className="card border-0">
                                    <div className="card-header bg-white fw-semibold small">Action Details</div>
                                    <div className="card-body small">
                                      <div className="d-flex justify-content-between">
                                        <span>Step</span>
                                        <span>{detail.scheduled_action.step_index}</span>
                                      </div>
                                      <div className="d-flex justify-content-between mt-1">
                                        <span>AI Generated</span>
                                        <span>{detail.scheduled_action.ai_generated ? 'Yes' : 'No'}</span>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="text-center text-muted py-3">Failed to load details</div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
