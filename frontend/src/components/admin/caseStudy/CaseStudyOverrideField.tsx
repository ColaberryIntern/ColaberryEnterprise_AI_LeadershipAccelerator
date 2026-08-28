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
  /**
   * Refuse the edit before it is attempted, and say why on screen.
   *
   * There is one caller that needs this and it is the reason it exists:
   * `CaseStudyNarrativePanel` renders three of these fields unconditionally,
   * including on a candidate with no snapshot at all. Pressing Apply there
   * POSTs an override against nothing and comes back 404, which the client
   * renders as "this override not found." — a sentence describing a lookup the
   * operator never asked for. Observed on production 2026-08-26.
   */
  disabledReason?: string;
}

export default function CaseStudyOverrideField({
  label, path, generated, testId, busy, onApply, help, rows, disabledReason,
}: Props): React.ReactElement {
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');

  const blocked = Boolean(disabledReason);

  const apply = () => {
    if (blocked) return;
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
          placeholder="Human override" disabled={blocked}
        />
      ) : (
        <input
          id={`${testId}-input`} data-testid={`${testId}-input`} className="form-control mt-1"
          value={value} onChange={(e) => setValue(e.target.value)} placeholder="Human override"
          disabled={blocked}
        />
      )}
      <input
        data-testid={`${testId}-note`} className="form-control form-control-sm mt-1"
        value={note} onChange={(e) => setNote(e.target.value)}
        placeholder="Why (optional, stored with the override)"
        aria-label={`Note for ${label}`} disabled={blocked}
      />
      <button
        type="button" className="btn btn-sm btn-outline-danger mt-2" data-testid={testId}
        onClick={apply} disabled={busy || blocked}
      >
        Apply override
      </button>
      {blocked ? (
        <div className="small text-muted mt-1" data-testid={`${testId}-blocked`}>
          {disabledReason}
        </div>
      ) : null}
    </div>
  );
}
