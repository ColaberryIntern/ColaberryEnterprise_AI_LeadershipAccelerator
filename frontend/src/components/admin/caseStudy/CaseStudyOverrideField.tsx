import React, { useState } from 'react';

/**
 * CaseStudyOverrideField — one human edit of one snapshot field (spec §34).
 *
 * Auto-synced facts and human editorial copy have separate ownership. Applying
 * an override writes a NEW snapshot version carrying `human_override`
 * provenance, so a later sync updates the generated value underneath without
 * silently overwriting approved human copy. That is why the generated value
 * stays on screen beside the edit box rather than being replaced by it: an
 * override that hides what it overrode is unreviewable.
 */

interface Props {
  label: string;
  /** Dotted path into the snapshot content, e.g. `heroMetrics.0.valueDisplay`. */
  path: string;
  /** What the sync produced. Rendered, never silently replaced. */
  generated: string;
  testId: string;
  busy: boolean;
  onApply: (path: string, value: string, note?: string) => void;
  help?: string;
  rows?: number;
}

export default function CaseStudyOverrideField({
  label, path, generated, testId, busy, onApply, help, rows,
}: Props): React.ReactElement {
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');

  const apply = () => {
    const next = value.trim();
    if (!next) return;
    onApply(path, next, note.trim() ? note.trim() : undefined);
  };

  return (
    <div className="mb-3">
      <label className="form-label mb-0" htmlFor={`${testId}-input`}>{label}</label>
      <div className="small text-muted">
        <span className="fw-semibold">Generated:</span>{' '}
        {generated ? generated : <em>nothing generated for this field yet</em>}
      </div>
      <div className="small text-muted font-monospace">{path}</div>
      {help && <div className="small text-muted">{help}</div>}
      {rows && rows > 1 ? (
        <textarea
          id={`${testId}-input`} data-testid={`${testId}-input`} className="form-control mt-1"
          rows={rows} value={value} onChange={(e) => setValue(e.target.value)}
          placeholder="Human override"
        />
      ) : (
        <input
          id={`${testId}-input`} data-testid={`${testId}-input`} className="form-control mt-1"
          value={value} onChange={(e) => setValue(e.target.value)} placeholder="Human override"
        />
      )}
      <input
        data-testid={`${testId}-note`} className="form-control form-control-sm mt-1"
        value={note} onChange={(e) => setNote(e.target.value)}
        placeholder="Why (optional, stored with the override)"
        aria-label={`Note for ${label}`}
      />
      <button
        type="button" className="btn btn-sm btn-outline-danger mt-2" data-testid={testId}
        onClick={apply} disabled={busy}
      >
        Apply override
      </button>
    </div>
  );
}
