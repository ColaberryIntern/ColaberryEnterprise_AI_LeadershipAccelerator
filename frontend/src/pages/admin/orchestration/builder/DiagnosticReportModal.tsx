import React from 'react';
import { DiagnosticReport, DiagnosticCategory, DiagnosticCheck } from './types';

interface Props {
  report: DiagnosticReport | null;
  loading: boolean;
  onClose: () => void;
  onRun: () => void;
}

const STATUS_ICON: Record<string, { icon: string; color: string }> = {
  pass: { icon: 'bi-check-circle-fill', color: 'var(--color-accent, #38a169)' },
  warning: { icon: 'bi-exclamation-triangle-fill', color: '#d69e2e' },
  fail: { icon: 'bi-x-circle-fill', color: 'var(--color-secondary, #e53e3e)' },
};

function StatusIcon({ status }: { status: 'pass' | 'warning' | 'fail' }) {
  const info = STATUS_ICON[status];
  return <i className={`bi ${info.icon}`} style={{ color: info.color, fontSize: 14 }}></i>;
}

function CategoryCard({ category }: { category: DiagnosticCategory }) {
  const [expanded, setExpanded] = React.useState(category.status !== 'pass');

  return (
    <div className="border rounded mb-2">
      <div
        className="d-flex align-items-center gap-2 px-3 py-2"
        style={{ cursor: 'pointer', backgroundColor: expanded ? 'var(--color-bg-alt, #f7fafc)' : 'transparent' }}
        onClick={() => setExpanded(!expanded)}
      >
        <StatusIcon status={category.status} />
        <span className="fw-semibold small flex-grow-1">{category.name}</span>
        <span className={`badge ${category.status === 'pass' ? 'bg-success' : category.status === 'warning' ? 'bg-warning text-dark' : 'bg-danger'}`} style={{ fontSize: 9 }}>
          {category.status.toUpperCase()}
        </span>
        <span style={{ fontSize: 11 }}>{expanded ? '\u25B2' : '\u25BC'}</span>
      </div>
      {expanded && (
        <div className="px-3 py-2" style={{ borderTop: '1px solid var(--color-border, #e2e8f0)' }}>
          {category.details.length === 0 ? (
            <p className="text-muted small mb-0">No details available.</p>
          ) : (
            <table className="table table-sm mb-0" style={{ fontSize: 11 }}>
              <tbody>
                {category.details.map((check, i) => (
                  <tr key={i}>
                    <td style={{ width: 20 }}><StatusIcon status={check.status} /></td>
                    <td className="fw-medium" style={{ width: '35%' }}>{check.label}</td>
                    <td className="text-muted">{check.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default function DiagnosticReportModal({ report, loading, onClose, onRun }: Props) {
  const overallInfo = report ? STATUS_ICON[report.overallStatus] : null;

  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true">
      <div className="modal-dialog modal-lg modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header py-2">
            <h6 className="modal-title fw-bold mb-0">
              <i className="bi bi-clipboard2-pulse me-2"></i>Diagnostic Report
            </h6>
            <button className="btn-close btn-close-sm" onClick={onClose} aria-label="Close"></button>
          </div>

          <div className="modal-body">
            {loading && (
              <div className="text-center py-4">
                <div className="spinner-border text-primary mb-2" role="status">
                  <span className="visually-hidden">Running diagnostics...</span>
                </div>
                <p className="text-muted small">Running 6 diagnostic categories...</p>
              </div>
            )}

            {!loading && !report && (
              <div className="text-center py-4">
                <i className="bi bi-clipboard2-pulse" style={{ fontSize: 40, color: 'var(--color-text-light)' }}></i>
                <p className="text-muted small mt-2 mb-3">Run a full diagnostic to check for issues across all categories.</p>
                <button className="btn btn-primary btn-sm" onClick={onRun}>
                  <i className="bi bi-play-fill me-1"></i>Run Full Diagnostic
                </button>
              </div>
            )}

            {!loading && report && (
              <>
                {/* Overall status banner */}
                <div className={`alert ${report.overallStatus === 'pass' ? 'alert-success' : report.overallStatus === 'warning' ? 'alert-warning' : 'alert-danger'} d-flex align-items-center gap-2 py-2`}>
                  <i className={`bi ${overallInfo!.icon}`} style={{ fontSize: 20 }}></i>
                  <div>
                    <strong className="small">Overall: {report.overallStatus.toUpperCase()}</strong>
                    <span className="small ms-2 text-muted">
                      {report.categories.filter(c => c.status === 'pass').length}/{report.categories.length} categories passed
                    </span>
                  </div>
                  <span className="ms-auto small text-muted">{new Date(report.timestamp).toLocaleTimeString()}</span>
                </div>

                {/* Category cards */}
                {report.categories.map((cat, i) => (
                  <CategoryCard key={i} category={cat} />
                ))}
              </>
            )}
          </div>

          <div className="modal-footer py-2 d-flex justify-content-between">
            {report && (
              <button className="btn btn-sm btn-outline-primary" onClick={onRun}>
                <i className="bi bi-arrow-clockwise me-1"></i>Re-run
              </button>
            )}
            <button className="btn btn-sm btn-secondary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
