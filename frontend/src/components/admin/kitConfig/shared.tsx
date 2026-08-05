import React, { useState } from 'react';
import { CategoryStatus } from './types';

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

export const EmptyDefaultsNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-muted small fst-italic mb-2">{children}</p>
);

/** Collapsed-by-default, always-editable card for one item in a resolved list —
 * replaces the old "authored defaults preview vs. write-my-own editor" split
 * (`ContentModeSwitch`/`DefaultPreviewCard`/`OverrideCard`) with a single
 * always-in-place editor: collapsed shows a one-line `summary` (the "here's
 * what this actually is" glance), expanded shows the full field editor in
 * `children`. Move-up/move-down + the numbered badge give explicit "1st, 2nd,
 * etc." positioning without standing up a per-panel drag-and-drop context —
 * the Timeline page keeps drag-and-drop for its own cross-lane use case; a
 * flat single-list editor doesn't need to duplicate that. Chevron/collapse
 * pattern matches `TimelineEditorTab.tsx`'s `BucketSection` and
 * `SectionBlueprintCard.tsx` (`bi-chevron-right/down`, collapsed by default). */
export const CollapsibleOverrideCard: React.FC<{
  index: number; total: number; summary: React.ReactNode;
  /** Plain-text version of `summary`, shown as a native hover tooltip so a
   * truncated title can still be read without expanding the card. */
  summaryText?: string;
  onRemove: () => void; onMoveUp: () => void; onMoveDown: () => void;
  defaultExpanded?: boolean; children: React.ReactNode;
}> = ({ index, total, summary, summaryText, onRemove, onMoveUp, onMoveDown, defaultExpanded, children }) => {
  const [expanded, setExpanded] = useState(!!defaultExpanded);
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const toggle = () => setExpanded((v) => !v);
  return (
    <div className="card border shadow-sm mb-2">
      <div
        className="card-header bg-white py-2 d-flex justify-content-between align-items-center gap-2"
        style={{ cursor: 'pointer' }}
        role="button" tabIndex={0} aria-expanded={expanded}
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
      >
        <div className="d-flex align-items-center gap-2 flex-grow-1" style={{ minWidth: 0 }}>
          <span className="badge bg-dark-subtle text-dark-emphasis rounded-pill flex-shrink-0">{index + 1}</span>
          <span className="text-truncate small" {...(summaryText ? { title: summaryText } : {})}>{summary}</span>
        </div>
        <div className="d-flex align-items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="btn btn-outline-secondary btn-sm" style={{ padding: '.15rem .5rem' }}
            disabled={isFirst} onClick={onMoveUp} aria-label={`Move item ${index + 1} up`} title="Move up">↑</button>
          <button type="button" className="btn btn-outline-secondary btn-sm" style={{ padding: '.15rem .5rem' }}
            disabled={isLast} onClick={onMoveDown} aria-label={`Move item ${index + 1} down`} title="Move down">↓</button>
          <button type="button" className="btn btn-outline-danger btn-sm" onClick={onRemove} aria-label={`Remove item ${index + 1}`}>Remove</button>
          <i className={`bi bi-chevron-${expanded ? 'down' : 'right'} text-muted ms-1`} style={{ fontSize: 11 }} aria-hidden="true"></i>
        </div>
      </div>
      {expanded && <div className="card-body py-2">{children}</div>}
    </div>
  );
};

/** Pure reorder helper every redesigned panel's move-up/move-down uses:
 * swaps the item at `index` with its neighbor, no-op past either end. */
export function moveItem<T>(list: T[], index: number, direction: 'up' | 'down'): T[] {
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** "Write my own" now means: type an instruction, get an AI-regenerated
 * draft (grounded in this week's real content), then edit it normally —
 * not hand-typing every field from a blank template. Shared across Lessons/
 * Story Beats/Claude Code Examples so the pattern (and the loading/error
 * handling) is identical everywhere it appears. `onRewrite` always resolves
 * (the backend falls back to the current list unchanged on any failure),
 * so this component has no error state of its own to show. */
export const AiRewriteBar: React.FC<{
  itemNoun: string;
  onRewrite: (instruction: string) => Promise<void>;
}> = ({ itemNoun, onRewrite }) => {
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await onRewrite(instruction.trim()); }
    finally { setBusy(false); }
  };
  return (
    <div className="rounded-3 border bg-light p-3 mb-3">
      <label className="form-label small fw-medium">Rewrite the {itemNoun} with AI (optional instruction)</label>
      <div className="d-flex gap-2">
        <input className="form-control form-control-sm" value={instruction} onChange={(e) => setInstruction(e.target.value)}
          placeholder="e.g. make this week's Lessons focus more on error handling" disabled={busy} />
        <button className="btn btn-primary btn-sm text-nowrap" disabled={busy} onClick={go}>
          {busy ? 'Rewriting…' : '✨ AI rewrite'}
        </button>
      </div>
      <div className="text-muted small mt-1">Grounded in this week's real content. Replaces the list below — review and edit after.</div>
    </div>
  );
};
