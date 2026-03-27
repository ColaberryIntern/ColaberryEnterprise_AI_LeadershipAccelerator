import { useState, useEffect, useCallback } from 'react';
import { useOpenclawContext } from './OpenclawContext';
import ResponseDetailModal from './ResponseDetailModal';
import {
  PLATFORM_COLORS,
  STATUS_BADGES,
  timeAgo,
} from './openclawUtils';
import {
  approveOpenclawResponse,
  rejectOpenclawResponse,
  markOpenclawResponsePosted,
  postResponseViaBrowser,
  type OpenclawResponseItem,
} from '../../../../../services/openclawApi';
import {
  getResponseQueue,
  approveResponse,
  rejectResponse,
  markResponsePosted,
  getLinkedInActions,
  completeLinkedInAction,
  skipLinkedInAction,
  type ResponseQueueItem,
  type LinkedInActionItem,
} from '../../../../../services/openclawReputationApi';

// ── Constants ─────────────────────────────────────────────────────────────────

const RESPONSES_PER_PAGE = 25;

// ── Main Component ────────────────────────────────────────────────────────────

export default function TaskQueueSubTab() {
  const {
    responses,
    responsesTotal,
    automatedTotal,
    manualTotal,
    responsePage,
    setResponsePage,
    responseFilter,
    setResponseFilter,
    responseView,
    setResponseView,
    actionItems,
    actionsLoading,
    fetchData,
  } = useOpenclawContext();

  // Local state
  const [selectedResponse, setSelectedResponse] = useState<OpenclawResponseItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [markPostedUrl, setMarkPostedUrl] = useState('');
  const [browserPostingId, setBrowserPostingId] = useState<string | null>(null);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleApprove = async (id: string) => {
    try {
      await approveOpenclawResponse(id);
      fetchData();
    } catch { /* ignore */ }
  };

  const handleReject = async (id: string) => {
    try {
      await rejectOpenclawResponse(id);
      fetchData();
    } catch { /* ignore */ }
  };

  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { /* ignore */ }
  };

  const handleMarkPosted = async (id: string) => {
    if (!markPostedUrl.trim()) return;
    try {
      await markOpenclawResponsePosted(id, markPostedUrl.trim());
      setSelectedResponse(null);
      setMarkPostedUrl('');
      fetchData();
    } catch { /* ignore */ }
  };

  const handleBrowserPost = async (id: string) => {
    setBrowserPostingId(id);
    try {
      await postResponseViaBrowser(id);
      fetchData();
    } catch { /* ignore */ }
    setBrowserPostingId(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ══════ What To Do Now — Action Queue ══════ */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold small d-flex align-items-center justify-content-between">
          <span>What To Do Now</span>
          {actionItems.length > 0 && (
            <span className="badge bg-danger">{actionItems.length} action{actionItems.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="card-body p-0">
          {actionsLoading ? (
            <div className="text-center py-3">
              <div className="spinner-border spinner-border-sm text-primary" role="status">
                <span className="visually-hidden">Loading actions...</span>
              </div>
            </div>
          ) : actionItems.length === 0 ? (
            <div className="text-center py-4">
              <div className="text-success mb-1" style={{ fontSize: '1.5rem' }}>&#10003;</div>
              <div className="text-muted small">All caught up! No urgent actions.</div>
            </div>
          ) : (
            <div className="list-group list-group-flush">
              {actionItems.map((item, idx) => {
                const urgencyColors: Record<string, string> = { critical: '#dc3545', high: '#fd7e14', medium: '#ffc107', low: '#adb5bd' };
                const urgencyBg: Record<string, string> = { critical: 'danger', high: 'warning', medium: 'info', low: 'secondary' };
                const actionTypeLabels: Record<string, string> = {
                  follow_up_required: 'Follow Up',
                  conversion_ready: 'Conversion Ready',
                  respond_to_interest: 'Interest Signal',
                  advance_stage: 'Advance',
                  close_opportunity: 'Close',
                };
                return (
                  <div key={item.conversation_id + idx} className="list-group-item px-3 py-2">
                    <div className="d-flex align-items-start gap-2">
                      <div style={{ minWidth: 4, background: urgencyColors[item.urgency.level], borderRadius: 2, alignSelf: 'stretch' }} />
                      <div className="flex-grow-1">
                        <div className="d-flex align-items-center gap-2 mb-1">
                          <span className={`badge bg-${urgencyBg[item.urgency.level]} text-uppercase`} style={{ fontSize: '0.65rem' }}>{item.urgency.level}</span>
                          <span className="badge bg-primary" style={{ fontSize: '0.65rem' }}>{actionTypeLabels[item.action_type] || item.action_type}</span>
                          <span className="badge" style={{ background: PLATFORM_COLORS[item.platform] || '#6c757d', color: '#fff', fontSize: '0.65rem' }}>{item.platform}</span>
                          <span className="text-muted small ms-auto">Stage {item.stage}</span>
                          <span className="text-muted small">{Math.round(item.hours_since_activity)}h ago</span>
                        </div>
                        <div className="small fw-medium">{item.lead_name || 'Unknown lead'}</div>
                        <div className="small text-muted">{item.description}</div>
                        <div className="small mt-1" style={{ color: 'var(--color-primary-light)' }}>
                          <strong>Action:</strong> {item.recommended_action}
                        </div>
                        <div className="d-flex align-items-center gap-2 mt-1">
                          <span className="text-muted" style={{ fontSize: '0.7rem' }}>Score: {item.priority_score}</span>
                          <span className="text-muted" style={{ fontSize: '0.7rem' }}>Lead: {item.lead_score}</span>
                          {item.conversion_signals.length > 0 && (
                            <span className="text-success" style={{ fontSize: '0.7rem' }}>
                              {item.conversion_signals.length} signal{item.conversion_signals.length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ══════ Response Queue Table ══════ */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white">
          <div className="d-flex justify-content-between align-items-center">
            <div className="d-flex gap-0">
              <button
                className={`btn btn-sm ${responseView === 'automated' ? 'btn-primary' : 'btn-outline-secondary'} rounded-end-0`}
                onClick={() => { setResponseView('automated'); setResponsePage(1); }}
              >
                <i className="bi bi-robot me-1" />Automated
                <span className="badge bg-light text-dark ms-1" style={{ fontSize: '0.6rem' }}>
                  {automatedTotal}
                </span>
              </button>
              <button
                className={`btn btn-sm ${responseView === 'manual' ? 'btn-warning' : 'btn-outline-secondary'} rounded-start-0`}
                onClick={() => { setResponseView('manual'); setResponsePage(1); }}
              >
                <i className="bi bi-person me-1" />Manual Action
                <span className="badge bg-light text-dark ms-1" style={{ fontSize: '0.6rem' }}>
                  {manualTotal}
                </span>
              </button>
            </div>
            <select
              className="form-select form-select-sm"
              style={{ width: 'auto', fontSize: '0.75rem' }}
              value={responseFilter}
              onChange={(e) => { setResponseFilter(e.target.value); setResponsePage(1); }}
            >
              <option value="">All Statuses</option>
              <option value="needs_action">Needs Action</option>
              {responseView === 'automated' ? (
                <>
                  <option value="draft">Pending Review</option>
                  <option value="approved">Approved (Queued)</option>
                  <option value="ready_to_post">Ready to Post</option>
                  <option value="posted">Posted</option>
                  <option value="rejected">Rejected</option>
                </>
              ) : (
                <>
                  <option value="draft">Draft</option>
                  <option value="ready_to_post">Ready to Post</option>
                  <option value="ready_for_manual_post">Ready to Post (Manual)</option>
                  <option value="posted">Posted</option>
                </>
              )}
            </select>
          </div>
          <div className="text-muted mt-1" style={{ fontSize: '0.68rem' }}>
            {responseView === 'automated'
              ? 'Medium, Dev.to, Hashnode - fully autonomous. Quality gate reviews, approves, and posts automatically.'
              : 'LinkedIn, Reddit, Quora, HackerNews - copy the response and post manually.'}
          </div>
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover mb-0 small">
              <thead className="table-light">
                <tr>
                  <th>Platform</th>
                  <th>Type</th>
                  <th>Signal</th>
                  <th>Tone</th>
                  <th>Content</th>
                  <th>Eng.</th>
                  <th>Status</th>
                  <th>Time</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {responses.map((resp) => (
                  <tr
                    key={resp.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedResponse(resp)}
                  >
                    <td>
                      <span
                        className="badge"
                        style={{ backgroundColor: PLATFORM_COLORS[resp.platform] || '#718096', fontSize: '0.65rem' }}
                      >
                        {resp.platform}
                      </span>
                    </td>
                    <td>
                      <span className={`badge bg-${resp.execution_type === 'human_execution' ? 'warning' : 'info'}`} style={{ fontSize: '0.55rem' }}>
                        {resp.execution_type === 'human_execution' ? 'Manual' : 'Auto'}
                      </span>
                    </td>
                    <td>
                      {resp.signal?.title ? (
                        <span
                          className="text-truncate d-inline-block"
                          style={{ maxWidth: 200, fontSize: '0.75rem', color: 'var(--color-primary-light)' }}
                          title={resp.signal.title}
                        >
                          {resp.signal.title}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td><span className="badge bg-secondary" style={{ fontSize: '0.6rem' }}>{resp.tone}</span></td>
                    <td>
                      <span
                        className="text-truncate d-inline-block text-muted"
                        style={{ maxWidth: 250, fontSize: '0.7rem' }}
                        title={resp.content}
                      >
                        {resp.content}
                      </span>
                    </td>
                    <td>
                      {(() => {
                        const score = resp.engagement_metrics?.engagement_score || 0;
                        const variant = score > 5 ? 'success' : score > 0 ? 'warning' : 'secondary';
                        return <span className={`badge bg-${variant}`} style={{ fontSize: '0.6rem' }}>{score}</span>;
                      })()}
                    </td>
                    <td>
                      <span className={`badge bg-${STATUS_BADGES[resp.post_status] || 'secondary'}`}>
                        {resp.post_status === 'ready_to_post' ? 'Ready' : resp.post_status === 'ready_for_manual_post' ? 'Manual' : resp.post_status}
                      </span>
                    </td>
                    <td className="text-muted text-nowrap">{timeAgo(resp.created_at)}</td>
                    <td>
                      {resp.post_status === 'draft' && (
                        <div className="d-flex gap-1">
                          <button
                            className="btn btn-sm btn-outline-success py-0 px-2"
                            onClick={(e) => { e.stopPropagation(); handleApprove(resp.id); }}
                          >
                            Approve
                          </button>
                          <button
                            className="btn btn-sm btn-outline-danger py-0 px-2"
                            onClick={(e) => { e.stopPropagation(); handleReject(resp.id); }}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                      {resp.post_status === 'approved' && ['medium', 'devto'].includes(resp.platform) && (
                        <button
                          className="btn btn-sm btn-outline-primary py-0 px-2"
                          style={{ fontSize: '0.65rem' }}
                          disabled={browserPostingId === resp.id}
                          onClick={(e) => { e.stopPropagation(); handleBrowserPost(resp.id); }}
                        >
                          {browserPostingId === resp.id ? <span className="spinner-border spinner-border-sm" style={{ width: '0.7rem', height: '0.7rem' }} /> : 'Post via Browser'}
                        </button>
                      )}
                      {(resp.post_status === 'ready_to_post' || resp.post_status === 'ready_for_manual_post') && (
                        <button
                          className="btn btn-sm btn-outline-primary py-0 px-2"
                          style={{ fontSize: '0.65rem' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(resp.content);
                            if (resp.signal?.source_url) window.open(resp.signal.source_url, '_blank');
                            setCopiedId(resp.id);
                            setTimeout(() => setCopiedId(null), 2000);
                          }}
                        >
                          {copiedId === resp.id ? 'Copied!' : 'Copy & Open'}
                        </button>
                      )}
                      {resp.post_url && (
                        <a href={resp.post_url} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-primary py-0 px-2" onClick={(e) => e.stopPropagation()}>
                          View
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
                {responses.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-muted text-center py-4">
                      {responseView === 'manual'
                        ? 'No manual responses pending - all caught up!'
                        : 'No automated responses yet - signals will appear once the Market Signal agent runs'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          {responsesTotal > RESPONSES_PER_PAGE && (
            <div className="card-footer bg-white d-flex justify-content-between align-items-center py-2">
              <span className="text-muted small">
                Showing {(responsePage - 1) * RESPONSES_PER_PAGE + 1}–{Math.min(responsePage * RESPONSES_PER_PAGE, responsesTotal)} of {responsesTotal}
              </span>
              <div className="d-flex gap-1">
                <button
                  className="btn btn-sm btn-outline-secondary py-0 px-2"
                  disabled={responsePage <= 1}
                  onClick={() => setResponsePage(p => p - 1)}
                >
                  Prev
                </button>
                {Array.from({ length: Math.min(Math.ceil(responsesTotal / RESPONSES_PER_PAGE), 5) }, (_, i) => {
                  const totalPages = Math.ceil(responsesTotal / RESPONSES_PER_PAGE);
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (responsePage <= 3) {
                    pageNum = i + 1;
                  } else if (responsePage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = responsePage - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      className={`btn btn-sm py-0 px-2 ${pageNum === responsePage ? 'btn-primary' : 'btn-outline-secondary'}`}
                      onClick={() => setResponsePage(pageNum)}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  className="btn btn-sm btn-outline-secondary py-0 px-2"
                  disabled={responsePage >= Math.ceil(responsesTotal / RESPONSES_PER_PAGE)}
                  onClick={() => setResponsePage(p => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══════ Conversation Replies (ResponseQueueSection) ══════ */}
      <ResponseQueueSection />

      {/* ══════ LinkedIn Command Center ══════ */}
      <LinkedInCommandCenter />

      {/* ══════ Response Detail Modal ══════ */}
      <ResponseDetailModal
        response={selectedResponse}
        onClose={() => setSelectedResponse(null)}
        onApprove={handleApprove}
        onReject={handleReject}
        onCopy={handleCopy}
        copiedId={copiedId}
        onMarkPosted={handleMarkPosted}
        markPostedUrl={markPostedUrl}
        onMarkPostedUrlChange={setMarkPostedUrl}
        onBrowserPost={handleBrowserPost}
        browserPostingId={browserPostingId}
      />
    </div>
  );
}

// ── Inline Sub-Components ─────────────────────────────────────────────────────

function ResponseQueueSection() {
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<ResponseQueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getResponseQueue();
      setItems(res.data.responses || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { if (expanded) load(); }, [expanded, load]);

  const handleApprove = async (id: string) => { await approveResponse(id); load(); };
  const handleReject = async (id: string) => { await rejectResponse(id); load(); };
  const handleMarkPosted = async (id: string) => { await markResponsePosted(id); load(); };

  const isExpired = (item: ResponseQueueItem) => item.expires_at && new Date(item.expires_at) < new Date();

  return (
    <div className="card border-0 shadow-sm mb-3">
      <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center" style={{ cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
        <span><i className="bi bi-reply me-2" />Conversation Replies</span>
        <i className={`bi bi-chevron-${expanded ? 'up' : 'down'}`} />
      </div>
      {expanded && (
        <div className="card-body p-3">
          {loading ? (
            <div className="text-center py-3"><span className="spinner-border spinner-border-sm text-primary" /></div>
          ) : items.length === 0 ? (
            <p className="text-muted small mb-0">No conversation replies in queue</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ fontSize: '0.8rem' }}>
                <thead className="table-light">
                  <tr>
                    <th>Engagement</th>
                    <th>Type</th>
                    <th>Priority</th>
                    <th>Urgency</th>
                    <th>Response Preview</th>
                    <th>Status</th>
                    <th>Expires</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => {
                    const expired = isExpired(item);
                    return (
                      <tr key={item.id} style={expired ? { textDecoration: 'line-through', opacity: 0.6 } : undefined}>
                        <td>
                          <div className="fw-medium">{item.engagement?.user_name || '—'}</div>
                          <span className="badge" style={{ backgroundColor: PLATFORM_COLORS[item.platform] || '#6c757d', fontSize: '0.6rem' }}>{item.platform}</span>
                        </td>
                        <td><span className={`badge bg-${item.response_type === 'follow_up' ? 'info' : 'primary'}`} style={{ fontSize: '0.65rem' }}>{item.response_type}</span></td>
                        <td>{item.details?.priority_score != null ? <span className={`badge bg-${item.details.priority_score >= 70 ? 'danger' : item.details.priority_score >= 40 ? 'warning' : 'secondary'}`} style={{ fontSize: '0.65rem' }}>{Math.round(item.details.priority_score)}</span> : '—'}</td>
                        <td>{item.details?.urgency_level ? <span className={`badge bg-${item.details.urgency_level === 'critical' ? 'danger' : item.details.urgency_level === 'high' ? 'warning' : item.details.urgency_level === 'medium' ? 'info' : 'secondary'}`} style={{ fontSize: '0.65rem' }}>{item.details.urgency_level}</span> : '—'}</td>
                        <td style={{ maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.response_text.slice(0, 120)}</td>
                        <td><span className={`badge bg-${STATUS_BADGES[item.status] || 'secondary'}`} style={{ fontSize: '0.65rem' }}>{item.status}</span></td>
                        <td className="text-nowrap text-muted" style={{ fontSize: '0.7rem' }}>{item.expires_at ? timeAgo(item.expires_at) : '—'}</td>
                        <td>
                          <div className="d-flex gap-1">
                            <button className="btn btn-outline-secondary btn-sm py-0 px-1" style={{ fontSize: '0.65rem' }} onClick={() => { navigator.clipboard.writeText(item.response_text); setCopiedId(item.id); setTimeout(() => setCopiedId(null), 2000); }}>
                              <i className={`bi ${copiedId === item.id ? 'bi-check' : 'bi-clipboard'}`} />
                            </button>
                            {item.status === 'draft' && !expired && (
                              <>
                                <button className="btn btn-outline-success btn-sm py-0 px-1" style={{ fontSize: '0.65rem' }} onClick={() => handleApprove(item.id)}>
                                  <i className="bi bi-check-circle" />
                                </button>
                                <button className="btn btn-outline-danger btn-sm py-0 px-1" style={{ fontSize: '0.65rem' }} onClick={() => handleReject(item.id)}>
                                  <i className="bi bi-x-circle" />
                                </button>
                              </>
                            )}
                            {item.status === 'approved' && (
                              <button className="btn btn-outline-primary btn-sm py-0 px-1" style={{ fontSize: '0.65rem' }} onClick={() => handleMarkPosted(item.id)}>
                                Posted
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LinkedInCommandCenter() {
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<LinkedInActionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getLinkedInActions({ status: 'pending' });
      setItems(res.data.actions || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { if (expanded) load(); }, [expanded, load]);

  const handleComplete = async (id: string) => { await completeLinkedInAction(id); load(); };
  const handleSkip = async (id: string) => { await skipLinkedInAction(id); load(); };

  const ACTION_ICONS: Record<string, string> = {
    comment: 'bi-chat-left-text',
    connection_request: 'bi-person-plus',
    dm_followup: 'bi-envelope',
    post_engagement: 'bi-hand-thumbs-up',
  };

  const ACTION_COLORS: Record<string, string> = {
    comment: 'primary',
    connection_request: 'success',
    dm_followup: 'info',
    post_engagement: 'warning',
  };

  return (
    <div className="card border-0 shadow-sm mb-3">
      <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center" style={{ cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
        <span>
          <i className="bi bi-linkedin me-2" style={{ color: '#0A66C2' }} />
          LinkedIn Command Center
          <span className="badge bg-warning text-dark ms-2" style={{ fontSize: '0.6rem' }}>Manual Only</span>
        </span>
        <i className={`bi bi-chevron-${expanded ? 'up' : 'down'}`} />
      </div>
      {expanded && (
        <div className="card-body p-3">
          {/* Summary strip */}
          {items.length > 0 && (
            <div className="d-flex gap-2 mb-3 flex-wrap">
              {Object.entries(
                items.reduce<Record<string, number>>((acc, i) => { acc[i.action_type] = (acc[i.action_type] || 0) + 1; return acc; }, {})
              ).map(([type, count]) => (
                <span key={type} className={`badge bg-${ACTION_COLORS[type] || 'secondary'}`} style={{ fontSize: '0.7rem' }}>
                  {type.replace(/_/g, ' ')}: {count}
                </span>
              ))}
            </div>
          )}

          {loading ? (
            <div className="text-center py-3"><span className="spinner-border spinner-border-sm text-primary" /></div>
          ) : items.length === 0 ? (
            <p className="text-muted small mb-0">No pending LinkedIn actions</p>
          ) : (
            <div className="row g-2">
              {items.map(item => (
                <div key={item.id} className="col-12 col-md-6">
                  <div className="card border h-100">
                    <div className="card-body p-2">
                      <div className="d-flex justify-content-between align-items-start mb-1">
                        <span className={`badge bg-${ACTION_COLORS[item.action_type] || 'secondary'}`} style={{ fontSize: '0.65rem' }}>
                          <i className={`bi ${ACTION_ICONS[item.action_type] || 'bi-lightning'} me-1`} />
                          {item.action_type.replace(/_/g, ' ')}
                        </span>
                        <span className="text-muted" style={{ fontSize: '0.6rem' }}>P{item.priority}</span>
                      </div>
                      {item.target_user_name && (
                        <div className="fw-medium small">{item.target_user_name}</div>
                      )}
                      {item.target_user_title && (
                        <div className="text-muted" style={{ fontSize: '0.65rem' }}>{item.target_user_title}</div>
                      )}
                      <div className="mt-1 p-2 bg-light rounded small" style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem', maxHeight: '120px', overflowY: 'auto' }}>
                        {item.suggested_text}
                      </div>
                      {item.context && (
                        <div className="text-muted mt-1" style={{ fontSize: '0.6rem' }}>{item.context}</div>
                      )}
                      <div className="d-flex gap-1 mt-2">
                        <button className="btn btn-outline-secondary btn-sm py-0 px-2" style={{ fontSize: '0.65rem' }} onClick={() => { navigator.clipboard.writeText(item.suggested_text); setCopiedId(item.id); setTimeout(() => setCopiedId(null), 2000); }}>
                          <i className={`bi ${copiedId === item.id ? 'bi-check' : 'bi-clipboard'} me-1`} />{copiedId === item.id ? 'Copied' : 'Copy'}
                        </button>
                        <button className="btn btn-outline-success btn-sm py-0 px-2" style={{ fontSize: '0.65rem' }} onClick={() => handleComplete(item.id)}>
                          <i className="bi bi-check-circle me-1" />Done
                        </button>
                        <button className="btn btn-outline-secondary btn-sm py-0 px-2" style={{ fontSize: '0.65rem' }} onClick={() => handleSkip(item.id)}>
                          Skip
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
