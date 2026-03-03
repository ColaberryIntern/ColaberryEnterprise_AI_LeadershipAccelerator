import React from 'react';
import Modal from '../ui/Modal';

interface ActionEntry {
  type: string;
  timestamp: string;
  channel?: string;
  subject?: string;
  status?: string;
  step_index?: number;
  body?: string | null;
  to_email?: string | null;
  to_phone?: string | null;
  scheduled_for?: string | null;
  ai_generated?: boolean;
  metadata?: Record<string, any> | null;
}

interface Props {
  action: ActionEntry;
  totalSteps?: number;
  onClose: () => void;
}

export default function ActionDetailModal({ action, totalSteps, onClose }: Props) {
  const fmtDateTime = (d: string | null | undefined) => {
    if (!d) return '—';
    return new Date(d).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  };

  const relTime = (d: string | null | undefined) => {
    if (!d) return null;
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  const isEmail = action.channel === 'email';
  const isSms = action.channel === 'sms';

  return (
    <Modal
      show={true}
      onClose={onClose}
      title={action.subject || 'Action Detail'}
      size="lg"
      footer={<button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>}
    >
      {/* Delivery Info */}
      <div className="d-flex flex-wrap gap-3 mb-3 pb-3 border-bottom">
        <div>
          <span className="text-muted small d-block">Channel</span>
          <span className={`badge bg-${isEmail ? 'info' : isSms ? 'warning' : 'secondary'}`}>
            {action.channel}
          </span>
        </div>
        <div>
          <span className="text-muted small d-block">Delivery</span>
          <span className={`badge bg-${action.status === 'sent' ? 'success' : action.status === 'failed' ? 'danger' : 'secondary'}`}>
            {action.status === 'sent' ? 'Delivered' : action.status}
          </span>
        </div>
        {action.ai_generated && (
          <div>
            <span className="text-muted small d-block">Source</span>
            <span className="badge bg-primary bg-opacity-10 text-primary">AI Generated</span>
          </div>
        )}
        {action.step_index !== undefined && (
          <div>
            <span className="text-muted small d-block">Step</span>
            <span className="small fw-medium">
              {action.step_index + 1}{totalSteps ? ` of ${totalSteps}` : ''}
            </span>
          </div>
        )}
        {(action.to_email || action.to_phone) && (
          <div>
            <span className="text-muted small d-block">To</span>
            <span className="small fw-medium">{action.to_email || action.to_phone}</span>
          </div>
        )}
        <div>
          <span className="text-muted small d-block">Sent</span>
          <span className="small fw-medium">
            {fmtDateTime(action.timestamp)}
            {relTime(action.timestamp) && (
              <span className="text-muted ms-1">({relTime(action.timestamp)})</span>
            )}
          </span>
        </div>
        {action.scheduled_for && action.scheduled_for !== action.timestamp && (
          <div>
            <span className="text-muted small d-block">Scheduled For</span>
            <span className="small fw-medium">{fmtDateTime(action.scheduled_for)}</span>
          </div>
        )}
      </div>

      {/* Body Content */}
      {action.body ? (
        isEmail ? (
          <div
            className="border rounded bg-white"
            style={{ maxHeight: 450, overflowY: 'auto' }}
            dangerouslySetInnerHTML={{ __html: action.body }}
          />
        ) : (
          <div className="border rounded p-3 bg-light">
            <pre className="mb-0 small" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
              {action.body}
            </pre>
          </div>
        )
      ) : (
        <div className="text-center py-4 text-muted small">
          <i className="bi bi-envelope-x fs-3 d-block mb-2" />
          Email content was not captured for this action.
        </div>
      )}
    </Modal>
  );
}
