import React, { useState } from 'react';
import { BackfillResult } from './types';

interface Props {
  token: string;
  apiUrl: string;
  onComplete: () => void;
}

export default function BackfillButton({ token, apiUrl, onComplete }: Props) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BackfillResult | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState('');

  const handleBackfill = async () => {
    setRunning(true);
    setError('');
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/backfill/inline-prompts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Backfill failed');
      const data = await res.json();
      setResult(data);
      onComplete();
    } catch (err: any) {
      setError(err.message);
    }
    setRunning(false);
  };

  return (
    <>
      <button
        className="btn btn-sm btn-outline-warning"
        onClick={() => setShowModal(true)}
        title="Copy prompt template text into inline fields"
      >
        <i className="bi bi-arrow-repeat me-1"></i>Backfill
      </button>

      {showModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} role="dialog" aria-modal="true">
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header py-2">
                <h6 className="modal-title" style={{ fontSize: 13 }}>
                  <i className="bi bi-arrow-repeat me-1"></i>Backfill Inline Prompts
                </h6>
                <button className="btn-close" onClick={() => { setShowModal(false); setResult(null); setError(''); }} style={{ fontSize: 10 }} />
              </div>
              <div className="modal-body">
                {!result && !running && (
                  <div>
                    <p className="small">This will scan all mini-sections and copy prompt text from linked PromptTemplate records into the inline prompt fields.</p>
                    <ul className="small text-muted">
                      <li>Only fills fields that are currently empty</li>
                      <li>Does not overwrite existing inline text</li>
                      <li>Safe to run multiple times (idempotent)</li>
                    </ul>
                  </div>
                )}
                {running && (
                  <div className="text-center py-3">
                    <div className="spinner-border text-primary" role="status">
                      <span className="visually-hidden">Running backfill...</span>
                    </div>
                    <p className="small text-muted mt-2">Scanning mini-sections...</p>
                  </div>
                )}
                {error && <div className="alert alert-danger small">{error}</div>}
                {result && (
                  <div>
                    <div className="alert alert-success small py-2">
                      <i className="bi bi-check-circle me-1"></i>Backfill complete
                    </div>
                    <div className="row g-2 mb-2">
                      <div className="col-4 text-center">
                        <div className="fw-bold" style={{ fontSize: 20 }}>{result.backfilled}</div>
                        <div className="text-muted" style={{ fontSize: 10 }}>Backfilled</div>
                      </div>
                      <div className="col-4 text-center">
                        <div className="fw-bold" style={{ fontSize: 20 }}>{result.alreadyHadInline}</div>
                        <div className="text-muted" style={{ fontSize: 10 }}>Already Inline</div>
                      </div>
                      <div className="col-4 text-center">
                        <div className="fw-bold" style={{ fontSize: 20 }}>{result.incomplete.length}</div>
                        <div className="text-muted" style={{ fontSize: 10 }}>Incomplete</div>
                      </div>
                    </div>
                    {result.brokenReferences.length > 0 && (
                      <div className="alert alert-warning small py-1 mb-2">
                        <strong>{result.brokenReferences.length}</strong> broken template reference{result.brokenReferences.length !== 1 ? 's' : ''} found
                      </div>
                    )}
                    {result.incomplete.length > 0 && (
                      <details className="mb-2">
                        <summary className="small text-muted" style={{ cursor: 'pointer' }}>
                          {result.incomplete.length} mini-section{result.incomplete.length !== 1 ? 's' : ''} with missing prompts
                        </summary>
                        <ul className="small mt-1" style={{ maxHeight: 150, overflowY: 'auto' }}>
                          {result.incomplete.map((item, i) => (
                            <li key={i}>{item.miniSectionId}: missing {item.missingPrompts.join(', ')}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                )}
              </div>
              <div className="modal-footer py-1">
                <button className="btn btn-sm btn-outline-secondary" onClick={() => { setShowModal(false); setResult(null); setError(''); }}>
                  Close
                </button>
                {!result && (
                  <button className="btn btn-sm btn-primary" onClick={handleBackfill} disabled={running}>
                    {running ? 'Running...' : 'Run Backfill'}
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
