/**
 * ActionBar — sticky bottom bar.
 *
 * Mode toggle (annotate / browse), reload iframe, compile prompt for all,
 * open Build Center, mark all ready for verification.
 */
import React from 'react';

interface Props {
  annotateMode: boolean;
  onToggleAnnotate: () => void;
  onReload: () => void;
  onCompileAll: () => void;
  onSendToBuildCenter: () => void;
  onMarkReady: () => void;
  totalIssues: number;
  acceptedCount: number;
  generating: boolean;
}

const ActionBar: React.FC<Props> = ({
  annotateMode, onToggleAnnotate, onReload,
  onCompileAll, onSendToBuildCenter, onMarkReady,
  totalIssues, acceptedCount, generating,
}) => {
  const hasWork = totalIssues > 0;
  return (
    <div className="vw-action-bar">
      <div className="vw-action-bar-left">
        <button
          type="button"
          className={`btn btn-sm`}
          style={annotateMode ? { background: '#FB2832', color: '#fff', border: 'none' } : { border: '1px solid #FB2832', color: '#FB2832', background: 'transparent' }}
          onClick={onToggleAnnotate}
        >
          <i className={`bi ${annotateMode ? 'bi-bullseye' : 'bi-cursor'} me-1`}></i>
          {annotateMode ? 'Annotate mode ON' : 'Annotate'}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={onReload}
          title="Reload iframe"
        >
          <i className="bi bi-arrow-clockwise me-1"></i>Reload
        </button>
      </div>

      <div className="vw-action-bar-status">
        <span>
          <strong>{totalIssues}</strong> {totalIssues === 1 ? 'issue' : 'issues'}
        </span>
        {acceptedCount > 0 && (
          <span style={{ color: 'var(--color-success)' }}>
            · <strong>{acceptedCount}</strong> ready
          </span>
        )}
      </div>

      <div className="vw-action-bar-right">
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={onMarkReady}
          disabled={!hasWork}
        >
          <i className="bi bi-clipboard-check me-1"></i>Mark ready for verification
        </button>
        <button
          type="button"
          className="btn btn-sm"
          style={{ border: '1px solid #FB2832', color: '#FB2832', background: 'transparent' }}
          onClick={onCompileAll}
          disabled={!hasWork || generating}
        >
          <i className="bi bi-lightning me-1"></i>
          {generating ? 'Compiling…' : 'Compile prompt'}
        </button>
        <button
          type="button"
          className="btn btn-sm"
          style={{ background: '#FB2832', color: '#fff', border: 'none' }}
          onClick={onSendToBuildCenter}
          disabled={!hasWork}
        >
          <i className="bi bi-rocket me-1"></i>Open Blueprint
        </button>
      </div>
    </div>
  );
};

export default ActionBar;
