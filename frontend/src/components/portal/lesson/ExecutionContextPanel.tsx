import React, { useState, useEffect } from 'react';
import { ExecutionContext } from '../../../services/executionContextBuilder';
import { LLMOption } from '../../../contexts/MentorContext';

interface ExecutionContextPanelProps {
  context: ExecutionContext | null;
  onOpenWorkspace: () => void;
  onDismiss: () => void;
  selectedLLM: LLMOption;
}

export default function ExecutionContextPanel({ context, onOpenWorkspace, onDismiss, selectedLLM }: ExecutionContextPanelProps) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (context) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [context]);

  if (!context) return null;

  const { summary } = context;

  const handleCopy = () => {
    navigator.clipboard.writeText(context.finalPrompt).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="card border-0 shadow-sm mb-4"
      style={{
        borderLeft: '4px solid #10b981',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 300ms ease, transform 300ms ease',
      }}
    >
      <div className="card-header bg-white border-bottom d-flex align-items-center justify-content-between" style={{ padding: '12px 16px' }}>
        <div className="d-flex align-items-center gap-2">
          <div className="d-flex align-items-center justify-content-center rounded" style={{ width: 26, height: 26, background: '#ecfdf5' }}>
            <i className="bi bi-lightning" style={{ color: '#10b981', fontSize: 13 }}></i>
          </div>
          <span className="fw-semibold" style={{ color: '#1e293b', fontSize: 13 }}>Your AI Execution Context is Ready</span>
        </div>
        <button
          className="btn btn-sm p-0"
          style={{ color: '#94a3b8', border: 'none', background: 'none', fontSize: 16 }}
          onClick={onDismiss}
          aria-label="Dismiss execution context panel"
        >
          <i className="bi bi-x-lg"></i>
        </button>
      </div>

      <div className="card-body" style={{ padding: '14px 16px' }}>
        <div className="row g-3">
          {/* Left column: learner context */}
          <div className="col-md-6">
            {summary.learnerContext.length > 0 && (
              <>
                <div className="small fw-semibold mb-2" style={{ color: '#64748b', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Your Context
                </div>
                <div className="d-flex flex-wrap gap-1">
                  {summary.learnerContext.slice(0, 6).map((line, i) => (
                    <span key={i} className="badge" style={{ background: '#f1f5f9', color: '#475569', fontSize: 10, fontWeight: 500 }}>
                      {line}
                    </span>
                  ))}
                  {summary.learnerContext.length > 6 && (
                    <span className="badge" style={{ background: '#f1f5f9', color: '#94a3b8', fontSize: 10 }}>
                      +{summary.learnerContext.length - 6} more
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Right column: lesson/task info */}
          <div className="col-md-6">
            <div className="small fw-semibold mb-2" style={{ color: '#64748b', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Included in Prompt
            </div>
            <div style={{ fontSize: 12, color: '#1e293b' }}>
              {summary.lessonTitle && (
                <div className="d-flex align-items-center gap-1 mb-1">
                  <i className="bi bi-book" style={{ color: '#6366f1', fontSize: 11 }}></i>
                  <span>{summary.lessonTitle}</span>
                </div>
              )}
              {summary.taskTitle && (
                <div className="d-flex align-items-center gap-1 mb-1">
                  <i className="bi bi-rocket" style={{ color: '#8b5cf6', fontSize: 11 }}></i>
                  <span>{summary.taskTitle}</span>
                </div>
              )}
              {summary.artifactNames.length > 0 && (
                <div className="d-flex align-items-center gap-1">
                  <i className="bi bi-file-earmark" style={{ color: '#f59e0b', fontSize: 11 }}></i>
                  <span>{summary.artifactNames.length} artifact{summary.artifactNames.length > 1 ? 's' : ''} referenced</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="card-footer bg-white border-top d-flex gap-2" style={{ padding: '10px 16px' }}>
        <button
          className="btn btn-sm d-flex align-items-center gap-2 px-3"
          style={{
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            color: '#fff', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none',
          }}
          onClick={onOpenWorkspace}
        >
          <i className={`bi ${selectedLLM.icon}`}></i>
          Open in {selectedLLM.name}
        </button>
        <button
          className="btn btn-sm d-flex align-items-center gap-2 px-3"
          style={{
            background: '#f1f5f9', color: '#475569', borderRadius: 6, fontSize: 12,
            fontWeight: 600, border: '1px solid #e2e8f0',
          }}
          onClick={handleCopy}
        >
          <i className={`bi ${copied ? 'bi-check-lg' : 'bi-clipboard'}`}></i>
          {copied ? 'Copied!' : 'Copy Full Prompt'}
        </button>
      </div>
    </div>
  );
}
