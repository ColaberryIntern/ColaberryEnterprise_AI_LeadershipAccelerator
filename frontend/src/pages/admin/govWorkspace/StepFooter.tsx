import React from 'react';

/**
 * StepFooter — the shared footer every pursuit step ends in (2026-10 redesign). One status line on
 * the left (Ready / Not yet) plus a one-line "what happens next"; on the right an optional Back link,
 * an optional destructive secondary, and exactly ONE primary action. When the exit gate is not met
 * the primary is visibly disabled and the blockers are listed in plain words.
 *
 * Presentational only — it gates nothing; the server enforces the real gates. The page decides
 * whether the primary is enabled and what the blockers are.
 */
export function StepFooter({
  ready,
  statusLine,
  nextLine,
  onBack,
  secondary,
  primary,
  blockers,
}: {
  ready: boolean;
  statusLine: string;
  nextLine?: string | null;
  onBack?: (() => void) | null;
  secondary?: { label: string; onClick: () => void; disabled?: boolean } | null;
  primary: { label: string; onClick: () => void; disabled?: boolean };
  blockers?: string[];
}): React.ReactElement {
  const showBlockers = !!primary.disabled && Array.isArray(blockers) && blockers.length > 0;
  return (
    <div className="gov-step-footer border rounded-3 p-3 mt-3 d-flex flex-wrap justify-content-between align-items-start gap-3">
      <div className="small" style={{ minWidth: 220, flex: '1 1 320px' }}>
        <div className="fw-semibold">
          <i className={`me-1 ${ready ? 'ri-checkbox-circle-line text-success' : 'ri-focus-3-line text-secondary'}`} aria-hidden="true" />
          {statusLine}
        </div>
        {nextLine ? <div className="text-secondary mt-1">{nextLine}</div> : null}
        {showBlockers ? (
          <ul className="text-secondary mt-1 mb-0 ps-3">
            {blockers!.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        ) : null}
      </div>
      <div className="d-flex align-items-center gap-2 flex-wrap justify-content-end">
        {onBack ? (
          <button type="button" className="btn btn-link btn-sm text-decoration-none px-1" onClick={onBack}>
            <i className="ri-arrow-left-line me-1" aria-hidden="true" />Back
          </button>
        ) : null}
        {secondary ? (
          <button type="button" className="btn btn-outline-danger btn-sm" disabled={secondary.disabled} onClick={secondary.onClick}>
            {secondary.label}
          </button>
        ) : null}
        <button type="button" className="btn btn-primary" disabled={primary.disabled} onClick={primary.onClick}>
          {primary.label}
          <i className="ri-arrow-right-line ms-1" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
