import React from 'react';
import { CategoryStatus, Tone } from './types';

/** Small status pill shown on the left-rail nav item and each panel header —
 * one glance tells you whether a category is running as-authored, capped,
 * fully customized, or turned off for this class. */
export const StatusBadge: React.FC<{ status: CategoryStatus }> = ({ status }) => {
  const map: Record<CategoryStatus, { label: string; cls: string }> = {
    off: { label: 'Off', cls: 'bg-secondary-subtle text-secondary-emphasis' },
    custom: { label: 'Custom', cls: 'bg-primary-subtle text-primary-emphasis' },
    capped: { label: 'Capped', cls: 'bg-info-subtle text-info-emphasis' },
    default: { label: 'Default', cls: 'bg-light text-muted border' },
  };
  const s = map[status];
  return <span className={`badge rounded-pill ${s.cls}`} style={{ fontWeight: 500, fontSize: '.7rem' }}>{s.label}</span>;
};

/** The toggle + optional "max shown" row every count-and-override category
 * starts with. `defaultCount` (from the real authored defaults) drives the
 * "X of Y will show" helper text so the cap is never a guess. */
export const CategoryToggleRow: React.FC<{
  id: string; label: string; hint: string;
  enabled: boolean; onToggle: (v: boolean) => void;
  max: number | null; onMaxChange?: (v: number | null) => void;
  defaultCount: number;
}> = ({ id, label, hint, enabled, onToggle, max, onMaxChange, defaultCount }) => (
  <div className="rounded-3 border bg-white p-3 mb-3">
    <div className="form-check form-switch mb-0">
      <input className="form-check-input" type="checkbox" id={id} checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
      <label className="form-check-label" htmlFor={id}>
        <span className="fw-semibold">{label}</span>
        <div className="text-muted small">{hint}</div>
      </label>
    </div>
    {enabled && onMaxChange && (
      <div className="mt-2 ms-4 d-flex align-items-center gap-2">
        <label className="form-label small fw-medium mb-0">Max shown</label>
        <input type="number" min={0} className="form-control form-control-sm" style={{ maxWidth: 100 }}
          value={max ?? ''} placeholder="No cap"
          onChange={(e) => onMaxChange(e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0))} />
        <span className="text-muted small">
          {max != null ? `${Math.min(max, defaultCount)} of ${defaultCount} will show` : `All ${defaultCount} will show`}
        </span>
      </div>
    )}
  </div>
);

/** The "authored defaults" vs "write my own" segmented switch that sits above
 * every override editor. */
export const ContentModeSwitch: React.FC<{
  id: string; usingCustom: boolean; onSwitch: (custom: boolean) => void; itemNoun: string;
}> = ({ id, usingCustom, onSwitch, itemNoun }) => (
  <div className="d-flex justify-content-between align-items-center mb-2">
    <h6 className="mb-0">Content</h6>
    <div className="btn-group btn-group-sm" role="group" aria-label={`${itemNoun} content mode`}>
      <button type="button" className={`btn ${!usingCustom ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => onSwitch(false)}>
        Authored defaults
      </button>
      <button type="button" id={id} className={`btn ${usingCustom ? 'btn-primary' : 'btn-outline-secondary'}`} onClick={() => onSwitch(true)}>
        Write my own
      </button>
    </div>
  </div>
);

/** A read-only preview card for one authored-default item — this is the "show
 * me the defaults" surface: real content, not a placeholder sentence. */
export const DefaultPreviewCard: React.FC<{
  eyebrow?: string; title: string; body?: string; footer?: React.ReactNode; tone?: Tone;
}> = ({ eyebrow, title, body, footer, tone }) => {
  const toneBorder: Record<Tone, string> = {
    cherry: '#e5121d', berry: '#367895', amber: '#c9820a', leaf: '#2f8f4e', violet: '#7c5cbf',
  };
  return (
    <div className="rounded-3 border p-3 mb-2" style={tone ? { borderLeftWidth: 4, borderLeftColor: toneBorder[tone] } : undefined}>
      {eyebrow && <div className="text-uppercase small fw-semibold text-muted mb-1" style={{ letterSpacing: '.03em' }}>{eyebrow}</div>}
      <div className="fw-semibold mb-1">{title}</div>
      {body && <div className="text-muted small">{body}</div>}
      {footer}
    </div>
  );
};

/** Numbered card wrapper for an editable override item — consistent chrome
 * (index badge, remove button) across every override editor. */
export const OverrideCard: React.FC<{ index: number; onRemove: () => void; children: React.ReactNode }> = ({ index, onRemove, children }) => (
  <div className="rounded-3 border p-3 mb-2 position-relative">
    <div className="d-flex justify-content-between align-items-start mb-2">
      <span className="badge bg-dark-subtle text-dark-emphasis rounded-pill">{index + 1}</span>
      <button className="btn btn-outline-danger btn-sm" onClick={onRemove}>Remove</button>
    </div>
    {children}
  </div>
);

export const EmptyDefaultsNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-muted small fst-italic mb-2">{children}</p>
);
