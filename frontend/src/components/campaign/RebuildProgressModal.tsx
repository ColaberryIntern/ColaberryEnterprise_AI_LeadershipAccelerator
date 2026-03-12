import React from 'react';

interface Props {
  show: boolean;
  currentStep: number; // 0-5 (0=not started, 1-5=progress, 5=complete)
  onClose: () => void;
  error?: string | null;
}

const REBUILD_STEPS = [
  'Saving prompt...',
  'Analyzing campaign strategy...',
  'Generating description & goals...',
  'Building sequence steps...',
  'Updating per-step instructions...',
];

export default function RebuildProgressModal({ show, currentStep, onClose, error }: Props) {
  if (!show) return null;

  const isComplete = currentStep >= REBUILD_STEPS.length;
  const canClose = isComplete || !!error;

  return (
    <>
      <div className="modal-backdrop show" />
      <div className="modal show d-block" role="dialog" aria-modal="true" tabIndex={-1}>
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title fw-semibold">
                {error ? 'Rebuild Failed' : isComplete ? 'Rebuild Complete' : 'Rebuilding Campaign...'}
              </h5>
            </div>
            <div className="modal-body">
              {error ? (
                <div className="alert alert-danger mb-0">
                  <strong>Error:</strong> {error}
                </div>
              ) : (
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
                        {isPending && <span className="text-muted" style={{ width: 16, display: 'inline-block' }}>&#8226;</span>}
                        <span className={isDone ? 'text-success' : isActive ? 'fw-medium' : ''}>
                          {label}
                        </span>
                      </li>
                    );
                  })}
                  {isComplete && (
                    <li className="d-flex align-items-center gap-2 py-2 text-success fw-semibold">
                      <span>&#10003;</span> Complete!
                    </li>
                  )}
                </ul>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-sm btn-primary" onClick={onClose} disabled={!canClose}>
                {canClose ? 'Close' : 'Please wait...'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
