/**
 * AnnotationModal — opens after a user clicks the stage to drop a pin.
 *
 * V1 keeps it lean: title, description, kind, severity, expected outcome.
 * "AI suggest" pre-fills from the curated critique pattern bank.
 */
import React, { useState, useEffect } from 'react';
import { CRITIQUE_KINDS, SEVERITIES } from '../types';
import type { CritiqueKind, CritiqueSeverity, PinCoordinate } from '../types';
import { suggestForKind } from '../lib/critiquePatterns';

interface Props {
  open: boolean;
  pin: PinCoordinate | null;
  onCancel: () => void;
  onSave: (data: {
    title: string;
    description: string;
    kind: CritiqueKind;
    severity: CritiqueSeverity;
    expected_outcome: string;
    target_selector: string;
  }) => Promise<void> | void;
}

const AnnotationModal: React.FC<Props> = ({ open, pin, onCancel, onSave }) => {
  const [kind, setKind] = useState<CritiqueKind>('hierarchy');
  const [severity, setSeverity] = useState<CritiqueSeverity>('medium');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [expectedOutcome, setExpectedOutcome] = useState('');
  const [targetSelector, setTargetSelector] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setKind('hierarchy');
      setSeverity('medium');
      setTitle('');
      setDescription('');
      setExpectedOutcome('');
      setTargetSelector('');
    }
  }, [open]);

  const aiSuggest = () => {
    const hint = suggestForKind(kind);
    if (!title) setTitle(hint.title);
    if (!description) setDescription(hint.description);
    if (!expectedOutcome) setExpectedOutcome(hint.expected_outcome);
  };

  const handleSave = async () => {
    if (!description.trim()) return;
    setSubmitting(true);
    try {
      await onSave({
        title: title.trim() || description.trim().split('.')[0].slice(0, 80),
        description: description.trim(),
        kind,
        severity,
        expected_outcome: expectedOutcome.trim(),
        target_selector: targetSelector.trim(),
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !pin) return null;

  return (
    <div className="vw-modal-backdrop" onClick={onCancel}>
      <div className="vw-modal" onClick={(e) => e.stopPropagation()}>
        <div className="vw-modal-header">
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-light)' }}>
              new annotation
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#FB2832' }}>
              Pin the issue
            </div>
          </div>
          <button type="button" className="btn btn-sm btn-link text-decoration-none" onClick={onCancel} aria-label="Close">
            ×
          </button>
        </div>

        <div className="vw-modal-body">
          <div className="row g-2 mb-2">
            <div className="col-7">
              <label className="form-label small fw-medium">Issue title</label>
              <input
                className="form-control form-control-sm"
                placeholder="Short, scannable title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            </div>
            <div className="col-5">
              <label className="form-label small fw-medium">Severity</label>
              <select
                className="form-select form-select-sm"
                value={severity}
                onChange={(e) => setSeverity(e.target.value as CritiqueSeverity)}
              >
                {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="row g-2 mb-2">
            <div className="col-7">
              <label className="form-label small fw-medium">Kind</label>
              <select
                className="form-select form-select-sm"
                value={kind}
                onChange={(e) => setKind(e.target.value as CritiqueKind)}
              >
                {CRITIQUE_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div className="col-5 d-flex align-items-end">
              <button
                type="button"
                className="btn btn-sm w-100"
                style={{ border: '1px solid #FB2832', color: '#FB2832', background: 'transparent' }}
                onClick={aiSuggest}
                title="Pre-fill description and expected outcome from a curated pattern"
              >
                <i className="bi bi-stars me-1"></i>AI suggest
              </button>
            </div>
          </div>

          <div className="mb-2">
            <label className="form-label small fw-medium">What's the issue?</label>
            <textarea
              className="form-control form-control-sm"
              rows={3}
              placeholder="Describe what's wrong. Be specific."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="mb-2">
            <label className="form-label small fw-medium">Expected improvement</label>
            <textarea
              className="form-control form-control-sm"
              rows={2}
              placeholder="What should the page look/behave like after the fix?"
              value={expectedOutcome}
              onChange={(e) => setExpectedOutcome(e.target.value)}
            />
          </div>

          <div className="mb-2">
            <label className="form-label small fw-medium">Target selector (optional)</label>
            <input
              className="form-control form-control-sm font-monospace"
              placeholder=".hero-cta, [data-testid='pricing-card']"
              value={targetSelector}
              onChange={(e) => setTargetSelector(e.target.value)}
            />
          </div>

          <div style={{
            fontSize: 11,
            color: 'var(--color-text-light)',
            background: 'var(--color-bg-alt)',
            border: '1px solid var(--color-border)',
            borderRadius: 4,
            padding: '0.4rem 0.55rem',
          }}>
            Pin coordinates: x={(pin.x * 100).toFixed(1)}% · y={(pin.y * 100).toFixed(1)}%
            <span style={{ marginLeft: 8, fontStyle: 'italic' }}>captured automatically</span>
          </div>
        </div>

        <div className="vw-modal-footer">
          <button type="button" className="btn btn-sm btn-light" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-sm"
            style={{ background: '#FB2832', color: '#fff', border: 'none' }}
            onClick={handleSave}
            disabled={submitting || !description.trim()}
          >
            {submitting ? 'Saving…' : 'Save annotation'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AnnotationModal;
