/**
 * PromptPreviewModal — shows the compiled Claude Code prompt with copy +
 * "open in Build Center" actions. Designed to feel snappy and final.
 */
import React, { useState } from 'react';

interface Props {
  open: boolean;
  prompt: string;
  source: 'backend' | 'local';
  onClose: () => void;
  onOpenBuildCenter: () => void;
}

const PromptPreviewModal: React.FC<Props> = ({ open, prompt, source, onClose, onOpenBuildCenter }) => {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard API unavailable; user can manually select */
    }
  };

  return (
    <div className="vw-modal-backdrop" onClick={onClose}>
      <div className="vw-modal vw-modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="vw-modal-header">
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-light)' }}>
              compiled prompt
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-primary)' }}>
              Ready to paste into Claude Code
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: source === 'backend' ? 'var(--color-success)' : 'var(--color-info)',
              background: source === 'backend' ? 'var(--color-success-bg)' : 'var(--color-info-bg)',
              padding: '0.15rem 0.5rem',
              borderRadius: 3,
              fontWeight: 600,
            }}>
              {source === 'backend' ? 'backend compiled' : 'local fallback'}
            </span>
            <button type="button" className="btn btn-sm btn-link text-decoration-none" onClick={onClose} aria-label="Close">×</button>
          </div>
        </div>

        <div className="vw-modal-body" style={{ padding: 0 }}>
          <pre style={{
            margin: 0,
            padding: '1rem 1.25rem',
            background: '#0f172a',
            color: '#e2e8f0',
            fontSize: 12,
            lineHeight: 1.55,
            fontFamily: 'var(--font-mono)',
            maxHeight: '60vh',
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>{prompt}</pre>
        </div>

        <div className="vw-modal-footer">
          <button type="button" className="btn btn-sm btn-light" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            onClick={() => window.open(`data:text/plain;charset=utf-8,${encodeURIComponent(prompt)}`, '_blank')}
          >
            <i className="bi bi-box-arrow-up-right me-1"></i>Open in new tab
          </button>
          <button
            type="button"
            className={`btn btn-sm ${copied ? 'btn-success' : 'btn-outline-primary'}`}
            onClick={handleCopy}
          >
            <i className={`bi ${copied ? 'bi-check2' : 'bi-clipboard'} me-1`}></i>
            {copied ? 'Copied' : 'Copy prompt'}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={onOpenBuildCenter}
          >
            <i className="bi bi-rocket me-1"></i>Send to Blueprint
          </button>
        </div>
      </div>
    </div>
  );
};

export default PromptPreviewModal;
