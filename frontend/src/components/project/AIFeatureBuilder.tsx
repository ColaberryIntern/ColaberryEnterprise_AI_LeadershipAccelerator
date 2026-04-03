import React, { useState } from 'react';
import portalApi from '../../utils/portalApi';

interface Props { capabilities?: Array<{ id: string; name: string }>; onCreated: () => void; onClose: () => void; }

export default function AIFeatureBuilder({ capabilities = [], onCreated, onClose }: Props) {
  const [desc, setDesc] = useState('');
  const [capId, setCapId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (!desc.trim()) return;
    setGenerating(true); setError(null); setResult(null);
    try {
      const r = await portalApi.post('/api/portal/project/capabilities/add-feature', { description: desc.trim(), capability_id: capId || undefined });
      setResult(r.data); onCreated();
    } catch (err: any) { setError(err.response?.data?.error || 'Failed'); } finally { setGenerating(false); }
  };

  return (
    <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="modal-dialog modal-dialog-centered" onClick={e => e.stopPropagation()}>
        <div className="modal-content border-0 shadow">
          <div className="modal-header border-0 pb-0">
            <h6 className="modal-title fw-semibold" style={{ color: 'var(--color-primary)' }}><i className="bi bi-stars me-2"></i>AI Feature Builder</h6>
            <button className="btn-close" onClick={onClose}></button>
          </div>
          <div className="modal-body">
            {!result ? (
              <>
                <p className="text-muted small mb-3">Describe the feature you want to add. AI will generate a structured feature with requirements.</p>
                <div className="mb-3">
                  <label className="form-label small fw-medium">What do you want to build?</label>
                  <textarea className="form-control" rows={3} placeholder="e.g., Automated user onboarding with email verification" value={desc} onChange={e => setDesc(e.target.value)} disabled={generating} />
                </div>
                {capabilities.length > 0 && (
                  <div className="mb-3">
                    <label className="form-label small fw-medium">Add to capability (optional)</label>
                    <select className="form-select form-select-sm" value={capId} onChange={e => setCapId(e.target.value)} disabled={generating}>
                      <option value="">Auto-detect</option>
                      {capabilities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}
                {error && <div className="alert alert-danger small py-2 mb-3"><i className="bi bi-exclamation-triangle me-1"></i>{error}</div>}
                <button className="btn btn-primary w-100" onClick={generate} disabled={generating || !desc.trim()}>
                  {generating ? <><span className="spinner-border spinner-border-sm me-2"></span>Generating...</> : <><i className="bi bi-stars me-2"></i>Generate Feature</>}
                </button>
              </>
            ) : (
              <div>
                <div className="alert alert-success small py-2 mb-3"><i className="bi bi-check-circle me-1"></i>Feature created</div>
                <div className="mb-2"><span className="badge bg-primary bg-opacity-10 text-primary me-1">{result.capability.name}</span><span className="fw-medium small">{result.feature.name}</span></div>
                <div className="small text-muted mb-2">{result.requirements.length} requirements:</div>
                {result.requirements.map((r: any) => <div key={r.key} className="d-flex gap-2 mb-1" style={{ fontSize: 12 }}><span className="fw-medium" style={{ color: 'var(--color-primary)' }}>{r.key}</span><span className="text-muted">{r.text}</span></div>)}
                <button className="btn btn-sm btn-outline-primary mt-3 w-100" onClick={onClose}>Done</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
