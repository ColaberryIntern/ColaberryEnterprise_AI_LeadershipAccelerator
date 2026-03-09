import React, { useState } from 'react';
import { ReconciliationReport } from './types';

interface Props {
  token: string;
  apiUrl: string;
  onComplete: () => void;
}

export default function BackfillButton({ token, apiUrl, onComplete }: Props) {
  const [running, setRunning] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [result, setResult] = useState<ReconciliationReport | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState('');

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const handlePreview = async () => {
    setPreviewing(true);
    setError('');
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/deep-reconcile?dryRun=true`, {
        method: 'POST', headers,
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Preview failed');
      setResult(await res.json());
    } catch (err: any) { setError(err.message); }
    setPreviewing(false);
  };

  const handleReconcile = async () => {
    setRunning(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/deep-reconcile`, {
        method: 'POST', headers,
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Reconciliation failed');
      setResult(await res.json());
      onComplete();
    } catch (err: any) { setError(err.message); }
    setRunning(false);
  };

  const closeModal = () => { setShowModal(false); setResult(null); setError(''); };

  const isPreview = result && result.quality.avgBefore === result.quality.avgAfter && !running;

  return (
    <>
      <button
        className="btn btn-sm btn-outline-warning"
        onClick={() => setShowModal(true)}
        title="Deep reconcile: populate prompts, skills, variables, artifacts"
      >
        <i className="bi bi-wrench-adjustable me-1"></i>Deep Reconcile
      </button>

      {showModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true">
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header py-2">
                <h6 className="modal-title" style={{ fontSize: 13 }}>
                  <i className="bi bi-wrench-adjustable me-1"></i>Deep Curriculum Reconciliation
                </h6>
                <button className="btn-close" onClick={closeModal} style={{ fontSize: 10 }} />
              </div>
              <div className="modal-body">
                {!result && !running && !previewing && (
                  <div>
                    <p className="small mb-2">This engine scans all mini-sections and populates:</p>
                    <div className="row g-2 mb-3">
                      <div className="col-3">
                        <div className="border rounded p-2 text-center" style={{ fontSize: 11 }}>
                          <i className="bi bi-chat-square-text d-block mb-1" style={{ fontSize: 18, color: 'var(--color-primary)' }}></i>
                          <strong>Prompts</strong>
                          <div className="text-muted" style={{ fontSize: 9 }}>System + User per type</div>
                        </div>
                      </div>
                      <div className="col-3">
                        <div className="border rounded p-2 text-center" style={{ fontSize: 11 }}>
                          <i className="bi bi-diagram-3 d-block mb-1" style={{ fontSize: 18, color: 'var(--color-accent)' }}></i>
                          <strong>Skills</strong>
                          <div className="text-muted" style={{ fontSize: 9 }}>From ontology layers</div>
                        </div>
                      </div>
                      <div className="col-3">
                        <div className="border rounded p-2 text-center" style={{ fontSize: 11 }}>
                          <i className="bi bi-braces d-block mb-1" style={{ fontSize: 18, color: '#e53e3e' }}></i>
                          <strong>Variables</strong>
                          <div className="text-muted" style={{ fontSize: 9 }}>System + lesson vars</div>
                        </div>
                      </div>
                      <div className="col-3">
                        <div className="border rounded p-2 text-center" style={{ fontSize: 11 }}>
                          <i className="bi bi-file-earmark-check d-block mb-1" style={{ fontSize: 18, color: '#d69e2e' }}></i>
                          <strong>Artifacts</strong>
                          <div className="text-muted" style={{ fontSize: 9 }}>For implementation tasks</div>
                        </div>
                      </div>
                    </div>
                    <ul className="small text-muted mb-0">
                      <li>Deterministic — no LLM calls, uses lesson metadata + ontology</li>
                      <li>Safe — never overwrites existing data (per-field idempotent)</li>
                      <li>Re-scores all mini-sections after population</li>
                    </ul>
                  </div>
                )}

                {(running || previewing) && (
                  <div className="text-center py-4">
                    <div className="spinner-border text-primary" role="status">
                      <span className="visually-hidden">{running ? 'Running reconciliation...' : 'Previewing...'}</span>
                    </div>
                    <p className="small text-muted mt-2">
                      {running ? 'Reconciling mini-sections + re-scoring...' : 'Previewing changes (dry run)...'}
                    </p>
                  </div>
                )}

                {error && <div className="alert alert-danger small py-2">{error}</div>}

                {result && (
                  <div>
                    <div className={`alert ${isPreview ? 'alert-info' : 'alert-success'} small py-2 mb-3`}>
                      <i className={`bi ${isPreview ? 'bi-eye' : 'bi-check-circle'} me-1`}></i>
                      {isPreview ? 'Preview (dry run) — no changes applied' : `Reconciliation complete in ${(result.duration_ms / 1000).toFixed(1)}s`}
                    </div>

                    {/* Metric Cards */}
                    <div className="row g-2 mb-3">
                      <div className="col-3">
                        <div className="border rounded p-2 text-center">
                          <div className="fw-bold" style={{ fontSize: 22, color: 'var(--color-primary)' }}>{result.prompts.generated}</div>
                          <div className="text-muted" style={{ fontSize: 10 }}>Prompts Generated</div>
                          {result.prompts.skipped > 0 && (
                            <div className="text-muted" style={{ fontSize: 9 }}>{result.prompts.skipped} skipped</div>
                          )}
                        </div>
                      </div>
                      <div className="col-3">
                        <div className="border rounded p-2 text-center">
                          <div className="fw-bold" style={{ fontSize: 22, color: 'var(--color-accent)' }}>{result.skills.mapped}</div>
                          <div className="text-muted" style={{ fontSize: 10 }}>Skills Mapped</div>
                          {result.skills.skipped > 0 && (
                            <div className="text-muted" style={{ fontSize: 9 }}>{result.skills.skipped} skipped</div>
                          )}
                        </div>
                      </div>
                      <div className="col-3">
                        <div className="border rounded p-2 text-center">
                          <div className="fw-bold" style={{ fontSize: 22, color: '#e53e3e' }}>{result.variables.mapped}</div>
                          <div className="text-muted" style={{ fontSize: 10 }}>Variables Mapped</div>
                          {result.variables.skipped > 0 && (
                            <div className="text-muted" style={{ fontSize: 9 }}>{result.variables.skipped} skipped</div>
                          )}
                        </div>
                      </div>
                      <div className="col-3">
                        <div className="border rounded p-2 text-center">
                          <div className="fw-bold" style={{ fontSize: 22, color: '#d69e2e' }}>{result.artifacts.created}</div>
                          <div className="text-muted" style={{ fontSize: 10 }}>Artifacts Created</div>
                          {result.artifacts.linked > 0 && result.artifacts.linked !== result.artifacts.created && (
                            <div className="text-muted" style={{ fontSize: 9 }}>{result.artifacts.linked} linked</div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Quality Score Before/After */}
                    {!isPreview && (
                      <div className="border rounded p-2 mb-3">
                        <div className="d-flex justify-content-between align-items-center" style={{ fontSize: 12 }}>
                          <span className="fw-medium">Quality Score</span>
                          <span>
                            <span className="badge bg-secondary me-1">{result.quality.avgBefore} avg before</span>
                            <i className="bi bi-arrow-right mx-1"></i>
                            <span className={`badge ${result.quality.avgAfter >= 75 ? 'bg-success' : result.quality.avgAfter >= 50 ? 'bg-warning' : 'bg-danger'}`}>
                              {result.quality.avgAfter} avg after
                            </span>
                          </span>
                        </div>
                        <div className="progress mt-1" style={{ height: 6 }}>
                          <div
                            className={`progress-bar ${result.quality.avgAfter >= 75 ? 'bg-success' : result.quality.avgAfter >= 50 ? 'bg-warning' : 'bg-danger'}`}
                            style={{ width: `${result.quality.avgAfter}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Prompt Breakdown by Type */}
                    {Object.keys(result.prompts.byType).length > 0 && (
                      <details className="mb-2">
                        <summary className="small text-muted" style={{ cursor: 'pointer' }}>
                          Prompts by type ({Object.keys(result.prompts.byType).length} types)
                        </summary>
                        <div className="d-flex gap-1 mt-1 flex-wrap">
                          {Object.entries(result.prompts.byType).map(([type, count]) => (
                            <span key={type} className="badge bg-light text-dark border" style={{ fontSize: 9 }}>
                              {type}: {count}
                            </span>
                          ))}
                        </div>
                      </details>
                    )}

                    {/* Issues */}
                    {result.issues.length > 0 && (
                      <details className="mb-2">
                        <summary className="small text-warning" style={{ cursor: 'pointer' }}>
                          <i className="bi bi-exclamation-triangle me-1"></i>
                          {result.issues.length} issue{result.issues.length !== 1 ? 's' : ''} found
                        </summary>
                        <ul className="small mt-1" style={{ maxHeight: 150, overflowY: 'auto', fontSize: 10 }}>
                          {result.issues.map((issue, i) => (
                            <li key={i}>
                              <span className="badge bg-secondary me-1" style={{ fontSize: 8 }}>{issue.category}</span>
                              {issue.detail}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}

                    <div className="text-muted" style={{ fontSize: 10 }}>
                      Total: {result.total} mini-sections processed
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer py-1">
                <button className="btn btn-sm btn-outline-secondary" onClick={closeModal}>Close</button>
                {!result && (
                  <>
                    <button className="btn btn-sm btn-outline-info" onClick={handlePreview} disabled={running || previewing}>
                      {previewing ? 'Previewing...' : 'Preview (Dry Run)'}
                    </button>
                    <button className="btn btn-sm btn-primary" onClick={handleReconcile} disabled={running || previewing}>
                      {running ? 'Running...' : 'Run Reconciliation'}
                    </button>
                  </>
                )}
                {result && isPreview && (
                  <button className="btn btn-sm btn-primary" onClick={handleReconcile} disabled={running}>
                    {running ? 'Running...' : 'Apply Changes'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
