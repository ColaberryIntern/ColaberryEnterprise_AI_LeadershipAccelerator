import React, { useRef, useEffect } from 'react';

interface EmailPreviewProps {
  from?: string;
  to?: string;
  subject?: string;
  body?: string;
  date?: string;
  messageId?: string;
}

function parseFromField(from?: string): { name: string; email: string } {
  if (!from) return { name: 'Unknown', email: '' };
  const match = from.match(/^"?(.+?)"?\s*<(.+?)>$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  if (from.includes('@')) return { name: from.split('@')[0], email: from };
  return { name: from, email: '' };
}

function getInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function EmailPreview({ from, to, subject, body, date, messageId }: EmailPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sender = parseFromField(from);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !body) return;

    const resizeIframe = () => {
      try {
        const doc = iframe.contentDocument;
        if (doc?.body) {
          iframe.style.height = Math.min(doc.body.scrollHeight + 16, 400) + 'px';
        }
      } catch {
        // cross-origin safety
      }
    };

    iframe.onload = resizeIframe;
    // Also try after a short delay for slow renders
    const timer = setTimeout(resizeIframe, 200);
    return () => clearTimeout(timer);
  }, [body]);

  const srcdoc = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #2d3748; line-height: 1.6; margin: 12px 16px; padding: 0; }
  a { color: #2b6cb0; }
  h1, h2, h3 { color: #1a365d; }
  img { max-width: 100%; height: auto; }
</style></head><body>${body || ''}</body></html>`;

  return (
    <div className="border rounded" style={{ backgroundColor: '#fff', overflow: 'hidden' }}>
      {/* Email Header */}
      <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--color-border, #e2e8f0)' }}>
        <div className="d-flex align-items-start gap-2">
          {/* Avatar */}
          <div
            className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
            style={{
              width: 36, height: 36,
              backgroundColor: '#1a365d', color: '#fff',
              fontSize: '0.75rem', fontWeight: 600,
              marginTop: 2,
            }}
          >
            {getInitials(sender.name)}
          </div>
          <div className="flex-grow-1 min-width-0">
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <span className="fw-semibold small">{sender.name}</span>
                {sender.email && (
                  <span className="text-muted small ms-1">&lt;{sender.email}&gt;</span>
                )}
              </div>
              <span className="text-muted small text-nowrap ms-2">{formatDate(date)}</span>
            </div>
            {to && (
              <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                To: {to}
              </div>
            )}
            {subject && (
              <div className="fw-medium small mt-1" style={{ color: 'var(--color-text, #2d3748)' }}>
                {subject}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Email Body */}
      {body ? (
        <iframe
          ref={iframeRef}
          srcDoc={srcdoc}
          sandbox="allow-same-origin"
          title="Email preview"
          style={{
            width: '100%',
            height: 200,
            border: 'none',
            display: 'block',
          }}
        />
      ) : (
        <div className="p-3 text-muted small fst-italic">No email body</div>
      )}

      {/* Footer */}
      {messageId && (
        <div className="px-3 py-1 text-muted" style={{ fontSize: '0.65rem', borderTop: '1px solid var(--color-border, #e2e8f0)' }}>
          ID: {messageId}
        </div>
      )}
    </div>
  );
}
