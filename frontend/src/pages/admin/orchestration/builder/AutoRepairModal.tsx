import React from 'react';
import { RepairResult, RepairFix } from './types';

interface Props {
  result: RepairResult | null;
  loading: boolean;
  onClose: () => void;
  onRun: (dryRun: boolean) => void;
}

function FixRow({ fix }: { fix: RepairFix }) {
  const actionLabels: Record<string, string> = {
    add_placeholder_prompt: 'Add placeholder prompt',
    create_variable_definition: 'Create variable definition',
    normalize_casing: 'Normalize casing',
    set_default_kc_config: 'Set KC defaults',
    add_placeholder_learning_goal: 'Add learning goal',
    remove_orphan_refs: 'Remove broken reference',
  };

  return (
    <tr style={{ fontSize: 11 }}>
      <td>
        <span className="badge bg-success-subtle text-success border" style={{ fontSize: 9 }}>
          {actionLabels[fix.action] || fix.action}
        </span>
      </td>
      <td className="fw-medium">{fix.field}</td>
      <td className="text-muted text-truncate" style={{ maxWidth: 150 }}>
        {fix.oldValue === null ? <em>null</em> : typeof fix.oldValue === 'object' ? JSON.stringify(fix.oldValue) : String(fix.oldValue)}
      </td>
      <td className="text-truncate" style={{ maxWidth: 200 }}>
        {typeof fix.newValue === 'object' ? JSON.stringify(fix.newValue) : String(fix.newValue).substring(0, 80)}
        {String(fix.newValue).length > 80 ? '...' : ''}
      </td>
    </tr>
  );
}

export default function AutoRepairModal({ result, loading, onClose, onRun }: Props) {
  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true">
      <div className="modal-dialog modal-lg modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header py-2">
            <h6 className="modal-title fw-bold mb-0">
              <i className="bi bi-wrench-adjustable me-2"></i>Auto-Repair
            </h6>
            <button className="btn-close btn-close-sm" onClick={onClose} aria-label="Close"></button>
          </div>

          <div className="modal-body">
            {loading && (
              <div className="text-center py-4">
                <div className="spinner-border text-primary mb-2" role="status">
                  <span className="visually-hidden">Repairing...</span>
                </div>
                <p className="text-muted small">Applying safe auto-fixes...</p>
              </div>
            )}

            {!loading && !result && (
              <div className="text-center py-4">
                <i className="bi bi-wrench-adjustable" style={{ fontSize: 40, color: 'var(--color-text-light)' }}></i>
                <p className="text-muted small mt-2 mb-1">Auto-repair applies safe, reversible fixes:</p>
                <ul className="list-unstyled small text-muted text-start mx-auto" style={{ maxWidth: 360 }}>
                  <li><i className="bi bi-check text-success me-1"></i>Fill empty prompt fields with templates</li>
                  <li><i className="bi bi-check text-success me-1"></i>Create missing variable definitions</li>
                  <li><i className="bi bi-check text-success me-1"></i>Normalize variable key casing</li>
                  <li><i className="bi bi-check text-success me-1"></i>Set default KC configuration</li>
                  <li><i className="bi bi-check text-success me-1"></i>Add placeholder learning goals</li>
                  <li><i className="bi bi-check text-success me-1"></i>Remove broken FK references</li>
                </ul>
                <p className="small text-muted mb-3"><strong>Safety:</strong> Only fills null fields. Never overwrites existing data.</p>
                <div className="d-flex gap-2 justify-content-center">
                  <button className="btn btn-outline-primary btn-sm" onClick={() => onRun(true)}>
                    <i className="bi bi-eye me-1"></i>Preview (Dry Run)
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={() => onRun(false)}>
                    <i className="bi bi-wrench me-1"></i>Apply Fixes
                  </button>
                </div>
              </div>
            )}

            {!loading && result && (
              <>
                {/* Score comparison */}
                <div className="d-flex align-items-center gap-3 mb-3 p-2 border rounded bg-light">
                  <div className="text-center">
                    <div className="small text-muted">Before</div>
                    <div className="fw-bold" style={{ fontSize: 20 }}>{result.previousScore}</div>
                  </div>
                  <i className="bi bi-arrow-right" style={{ fontSize: 20, color: 'var(--color-primary-light)' }}></i>
                  <div className="text-center">
                    <div className="small text-muted">After</div>
                    <div className="fw-bold text-success" style={{ fontSize: 20 }}>{result.newQualityScore}</div>
                  </div>
                  <div className="ms-auto">
                    {result.newQualityScore > result.previousScore ? (
                      <span className="badge bg-success">+{result.newQualityScore - result.previousScore} points</span>
                    ) : (
                      <span className="badge bg-secondary">No change</span>
                    )}
                  </div>
                </div>

                {/* Applied fixes */}
                {result.appliedFixes.length > 0 ? (
                  <>
                    <h6 className="small fw-bold mb-2">
                      <i className="bi bi-check-circle-fill text-success me-1"></i>
                      {result.appliedFixes.length} fix{result.appliedFixes.length !== 1 ? 'es' : ''} applied
                    </h6>
                    <div className="table-responsive">
                      <table className="table table-sm table-hover mb-0">
                        <thead className="table-light">
                          <tr style={{ fontSize: 10 }}>
                            <th>Action</th>
                            <th>Field</th>
                            <th>Old Value</th>
                            <th>New Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.appliedFixes.map((fix, i) => <FixRow key={i} fix={fix} />)}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div className="alert alert-info small py-2">
                    <i className="bi bi-info-circle me-1"></i>No fixes needed — mini-section is already in good shape.
                  </div>
                )}

                {/* Skipped fixes */}
                {result.skippedFixes.length > 0 && (
                  <div className="mt-3">
                    <h6 className="small fw-bold mb-2 text-muted">
                      <i className="bi bi-skip-forward me-1"></i>
                      {result.skippedFixes.length} skipped
                    </h6>
                    <ul className="list-unstyled small text-muted mb-0">
                      {result.skippedFixes.map((s, i) => (
                        <li key={i}><i className="bi bi-dot"></i>{s.action}: {s.reason}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="modal-footer py-2 d-flex justify-content-between">
            {result && (
              <div className="d-flex gap-2">
                <button className="btn btn-sm btn-outline-primary" onClick={() => onRun(true)}>
                  <i className="bi bi-eye me-1"></i>Dry Run
                </button>
                <button className="btn btn-sm btn-primary" onClick={() => onRun(false)}>
                  <i className="bi bi-wrench me-1"></i>Apply Again
                </button>
              </div>
            )}
            <button className="btn btn-sm btn-secondary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
