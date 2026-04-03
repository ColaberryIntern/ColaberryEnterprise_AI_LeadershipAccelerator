import React, { useState } from 'react';
import portalApi from '../../utils/portalApi';

interface CapabilityOption {
  id: string;
  name: string;
}

interface Props {
  capabilities?: CapabilityOption[];
  onCreated: () => void;
  onClose: () => void;
}

export default function AIFeatureBuilder({ capabilities = [], onCreated, onClose }: Props) {
  const [description, setDescription] = useState('');
  const [capabilityId, setCapabilityId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!description.trim()) return;
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const res = await portalApi.post('/api/portal/project/capabilities/add-feature', {
        description: description.trim(),
        capability_id: capabilityId || undefined,
      });
      setResult(res.data);
      onCreated();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate feature');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="modal show d-block" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="modal-dialog modal-dialog-centered" onClick={e => e.stopPropagation()}>
        <div className="modal-content border-0 shadow">
          <div className="modal-header border-0 pb-0">
            <h6 className="modal-title fw-semibold" style={{ color: 'var(--color-primary)' }}>
              <i className="bi bi-stars me-2"></i>AI Feature Builder
            </h6>
            <button className="btn-close" onClick={onClose}></button>
          </div>
          <div className="modal-body">
            {!result ? (
              <>
                <p className="text-muted small mb-3">
                  Describe the feature you want to add. The AI will generate a structured feature with atomic requirements.
                </p>

                <div className="mb-3">
                  <label className="form-label small fw-medium">What do you want to build?</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    placeholder="e.g., I want automated user onboarding with email verification and welcome flow"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    disabled={generating}
                  />
                </div>

                {capabilities.length > 0 && (
                  <div className="mb-3">
                    <label className="form-label small fw-medium">Add to capability (optional)</label>
                    <select
                      className="form-select form-select-sm"
                      value={capabilityId}
                      onChange={e => setCapabilityId(e.target.value)}
                      disabled={generating}
                    >
                      <option value="">Auto-detect best fit</option>
                      {capabilities.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {error && (
                  <div className="alert alert-danger small py-2 mb-3">
                    <i className="bi bi-exclamation-triangle me-1"></i>{error}
                  </div>
                )}

                <button
                  className="btn btn-primary w-100"
                  onClick={handleGenerate}
                  disabled={generating || !description.trim()}
                >
                  {generating ? (
                    <><span className="spinner-border spinner-border-sm me-2"></span>Generating feature...</>
                  ) : (
                    <><i className="bi bi-stars me-2"></i>Generate Feature</>
                  )}
                </button>
              </>
            ) : (
              <div>
                <div className="alert alert-success small py-2 mb-3">
                  <i className="bi bi-check-circle me-1"></i>Feature created successfully
                </div>

                <div className="mb-2">
                  <span className="badge bg-primary bg-opacity-10 text-primary me-1">{result.capability.name}</span>
                  <span className="fw-medium small">{result.feature.name}</span>
                </div>

                <div className="small text-muted mb-2">
                  {result.requirements.length} requirements generated:
                </div>

                {result.requirements.map((req: any) => (
                  <div key={req.key} className="d-flex align-items-start gap-2 mb-1" style={{ fontSize: 12 }}>
                    <span className="fw-medium" style={{ color: 'var(--color-primary)' }}>{req.key}</span>
                    <span className="text-muted">{req.text}</span>
                  </div>
                ))}

                <button className="btn btn-sm btn-outline-primary mt-3 w-100" onClick={onClose}>
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
