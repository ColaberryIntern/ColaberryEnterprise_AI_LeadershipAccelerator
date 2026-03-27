import type { OpenclawResponseItem } from '../../../../../services/openclawApi';
import { PLATFORM_COLORS, STATUS_BADGES, PLATFORM_STRATEGY, STRATEGY_BADGES, timeAgo } from './openclawUtils';

interface ResponseDetailModalProps {
  response: OpenclawResponseItem | null;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onCopy: (text: string, id: string) => void;
  copiedId: string | null;
  onMarkPosted: (id: string) => void;
  markPostedUrl: string;
  onMarkPostedUrlChange: (url: string) => void;
  onBrowserPost: (id: string) => void;
  browserPostingId: string | null;
}

export default function ResponseDetailModal({
  response,
  onClose,
  onApprove,
  onReject,
  onCopy,
  copiedId,
  onMarkPosted,
  markPostedUrl,
  onMarkPostedUrlChange,
  onBrowserPost,
  browserPostingId,
}: ResponseDetailModalProps) {
  if (!response) return null;

  return (
    <>
      <div className="modal-backdrop show" style={{ opacity: 0.5 }} onClick={onClose} />
      <div className="modal show d-block" role="dialog" aria-modal="true" onClick={onClose}>
        <div className="modal-dialog modal-lg modal-dialog-scrollable" style={{ maxWidth: 800 }} onClick={(e) => e.stopPropagation()}>
          <div className="modal-content">
            <div className="modal-header py-2">
              <h6 className="modal-title fw-semibold mb-0 d-flex align-items-center gap-2">
                <span className="badge" style={{ backgroundColor: PLATFORM_COLORS[response.platform] || '#718096', fontSize: '0.7rem' }}>
                  {response.platform}
                </span>
                <span className={`badge bg-${STATUS_BADGES[response.post_status] || 'secondary'}`} style={{ fontSize: '0.7rem' }}>
                  {response.post_status === 'ready_to_post' ? 'Ready to Post' : response.post_status === 'ready_for_manual_post' ? 'Manual Queue' : response.post_status}
                </span>
                {response.execution_type && (
                  <span className={`badge bg-${response.execution_type === 'human_execution' ? 'warning' : 'info'}`} style={{ fontSize: '0.65rem' }}>
                    {response.execution_type === 'human_execution' ? 'Manual Execution' : 'Auto Execution'}
                  </span>
                )}
                <span className="badge bg-secondary" style={{ fontSize: '0.65rem' }}>{response.tone}</span>
              </h6>
              <button type="button" className="btn-close btn-close-sm" onClick={onClose} aria-label="Close" />
            </div>
            <div className="modal-body p-3">
              {/* Signal / Source Info */}
              {response.signal && (
                <div className="card border-0 bg-light mb-3">
                  <div className="card-body py-2 px-3">
                    <div className="fw-semibold small mb-1">Original Signal</div>
                    <div className="mb-1">
                      {(() => {
                        const sig = response.signal!;
                        const href = sig.source_url?.startsWith('http') ? sig.source_url
                          : sig.title?.startsWith('http') ? sig.title
                          : sig.details?.linkedin_profile || null;
                        const label = sig.title?.startsWith('http')
                          ? (sig.title.length > 80 ? sig.title.slice(0, 80) + '...' : sig.title)
                          : sig.title || sig.source_url;
                        return href ? (
                          <a href={href} target="_blank" rel="noopener noreferrer" className="small fw-medium" style={{ color: 'var(--color-primary-light)' }}>
                            {label}
                            <span className="ms-1" style={{ fontSize: '0.65rem' }}>&#8599;</span>
                          </a>
                        ) : (
                          <span className="small fw-medium">{label}</span>
                        );
                      })()}
                    </div>
                    {response.signal.author && (
                      <div style={{ fontSize: '0.72rem' }} className="text-muted mb-1">
                        Author: <strong>{response.signal.author}</strong>
                      </div>
                    )}
                    {response.signal.content_excerpt && (
                      <div className="mt-1">
                        <div className="text-muted" style={{ fontSize: '0.68rem', fontStyle: 'italic' }}>
                          "{response.signal.content_excerpt.slice(0, 300)}{response.signal.content_excerpt.length > 300 ? '...' : ''}"
                        </div>
                      </div>
                    )}
                    <div className="d-flex gap-3 mt-2" style={{ fontSize: '0.68rem' }}>
                      {response.signal.relevance_score != null && (
                        <span>Relevance: <strong>{(response.signal.relevance_score * 100).toFixed(0)}%</strong></span>
                      )}
                      {response.signal.engagement_score != null && (
                        <span>Engagement: <strong>{(response.signal.engagement_score * 100).toFixed(0)}%</strong></span>
                      )}
                    </div>
                    {response.signal.details && Object.keys(response.signal.details).length > 0 && (
                      <details className="mt-2">
                        <summary className="text-muted" style={{ fontSize: '0.65rem', cursor: 'pointer' }}>Signal Details</summary>
                        <pre className="bg-white border rounded p-2 mt-1 mb-0" style={{ fontSize: '0.65rem', maxHeight: 120, overflow: 'auto' }}>
                          {JSON.stringify(response.signal.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              )}

              {/* Intelligence Fields */}
              {(response.reasoning || response.recommended_action || response.follow_up_suggestion) && (
                <div className="card border-0 bg-light mb-3">
                  <div className="card-body py-2 px-3">
                    <div className="fw-semibold small mb-1">Intelligence</div>
                    {response.recommended_action && (
                      <div className="mb-1" style={{ fontSize: '0.72rem' }}>
                        <strong>Action:</strong> {response.recommended_action}
                      </div>
                    )}
                    {response.reasoning && (
                      <div className="mb-1 text-muted" style={{ fontSize: '0.68rem' }}>
                        <strong>Reasoning:</strong> {response.reasoning}
                      </div>
                    )}
                    {response.follow_up_suggestion && (
                      <div className="text-muted" style={{ fontSize: '0.68rem' }}>
                        <strong>Follow-up:</strong> {response.follow_up_suggestion}
                      </div>
                    )}
                    <div className="d-flex gap-3 mt-2" style={{ fontSize: '0.68rem' }}>
                      {response.intent_level && (
                        <span>Intent: <span className={`badge bg-${response.intent_level === 'high' ? 'danger' : response.intent_level === 'medium' ? 'warning' : 'secondary'}`} style={{ fontSize: '0.6rem' }}>{response.intent_level}</span></span>
                      )}
                      {response.priority_score != null && (
                        <span>Priority: <strong>{response.priority_score}</strong></span>
                      )}
                      {response.lead && (
                        <span>Lead: <strong>{response.lead.name}</strong> ({response.lead.pipeline_stage || 'new'})</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Response Content */}
              <div className="mb-3">
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <span className="fw-semibold small">Response Content ({response.content.length} chars)</span>
                  <button
                    className={`btn btn-sm py-0 px-2 ${copiedId === response.id ? 'btn-success' : 'btn-outline-secondary'}`}
                    onClick={() => onCopy(response.content, response.id)}
                  >
                    {copiedId === response.id ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <pre className="bg-light border rounded p-2 mb-0" style={{ fontSize: '0.75rem', whiteSpace: 'pre-wrap', maxHeight: 250, overflow: 'auto' }}>
                  {response.content}
                </pre>
                {/* Post to LinkedIn button */}
                {response.platform === 'linkedin' && response.post_status !== 'posted' && (
                  <div className="mt-2 d-flex align-items-center gap-2">
                    <button
                      className="btn btn-sm text-white fw-medium"
                      style={{ backgroundColor: '#0A66C2' }}
                      onClick={async () => {
                        await navigator.clipboard.writeText(response.content);
                        onCopy(response.content, response.id);
                        window.open('https://www.linkedin.com/feed/?shareActive=true', '_blank');
                      }}
                    >
                      <i className="bi bi-linkedin me-1" />
                      {copiedId === response.id ? 'Copied! Paste in LinkedIn' : 'Copy & Open LinkedIn'}
                    </button>
                    <span className="text-muted" style={{ fontSize: '0.65rem' }}>Copies post to clipboard, then opens LinkedIn — just Ctrl+V and Post</span>
                  </div>
                )}
              </div>

              {/* Tracking Info */}
              {response.tracked_url && (
                <div className="card border-0 bg-light mb-3">
                  <div className="card-body py-2 px-3">
                    <div className="fw-semibold small mb-1">Tracking</div>
                    <div className="d-flex align-items-center gap-2 mb-1">
                      <span className="text-muted small">Tracked URL:</span>
                      <code className="small">{response.tracked_url}</code>
                      <button
                        className={`btn btn-sm py-0 px-1 ${copiedId === `url-${response.id}` ? 'btn-success' : 'btn-outline-secondary'}`}
                        style={{ fontSize: '0.65rem' }}
                        onClick={() => onCopy(response.tracked_url!, `url-${response.id}`)}
                      >
                        {copiedId === `url-${response.id}` ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    {response.short_id && (
                      <div style={{ fontSize: '0.68rem' }} className="text-muted">Tag: <code>{response.short_id}</code></div>
                    )}
                  </div>
                </div>
              )}

              {/* Post Info */}
              {response.post_url && (
                <div className="mb-3">
                  <span className="fw-semibold small">Posted: </span>
                  <a href={response.post_url} target="_blank" rel="noopener noreferrer" className="small">
                    {response.post_url} <span style={{ fontSize: '0.65rem' }}>&#8599;</span>
                  </a>
                  {response.posted_at && (
                    <span className="text-muted ms-2" style={{ fontSize: '0.68rem' }}>{timeAgo(response.posted_at)}</span>
                  )}
                </div>
              )}

              {/* Engagement Metrics */}
              {response.engagement_metrics && Object.keys(response.engagement_metrics).length > 0 && (
                <div className="card border-0 bg-light mb-3">
                  <div className="card-body py-2 px-3">
                    <div className="fw-semibold small mb-1">Engagement Metrics</div>
                    <div className="d-flex gap-3 flex-wrap" style={{ fontSize: '0.72rem' }}>
                      {Object.entries(response.engagement_metrics).map(([key, val]) => (
                        <span key={key}>{key}: <strong>{String(val)}</strong></span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Metadata */}
              <div className="d-flex gap-4 text-muted" style={{ fontSize: '0.68rem' }}>
                <span>Created: {new Date(response.created_at).toLocaleString()}</span>
                <span>ID: <code style={{ fontSize: '0.6rem' }}>{response.id.slice(0, 8)}</code></span>
              </div>

              {/* Post via Browser (only after approval on browser-supported platforms) */}
              {response.post_status === 'approved' && ['medium', 'devto'].includes(response.platform) && (
                <div className="border-top mt-3 pt-3">
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={browserPostingId === response.id}
                    onClick={async () => {
                      onBrowserPost(response.id);
                      onClose();
                    }}
                  >
                    {browserPostingId === response.id
                      ? <><span className="spinner-border spinner-border-sm me-1" style={{ width: '0.7rem', height: '0.7rem' }} />Posting...</>
                      : <><i className="bi bi-globe me-1" />Post via Browser</>}
                  </button>
                  <div className="text-muted mt-1" style={{ fontSize: '0.7rem' }}>
                    Automates posting to {response.platform} using a browser session
                  </div>
                </div>
              )}

              {/* Mark as Posted (for approved/ready_to_post) */}
              {(response.post_status === 'approved' || response.post_status === 'ready_to_post' || response.post_status === 'ready_for_manual_post') && (
                <div className="border-top mt-3 pt-3">
                  <div className="fw-semibold small mb-2">Mark as Manually Posted</div>
                  <div className="d-flex align-items-center gap-2">
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="Paste the URL where you posted this..."
                      style={{ fontSize: '0.75rem' }}
                      value={markPostedUrl}
                      onChange={(e) => onMarkPostedUrlChange(e.target.value)}
                    />
                    <button
                      className="btn btn-sm btn-primary py-0 px-3 text-nowrap"
                      disabled={!markPostedUrl.trim()}
                      onClick={() => onMarkPosted(response.id)}
                    >
                      Mark Posted
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer py-2">
              {response.post_status === 'draft' && (
                <div className="me-auto d-flex gap-2">
                  <button className="btn btn-sm btn-outline-success" onClick={() => { onApprove(response.id); onClose(); }}>Approve</button>
                  <button className="btn btn-sm btn-outline-danger" onClick={() => { onReject(response.id); onClose(); }}>Reject</button>
                </div>
              )}
              <button className="btn btn-sm btn-outline-secondary" onClick={onClose}>Close</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
