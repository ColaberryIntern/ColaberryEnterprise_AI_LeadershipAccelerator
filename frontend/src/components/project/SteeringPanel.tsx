import React, { useState } from 'react';
import portalApi from '../../utils/portalApi';

interface Props {
  onAction: () => void;
}

export default function SteeringPanel({ onAction }: Props) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleSteer = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setPreview(null);
    setResult(null);
    try {
      const res = await portalApi.post('/api/portal/project/steer', { input });
      setPreview(res.data);
    } catch (err: any) {
      setResult({ error: err.response?.data?.error || 'Failed to classify intent' });
    } finally { setLoading(false); }
  };

  const handleApply = async () => {
    if (!preview?.action_id) return;
    setApplying(true);
    try {
      const res = await portalApi.post(`/api/portal/project/steer/${preview.action_id}/apply`);
      setResult({ success: true, message: preview.message, created: res.data.created_process });
      setPreview(null);
      setInput('');
      setTimeout(() => { setResult(null); onAction(); }, 2500);
    } catch (err: any) {
      setResult({ error: err.response?.data?.error || 'Failed to apply' });
    } finally { setApplying(false); }
  };

  const handleCancel = () => {
    setPreview(null);
    setResult(null);
  };

  const intentIcons: Record<string, string> = {
    mode_change: 'bi-toggles',
    priority_boost: 'bi-arrow-up-circle',
    defer_process: 'bi-pause-circle',
    activate_process: 'bi-play-circle',
    add_process: 'bi-plus-circle',
    quality_focus: 'bi-speedometer2',
    unknown: 'bi-question-circle',
  };

  const intentColors: Record<string, string> = {
    mode_change: 'var(--color-info)',
    priority_boost: 'var(--color-warning)',
    defer_process: 'var(--color-muted, #9ca3af)',
    activate_process: 'var(--color-success)',
    add_process: 'var(--color-accent)',
    quality_focus: 'var(--color-purple, #6366f1)',
    unknown: 'var(--color-danger)',
  };

  return (
    <div className="card border-0 shadow-sm mb-3">
      <div className="card-body p-3">
        <div className="d-flex gap-2 align-items-center mb-2">
          <i className="bi bi-chat-dots" style={{ color: 'var(--color-primary)', fontSize: 16 }}></i>
          <span className="fw-semibold small" style={{ color: 'var(--color-primary)' }}>Steer Your Project</span>
          <span className="text-muted" style={{ fontSize: 10 }}>Tell the system what to do next</span>
        </div>

        <div className="d-flex gap-2">
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="e.g., switch to MVP mode, prioritize user management, defer logging, build a notifications system..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !loading && handleSteer()}
            disabled={loading || applying}
            style={{ fontSize: 12 }}
          />
          <button
            className="btn btn-sm btn-primary"
            onClick={handleSteer}
            disabled={loading || !input.trim() || applying}
            style={{ whiteSpace: 'nowrap' }}
          >
            {loading ? (
              <><span className="spinner-border spinner-border-sm me-1" style={{ width: 12, height: 12 }}></span>Thinking...</>
            ) : (
              <><i className="bi bi-send me-1"></i>Go</>
            )}
          </button>
        </div>

        {/* Preview Card */}
        {preview && (
          <div className="mt-3 p-3" style={{ background: 'var(--color-bg-alt, #f7fafc)', borderRadius: 8, border: '1px solid var(--color-border, #e2e8f0)' }}>
            <div className="d-flex align-items-center gap-2 mb-2">
              <i className={`bi ${intentIcons[preview.intent?.type] || 'bi-gear'}`}
                style={{ color: intentColors[preview.intent?.type] || 'var(--color-primary)', fontSize: 18 }}></i>
              <div>
                <div className="fw-semibold small">{preview.message}</div>
                <div className="text-muted" style={{ fontSize: 10 }}>
                  Intent: <span className="badge" style={{ background: `${intentColors[preview.intent?.type]}20`, color: intentColors[preview.intent?.type], fontSize: 9 }}>{preview.intent?.type}</span>
                </div>
              </div>
            </div>

            {/* Changes preview */}
            {preview.preview?.length > 0 && (
              <div className="mb-2">
                {preview.preview.map((p: any, i: number) => (
                  <div key={i} className="d-flex align-items-center gap-2 small" style={{ fontSize: 11 }}>
                    <span className="text-muted">{p.label}:</span>
                    <span style={{ color: 'var(--color-danger)', textDecoration: 'line-through' }}>{p.before}</span>
                    <i className="bi bi-arrow-right" style={{ fontSize: 10 }}></i>
                    <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>{p.after}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="d-flex gap-2">
              <button className="btn btn-sm btn-primary" onClick={handleApply} disabled={applying}>
                {applying ? <><span className="spinner-border spinner-border-sm me-1" style={{ width: 10, height: 10 }}></span>Applying...</> : <><i className="bi bi-check-lg me-1"></i>Confirm</>}
              </button>
              <button className="btn btn-sm btn-outline-secondary" onClick={handleCancel} disabled={applying}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Result feedback */}
        {result && (
          <div className={`mt-2 small ${result.error ? 'text-danger' : 'text-success'}`}>
            {result.error ? (
              <><i className="bi bi-exclamation-triangle me-1"></i>{result.error}</>
            ) : (
              <><i className="bi bi-check-circle me-1"></i>{result.message}
                {result.created && <span className="ms-1">— "{result.created.name}" created with {result.created.requirements_count} requirements</span>}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
