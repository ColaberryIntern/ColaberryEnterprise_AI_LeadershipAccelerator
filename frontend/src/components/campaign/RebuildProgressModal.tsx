import React from 'react';

interface Props {
  show: boolean;
  minimized: boolean;
  currentStep: number; // 0-5 (0=not started, 1-5=progress, 5=complete)
  onClose: () => void;
  onMinimize: () => void;
  onRestore: () => void;
  error?: string | null;
}

const REBUILD_STEPS = [
  'Saving prompt...',
  'Analyzing campaign strategy...',
  'Generating description & goals...',
  'Building sequence steps...',
  'Complete!',
];

export default function RebuildProgressModal({
  show,
  minimized,
  currentStep,
  onClose,
  onMinimize,
  onRestore,
  error,
}: Props) {
  if (!show) return null;

  const isComplete = currentStep >= REBUILD_STEPS.length;
  const canClose = isComplete || !!error;
  const activeStepLabel =
    error ? 'Rebuild failed' : isComplete ? 'Rebuild complete' : REBUILD_STEPS[currentStep - 1] || 'Starting...';

  // ── Minimized floating pill ──────────────────────────────────────
  if (minimized) {
    return (
      <div
        onClick={onRestore}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 1060,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 16px',
          borderRadius: 24,
          backgroundColor: error ? 'var(--color-secondary, #e53e3e)' : isComplete ? 'var(--color-accent, #38a169)' : 'var(--color-primary, #1a365d)',
          color: '#fff',
          boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
          fontSize: '0.85rem',
          fontWeight: 500,
          transition: 'transform 0.15s ease',
        }}
        title="Click to expand"
      >
        {!isComplete && !error && (
          <div className="spinner-border spinner-border-sm text-light" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        )}
        {isComplete && <span>&#10003;</span>}
        {error && <span>&#10007;</span>}
        <span>{activeStepLabel}</span>
      </div>
    );
  }

  // ── Full modal ───────────────────────────────────────────────────
  return (
    <>
      <div className="modal-backdrop show" style={{ zIndex: 1050 }} />
      <div className="modal show d-block" role="dialog" aria-modal="true" tabIndex={-1} style={{ zIndex: 1055 }}>
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title fw-semibold">
                {error ? 'Rebuild Failed' : isComplete ? 'Rebuild Complete' : 'Rebuilding Campaign...'}
              </h5>
              {!canClose && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary ms-auto"
                  onClick={onMinimize}
                  title="Run in background"
                  style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                >
                  Minimize
                </button>
              )}
            </div>
            <div className="modal-body">
              {error ? (
                <div className="alert alert-danger mb-0">
                  <strong>Error:</strong> {error}
                </div>
              ) : (
                <>
                  <ul className="list-unstyled mb-0">
                    {REBUILD_STEPS.map((label, i) => {
                      const stepNum = i + 1;
                      const isActive = stepNum === currentStep;
                      const isDone = stepNum < currentStep || isComplete;
                      const isPending = stepNum > currentStep && !isComplete;

                      return (
                        <li key={i} className={`d-flex align-items-center gap-2 py-2 ${isPending ? 'text-muted' : ''}`}>
                          {isDone && <span className="text-success fw-bold">&#10003;</span>}
                          {isActive && (
                            <div className="spinner-border spinner-border-sm text-primary" role="status">
                              <span className="visually-hidden">Loading...</span>
                            </div>
                          )}
                          {isPending && (
                            <span className="text-muted" style={{ width: 16, display: 'inline-block' }}>
                              &#8226;
                            </span>
                          )}
                          <span className={isDone ? 'text-success' : isActive ? 'fw-medium' : ''}>{label}</span>
                        </li>
                      );
                    })}
                  </ul>
                  {!isComplete && (
                    <div className="text-muted small mt-3" style={{ fontSize: '0.78rem' }}>
                      This may take 30-60 seconds depending on AI response time.
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="modal-footer d-flex justify-content-between">
              {!canClose ? (
                <>
                  <button className="btn btn-sm btn-outline-secondary" onClick={onMinimize}>
                    Run in Background
                  </button>
                  <span className="text-muted small">Please wait...</span>
                </>
              ) : (
                <>
                  <div />
                  <button className="btn btn-sm btn-primary" onClick={onClose}>
                    Close
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
