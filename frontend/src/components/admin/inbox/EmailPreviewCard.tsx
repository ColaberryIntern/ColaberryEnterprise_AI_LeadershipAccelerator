import React from 'react';
import ClassificationBadge from './ClassificationBadge';

interface EmailData {
  from_name: string;
  from_address: string;
  subject: string;
  body_text: string;
  received_at: string;
  provider: string;
  has_attachments: boolean;
}

interface ClassificationData {
  state: 'INBOX' | 'AUTOMATION' | 'SILENT_HOLD' | 'ASK_USER';
  confidence: number;
  reasoning: string;
  classified_by: string;
}

interface EmailPreviewCardProps {
  email: EmailData;
  classification?: ClassificationData;
  compact?: boolean;
}

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export default function EmailPreviewCard({ email, classification, compact }: EmailPreviewCardProps) {
  if (compact) {
    return (
      <div className="d-flex align-items-center gap-2 small">
        <strong className="text-truncate" style={{ maxWidth: 160 }}>{email.from_name}</strong>
        <span className="text-muted text-truncate flex-grow-1">{email.subject}</span>
        <span className="text-muted">{formatRelativeTime(email.received_at)}</span>
        {classification && <ClassificationBadge state={classification.state} />}
      </div>
    );
  }

  const confidencePct = classification ? Math.round(classification.confidence * 100) : 0;

  return (
    <div className="card border-0 shadow-sm">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-start mb-2">
          <div>
            <div className="fw-semibold">{email.from_name} <span className="text-muted small">&lt;{email.from_address}&gt;</span></div>
            <div className="fw-medium">{email.subject}</div>
          </div>
          <div className="d-flex align-items-center gap-2">
            <span className="badge bg-secondary">{email.provider}</span>
            {email.has_attachments && (
              <span className="text-muted" title="Has attachments">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M4.5 3a2.5 2.5 0 0 1 5 0v9a1.5 1.5 0 0 1-3 0V5a.5.5 0 0 1 1 0v7a.5.5 0 0 0 1 0V3a1.5 1.5 0 1 0-3 0v9a2.5 2.5 0 0 0 5 0V5a.5.5 0 0 1 1 0v7a3.5 3.5 0 1 1-7 0V3z"/>
                </svg>
              </span>
            )}
            <span className="text-muted small">{formatRelativeTime(email.received_at)}</span>
          </div>
        </div>

        <p className="text-muted small mb-3" style={{ whiteSpace: 'pre-wrap' }}>
          {email.body_text.length > 300 ? email.body_text.slice(0, 300) + '...' : email.body_text}
        </p>

        {classification && (
          <div className="border-top pt-2">
            <div className="d-flex align-items-center gap-3 mb-1">
              <ClassificationBadge state={classification.state} />
              <div className="flex-grow-1">
                <div className="progress" style={{ height: 6 }}>
                  <div
                    className={`progress-bar ${confidencePct >= 80 ? 'bg-success' : confidencePct >= 50 ? 'bg-warning' : 'bg-danger'}`}
                    role="progressbar"
                    style={{ width: `${confidencePct}%` }}
                    aria-valuenow={confidencePct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  />
                </div>
              </div>
              <span className="small fw-medium">{confidencePct}%</span>
              <span className="small text-muted">by {classification.classified_by}</span>
            </div>
            <p className="small text-muted mb-0">{classification.reasoning}</p>
          </div>
        )}
      </div>
    </div>
  );
}
